import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../../prisma/prisma.service";
import { getTenantContext } from "../../../../common/tenant/tenant.context";
import { NotificationsService } from "../../../notifications/application/services/notifications.service";
import {
  UpsertLessonAssessmentDto,
} from "../dto/upsert-lesson-assessment.dto";
import { ListMyTeacherAssessmentsDto } from "../dto/list-my-teacher-assessments.dto";

@Injectable()
export class LessonAssessmentsService {
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

  private parseDecimal(value?: string | null) {
    const normalized = String(value || "").trim();
    if (!normalized) return null;
    const parsed = Number.parseFloat(normalized.replace(",", "."));
    if (!Number.isFinite(parsed)) {
      throw new BadRequestException(
        "Informe um valor numérico válido. Exemplo: 8,5",
      );
    }
    return parsed;
  }

  private async findLessonEventForTeacher(lessonEventId: string) {
    const lessonEvent = await this.prisma.lessonEvent.findFirst({
      where: {
        id: lessonEventId,
        tenantId: this.tenantId(),
        teacherId: this.userId(),
        canceledAt: null,
        eventType: {
          in: ["PROVA", "TRABALHO"],
        },
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
        assessment: {
          include: {
            grades: {
              where: {
                canceledAt: null,
              },
              include: {
                student: true,
              },
            },
          },
        },
      },
    });

    if (!lessonEvent) {
      throw new NotFoundException(
        "Prova ou trabalho não encontrado para este professor.",
      );
    }

    return lessonEvent;
  }

  private requireLessonCalendarItem(
    lessonEvent: Awaited<
      ReturnType<LessonAssessmentsService["findLessonEventForTeacher"]>
    >,
  ) {
    if (!lessonEvent.lessonCalendarItem) {
      throw new BadRequestException(
        "A avaliação precisa estar vinculada a uma aula válida.",
      );
    }

    return lessonEvent.lessonCalendarItem;
  }

  async findMyTeacherAssessments(query: ListMyTeacherAssessmentsDto) {
    const normalizedStatus = String(query.status || "ALL").trim().toUpperCase();
    const events = await this.prisma.lessonEvent.findMany({
      where: {
        tenantId: this.tenantId(),
        teacherId: this.userId(),
        canceledAt: null,
        eventType: {
          in: ["PROVA", "TRABALHO"],
        },
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
        assessment: {
          include: {
            grades: {
              where: {
                canceledAt: null,
              },
            },
          },
        },
      },
      orderBy: [
        { lessonCalendarItem: { lessonDate: "desc" } },
        { lessonCalendarItem: { startTime: "asc" } },
      ],
    });

    const enrollmentKeys = new Map<string, number>();
    const linkedEvents = events.filter((event) => event.lessonCalendarItem);
    const uniqueCombos = Array.from(
      new Set(
        linkedEvents.map(
          (event) =>
            `${event.lessonCalendarItem!.schoolYearId}:${event.lessonCalendarItem!.seriesClassId}`,
        ),
      ),
    );

    await Promise.all(
      uniqueCombos.map(async (combo) => {
        const [schoolYearId, seriesClassId] = combo.split(":");
        const count = await this.prisma.enrollment.count({
          where: {
            tenantId: this.tenantId(),
            schoolYearId,
            seriesClassId,
            status: "ATIVO",
            canceledAt: null,
            student: {
              canceledAt: null,
            },
          },
        });
        enrollmentKeys.set(combo, count);
      }),
    );

    const mapped = linkedEvents.map((event) => {
      const lessonItem = event.lessonCalendarItem!;
      const comboKey = `${lessonItem.schoolYearId}:${lessonItem.seriesClassId}`;
      const totalStudents = enrollmentKeys.get(comboKey) || 0;
      const gradedStudentsCount =
        event.assessment?.grades.filter((grade) => grade.score !== null).length || 0;
      const hasGrades = gradedStudentsCount > 0;

      return {
        lessonEventId: event.id,
        eventType: event.eventType,
        eventTypeLabel: event.eventType === "PROVA" ? "PROVA" : "TRABALHO",
        title: event.title,
        description: event.description,
        lessonDate: lessonItem.lessonDate,
        startTime: lessonItem.startTime,
        endTime: lessonItem.endTime,
        subjectName: lessonItem.teacherSubject.subject?.name || "DISCIPLINA",
        teacherName: lessonItem.teacherSubject.teacher?.name || "PROFESSOR",
        seriesName: lessonItem.seriesClass.series?.name || "SEM SÉRIE",
        className: lessonItem.seriesClass.class?.name || "SEM TURMA",
        shift: lessonItem.seriesClass.class?.shift || null,
        totalStudents,
        gradedStudentsCount,
        pendingStudentsCount: Math.max(totalStudents - gradedStudentsCount, 0),
        hasAssessment: !!event.assessment,
        lastNotifiedAt: event.assessment?.lastNotifiedAt || null,
        assessmentId: event.assessment?.id || null,
      };
    });

    const filtered =
      normalizedStatus === "PENDING"
        ? mapped.filter((event) => event.pendingStudentsCount > 0)
        : normalizedStatus === "GRADED"
          ? mapped.filter((event) => event.gradedStudentsCount > 0)
          : mapped;

    return {
      items: filtered,
      totalItems: filtered.length,
      totalPending: filtered.filter((event) => event.pendingStudentsCount > 0).length,
      totalWithGrades: filtered.filter((event) => event.gradedStudentsCount > 0).length,
    };
  }

  private async findActiveStudentsForLessonEvent(lessonEvent: Awaited<ReturnType<LessonAssessmentsService["findLessonEventForTeacher"]>>) {
    const lessonItem = this.requireLessonCalendarItem(lessonEvent);
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
        student: {
          include: {
            guardians: {
              where: {
                canceledAt: null,
              },
              include: {
                guardian: true,
              },
            },
          },
        },
      },
      orderBy: [{ student: { name: "asc" } }],
    });
  }

  private mapAssessmentResponse(
    lessonEvent: Awaited<ReturnType<LessonAssessmentsService["findLessonEventForTeacher"]>>,
    enrollments: Awaited<ReturnType<LessonAssessmentsService["findActiveStudentsForLessonEvent"]>>,
  ) {
    const lessonItem = this.requireLessonCalendarItem(lessonEvent);
    const gradesByStudent = new Map(
      (lessonEvent.assessment?.grades || []).map((grade) => [grade.studentId, grade]),
    );

    return {
      lessonEvent: {
        id: lessonEvent.id,
        eventType: lessonEvent.eventType,
        eventTypeLabel: lessonEvent.eventType === "PROVA" ? "PROVA" : "TRABALHO",
        title: lessonEvent.title,
        description: lessonEvent.description,
      },
      lessonItem: {
        id: lessonItem.id,
        lessonDate: lessonItem.lessonDate,
        startTime: lessonItem.startTime,
        endTime: lessonItem.endTime,
        subjectName: lessonItem.teacherSubject.subject?.name || "DISCIPLINA",
        teacherName: lessonItem.teacherSubject.teacher?.name || "PROFESSOR",
        seriesName: lessonItem.seriesClass.series?.name || "SEM SÉRIE",
        className: lessonItem.seriesClass.class?.name || "SEM TURMA",
        schoolYearId: lessonItem.schoolYearId,
        seriesClassId: lessonItem.seriesClassId,
      },
      assessment: lessonEvent.assessment
        ? {
            id: lessonEvent.assessment.id,
            title: lessonEvent.assessment.title,
            description: lessonEvent.assessment.description,
            maxScore: lessonEvent.assessment.maxScore,
            notifyStudents: lessonEvent.assessment.notifyStudents,
            notifyGuardians: lessonEvent.assessment.notifyGuardians,
            notifyByEmail: lessonEvent.assessment.notifyByEmail,
            lastNotifiedAt: lessonEvent.assessment.lastNotifiedAt,
          }
        : null,
      students: enrollments.map((enrollment) => {
        const currentGrade = gradesByStudent.get(enrollment.student.id);
        return {
          studentId: enrollment.student.id,
          enrollmentId: enrollment.id,
          studentName: enrollment.student.name,
          studentEmail: enrollment.student.email,
          guardiansCount: enrollment.student.guardians.length,
          score: currentGrade?.score ?? null,
          remarks: currentGrade?.remarks ?? null,
          releasedAt: currentGrade?.releasedAt ?? null,
        };
      }),
    };
  }

  async findByLessonEvent(lessonEventId: string) {
    const lessonEvent = await this.findLessonEventForTeacher(lessonEventId);
    const enrollments = await this.findActiveStudentsForLessonEvent(lessonEvent);
    return this.mapAssessmentResponse(lessonEvent, enrollments);
  }

  async upsertByLessonEvent(lessonEventId: string, dto: UpsertLessonAssessmentDto) {
    const lessonEvent = await this.findLessonEventForTeacher(lessonEventId);
    const lessonItem = this.requireLessonCalendarItem(lessonEvent);
    const enrollments = await this.findActiveStudentsForLessonEvent(lessonEvent);
    const validStudentIds = new Set(enrollments.map((enrollment) => enrollment.studentId));

    const normalizedGrades = dto.grades.map((grade) => {
      if (!validStudentIds.has(grade.studentId)) {
        throw new BadRequestException(
          "Existe aluno informado que não pertence à turma desta avaliação.",
        );
      }

      return {
        studentId: grade.studentId,
        score: this.parseDecimal(grade.score),
        remarks: grade.remarks ? this.normalizeText(grade.remarks) : null,
      };
    });

    const assessmentTitle = this.normalizeText(
      dto.title || lessonEvent.title || lessonEvent.eventType,
    );
    const assessmentDescription = dto.description
      ? this.normalizeText(dto.description)
      : lessonEvent.description
        ? this.normalizeText(lessonEvent.description)
        : null;
    const maxScore = this.parseDecimal(dto.maxScore) ?? 10;

    const result = await this.prisma.$transaction(async (tx) => {
      const currentAssessment = await tx.lessonAssessment.findFirst({
        where: {
          lessonEventId,
          tenantId: this.tenantId(),
          canceledAt: null,
        },
        include: {
          grades: {
            where: { canceledAt: null },
          },
        },
      });

      const assessment = currentAssessment
        ? await tx.lessonAssessment.update({
            where: { id: currentAssessment.id },
            data: {
              title: assessmentTitle,
              description: assessmentDescription,
              maxScore,
              notifyStudents: dto.notifyStudents !== false,
              notifyGuardians: dto.notifyGuardians !== false,
              notifyByEmail: dto.notifyByEmail !== false,
              updatedBy: this.userId(),
            },
          })
        : await tx.lessonAssessment.create({
            data: {
              tenantId: this.tenantId(),
              lessonEventId,
              lessonCalendarItemId: lessonItem.id,
              teacherId: this.userId(),
              assessmentType: lessonEvent.eventType,
              title: assessmentTitle,
              description: assessmentDescription,
              maxScore,
              notifyStudents: dto.notifyStudents !== false,
              notifyGuardians: dto.notifyGuardians !== false,
              notifyByEmail: dto.notifyByEmail !== false,
              createdBy: this.userId(),
              updatedBy: this.userId(),
            },
          });

      for (const grade of normalizedGrades) {
        const existingGrade = currentAssessment?.grades.find(
          (item) => item.studentId === grade.studentId,
        );

        if (existingGrade) {
          await tx.lessonAssessmentGrade.update({
            where: { id: existingGrade.id },
            data: {
              score: grade.score,
              remarks: grade.remarks,
              releasedAt: grade.score !== null ? new Date() : null,
              updatedBy: this.userId(),
            },
          });
        } else {
          await tx.lessonAssessmentGrade.create({
            data: {
              tenantId: this.tenantId(),
              lessonAssessmentId: assessment.id,
              studentId: grade.studentId,
              score: grade.score,
              remarks: grade.remarks,
              releasedAt: grade.score !== null ? new Date() : null,
              createdBy: this.userId(),
              updatedBy: this.userId(),
            },
          });
        }
      }

      return assessment;
    });

    const assessedStudents = normalizedGrades.filter(
      (
        grade,
      ): grade is {
        studentId: string;
        score: number;
        remarks: string | null;
      } => grade.score !== null,
    );
    let notificationsCreated = 0;
    let emailSent = false;

    if (assessedStudents.length > 0) {
      const dispatchResult =
        await this.notificationsService.dispatchAssessmentGradeNotifications({
          assessment: {
            id: result.id,
            assessmentType: result.assessmentType,
            title: result.title,
            description: result.description,
            maxScore: result.maxScore,
            notifyStudents: result.notifyStudents,
            notifyGuardians: result.notifyGuardians,
            notifyByEmail: result.notifyByEmail,
          },
          lessonItem,
          gradedStudents: assessedStudents,
        });

      notificationsCreated = dispatchResult.notificationsCreated;
      emailSent = dispatchResult.emailSent;

      if (notificationsCreated > 0) {
        await this.prisma.lessonAssessment.update({
          where: { id: result.id },
          data: {
            lastNotifiedAt: new Date(),
            updatedBy: this.userId(),
          },
        });
      }
    }

    const refreshedLessonEvent = await this.findLessonEventForTeacher(lessonEventId);
    const refreshedEnrollments =
      await this.findActiveStudentsForLessonEvent(refreshedLessonEvent);

    return {
      ...this.mapAssessmentResponse(refreshedLessonEvent, refreshedEnrollments),
      notificationsCreated,
      emailSent,
    };
  }
}
