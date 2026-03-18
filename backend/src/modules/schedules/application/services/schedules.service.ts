import {
  Injectable,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../../../../prisma/prisma.service";
import { CreateScheduleDto } from "../dto/create-schedule.dto";
import { UpdateScheduleDto } from "../dto/update-schedule.dto";
import { getTenantContext } from "../../../../common/tenant/tenant.context";

@Injectable()
export class SchedulesService {
  constructor(private readonly prisma: PrismaService) {}

  private isInterval(lessonNumber: number) {
    return Number(lessonNumber) === 0;
  }

  private normalizePeriod(period: string) {
    return String(period || "").trim().toUpperCase();
  }

  private normalizeTime(value?: string | null) {
    return String(value || "").trim();
  }

  private ensureValidTimeRange(startTime: string, endTime: string) {
    if (startTime >= endTime) {
      throw new ConflictException(
        "O horário inicial deve ser menor que o horário final.",
      );
    }
  }

  async create(createDto: CreateScheduleDto) {
    const { lessonNumber } = createDto;
    const period = this.normalizePeriod(createDto.period);
    const startTime = this.isInterval(lessonNumber)
      ? ""
      : this.normalizeTime(createDto.startTime);
    const endTime = this.isInterval(lessonNumber)
      ? ""
      : this.normalizeTime(createDto.endTime);
    const tenantId = getTenantContext()!.tenantId;
    if (!this.isInterval(lessonNumber)) {
      this.ensureValidTimeRange(startTime, endTime);
    }

    const lessonConflict = await this.prisma.schedule.findFirst({
      where: {
        tenantId,
        period,
        lessonNumber,
        canceledAt: null,
      },
    });

    if (lessonConflict) {
      throw new ConflictException(
        "Já existe uma aula cadastrada com este período e número.",
      );
    }

    if (!this.isInterval(lessonNumber) && startTime) {
      const timeConflict = await this.prisma.schedule.findFirst({
        where: {
          tenantId,
          period,
          startTime,
          canceledAt: null,
        },
      });

      if (timeConflict) {
        throw new ConflictException(
          "Já existe uma aula cadastrada com este período e horário inicial.",
        );
      }
    }

    return this.prisma.schedule.create({
      data: {
        period,
        lessonNumber,
        startTime,
        endTime,
        tenantId,
        createdBy: getTenantContext()!.userId,
      },
    });
  }

  async findAll() {
    return this.prisma.schedule.findMany({
      where: {
        tenantId: getTenantContext()!.tenantId,
      },
      orderBy: [
        { canceledAt: "asc" },
        { period: "asc" },
        { lessonNumber: "asc" },
        { startTime: "asc" },
      ],
    });
  }

  async findOne(id: string) {
    const schedule = await this.prisma.schedule.findFirst({
      where: {
        id,
        tenantId: getTenantContext()!.tenantId,
      },
    });

    if (!schedule) throw new NotFoundException("Agendamento não encontrado.");
    return schedule;
  }

  async update(id: string, updateDto: UpdateScheduleDto) {
    const currentSchedule = await this.findOne(id);
    const nextPeriod = updateDto.period
      ? this.normalizePeriod(updateDto.period)
      : currentSchedule.period;
    const nextLessonNumber = updateDto.lessonNumber ?? currentSchedule.lessonNumber;
    const nextStartTime = this.isInterval(nextLessonNumber)
      ? ""
      : this.normalizeTime(updateDto.startTime ?? currentSchedule.startTime);
    const nextEndTime = this.isInterval(nextLessonNumber)
      ? ""
      : this.normalizeTime(updateDto.endTime ?? currentSchedule.endTime);

    if (!this.isInterval(nextLessonNumber)) {
      this.ensureValidTimeRange(nextStartTime, nextEndTime);
    }

    const lessonConflict = await this.prisma.schedule.findFirst({
      where: {
        tenantId: getTenantContext()!.tenantId,
        period: nextPeriod,
        lessonNumber: nextLessonNumber,
        canceledAt: null,
        id: { not: id },
      },
    });

    if (lessonConflict) {
      throw new ConflictException(
        "Já existe uma aula cadastrada com este período e número.",
      );
    }

    if (!this.isInterval(nextLessonNumber) && nextStartTime) {
      const timeConflict = await this.prisma.schedule.findFirst({
        where: {
          tenantId: getTenantContext()!.tenantId,
          period: nextPeriod,
          startTime: nextStartTime,
          canceledAt: null,
          id: { not: id },
        },
      });

      if (timeConflict) {
        throw new ConflictException(
          "Já existe uma aula cadastrada com este período e horário inicial.",
        );
      }
    }

    return this.prisma.schedule.update({
      where: { id },
      data: {
        period: updateDto.period ? nextPeriod : undefined,
        lessonNumber: updateDto.lessonNumber,
        startTime: this.isInterval(nextLessonNumber)
          ? ""
          : updateDto.startTime !== undefined
            ? nextStartTime
            : undefined,
        endTime: this.isInterval(nextLessonNumber)
          ? ""
          : updateDto.endTime !== undefined
            ? nextEndTime
            : undefined,
        updatedBy: getTenantContext()!.userId,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.schedule.updateMany({
      where: { id },
      data: {
        canceledAt: new Date(),
        canceledBy: getTenantContext()!.userId,
      },
    });
  }

  async setActiveStatus(id: string, active: boolean) {
    await this.findOne(id);

    const updatedSchedule = await this.prisma.schedule.update({
      where: { id },
      data: active
        ? {
            canceledAt: null,
            canceledBy: null,
            updatedBy: getTenantContext()!.userId,
          }
        : {
            canceledAt: new Date(),
            canceledBy: getTenantContext()!.userId,
            updatedBy: getTenantContext()!.userId,
          },
    });

    return {
      message: active
        ? "Horário base ativado com sucesso."
        : "Horário base inativado com sucesso.",
      schedule: updatedSchedule,
    };
  }
}
