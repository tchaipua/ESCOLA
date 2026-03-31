import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../prisma/prisma.service";
import { getTenantContext } from "../../../../common/tenant/tenant.context";
import { CreateClassScheduleItemDto } from "../dto/create-class-schedule-item.dto";
import { UpdateClassScheduleItemDto } from "../dto/update-class-schedule-item.dto";

@Injectable()
export class ClassScheduleItemsService {
  constructor(private readonly prisma: PrismaService) {}

  private static readonly DAY_ORDER: Record<string, number> = {
    SEGUNDA: 1,
    "SEGUNDA-FEIRA": 1,
    TERCA: 2,
    "TERCA-FEIRA": 2,
    QUARTA: 3,
    "QUARTA-FEIRA": 3,
    QUINTA: 4,
    "QUINTA-FEIRA": 4,
    SEXTA: 5,
    "SEXTA-FEIRA": 5,
    SABADO: 6,
    DOMINGO: 7,
  };

  private tenantId() {
    return getTenantContext()!.tenantId;
  }

  private userId() {
    return getTenantContext()!.userId;
  }

  private normalizeDayOfWeek(value: string) {
    return String(value || "")
      .trim()
      .toUpperCase();
  }

  private normalizeTime(value: string) {
    return String(value || "").trim();
  }

  private parseDateOnly(value: string) {
    const parsed = new Date(`${String(value || "").trim()}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      throw new ConflictException(
        "Informe uma data válida no formato AAAA-MM-DD.",
      );
    }
    return parsed;
  }

  private todayDateOnly() {
    return this.parseDateOnly(new Date().toISOString().slice(0, 10));
  }

  private ensureValidTimeRange(startTime: string, endTime: string) {
    if (startTime >= endTime) {
      throw new ConflictException(
        "O horário inicial deve ser menor que o horário final.",
      );
    }
  }

  private async validateReferences(
    schoolYearId: string,
    seriesClassId: string,
    teacherSubjectId?: string | null,
  ) {
    const [schoolYear, seriesClass, teacherSubject] = await Promise.all([
      this.prisma.schoolYear.findFirst({
        where: {
          id: schoolYearId,
          tenantId: this.tenantId(),
          canceledAt: null,
        },
      }),
      this.prisma.seriesClass.findFirst({
        where: {
          id: seriesClassId,
          tenantId: this.tenantId(),
          canceledAt: null,
        },
      }),
      teacherSubjectId
        ? this.prisma.teacherSubject.findFirst({
            where: {
              id: teacherSubjectId,
              tenantId: this.tenantId(),
              canceledAt: null,
              teacher: {
                tenantId: this.tenantId(),
                canceledAt: null,
              },
              subject: {
                tenantId: this.tenantId(),
                canceledAt: null,
              },
            },
          })
        : Promise.resolve(null),
    ]);

    if (!schoolYear) {
      throw new NotFoundException("Ano letivo inválido para esta escola.");
    }

    if (!seriesClass) {
      throw new NotFoundException("Turma inválida para esta escola.");
    }

    if (teacherSubjectId && !teacherSubject) {
      throw new NotFoundException(
        "Professor e matéria inválidos para esta escola.",
      );
    }
  }

  private async ensureNoExactDuplicate(
    schoolYearId: string,
    seriesClassId: string,
    teacherSubjectId: string | null | undefined,
    dayOfWeek: string,
    startTime: string,
    endTime: string,
    itemId?: string,
  ) {
    const conflict = await this.prisma.classScheduleItem.findFirst({
      where: {
        tenantId: this.tenantId(),
        schoolYearId,
        seriesClassId,
        teacherSubjectId: teacherSubjectId ?? null,
        dayOfWeek,
        canceledAt: null,
        id: itemId ? { not: itemId } : undefined,
        startTime,
        endTime,
      },
    });

    if (conflict) {
      throw new ConflictException(
        "Já existe um lançamento igual para ano, turma, dia, matéria, professor e horário.",
      );
    }
  }

  private includeRelations() {
    return {
      schoolYear: true,
      seriesClass: {
        include: {
          series: true,
          class: true,
        },
      },
      teacherSubject: {
        include: {
          teacher: true,
          subject: true,
        },
      },
    } as const;
  }

  private resolveTeacherHourlyRate(
    teacherSubject: {
      hourlyRate: number | null;
      rateHistories: Array<{
        hourlyRate: number | null;
        effectiveFrom: Date;
        effectiveTo: Date | null;
      }>;
    },
    lessonDate: Date,
  ) {
    const match = teacherSubject.rateHistories.find((history) => {
      const startsOk =
        lessonDate.getTime() >= new Date(history.effectiveFrom).getTime();
      const endsOk =
        !history.effectiveTo ||
        lessonDate.getTime() <= new Date(history.effectiveTo).getTime();
      return startsOk && endsOk;
    });

    if (match) {
      return match.hourlyRate ?? null;
    }

    return teacherSubject.hourlyRate ?? null;
  }

  private async syncFutureGeneratedLessonsTeacherSubject(
    tx: Prisma.TransactionClient,
    classScheduleItemId: string,
    currentTeacherSubjectId: string | null,
    nextTeacherSubjectId: string | null,
    effectiveFromDate: Date,
  ) {
    if (!currentTeacherSubjectId && !nextTeacherSubjectId) {
      return;
    }

    const futureLessonItems = await tx.lessonCalendarItem.findMany({
      where: {
        tenantId: this.tenantId(),
        classScheduleItemId,
        canceledAt: null,
        lessonDate: {
          gte: effectiveFromDate,
        },
      },
      select: {
        id: true,
        lessonDate: true,
      },
      orderBy: [{ lessonDate: "asc" }, { startTime: "asc" }],
    });

    if (futureLessonItems.length === 0) {
      return;
    }

    if (!nextTeacherSubjectId) {
      throw new ConflictException(
        "Não é possível remover professor e matéria porque esta aula já foi gerada na grade anual.",
      );
    }

    const teacherSubject = await tx.teacherSubject.findFirst({
      where: {
        id: nextTeacherSubjectId,
        tenantId: this.tenantId(),
        canceledAt: null,
        teacher: {
          tenantId: this.tenantId(),
          canceledAt: null,
        },
        subject: {
          tenantId: this.tenantId(),
          canceledAt: null,
        },
      },
      select: {
        hourlyRate: true,
        rateHistories: {
          where: {
            canceledAt: null,
          },
          orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }],
          select: {
            hourlyRate: true,
            effectiveFrom: true,
            effectiveTo: true,
          },
        },
      },
    });

    if (!teacherSubject) {
      throw new NotFoundException(
        "Professor e matéria inválidos para esta escola.",
      );
    }

    // Mantém o calendário anual coerente sem recriar os lançamentos futuros,
    // preservando auditoria e relacionamentos já existentes.
    for (const lessonItem of futureLessonItems) {
      await tx.lessonCalendarItem.update({
        where: { id: lessonItem.id },
        data: {
          teacherSubjectId: nextTeacherSubjectId,
          hourlyRate: this.resolveTeacherHourlyRate(
            teacherSubject,
            lessonItem.lessonDate,
          ),
          updatedBy: this.userId(),
        },
      });
    }
  }

  private sortScheduleItems<T extends { dayOfWeek: string; startTime: string }>(
    items: T[],
  ) {
    return [...items].sort((left, right) => {
      const dayDiff =
        (ClassScheduleItemsService.DAY_ORDER[left.dayOfWeek] ?? 99) -
        (ClassScheduleItemsService.DAY_ORDER[right.dayOfWeek] ?? 99);

      if (dayDiff !== 0) {
        return dayDiff;
      }

      return left.startTime.localeCompare(right.startTime);
    });
  }

  private async findCurrentEnrollment(studentId: string) {
    return this.prisma.enrollment.findFirst({
      where: {
        tenantId: this.tenantId(),
        studentId,
        status: "ATIVO",
        canceledAt: null,
      },
      include: {
        schoolYear: true,
        seriesClass: {
          include: {
            series: true,
            class: true,
          },
        },
      },
      orderBy: [{ schoolYear: { year: "desc" } }, { createdAt: "desc" }],
    });
  }

  async findMySchedule(userId: string, role: string) {
    const normalizedRole = String(role || "")
      .trim()
      .toUpperCase();

    if (normalizedRole === "PROFESSOR") {
      const items = await this.prisma.classScheduleItem.findMany({
        where: {
          tenantId: this.tenantId(),
          canceledAt: null,
          teacherSubject: {
            is: {
              tenantId: this.tenantId(),
              canceledAt: null,
              teacherId: userId,
              teacher: {
                is: {
                  tenantId: this.tenantId(),
                  canceledAt: null,
                },
              },
              subject: {
                is: {
                  tenantId: this.tenantId(),
                  canceledAt: null,
                },
              },
            },
          },
        },
        include: this.includeRelations(),
      });

      return {
        scope: "PROFESSOR",
        items: this.sortScheduleItems(items),
      };
    }

    if (normalizedRole === "ALUNO") {
      const enrollment = await this.findCurrentEnrollment(userId);

      if (!enrollment?.seriesClassId) {
        return {
          scope: "ALUNO",
          enrollment: enrollment ?? null,
          items: [],
        };
      }

      const items = await this.prisma.classScheduleItem.findMany({
        where: {
          tenantId: this.tenantId(),
          canceledAt: null,
          schoolYearId: enrollment.schoolYearId,
          seriesClassId: enrollment.seriesClassId,
        },
        include: this.includeRelations(),
      });

      return {
        scope: "ALUNO",
        enrollment,
        items: this.sortScheduleItems(items),
      };
    }

    if (normalizedRole === "RESPONSAVEL") {
      const links = await this.prisma.guardianStudent.findMany({
        where: {
          tenantId: this.tenantId(),
          guardianId: userId,
          canceledAt: null,
        },
        include: {
          student: true,
        },
        orderBy: [{ student: { name: "asc" } }],
      });

      const students = await Promise.all(
        links.map(async (link) => {
          const enrollment = await this.findCurrentEnrollment(link.studentId);

          if (!enrollment?.seriesClassId) {
            return {
              studentId: link.studentId,
              studentName: link.student.name,
              kinship: link.kinship,
              kinshipDescription: link.kinshipDescription,
              enrollment: enrollment ?? null,
              items: [],
            };
          }

          const items = await this.prisma.classScheduleItem.findMany({
            where: {
              tenantId: this.tenantId(),
              canceledAt: null,
              schoolYearId: enrollment.schoolYearId,
              seriesClassId: enrollment.seriesClassId,
            },
            include: this.includeRelations(),
          });

          return {
            studentId: link.studentId,
            studentName: link.student.name,
            kinship: link.kinship,
            kinshipDescription: link.kinshipDescription,
            enrollment,
            items: this.sortScheduleItems(items),
          };
        }),
      );

      return {
        scope: "RESPONSAVEL",
        students,
      };
    }

    throw new NotFoundException("Perfil sem grade própria configurada.");
  }

  private rethrowPersistenceError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        throw new ConflictException(
          "Já existe um lançamento igual para ano, turma, dia, matéria, professor e horário.",
        );
      }

      if (error.code === "P2003") {
        throw new NotFoundException(
          "Os dados informados para lançar a grade não são mais válidos para esta escola.",
        );
      }

      if (error.code === "P2025") {
        throw new NotFoundException(
          "O lançamento da grade não foi encontrado para concluir esta operação.",
        );
      }
    }

    throw error;
  }

  async create(createDto: CreateClassScheduleItemDto) {
    const dayOfWeek = this.normalizeDayOfWeek(createDto.dayOfWeek);
    const startTime = this.normalizeTime(createDto.startTime);
    const endTime = this.normalizeTime(createDto.endTime);
    const teacherSubjectId = createDto.teacherSubjectId?.trim() || null;

    this.ensureValidTimeRange(startTime, endTime);
    await this.validateReferences(
      createDto.schoolYearId,
      createDto.seriesClassId,
      teacherSubjectId,
    );
    await this.ensureNoExactDuplicate(
      createDto.schoolYearId,
      createDto.seriesClassId,
      teacherSubjectId,
      dayOfWeek,
      startTime,
      endTime,
    );

    try {
      return await this.prisma.classScheduleItem.create({
        data: {
          tenantId: this.tenantId(),
          schoolYearId: createDto.schoolYearId,
          seriesClassId: createDto.seriesClassId,
          teacherSubjectId,
          dayOfWeek,
          startTime,
          endTime,
          createdBy: this.userId(),
        },
        include: this.includeRelations(),
      });
    } catch (error) {
      this.rethrowPersistenceError(error);
    }
  }

  async findAll() {
    return this.prisma.classScheduleItem.findMany({
      where: {
        tenantId: this.tenantId(),
      },
      include: this.includeRelations(),
      orderBy: [
        { canceledAt: "asc" },
        { schoolYear: { year: "desc" } },
        { dayOfWeek: "asc" },
        { startTime: "asc" },
      ],
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.classScheduleItem.findFirst({
      where: {
        id,
        tenantId: this.tenantId(),
      },
      include: this.includeRelations(),
    });

    if (!item) {
      throw new NotFoundException(
        "Lançamento da grade horária não encontrado.",
      );
    }

    return item;
  }

  async update(id: string, updateDto: UpdateClassScheduleItemDto) {
    const currentItem = await this.findOne(id);
    const schoolYearId = updateDto.schoolYearId || currentItem.schoolYearId;
    const seriesClassId = updateDto.seriesClassId || currentItem.seriesClassId;
    const teacherSubjectId = Object.prototype.hasOwnProperty.call(
      updateDto,
      "teacherSubjectId",
    )
      ? updateDto.teacherSubjectId?.trim() || null
      : currentItem.teacherSubjectId;
    const dayOfWeek = updateDto.dayOfWeek
      ? this.normalizeDayOfWeek(updateDto.dayOfWeek)
      : currentItem.dayOfWeek;
    const startTime = updateDto.startTime
      ? this.normalizeTime(updateDto.startTime)
      : currentItem.startTime;
    const endTime = updateDto.endTime
      ? this.normalizeTime(updateDto.endTime)
      : currentItem.endTime;
    const effectiveFromDate = updateDto.effectiveFromDate
      ? this.parseDateOnly(updateDto.effectiveFromDate)
      : this.todayDateOnly();

    this.ensureValidTimeRange(startTime, endTime);
    await this.validateReferences(
      schoolYearId,
      seriesClassId,
      teacherSubjectId,
    );
    await this.ensureNoExactDuplicate(
      schoolYearId,
      seriesClassId,
      teacherSubjectId,
      dayOfWeek,
      startTime,
      endTime,
      id,
    );

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.classScheduleItem.update({
          where: { id },
          data: {
            schoolYearId: updateDto.schoolYearId,
            seriesClassId: updateDto.seriesClassId,
            teacherSubjectId,
            dayOfWeek: updateDto.dayOfWeek ? dayOfWeek : undefined,
            startTime: updateDto.startTime ? startTime : undefined,
            endTime: updateDto.endTime ? endTime : undefined,
            updatedBy: this.userId(),
          },
        });

        await this.syncFutureGeneratedLessonsTeacherSubject(
          tx,
          id,
          currentItem.teacherSubjectId ?? null,
          teacherSubjectId ?? null,
          effectiveFromDate,
        );
      });
    } catch (error) {
      this.rethrowPersistenceError(error);
    }

    return this.findOne(id);
  }

  async remove(id: string) {
    await this.findOne(id);

    const linkedLessonItems = await this.prisma.lessonCalendarItem.count({
      where: {
        tenantId: this.tenantId(),
        classScheduleItemId: id,
      },
    });

    if (linkedLessonItems > 0) {
      throw new ConflictException(
        "Este lançamento já foi usado no calendário anual e não pode mais ser excluído fisicamente.",
      );
    }

    try {
      await this.prisma.classScheduleItem.delete({
        where: { id },
      });

      return {
        message: "Lançamento da grade excluído com sucesso.",
      };
    } catch (error) {
      this.rethrowPersistenceError(error);
    }
  }

  async setActiveStatus(id: string, active: boolean) {
    await this.findOne(id);

    await this.prisma.classScheduleItem.update({
      where: { id },
      data: active
        ? {
            canceledAt: null,
            canceledBy: null,
            updatedBy: this.userId(),
          }
        : {
            canceledAt: new Date(),
            canceledBy: this.userId(),
            updatedBy: this.userId(),
          },
    });

    const updatedItem = await this.findOne(id);

    return {
      message: active
        ? "Lançamento ativado com sucesso."
        : "Lançamento inativado com sucesso.",
      item: updatedItem,
    };
  }
}
