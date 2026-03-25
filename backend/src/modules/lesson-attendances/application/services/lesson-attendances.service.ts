import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../../prisma/prisma.service";
import { getTenantContext } from "../../../../common/tenant/tenant.context";
import { NotificationsService } from "../../../notifications/application/services/notifications.service";
import { UpsertLessonAttendanceDto } from "../dto/upsert-lesson-attendance.dto";

@Injectable()
export class LessonAttendancesService {
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

  private normalizeText(value?: string | null) {
    const normalized = String(value || "").trim();
    return normalized ? normalized.toUpperCase() : null;
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
        lessonAttendances: {
          where: {
            canceledAt: null,
          },
          include: {
            student: true,
          },
        },
      },
    });

    if (!lessonItem) {
      throw new NotFoundException("Aula não encontrada para este professor.");
    }

    return lessonItem;
  }

  private async findActiveEnrollments(lessonItem: Awaited<ReturnType<LessonAttendancesService["findLessonItemForTeacher"]>>) {
    return this.prisma.enrollment.findMany({
      where: {
        tenantId: this.tenantId(),
        schoolYearId: lessonItem.schoolYearId,
        seriesClassId: lessonItem.seriesClassId,
        status: "ATIVO",
        canceledAt: null,
        student: {
          canceledAt: null,
        },
      },
      include: {
        student: true,
      },
      orderBy: [{ student: { name: "asc" } }],
    });
  }

  private mapResponse(
    lessonItem: Awaited<ReturnType<LessonAttendancesService["findLessonItemForTeacher"]>>,
    enrollments: Awaited<ReturnType<LessonAttendancesService["findActiveEnrollments"]>>,
  ) {
    const attendanceByStudent = new Map(
      lessonItem.lessonAttendances.map((attendance) => [
        attendance.studentId,
        attendance,
      ]),
    );

    return {
      lessonItem: {
        id: lessonItem.id,
        lessonDate: lessonItem.lessonDate,
        startTime: lessonItem.startTime,
        endTime: lessonItem.endTime,
        subjectName:
          lessonItem.teacherSubject.subject?.name || "DISCIPLINA",
        teacherName:
          lessonItem.teacherSubject.teacher?.name || "PROFESSOR",
        seriesName: lessonItem.seriesClass.series?.name || "SEM SÉRIE",
        className: lessonItem.seriesClass.class?.name || "SEM TURMA",
        shift: lessonItem.seriesClass.class?.shift || null,
      },
      summary: {
        totalStudents: enrollments.length,
        totalPresentes: Array.from(attendanceByStudent.values()).filter(
          (attendance) => attendance.status === "PRESENTE",
        ).length,
        totalFaltou: Array.from(attendanceByStudent.values()).filter(
          (attendance) => attendance.status === "FALTOU",
        ).length,
      },
      students: enrollments.map((enrollment) => {
        const currentAttendance = attendanceByStudent.get(enrollment.studentId);
        return {
          studentId: enrollment.studentId,
          enrollmentId: enrollment.id,
          studentName: enrollment.student.name,
          studentEmail: enrollment.student.email,
          status: currentAttendance?.status || null,
          notes: currentAttendance?.notes || null,
          recordedAt: currentAttendance?.recordedAt || null,
        };
      }),
    };
  }

  async findByLessonItem(lessonCalendarItemId: string) {
    const lessonItem = await this.findLessonItemForTeacher(lessonCalendarItemId);
    const enrollments = await this.findActiveEnrollments(lessonItem);
    return this.mapResponse(lessonItem, enrollments);
  }

  async upsertByLessonItem(
    lessonCalendarItemId: string,
    dto: UpsertLessonAttendanceDto,
  ) {
    const lessonItem = await this.findLessonItemForTeacher(lessonCalendarItemId);
    const enrollments = await this.findActiveEnrollments(lessonItem);
    const validStudentIds = new Set(
      enrollments.map((enrollment) => enrollment.studentId),
    );

    for (const attendance of dto.attendances) {
      if (!validStudentIds.has(attendance.studentId)) {
        throw new BadRequestException(
          "Existe aluno informado que não pertence à turma desta aula.",
        );
      }
    }

    await this.prisma.$transaction(
      dto.attendances.map((attendance) =>
        this.prisma.lessonAttendance.upsert({
          where: {
            lessonCalendarItemId_studentId: {
              lessonCalendarItemId,
              studentId: attendance.studentId,
            },
          },
          update: {
            status: attendance.status,
            notes: this.normalizeText(attendance.notes),
            recordedAt: new Date(),
            updatedBy: this.userId(),
            canceledAt: null,
            canceledBy: null,
          },
          create: {
            tenantId: this.tenantId(),
            lessonCalendarItemId,
            studentId: attendance.studentId,
            teacherId: this.userId(),
            status: attendance.status,
            notes: this.normalizeText(attendance.notes),
            recordedAt: new Date(),
            createdBy: this.userId(),
            updatedBy: this.userId(),
          },
        }),
      ),
    );

    let notificationsCreated = 0;
    if (dto.notifyStudents || dto.notifyGuardians) {
      const dispatchResult =
        await this.notificationsService.dispatchAttendanceNotifications({
          attendance: {
            lessonCalendarItemId,
            notifyStudents: dto.notifyStudents === true,
            notifyGuardians: dto.notifyGuardians === true,
          },
          lessonItem: {
            id: lessonItem.id,
            lessonDate: lessonItem.lessonDate,
            startTime: lessonItem.startTime,
            endTime: lessonItem.endTime,
            schoolYearId: lessonItem.schoolYearId,
            seriesClassId: lessonItem.seriesClassId,
            teacherSubject: lessonItem.teacherSubject,
            seriesClass: lessonItem.seriesClass,
          },
          attendanceStudents: dto.attendances.map((attendance) => ({
            studentId: attendance.studentId,
            status: attendance.status,
            notes: this.normalizeText(attendance.notes),
          })),
        });

      notificationsCreated = dispatchResult.notificationsCreated;
    }

    const refreshedLessonItem = await this.findLessonItemForTeacher(
      lessonCalendarItemId,
    );
    const refreshedEnrollments = await this.findActiveEnrollments(
      refreshedLessonItem,
    );
    return {
      ...this.mapResponse(refreshedLessonItem, refreshedEnrollments),
      notificationsCreated,
    };
  }
}
