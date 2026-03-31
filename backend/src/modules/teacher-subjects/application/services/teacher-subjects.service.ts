import {
  Injectable,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../prisma/prisma.service";
import { AssignSubjectDto } from "../dto/assign-subject.dto";
import { UpdateTeacherSubjectDto } from "../dto/update-teacher-subject.dto";
import { getTenantContext } from "../../../../common/tenant/tenant.context";

@Injectable()
export class TeacherSubjectsService {
  constructor(private readonly prisma: PrismaService) {}

  private tenantId() {
    return getTenantContext()!.tenantId;
  }

  private userId() {
    return getTenantContext()!.userId;
  }

  private parseDateOnly(value: string) {
    const parsed = new Date(`${String(value || "").trim()}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      throw new ConflictException(
        "Informe a data de vigência no formato AAAA-MM-DD.",
      );
    }
    return parsed;
  }

  private todayDateOnly() {
    return this.parseDateOnly(new Date().toISOString().slice(0, 10));
  }

  private addDays(value: Date, amount: number) {
    return new Date(value.getTime() + amount * 24 * 60 * 60 * 1000);
  }

  private getEffectiveFromDate(rawValue?: string | null) {
    return rawValue ? this.parseDateOnly(rawValue) : this.todayDateOnly();
  }

  private async rebuildRateHistoryWindows(
    tx: Prisma.TransactionClient,
    teacherSubjectId: string,
  ) {
    const histories = await tx.teacherSubjectRateHistory.findMany({
      where: {
        tenantId: this.tenantId(),
        teacherSubjectId,
        canceledAt: null,
      },
      orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }],
    });

    for (let index = 0; index < histories.length; index += 1) {
      const current = histories[index];
      const next = histories[index + 1];
      const effectiveTo = next
        ? this.addDays(new Date(next.effectiveFrom), -1)
        : null;

      await tx.teacherSubjectRateHistory.update({
        where: { id: current.id },
        data: {
          effectiveTo,
          updatedBy: this.userId(),
        },
      });
    }

    return tx.teacherSubjectRateHistory.findMany({
      where: {
        tenantId: this.tenantId(),
        teacherSubjectId,
        canceledAt: null,
      },
      orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }],
    });
  }

  private resolveRateForDate(
    histories: Array<{
      hourlyRate: number | null;
      effectiveFrom: Date;
      effectiveTo: Date | null;
    }>,
    lessonDate: Date,
    fallbackRate: number | null | undefined,
  ) {
    const match = histories.find((history) => {
      const startsOk =
        lessonDate.getTime() >= new Date(history.effectiveFrom).getTime();
      const endsOk =
        !history.effectiveTo ||
        lessonDate.getTime() <= new Date(history.effectiveTo).getTime();
      return startsOk && endsOk;
    });

    return match ? (match.hourlyRate ?? null) : (fallbackRate ?? null);
  }

  private async reapplyCalendarItemRatesFromDate(
    tx: Prisma.TransactionClient,
    teacherSubjectId: string,
    startDate: Date,
    fallbackRate: number | null | undefined,
  ) {
    const [histories, calendarItems] = await Promise.all([
      tx.teacherSubjectRateHistory.findMany({
        where: {
          tenantId: this.tenantId(),
          teacherSubjectId,
          canceledAt: null,
        },
        orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }],
      }),
      tx.lessonCalendarItem.findMany({
        where: {
          tenantId: this.tenantId(),
          teacherSubjectId,
          canceledAt: null,
          lessonDate: {
            gte: startDate,
          },
        },
        select: {
          id: true,
          lessonDate: true,
        },
      }),
    ]);

    for (const item of calendarItems) {
      await tx.lessonCalendarItem.update({
        where: { id: item.id },
        data: {
          hourlyRate: this.resolveRateForDate(
            histories,
            item.lessonDate,
            fallbackRate,
          ),
        },
      });
    }
  }

  private async applyRateHistoryChange(
    tx: Prisma.TransactionClient,
    assignmentId: string,
    hourlyRate: number | null | undefined,
    effectiveFrom: Date,
  ) {
    const existingHistory = await tx.teacherSubjectRateHistory.findFirst({
      where: {
        tenantId: this.tenantId(),
        teacherSubjectId: assignmentId,
        canceledAt: null,
        effectiveFrom,
      },
    });

    if (existingHistory) {
      await tx.teacherSubjectRateHistory.update({
        where: { id: existingHistory.id },
        data: {
          hourlyRate: hourlyRate ?? null,
          updatedBy: this.userId(),
        },
      });
    } else {
      await tx.teacherSubjectRateHistory.create({
        data: {
          tenantId: this.tenantId(),
          teacherSubjectId: assignmentId,
          hourlyRate: hourlyRate ?? null,
          effectiveFrom,
          createdBy: this.userId(),
        },
      });
    }

    const histories = await this.rebuildRateHistoryWindows(tx, assignmentId);
    const currentHistory = this.resolveRateForDate(
      histories,
      this.todayDateOnly(),
      hourlyRate,
    );

    await tx.teacherSubject.update({
      where: { id: assignmentId },
      data: {
        hourlyRate: currentHistory,
        updatedBy: this.userId(),
      },
    });

    await this.reapplyCalendarItemRatesFromDate(
      tx,
      assignmentId,
      effectiveFrom,
      currentHistory,
    );
  }

  async findAll() {
    return this.prisma.teacherSubject.findMany({
      where: {
        tenantId: this.tenantId(),
        canceledAt: null,
        teacher: { canceledAt: null, tenantId: this.tenantId() },
        subject: { canceledAt: null, tenantId: this.tenantId() },
      },
      include: {
        teacher: true,
        subject: true,
      },
      orderBy: [{ subject: { name: "asc" } }, { teacher: { name: "asc" } }],
    });
  }

  async assign(teacherId: string, assignDto: AssignSubjectDto) {
    const { subjectId, hourlyRate } = assignDto;
    const effectiveFrom = this.getEffectiveFromDate(assignDto.effectiveFrom);
    const tenantId = this.tenantId();

    const teacher = await this.prisma.teacher.findFirst({
      where: { id: teacherId, tenantId, canceledAt: null },
    });
    if (!teacher) throw new NotFoundException("Professor não encontrado.");

    const subject = await this.prisma.subject.findFirst({
      where: { id: subjectId, tenantId, canceledAt: null },
    });
    if (!subject) throw new NotFoundException("Matéria inválida.");

    const existingAssign = await this.prisma.teacherSubject.findFirst({
      where: { teacherId, subjectId, tenantId, canceledAt: null },
    });

    if (existingAssign) {
      throw new ConflictException("Este Professor já leciona esta matéria.");
    }

    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.teacherSubject.create({
        data: {
          teacherId,
          subjectId,
          hourlyRate,
          tenantId,
          createdBy: this.userId(),
        },
      });

      if (typeof hourlyRate === "number" || hourlyRate === null) {
        await this.applyRateHistoryChange(
          tx,
          assignment.id,
          hourlyRate,
          effectiveFrom,
        );
      }

      return assignment;
    });
  }

  async unassign(teacherId: string, subjectId: string) {
    const assignment = await this.prisma.teacherSubject.findFirst({
      where: {
        teacherId,
        subjectId,
        tenantId: this.tenantId(),
        canceledAt: null,
      },
    });

    if (!assignment) {
      throw new NotFoundException(
        "Vínculo disciplina x professor não encontrado.",
      );
    }

    return this.prisma.teacherSubject.updateMany({
      where: {
        teacherId,
        subjectId,
        canceledAt: null,
      },
      data: {
        canceledAt: new Date(),
        canceledBy: getTenantContext()!.userId,
      },
    });
  }

  async update(
    teacherId: string,
    subjectId: string,
    updateDto: UpdateTeacherSubjectDto,
  ) {
    const assignment = await this.prisma.teacherSubject.findFirst({
      where: {
        teacherId,
        subjectId,
        tenantId: this.tenantId(),
        canceledAt: null,
      },
    });

    if (!assignment) {
      throw new NotFoundException(
        "Vínculo disciplina x professor não encontrado.",
      );
    }

    const effectiveFrom = this.getEffectiveFromDate(updateDto.effectiveFrom);

    return this.prisma.$transaction(async (tx) => {
      await this.applyRateHistoryChange(
        tx,
        assignment.id,
        updateDto.hourlyRate,
        effectiveFrom,
      );

      return tx.teacherSubject.findFirst({
        where: {
          id: assignment.id,
          tenantId: this.tenantId(),
        },
        include: {
          subject: true,
          rateHistories: {
            where: {
              canceledAt: null,
            },
            orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
          },
        },
      });
    });
  }
}
