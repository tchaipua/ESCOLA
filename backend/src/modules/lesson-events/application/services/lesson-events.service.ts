import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../../prisma/prisma.service";
import { getTenantContext } from "../../../../common/tenant/tenant.context";
import { NotificationsService } from "../../../notifications/application/services/notifications.service";
import { CreateLessonEventDto } from "../dto/create-lesson-event.dto";
import { UpdateLessonEventDto } from "../dto/update-lesson-event.dto";
import { FindMyTeacherAgendaDto } from "../dto/find-my-teacher-agenda.dto";
import { FindMyTeacherCalendarDto } from "../dto/find-my-teacher-calendar.dto";

@Injectable()
export class LessonEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private tenantId() {
    return getTenantContext()!.tenantId;
  }

  private userId() {
    return getTenantContext()!.userId;
  }

  private normalizeText(value: string) {
    return String(value || "").trim().toUpperCase();
  }

  private getEventTypeLabel(value: string) {
    switch (String(value || "").trim().toUpperCase()) {
      case "PROVA":
        return "PROVA";
      case "TRABALHO":
        return "TRABALHO";
      case "RECADO":
        return "RECADO";
      case "FALTA_PROFESSOR":
        return "FALTA DO PROFESSOR";
      default:
        return this.normalizeText(value || "EVENTO");
    }
  }

  private getDefaultTitle(eventType: string) {
    switch (String(eventType || "").trim().toUpperCase()) {
      case "PROVA":
        return "PROVA AGENDADA";
      case "TRABALHO":
        return "TRABALHO AGENDADO";
      case "RECADO":
        return "RECADO DO PROFESSOR";
      case "FALTA_PROFESSOR":
        return "PROFESSOR AUSENTE";
      default:
        return "EVENTO DA AULA";
    }
  }

  private formatDateKey(value: Date) {
    return new Date(value).toISOString().slice(0, 10);
  }

  private formatDateLabel(value: Date) {
    return new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(value));
  }

  private buildDateRange(date?: string) {
    const selectedDate = date
      ? new Date(`${date}T00:00:00.000Z`)
      : new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);

    const start = new Date(selectedDate);
    start.setUTCDate(start.getUTCDate() - 3);

    const end = new Date(selectedDate);
    end.setUTCDate(end.getUTCDate() + 10);
    end.setUTCHours(23, 59, 59, 999);

    return { selectedDate, start, end };
  }

  private normalizeCalendarView(value?: string) {
    const normalized = String(value || "MONTH").trim().toUpperCase();
    if (normalized === "WEEK" || normalized === "DAY") {
      return normalized as "WEEK" | "DAY";
    }

    return "MONTH" as const;
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

  private buildCalendarRange(referenceDate?: string, view?: string) {
    const selectedDate = referenceDate
      ? new Date(`${referenceDate}T00:00:00.000Z`)
      : new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
    const calendarView = this.normalizeCalendarView(view);

    if (calendarView === "DAY") {
      return {
        view: calendarView,
        selectedDate,
        start: this.startOfDay(selectedDate),
        end: this.endOfDay(selectedDate),
      };
    }

    if (calendarView === "WEEK") {
      return {
        view: calendarView,
        selectedDate,
        start: this.startOfWeek(selectedDate),
        end: this.endOfWeek(selectedDate),
      };
    }

    const monthStart = new Date(
      Date.UTC(selectedDate.getUTCFullYear(), selectedDate.getUTCMonth(), 1),
    );
    const monthEnd = new Date(
      Date.UTC(selectedDate.getUTCFullYear(), selectedDate.getUTCMonth() + 1, 0),
    );

    return {
      view: calendarView,
      selectedDate,
      start: this.startOfWeek(monthStart),
      end: this.endOfWeek(monthEnd),
    };
  }

  private mapLessonItem(item: any) {
    const dateKey = this.formatDateKey(item.lessonDate);

    return {
      id: item.id,
      lessonDate: dateKey,
      dateLabel: this.formatDateLabel(item.lessonDate),
      dayOfWeek: item.dayOfWeek,
      startTime: item.startTime,
      endTime: item.endTime,
      subjectName: item.teacherSubject.subject?.name || "DISCIPLINA",
      teacherName: item.teacherSubject.teacher?.name || "PROFESSOR",
      seriesName: item.seriesClass.series?.name || "SEM SÉRIE",
      className: item.seriesClass.class?.name || "SEM TURMA",
      shift: item.seriesClass.class?.shift || null,
      events: item.lessonEvents.map((event: any) => this.mapEvent(event)),
      hasEvents: item.lessonEvents.length > 0,
    };
  }

  private async findTeacherLessonItems(start: Date, end: Date) {
    return this.prisma.lessonCalendarItem.findMany({
      where: {
        tenantId: this.tenantId(),
        canceledAt: null,
        lessonDate: {
          gte: start,
          lte: end,
        },
        teacherSubject: {
          is: {
            tenantId: this.tenantId(),
            canceledAt: null,
            teacherId: this.userId(),
            teacher: {
              is: {
                tenantId: this.tenantId(),
                canceledAt: null,
              },
            },
          },
        },
      },
      include: {
        teacherSubject: {
          include: {
            subject: true,
            teacher: true,
          },
        },
        seriesClass: {
          include: {
            series: true,
            class: true,
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
    });
  }

  private async findLessonItemForTeacher(lessonCalendarItemId: string) {
    const lessonItem = await this.prisma.lessonCalendarItem.findFirst({
      where: {
        id: lessonCalendarItemId,
        tenantId: this.tenantId(),
        canceledAt: null,
        teacherSubject: {
          is: {
            tenantId: this.tenantId(),
            canceledAt: null,
            teacherId: this.userId(),
            teacher: {
              is: {
                tenantId: this.tenantId(),
                canceledAt: null,
              },
            },
          },
        },
      },
      include: {
        teacherSubject: {
          include: {
            subject: true,
            teacher: true,
          },
        },
        seriesClass: {
          include: {
            series: true,
            class: true,
          },
        },
      },
    });

    if (!lessonItem) {
      throw new NotFoundException(
        "Aula anual não encontrada para este professor.",
      );
    }

    return lessonItem;
  }

  private async findLessonEventForTeacher(id: string) {
    const lessonEvent = await this.prisma.lessonEvent.findFirst({
      where: {
        id,
        tenantId: this.tenantId(),
        teacherId: this.userId(),
        canceledAt: null,
      },
      include: {
        lessonCalendarItem: {
          include: {
            teacherSubject: {
              include: {
                subject: true,
                teacher: true,
              },
            },
            seriesClass: {
              include: {
                series: true,
                class: true,
              },
            },
          },
        },
      },
    });

    if (!lessonEvent) {
      throw new NotFoundException("Evento da aula não encontrado.");
    }

    return lessonEvent;
  }

  private mapEvent(event: any) {
    return {
      id: event.id,
      eventType: event.eventType,
      eventTypeLabel: this.getEventTypeLabel(event.eventType),
      title: event.title,
      description: event.description,
      notifyStudents: event.notifyStudents,
      notifyGuardians: event.notifyGuardians,
      notifyByEmail: event.notifyByEmail,
      lastNotifiedAt: event.lastNotifiedAt,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    };
  }

  async findMyAgenda(query: FindMyTeacherAgendaDto) {
    const { selectedDate, start, end } = this.buildDateRange(query.date);
    const items = await this.findTeacherLessonItems(start, end);

    const grouped = new Map<string, any[]>();
    for (const item of items) {
      const mappedItem = this.mapLessonItem(item);
      const dateKey = mappedItem.lessonDate;
      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, []);
      }

      grouped.get(dateKey)!.push(mappedItem);
    }

    const days = Array.from(grouped.entries()).map(([date, dayItems]) => ({
      date,
      dateLabel:
        dayItems[0]?.dateLabel ||
        this.formatDateLabel(new Date(`${date}T00:00:00.000Z`)),
      items: dayItems,
    }));

    const selectedKey = this.formatDateKey(selectedDate);
    const selectedDay = days.find((day) => day.date === selectedKey) || null;

    return {
      selectedDate: selectedKey,
      days,
      selectedDay,
      totalItems: items.length,
    };
  }

  async findMyCalendar(query: FindMyTeacherCalendarDto) {
    const { view, selectedDate, start, end } = this.buildCalendarRange(
      query.referenceDate,
      query.view,
    );
    const items = await this.findTeacherLessonItems(start, end);
    const mappedItems = items.map((item) => this.mapLessonItem(item));
    const dates = new Set(mappedItems.map((item) => item.lessonDate));

    return {
      view,
      selectedDate: this.formatDateKey(selectedDate),
      rangeStart: this.formatDateKey(start),
      rangeEnd: this.formatDateKey(end),
      totalItems: mappedItems.length,
      totalDaysWithLessons: dates.size,
      items: mappedItems,
    };
  }

  async create(createDto: CreateLessonEventDto) {
    const lessonItem = await this.findLessonItemForTeacher(
      createDto.lessonCalendarItemId,
    );

    const eventType = this.normalizeText(createDto.eventType);
    const existingEvent = await this.prisma.lessonEvent.findFirst({
      where: {
        tenantId: this.tenantId(),
        lessonCalendarItemId: lessonItem.id,
        teacherId: this.userId(),
        eventType,
        canceledAt: null,
      },
    });

    if (existingEvent) {
      throw new ConflictException(
        "Já existe um evento deste tipo cadastrado para esta aula.",
      );
    }

    const lessonEvent = await this.prisma.lessonEvent.create({
      data: {
        tenantId: this.tenantId(),
        lessonCalendarItemId: lessonItem.id,
        teacherId: this.userId(),
        eventType,
        title: this.normalizeText(
          createDto.title || this.getDefaultTitle(eventType),
        ),
        description: createDto.description
          ? this.normalizeText(createDto.description)
          : null,
        notifyStudents: createDto.notifyStudents !== false,
        notifyGuardians: createDto.notifyGuardians !== false,
        notifyByEmail: createDto.notifyByEmail !== false,
        createdBy: this.userId(),
        updatedBy: this.userId(),
      },
    });

    const dispatchResult =
      await this.notificationsService.dispatchLessonEventNotifications({
        lessonEvent,
        lessonItem,
        action: "CREATE",
      });

    const syncedEvent = await this.prisma.lessonEvent.update({
      where: { id: lessonEvent.id },
      data: {
        lastNotifiedAt:
          dispatchResult.notificationsCreated > 0 ? new Date() : null,
        updatedBy: this.userId(),
      },
    });

    return {
      ...this.mapEvent(syncedEvent),
      notificationsCreated: dispatchResult.notificationsCreated,
      emailSent: dispatchResult.emailSent,
    };
  }

  async update(id: string, updateDto: UpdateLessonEventDto) {
    const currentEvent = await this.findLessonEventForTeacher(id);
    const nextEventType = updateDto.eventType
      ? this.normalizeText(updateDto.eventType)
      : currentEvent.eventType;

    if (nextEventType !== currentEvent.eventType) {
      const conflict = await this.prisma.lessonEvent.findFirst({
        where: {
          tenantId: this.tenantId(),
          lessonCalendarItemId: currentEvent.lessonCalendarItemId,
          teacherId: this.userId(),
          eventType: nextEventType,
          canceledAt: null,
          id: { not: id },
        },
      });

      if (conflict) {
        throw new ConflictException(
          "Já existe um evento deste tipo cadastrado para esta aula.",
        );
      }
    }

    const updatedEvent = await this.prisma.lessonEvent.update({
      where: { id },
      data: {
        eventType: updateDto.eventType ? nextEventType : undefined,
        title:
          updateDto.title !== undefined
            ? this.normalizeText(
                updateDto.title || this.getDefaultTitle(nextEventType),
              )
            : undefined,
        description:
          updateDto.description !== undefined
            ? updateDto.description
              ? this.normalizeText(updateDto.description)
              : null
            : undefined,
        notifyStudents: updateDto.notifyStudents,
        notifyGuardians: updateDto.notifyGuardians,
        notifyByEmail: updateDto.notifyByEmail,
        updatedBy: this.userId(),
      },
    });

    const dispatchResult =
      await this.notificationsService.dispatchLessonEventNotifications({
        lessonEvent: updatedEvent,
        lessonItem: currentEvent.lessonCalendarItem,
        action: "UPDATE",
      });

    const syncedEvent = await this.prisma.lessonEvent.update({
      where: { id },
      data: {
        lastNotifiedAt:
          dispatchResult.notificationsCreated > 0
            ? new Date()
            : currentEvent.lastNotifiedAt,
        updatedBy: this.userId(),
      },
    });

    return {
      ...this.mapEvent(syncedEvent),
      notificationsCreated: dispatchResult.notificationsCreated,
      emailSent: dispatchResult.emailSent,
    };
  }

  async remove(id: string) {
    await this.findLessonEventForTeacher(id);

    return this.prisma.lessonEvent.update({
      where: { id },
      data: {
        canceledAt: new Date(),
        canceledBy: this.userId(),
        updatedBy: this.userId(),
      },
    });
  }
}
