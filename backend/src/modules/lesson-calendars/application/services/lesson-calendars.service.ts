import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../../prisma/prisma.service";
import { getTenantContext } from "../../../../common/tenant/tenant.context";
import { CreateLessonCalendarDto } from "../dto/create-lesson-calendar.dto";
import { UpdateLessonCalendarItemDto } from "../dto/update-lesson-calendar-item.dto";
import { UpdateLessonCalendarDto } from "../dto/update-lesson-calendar.dto";

type NormalizedPeriod = {
  periodType: "AULA" | "INTERVALO";
  startDate: Date;
  endDate: Date;
  sortOrder: number;
};

type WeeklySourceItem = {
  id: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  teacherSubjectId: string;
  teacherSubject: {
    id: string;
    hourlyRate: number | null;
    rateHistories: Array<{
      hourlyRate: number | null;
      effectiveFrom: Date;
      effectiveTo: Date | null;
    }>;
    teacher: { id: string; name: string } | null;
    subject: { id: string; name: string } | null;
  } | null;
};

type TeacherSubjectRateSource = {
  hourlyRate: number | null;
  rateHistories: Array<{
    hourlyRate: number | null;
    effectiveFrom: Date;
    effectiveTo: Date | null;
  }>;
};

@Injectable()
export class LessonCalendarsService {
  constructor(private readonly prisma: PrismaService) {}

  private static readonly DAY_ORDER = [
    "DOMINGO",
    "SEGUNDA",
    "TERCA",
    "QUARTA",
    "QUINTA",
    "SEXTA",
    "SABADO",
  ] as const;

  private tenantId() {
    return getTenantContext()!.tenantId;
  }

  private userId() {
    return getTenantContext()!.userId;
  }

  private parseDateOnly(value: string) {
    const normalized = String(value || "").trim();
    const parsed = new Date(`${normalized}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      throw new ConflictException(
        "As datas da grade anual precisam estar no formato AAAA-MM-DD.",
      );
    }
    return parsed;
  }

  private normalizeDateOnly(value: Date) {
    return this.parseDateOnly(value.toISOString().slice(0, 10));
  }

  private formatDateOnly(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private todayDateOnly() {
    return this.parseDateOnly(new Date().toISOString().slice(0, 10));
  }

  private addDays(date: Date, amount: number) {
    return new Date(date.getTime() + amount * 24 * 60 * 60 * 1000);
  }

  private startOfDay(value: Date) {
    const next = new Date(value);
    next.setUTCHours(0, 0, 0, 0);
    return next;
  }

  private endOfDay(value: Date) {
    const next = new Date(value);
    next.setUTCHours(23, 59, 59, 999);
    return next;
  }

  private startOfWeek(value: Date) {
    const next = this.startOfDay(value);
    const day = next.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    next.setUTCDate(next.getUTCDate() + diff);
    return next;
  }

  private endOfWeek(value: Date) {
    const next = this.startOfWeek(value);
    next.setUTCDate(next.getUTCDate() + 6);
    return this.endOfDay(next);
  }

  private buildCalendarMonthRange(referenceDate?: string) {
    const selectedDate = referenceDate
      ? new Date(`${referenceDate}T00:00:00.000Z`)
      : new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);

    const monthStart = new Date(
      Date.UTC(selectedDate.getUTCFullYear(), selectedDate.getUTCMonth(), 1),
    );
    const monthEnd = new Date(
      Date.UTC(selectedDate.getUTCFullYear(), selectedDate.getUTCMonth() + 1, 0),
    );

    return {
      selectedDate,
      start: this.startOfWeek(monthStart),
      end: this.endOfWeek(monthEnd),
    };
  }

  private resolveTeacherHourlyRateFromSource(
    source: TeacherSubjectRateSource | null | undefined,
    lessonDate: Date,
  ) {
    const histories = source?.rateHistories || [];
    const match = histories.find((history) => {
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

    return source?.hourlyRate ?? null;
  }

  private resolveTeacherHourlyRate(
    weeklyItem: WeeklySourceItem,
    lessonDate: Date,
  ) {
    return this.resolveTeacherHourlyRateFromSource(
      weeklyItem.teacherSubject,
      lessonDate,
    );
  }

  private getDayOfWeek(date: Date) {
    return LessonCalendarsService.DAY_ORDER[date.getUTCDay()];
  }

  private ensureValidDateRange(startDate: Date, endDate: Date, message: string) {
    if (startDate.getTime() > endDate.getTime()) {
      throw new ConflictException(message);
    }
  }

  private ensureNoOverlap(periods: NormalizedPeriod[], periodType: "AULA" | "INTERVALO") {
    const sameType = periods
      .filter((period) => period.periodType === periodType)
      .sort((left, right) => left.startDate.getTime() - right.startDate.getTime());

    for (let index = 1; index < sameType.length; index += 1) {
      const previous = sameType[index - 1];
      const current = sameType[index];
      if (current.startDate.getTime() <= previous.endDate.getTime()) {
        throw new ConflictException(
          periodType === "AULA"
            ? "Os períodos de aula não podem se sobrepor."
            : "Os períodos de intervalo/férias não podem se sobrepor.",
        );
      }
    }
  }

  private normalizePeriods(
    input: Array<{ periodType?: string; startDate?: string; endDate?: string }>,
  ): NormalizedPeriod[] {
    const normalized = input.map((period, index) => {
      const periodType = String(period.periodType || "").trim().toUpperCase() as
        | "AULA"
        | "INTERVALO";
      const startDate = this.parseDateOnly(String(period.startDate || ""));
      const endDate = this.parseDateOnly(String(period.endDate || ""));

      this.ensureValidDateRange(
        startDate,
        endDate,
        "A data inicial do período precisa ser menor ou igual à data final.",
      );

      return {
        periodType,
        startDate,
        endDate,
        sortOrder: index,
      };
    });

    if (!normalized.some((period) => period.periodType === "AULA")) {
      throw new ConflictException(
        "Adicione pelo menos um período de aula na grade anual.",
      );
    }

    this.ensureNoOverlap(normalized, "AULA");
    this.ensureNoOverlap(normalized, "INTERVALO");

    const classPeriods = normalized.filter((period) => period.periodType === "AULA");
    const intervalPeriods = normalized.filter(
      (period) => period.periodType === "INTERVALO",
    );

    intervalPeriods.forEach((intervalPeriod) => {
      const isInsideClassPeriod = classPeriods.some(
        (classPeriod) =>
          intervalPeriod.startDate.getTime() >= classPeriod.startDate.getTime() &&
          intervalPeriod.endDate.getTime() <= classPeriod.endDate.getTime(),
      );

      if (!isInsideClassPeriod) {
        throw new ConflictException(
          "Cada intervalo/férias precisa ficar dentro de um período de aula informado.",
        );
      }
    });

    return normalized.sort((left, right) => {
      const startDiff = left.startDate.getTime() - right.startDate.getTime();
      if (startDiff !== 0) return startDiff;
      return left.periodType.localeCompare(right.periodType);
    });
  }

  private async validateReferences(schoolYearId: string, seriesClassId: string) {
    const [schoolYear, seriesClass] = await Promise.all([
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
        include: {
          series: true,
          class: true,
        },
      }),
    ]);

    if (!schoolYear) {
      throw new NotFoundException("Ano letivo inválido para esta escola.");
    }

    if (!seriesClass) {
      throw new NotFoundException("Turma inválida para esta escola.");
    }

    return { schoolYear, seriesClass };
  }

  private async validateTeacherSubject(teacherSubjectId: string) {
    const teacherSubject = await this.prisma.teacherSubject.findFirst({
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
      include: {
        teacher: true,
        subject: true,
        rateHistories: {
          where: {
            canceledAt: null,
          },
          orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }],
        },
      },
    });

    if (!teacherSubject) {
      throw new NotFoundException(
        "Professor e matéria inválidos para esta escola.",
      );
    }

    return teacherSubject;
  }

  private async mapLessonCalendarItem(id: string) {
    const item = await this.prisma.lessonCalendarItem.findFirst({
      where: {
        id,
        tenantId: this.tenantId(),
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
        teacherSubject: {
          include: {
            teacher: true,
            subject: true,
          },
        },
        lessonEvents: {
          where: {
            canceledAt: null,
          },
          orderBy: [{ createdAt: "asc" }],
        },
      },
    });

    if (!item) {
      throw new NotFoundException("Aula anual não encontrada.");
    }

    return {
      id: item.id,
      lessonCalendarId: item.lessonCalendarId,
      date: this.formatDateOnly(item.lessonDate),
      classScheduleItemId: item.classScheduleItemId,
      dayOfWeek: item.dayOfWeek,
      startTime: item.startTime,
      endTime: item.endTime,
      schoolYearId: item.schoolYearId,
      schoolYearLabel: String(item.schoolYear?.year || ""),
      seriesClassId: item.seriesClassId,
      seriesClassLabel: `${item.seriesClass?.series?.name || "SEM SÉRIE"} - ${item.seriesClass?.class?.name || "SEM TURMA"}`,
      subjectName: item.teacherSubject?.subject?.name || "DISCIPLINA",
      teacherName: item.teacherSubject?.teacher?.name || "PROFESSOR",
      teacherSubjectId: item.teacherSubjectId,
      events: item.lessonEvents.map((event) => ({
        id: event.id,
        date: this.formatDateOnly(item.lessonDate),
        eventType: event.eventType,
        eventTypeLabel:
          event.eventType === "FALTA_PROFESSOR"
            ? "FALTA DO PROFESSOR"
            : event.eventType,
        title: event.title,
        description: event.description,
        startTime: item.startTime,
        endTime: item.endTime,
      })),
    };
  }

  private ensurePeriodsWithinSchoolYear(
    periods: NormalizedPeriod[],
    schoolYear: { startDate: Date; endDate: Date },
  ) {
    const schoolYearStart = this.normalizeDateOnly(schoolYear.startDate);
    const schoolYearEnd = this.normalizeDateOnly(schoolYear.endDate);

    periods.forEach((period) => {
      if (
        period.startDate.getTime() < schoolYearStart.getTime() ||
        period.endDate.getTime() > schoolYearEnd.getTime()
      ) {
        throw new ConflictException(
          "Os períodos da grade anual precisam ficar dentro do ano letivo selecionado.",
        );
      }
    });
  }

  private async loadWeeklySource(schoolYearId: string, seriesClassId: string) {
    const weeklyItems = await this.prisma.classScheduleItem.findMany({
      where: {
        tenantId: this.tenantId(),
        schoolYearId,
        seriesClassId,
        canceledAt: null,
      },
      include: {
        teacherSubject: {
          include: {
            teacher: true,
            subject: true,
            rateHistories: {
              where: {
                canceledAt: null,
              },
              orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }],
            },
          },
        },
      },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });

    if (weeklyItems.length === 0) {
      throw new ConflictException(
        "Lance primeiro a grade semanal desta turma antes de montar a grade anual.",
      );
    }

    return weeklyItems as WeeklySourceItem[];
  }

  private buildLessonCalendarItems(
    lessonCalendarId: string,
    schoolYearId: string,
    seriesClassId: string,
    periods: NormalizedPeriod[],
    weeklyItems: WeeklySourceItem[],
  ) {
    const classPeriods = periods.filter((period) => period.periodType === "AULA");
    const intervalPeriods = periods.filter((period) => period.periodType === "INTERVALO");
    const itemPayloads: Array<{
      tenantId: string;
      lessonCalendarId: string;
      schoolYearId: string;
      seriesClassId: string;
      teacherSubjectId: string;
      classScheduleItemId: string;
      lessonDate: Date;
      dayOfWeek: string;
      startTime: string;
      endTime: string;
      hourlyRate: number | null;
      createdBy: string | null;
    }> = [];

    classPeriods.forEach((classPeriod) => {
      for (
        let currentDate = classPeriod.startDate;
        currentDate.getTime() <= classPeriod.endDate.getTime();
        currentDate = this.addDays(currentDate, 1)
      ) {
        const isInsideInterval = intervalPeriods.some(
          (intervalPeriod) =>
            currentDate.getTime() >= intervalPeriod.startDate.getTime() &&
            currentDate.getTime() <= intervalPeriod.endDate.getTime(),
        );

        if (isInsideInterval) {
          continue;
        }

        const dayOfWeek = this.getDayOfWeek(currentDate);
        const matchingWeeklyItems = weeklyItems.filter(
          (item) => item.dayOfWeek === dayOfWeek,
        );

        matchingWeeklyItems.forEach((weeklyItem) => {
          itemPayloads.push({
            tenantId: this.tenantId(),
            lessonCalendarId,
            schoolYearId,
            seriesClassId,
            teacherSubjectId: weeklyItem.teacherSubjectId,
            classScheduleItemId: weeklyItem.id,
            lessonDate: currentDate,
            dayOfWeek,
            startTime: weeklyItem.startTime,
            endTime: weeklyItem.endTime,
            hourlyRate: this.resolveTeacherHourlyRate(weeklyItem, currentDate),
            createdBy: this.userId(),
          });
        });
      }
    });

    return itemPayloads;
  }

  private buildPeriodSummary(periods: Array<{ periodType: string; startDate: Date; endDate: Date }>) {
    const classPeriods = periods.filter((period) => period.periodType === "AULA");
    const intervalPeriods = periods.filter((period) => period.periodType === "INTERVALO");

    return {
      classPeriodsCount: classPeriods.length,
      intervalPeriodsCount: intervalPeriods.length,
      classPeriodsLabel: classPeriods
        .map(
          (period) =>
            `${this.formatDateOnly(period.startDate)} a ${this.formatDateOnly(period.endDate)}`,
        )
        .join(" | "),
      intervalPeriodsLabel: intervalPeriods
        .map(
          (period) =>
            `${this.formatDateOnly(period.startDate)} a ${this.formatDateOnly(period.endDate)}`,
        )
        .join(" | "),
    };
  }

  private async ensureNoActiveCalendarConflict(
    schoolYearId: string,
    seriesClassId: string,
    currentId?: string,
  ) {
    const conflict = await this.prisma.lessonCalendar.findFirst({
      where: {
        tenantId: this.tenantId(),
        schoolYearId,
        seriesClassId,
        canceledAt: null,
        id: currentId ? { not: currentId } : undefined,
      },
    });

    if (conflict) {
      throw new ConflictException(
        "Esta turma já possui uma grade anual ativa para o ano letivo selecionado.",
      );
    }
  }

  private async mapCalendarSummary(calendarId: string) {
    const calendar = await this.prisma.lessonCalendar.findFirst({
      where: {
        id: calendarId,
        tenantId: this.tenantId(),
      },
      include: {
        schoolYear: true,
        seriesClass: {
          include: {
            series: true,
            class: true,
          },
        },
        periods: {
          where: { canceledAt: null },
          orderBy: [{ startDate: "asc" }, { sortOrder: "asc" }],
        },
      },
    });

    if (!calendar) {
      throw new NotFoundException("Grade anual não encontrada.");
    }

    const generatedItemsCount = await this.prisma.lessonCalendarItem.count({
      where: {
        tenantId: this.tenantId(),
        lessonCalendarId: calendar.id,
        canceledAt: null,
      },
    });

    return {
      ...calendar,
      generatedItemsCount,
      ...this.buildPeriodSummary(calendar.periods),
    };
  }

  async create(createDto: CreateLessonCalendarDto) {
    const { schoolYear, seriesClass } = await this.validateReferences(
      createDto.schoolYearId,
      createDto.seriesClassId,
    );
    const periods = this.normalizePeriods(createDto.periods);
    this.ensurePeriodsWithinSchoolYear(periods, schoolYear);
    await this.ensureNoActiveCalendarConflict(
      createDto.schoolYearId,
      createDto.seriesClassId,
    );
    const weeklyItems = await this.loadWeeklySource(
      createDto.schoolYearId,
      createDto.seriesClassId,
    );

    const createdCalendar = await this.prisma.$transaction(async (tx) => {
      const lessonCalendar = await tx.lessonCalendar.create({
        data: {
          tenantId: this.tenantId(),
          schoolYearId: createDto.schoolYearId,
          seriesClassId: createDto.seriesClassId,
          lastWeeklySyncAt: new Date(),
          createdBy: this.userId(),
        },
      });

      await tx.lessonCalendarPeriod.createMany({
        data: periods.map((period) => ({
          tenantId: this.tenantId(),
          lessonCalendarId: lessonCalendar.id,
          periodType: period.periodType,
          startDate: period.startDate,
          endDate: period.endDate,
          sortOrder: period.sortOrder,
          createdBy: this.userId(),
        })),
      });

      const generatedItems = this.buildLessonCalendarItems(
        lessonCalendar.id,
        createDto.schoolYearId,
        createDto.seriesClassId,
        periods,
        weeklyItems,
      );

      if (generatedItems.length > 0) {
        await tx.lessonCalendarItem.createMany({
          data: generatedItems,
        });
      }

      return lessonCalendar;
    });

    return this.mapCalendarSummary(createdCalendar.id);
  }

  async findAll() {
    const calendars = await this.prisma.lessonCalendar.findMany({
      where: {
        tenantId: this.tenantId(),
      },
      include: {
        schoolYear: true,
        seriesClass: {
          include: {
            series: true,
            class: true,
          },
        },
        periods: {
          where: { canceledAt: null },
          orderBy: [{ startDate: "asc" }, { sortOrder: "asc" }],
        },
      },
      orderBy: [{ canceledAt: "asc" }, { updatedAt: "desc" }],
    });

    return Promise.all(
      calendars.map(async (calendar) => ({
        ...calendar,
        generatedItemsCount: await this.prisma.lessonCalendarItem.count({
          where: {
            tenantId: this.tenantId(),
            lessonCalendarId: calendar.id,
            canceledAt: null,
          },
        }),
        ...this.buildPeriodSummary(calendar.periods),
      })),
    );
  }

  async findOne(id: string) {
    return this.mapCalendarSummary(id);
  }

  async findSchoolCalendarEvents(referenceDate?: string) {
    const { selectedDate, start, end } = this.buildCalendarMonthRange(referenceDate);

    const [lessonItems, standaloneEvents] = await Promise.all([
      this.prisma.lessonCalendarItem.findMany({
        where: {
          tenantId: this.tenantId(),
          canceledAt: null,
          lessonDate: {
            gte: start,
            lte: end,
          },
        },
        include: {
          schoolYear: true,
          seriesClass: {
            include: {
              series: true,
              class: true,
            },
          },
          teacherSubject: {
            include: {
              subject: true,
              teacher: true,
            },
          },
          lessonEvents: {
            where: {
              canceledAt: null,
            },
            orderBy: [{ createdAt: "asc" }],
          },
        },
        orderBy: [{ lessonDate: "asc" }, { startTime: "asc" }],
      }),
      this.prisma.lessonEvent.findMany({
        where: {
          tenantId: this.tenantId(),
          canceledAt: null,
          lessonCalendarItemId: null,
          eventDate: {
            gte: start,
            lte: end,
          },
        },
        include: {
          teacher: true,
        },
        orderBy: [{ eventDate: "asc" }, { createdAt: "asc" }],
      }),
    ]);

    const mappedLessonItems = lessonItems.map((item) => ({
      id: item.id,
      lessonCalendarId: item.lessonCalendarId,
      date: this.formatDateOnly(item.lessonDate),
      classScheduleItemId: item.classScheduleItemId,
      dayOfWeek: item.dayOfWeek,
      startTime: item.startTime,
      endTime: item.endTime,
      schoolYearId: item.schoolYearId,
      schoolYearLabel: String(item.schoolYear?.year || ""),
      seriesClassId: item.seriesClassId,
      seriesClassLabel: `${item.seriesClass?.series?.name || "SEM SÉRIE"} - ${item.seriesClass?.class?.name || "SEM TURMA"}`,
      subjectName: item.teacherSubject?.subject?.name || "DISCIPLINA",
      teacherName: item.teacherSubject?.teacher?.name || "PROFESSOR",
      teacherSubjectId: item.teacherSubjectId || null,
      events: item.lessonEvents.map((event) => ({
        id: event.id,
        date: this.formatDateOnly(item.lessonDate),
        eventType: event.eventType,
        eventTypeLabel: event.eventType === "FALTA_PROFESSOR" ? "FALTA DO PROFESSOR" : event.eventType,
        title: event.title,
        description: event.description,
        startTime: item.startTime,
        endTime: item.endTime,
      })),
    }));

    const standaloneEventItems = standaloneEvents.map((event) => ({
      id: event.id,
      date: this.formatDateOnly(event.eventDate || event.createdAt),
      eventType: event.eventType,
      eventTypeLabel: event.eventType === "FALTA_PROFESSOR" ? "FALTA DO PROFESSOR" : event.eventType,
      title: event.title,
      description: event.description,
      startTime: null,
      endTime: null,
      isStandaloneNotice: true,
      schoolYearId: event.schoolYearId || null,
      schoolYearLabel: "",
      seriesClassId: event.seriesClassId || null,
      seriesClassLabel: `${event.seriesNameSnapshot || "SEM SÉRIE"} - ${event.classNameSnapshot || "SEM TURMA"}`,
      subjectName: event.subjectNameSnapshot || "RECADO AVULSO",
      teacherName: event.teacher?.name || "PROFESSOR",
    }));

    return {
      selectedDate: this.formatDateOnly(selectedDate),
      rangeStart: this.formatDateOnly(start),
      rangeEnd: this.formatDateOnly(end),
      lessonItems: mappedLessonItems.sort((left, right) => {
        const dateCompare = left.date.localeCompare(right.date);
        if (dateCompare !== 0) return dateCompare;
        return `${left.startTime || ""}`.localeCompare(`${right.startTime || ""}`);
      }),
      standaloneEvents: standaloneEventItems.sort((left, right) => {
        const dateCompare = left.date.localeCompare(right.date);
        if (dateCompare !== 0) return dateCompare;
        return `${left.startTime || ""}`.localeCompare(`${right.startTime || ""}`);
      }),
    };
  }

  async updateLessonCalendarItem(
    lessonCalendarItemId: string,
    updateDto: UpdateLessonCalendarItemDto,
  ) {
    const current = await this.prisma.lessonCalendarItem.findFirst({
      where: {
        id: lessonCalendarItemId,
        tenantId: this.tenantId(),
        canceledAt: null,
      },
      select: {
        id: true,
        lessonDate: true,
        teacherSubjectId: true,
      },
    });

    if (!current) {
      throw new NotFoundException("Aula anual não encontrada.");
    }

    const teacherSubject = await this.validateTeacherSubject(
      updateDto.teacherSubjectId,
    );

    await this.prisma.lessonCalendarItem.update({
      where: { id: lessonCalendarItemId },
      data: {
        teacherSubjectId: updateDto.teacherSubjectId,
        hourlyRate: this.resolveTeacherHourlyRateFromSource(
          teacherSubject,
          current.lessonDate,
        ),
        updatedBy: this.userId(),
      },
    });

    return this.mapLessonCalendarItem(lessonCalendarItemId);
  }

  async getWeeklySource(schoolYearId: string, seriesClassId: string) {
    const { schoolYear, seriesClass } = await this.validateReferences(
      schoolYearId,
      seriesClassId,
    );
    const items = await this.loadWeeklySource(schoolYearId, seriesClassId);

    return {
      schoolYear,
      seriesClass,
      items,
    };
  }

  async update(id: string, updateDto: UpdateLessonCalendarDto) {
    const current = await this.prisma.lessonCalendar.findFirst({
      where: {
        id,
        tenantId: this.tenantId(),
        canceledAt: null,
      },
      include: {
        periods: {
          where: {
            canceledAt: null,
          },
        },
      },
    });

    if (!current) {
      throw new NotFoundException("Grade anual não encontrada.");
    }

    const schoolYearId = updateDto.schoolYearId || current.schoolYearId;
    const seriesClassId = updateDto.seriesClassId || current.seriesClassId;
    const periods = this.normalizePeriods(
      updateDto.periods ||
        current.periods.map((period) => ({
          periodType: period.periodType,
          startDate: this.formatDateOnly(period.startDate),
          endDate: this.formatDateOnly(period.endDate),
        })),
    );
    const { schoolYear } = await this.validateReferences(schoolYearId, seriesClassId);

    this.ensurePeriodsWithinSchoolYear(periods, schoolYear);
    await this.ensureNoActiveCalendarConflict(schoolYearId, seriesClassId, id);
    const weeklyItems = await this.loadWeeklySource(schoolYearId, seriesClassId);
    const preserveUntilDate = this.todayDateOnly();

    await this.prisma.$transaction(async (tx) => {
      await tx.lessonCalendar.update({
        where: { id },
        data: {
          schoolYearId,
          seriesClassId,
          lastWeeklySyncAt: new Date(),
          updatedBy: this.userId(),
        },
      });

      await tx.lessonCalendarPeriod.updateMany({
        where: {
          lessonCalendarId: id,
          tenantId: this.tenantId(),
          canceledAt: null,
        },
        data: {
          canceledAt: new Date(),
          canceledBy: this.userId(),
        },
      });

      await tx.lessonCalendarItem.updateMany({
        where: {
          lessonCalendarId: id,
          tenantId: this.tenantId(),
          canceledAt: null,
          lessonDate: {
            gte: preserveUntilDate,
          },
        },
        data: {
          canceledAt: new Date(),
          canceledBy: this.userId(),
        },
      });

      await tx.lessonCalendarPeriod.createMany({
        data: periods.map((period) => ({
          tenantId: this.tenantId(),
          lessonCalendarId: id,
          periodType: period.periodType,
          startDate: period.startDate,
          endDate: period.endDate,
          sortOrder: period.sortOrder,
          createdBy: this.userId(),
        })),
      });

      const generatedItems = this.buildLessonCalendarItems(
        id,
        schoolYearId,
        seriesClassId,
        periods,
        weeklyItems,
      );

      if (generatedItems.length > 0) {
        await tx.lessonCalendarItem.createMany({
          data: generatedItems,
        });
      }
    });

    return this.mapCalendarSummary(id);
  }

  async refreshWeeklySource(id: string) {
    const calendar = await this.prisma.lessonCalendar.findFirst({
      where: {
        id,
        tenantId: this.tenantId(),
        canceledAt: null,
      },
      include: {
        periods: {
          where: {
            canceledAt: null,
          },
          orderBy: [{ startDate: "asc" }, { sortOrder: "asc" }],
        },
      },
    });

    if (!calendar) {
      throw new NotFoundException("Grade anual não encontrada.");
    }

    const weeklyItems = await this.loadWeeklySource(
      calendar.schoolYearId,
      calendar.seriesClassId,
    );
    const preserveUntilDate = this.todayDateOnly();
    const periods = this.normalizePeriods(
      calendar.periods.map((period) => ({
        periodType: period.periodType,
        startDate: this.formatDateOnly(period.startDate),
        endDate: this.formatDateOnly(period.endDate),
      })),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.lessonCalendarItem.updateMany({
        where: {
          lessonCalendarId: id,
          tenantId: this.tenantId(),
          canceledAt: null,
          lessonDate: {
            gte: preserveUntilDate,
          },
        },
        data: {
          canceledAt: new Date(),
          canceledBy: this.userId(),
        },
      });

      const generatedItems = this.buildLessonCalendarItems(
        id,
        calendar.schoolYearId,
        calendar.seriesClassId,
        periods,
        weeklyItems,
      );

      if (generatedItems.length > 0) {
        await tx.lessonCalendarItem.createMany({
          data: generatedItems,
        });
      }

      await tx.lessonCalendar.update({
        where: { id },
        data: {
          lastWeeklySyncAt: new Date(),
          updatedBy: this.userId(),
        },
      });
    });

    return this.mapCalendarSummary(id);
  }

  async remove(id: string) {
    const current = await this.prisma.lessonCalendar.findFirst({
      where: {
        id,
        tenantId: this.tenantId(),
        canceledAt: null,
      },
    });

    if (!current) {
      throw new NotFoundException("Grade anual não encontrada.");
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.lessonCalendarPeriod.updateMany({
        where: {
          lessonCalendarId: id,
          tenantId: this.tenantId(),
          canceledAt: null,
        },
        data: {
          canceledAt: new Date(),
          canceledBy: this.userId(),
        },
      });

      await tx.lessonCalendarItem.updateMany({
        where: {
          lessonCalendarId: id,
          tenantId: this.tenantId(),
          canceledAt: null,
        },
        data: {
          canceledAt: new Date(),
          canceledBy: this.userId(),
        },
      });

      await tx.lessonCalendar.updateMany({
        where: {
          id,
          tenantId: this.tenantId(),
          canceledAt: null,
        },
        data: {
          canceledAt: new Date(),
          canceledBy: this.userId(),
        },
      });

      return { success: true };
    });
  }

  async setActiveStatus(id: string, active: boolean) {
    const current = await this.prisma.lessonCalendar.findFirst({
      where: {
        id,
        tenantId: this.tenantId(),
      },
    });

    if (!current) {
      throw new NotFoundException("Grade anual não encontrada.");
    }

    return this.prisma.$transaction(async (tx) => {
      const commonWhere = {
        lessonCalendarId: id,
        tenantId: this.tenantId(),
      };

      await tx.lessonCalendarPeriod.updateMany({
        where: active ? commonWhere : { ...commonWhere, canceledAt: null },
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

      await tx.lessonCalendarItem.updateMany({
        where: active ? commonWhere : { ...commonWhere, canceledAt: null },
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

      const updatedCalendar = await tx.lessonCalendar.update({
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

      return {
        message: active
          ? "Grade anual ativada com sucesso."
          : "Grade anual inativada com sucesso.",
        lessonCalendar: updatedCalendar,
      };
    });
  }
}
