import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../../prisma/prisma.service";
import { CreateStudentDto } from "../dto/create-student.dto";
import { UpdateStudentDto } from "../dto/update-student.dto";
import { AssignStudentSeriesClassDto } from "../dto/assign-student-series-class.dto";
import { getTenantContext } from "../../../../common/tenant/tenant.context";
import * as bcrypt from "bcrypt";
import { SharedProfilesService } from "../../../shared-profiles/application/services/shared-profiles.service";
import {
  getDefaultAccessProfileForRole,
  normalizeAccessProfileCode,
  resolveAccountPermissions,
} from "../../../../common/auth/access-profiles";
import { serializePermissions } from "../../../../common/auth/user-permissions";
import type { ICurrentUser } from "../../../../common/decorators/current-user.decorator";
import {
  canViewStudentAccessData,
  canViewStudentFinancialData,
  sanitizeStudentForViewer,
} from "../../../../common/auth/entity-visibility";

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sharedProfilesService: SharedProfilesService,
  ) {}

  private normalizeDocument(value?: string | null): string {
    return String(value || "").replace(/\D/g, "");
  }

  private async assertUniqueStudentCpf(
    tenantId: string,
    cpf?: string | null,
    excludeStudentId?: string,
  ) {
    const normalizedCpf = this.normalizeDocument(cpf);
    if (!normalizedCpf) return;

    const students = await this.prisma.student.findMany({
      where: {
        tenantId,
        canceledAt: null,
        cpf: { not: null },
        ...(excludeStudentId ? { id: { not: excludeStudentId } } : {}),
      },
      select: {
        id: true,
        name: true,
        cpf: true,
      },
    });

    const conflict = students.find(
      (student) => this.normalizeDocument(student.cpf) === normalizedCpf,
    );

    if (conflict) {
      throw new ConflictException(
        `Já existe um aluno com este CPF nesta escola: ${conflict.name}.`,
      );
    }
  }

  private tenantId() {
    return getTenantContext()!.tenantId;
  }

  private userId() {
    return getTenantContext()!.userId;
  }

  private transformToUpperCase(data: any): any {
    const transformed = { ...data };
    for (const key in transformed) {
      if (
        typeof transformed[key] === "string" &&
        key !== "password" &&
        key !== "email" &&
        key !== "photoUrl"
      ) {
        transformed[key] = transformed[key].toUpperCase();
      }
    }
    return transformed;
  }

  private normalizeMonthlyFee(value?: number | null) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  private sanitizeStudentMutationDto<
    T extends CreateStudentDto | UpdateStudentDto,
  >(dto: T, viewer?: ICurrentUser | null): T {
    const sanitizedDto = { ...dto };

    if (!canViewStudentFinancialData(viewer)) {
      delete sanitizedDto.monthlyFee;
    }

    if (!canViewStudentAccessData(viewer)) {
      delete sanitizedDto.email;
      delete sanitizedDto.password;
      delete sanitizedDto.accessProfile;
      delete sanitizedDto.permissions;
    }

    return sanitizedDto;
  }

  private mapStudentAccess<
    T extends { accessProfile?: string | null; permissions?: string | null },
  >(student: T) {
    return {
      ...student,
      accessProfile:
        normalizeAccessProfileCode(student.accessProfile, "ALUNO") ||
        getDefaultAccessProfileForRole("ALUNO"),
      permissions: resolveAccountPermissions({
        role: "ALUNO",
        accessProfile: student.accessProfile,
        permissions: student.permissions,
      }),
    };
  }

  private formatDateOnly(value?: Date | null) {
    return value ? new Date(value).toISOString().slice(0, 10) : null;
  }

  private calculatePercentage(value: number, total: number) {
    if (!total) return 0;
    return Number(((value / total) * 100).toFixed(2));
  }

  private calculateAverage(values: number[]) {
    if (!values.length) return 0;
    const total = values.reduce(
      (accumulator, current) => accumulator + current,
      0,
    );
    return Number((total / values.length).toFixed(2));
  }

  private normalizeStudentDisplayName<
    T extends {
      name?: string | null;
      person?: { name?: string | null } | null;
    },
  >(student: T) {
    const currentName = String(student.name || "").trim();
    if (currentName) return student;

    const fallbackName = String(student.person?.name || "").trim();
    return {
      ...student,
      name: fallbackName || "PESSOA SEM NOME",
    };
  }

  private async findStudentEntity(id: string) {
    const student = await this.prisma.student.findFirst({
      where: {
        id,
        tenantId: this.tenantId(),
      },
      include: {
        guardians: {
          include: { guardian: true },
        },
        person: true,
        enrollments: {
          where: { canceledAt: null },
          include: {
            seriesClass: {
              include: {
                series: true,
                class: true,
              },
            },
          },
          orderBy: [{ schoolYear: { year: "desc" } }, { createdAt: "desc" }],
        },
      },
    });

    if (!student) {
      throw new NotFoundException("Aluno não encontrado na sua Instituição.");
    }

    return student;
  }

  // ==========================================
  // VALIDAÇÃO E BUSCA AUTOMÁTICA DE CEP OBRIGATÓRIA (DIRETIVA)
  // ==========================================
  private async fillAddressFromViaCep(data: any): Promise<void> {
    if (data.zipCode) {
      try {
        const cleanZip = data.zipCode.replace(/\D/g, ""); // Limpa caracteres não numéricos
        if (cleanZip.length >= 8) {
          const response = await fetch(
            `https://viacep.com.br/ws/${cleanZip}/json/`,
          );
          const viaCepData = await response.json();

          if (!viaCepData.erro) {
            // Só substitui a tabela se o usuário não enviou o dado manual
            data.street = data.street || viaCepData.logradouro;
            data.neighborhood = data.neighborhood || viaCepData.bairro;
            data.city = data.city || viaCepData.localidade;
            data.state = data.state || viaCepData.uf;
          }
        }
      } catch (err) {
        // Falha silenciosa pra rede externa não derrubar nosso sistema principal
      }
    }
  }

  async create(createDto: CreateStudentDto, currentUser?: ICurrentUser) {
    const sanitizedDto = this.sanitizeStudentMutationDto(
      createDto,
      currentUser,
    );

    await this.sharedProfilesService.hydrateMissingFieldsFromCpf(
      this.tenantId(),
      sanitizedDto,
      "STUDENT",
    );

    sanitizedDto.name = this.sharedProfilesService.resolveWritableName(
      sanitizedDto.name,
    );

    await this.assertUniqueStudentCpf(this.tenantId(), sanitizedDto.cpf);

    // 1. Completa Endereços faltantes batendo na API Externa ViaCEP
    await this.fillAddressFromViaCep(sanitizedDto);

    if (sanitizedDto.email)
      sanitizedDto.email = sanitizedDto.email.toUpperCase();

    let hashedPassword: string | undefined;
    if (sanitizedDto.password) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(sanitizedDto.password, salt);
    } else if (sanitizedDto.email) {
      hashedPassword =
        (await this.sharedProfilesService.findSharedPasswordByEmail(
          this.tenantId(),
          sanitizedDto.email,
        )) || undefined;
    }
    const accessProfile =
      normalizeAccessProfileCode(sanitizedDto.accessProfile, "ALUNO") ||
      getDefaultAccessProfileForRole("ALUNO");
    const explicitPermissions =
      Array.isArray(sanitizedDto.permissions) &&
      sanitizedDto.permissions.length > 0
        ? serializePermissions(sanitizedDto.permissions)
        : null;

    // 2. Transforma tudo em Maiúsculo para banco (exceto senha/email)
    const rawData = this.transformToUpperCase(sanitizedDto);
    delete rawData.permissions;
    delete rawData.accessProfile;

    const createdStudent = await this.prisma.student.create({
      data: {
        ...rawData,
        password: hashedPassword,
        accessProfile,
        permissions: explicitPermissions,
        photoUrl: sanitizedDto.photoUrl?.trim() || null,
        monthlyFee: this.normalizeMonthlyFee(sanitizedDto.monthlyFee),
        birthDate: sanitizedDto.birthDate
          ? new Date(sanitizedDto.birthDate)
          : undefined,
        tenantId: this.tenantId(),
        createdBy: this.userId(), // Auditoria OBRIGATÓRIA
      },
    });

    await this.sharedProfilesService.syncSharedProfile(
      this.tenantId(),
      "STUDENT",
      createdStudent.id,
      createdStudent,
      this.userId(),
    );

    if (sanitizedDto.email && hashedPassword) {
      await this.sharedProfilesService.syncSharedPasswordByEmail(
        this.tenantId(),
        sanitizedDto.email,
        hashedPassword,
        { kind: "STUDENT", id: createdStudent.id },
        this.userId(),
      );
    }

    return sanitizeStudentForViewer(
      this.mapStudentAccess(createdStudent),
      currentUser,
    );
  }

  async findAll(currentUser?: ICurrentUser) {
    const students = await this.prisma.student.findMany({
      where: {
        tenantId: this.tenantId(),
      }, // Aplica o Soft Delete
      include: {
        person: true,
        enrollments: {
          where: { canceledAt: null },
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
        },
      },
      orderBy: [{ canceledAt: "asc" }, { name: "asc" }],
    });

    return students.map((student) =>
      sanitizeStudentForViewer(
        this.mapStudentAccess(this.normalizeStudentDisplayName(student)),
        currentUser,
      ),
    );
  }

  async findOne(id: string, currentUser?: ICurrentUser) {
    const student = await this.findStudentEntity(id);
    return sanitizeStudentForViewer(
      this.mapStudentAccess(this.normalizeStudentDisplayName(student)),
      currentUser,
    );
  }

  async findMe(userId: string, tenantId: string, currentUser?: ICurrentUser) {
    const student = await this.prisma.student.findFirst({
      where: {
        id: userId,
        tenantId,
        canceledAt: null,
      },
      include: {
        person: true,
        guardians: {
          include: { guardian: true },
        },
        enrollments: {
          where: { canceledAt: null },
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
        },
      },
    });

    if (!student) {
      throw new NotFoundException("Aluno não encontrado para esta escola.");
    }

    return sanitizeStudentForViewer(
      this.mapStudentAccess(this.normalizeStudentDisplayName(student)),
      currentUser,
    );
  }

  async findMyPwaSummary(
    userId: string,
    tenantId: string,
    currentUser?: ICurrentUser,
  ) {
    const student = await this.prisma.student.findFirst({
      where: {
        id: userId,
        tenantId,
        canceledAt: null,
      },
      include: {
        guardians: {
          where: {
            canceledAt: null,
          },
          include: {
            guardian: true,
          },
        },
        enrollments: {
          where: { canceledAt: null },
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
        },
      },
    });

    if (!student) {
      throw new NotFoundException("Aluno não encontrado para esta escola.");
    }

    const currentEnrollment =
      student.enrollments.find((enrollment) => enrollment.status === "ATIVO") ||
      student.enrollments[0] ||
      null;

    const [attendanceHistory, assessmentGrades] = await Promise.all([
      this.prisma.lessonAttendance.findMany({
        where: {
          tenantId,
          studentId: userId,
          canceledAt: null,
          lessonCalendarItem: {
            canceledAt: null,
          },
        },
        include: {
          lessonCalendarItem: {
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
            },
          },
        },
        orderBy: [{ recordedAt: "desc" }, { createdAt: "desc" }],
      }),
      this.prisma.lessonAssessmentGrade.findMany({
        where: {
          tenantId,
          studentId: userId,
          canceledAt: null,
          lessonAssessment: {
            canceledAt: null,
            lessonCalendarItem: {
              canceledAt: null,
            },
          },
        },
        include: {
          lessonAssessment: {
            include: {
              lessonEvent: true,
              lessonCalendarItem: {
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
                },
              },
            },
          },
        },
        orderBy: [{ releasedAt: "desc" }, { createdAt: "desc" }],
      }),
    ]);

    const attendanceBySubject = new Map<
      string,
      {
        subjectId: string | null;
        subjectName: string;
        totalLessons: number;
        totalPresent: number;
        totalAbsent: number;
        lastRecordedAt: string | null;
      }
    >();

    const attendanceHistoryItems = attendanceHistory.map((attendance) => {
      const lessonItem = attendance.lessonCalendarItem;
      const subjectId = lessonItem.teacherSubject?.subject?.id || null;
      const subjectName =
        lessonItem.teacherSubject?.subject?.name || "DISCIPLINA";
      const subjectKey = `${subjectId || subjectName}:${subjectName}`;
      const currentSubject = attendanceBySubject.get(subjectKey) || {
        subjectId,
        subjectName,
        totalLessons: 0,
        totalPresent: 0,
        totalAbsent: 0,
        lastRecordedAt: null,
      };

      currentSubject.totalLessons += 1;
      if (attendance.status === "PRESENTE") {
        currentSubject.totalPresent += 1;
      } else {
        currentSubject.totalAbsent += 1;
      }
      currentSubject.lastRecordedAt =
        this.formatDateOnly(attendance.recordedAt) ||
        currentSubject.lastRecordedAt;
      attendanceBySubject.set(subjectKey, currentSubject);

      return {
        id: attendance.id,
        status: attendance.status,
        notes: attendance.notes,
        recordedAt: attendance.recordedAt,
        lessonDate: lessonItem.lessonDate,
        subjectName,
        teacherName: lessonItem.teacherSubject?.teacher?.name || "PROFESSOR",
        schoolYear:
          lessonItem.schoolYear?.year !== undefined &&
          lessonItem.schoolYear?.year !== null
            ? lessonItem.schoolYear.year
            : null,
        seriesName: lessonItem.seriesClass?.series?.name || "SEM SÉRIE",
        className: lessonItem.seriesClass?.class?.name || "SEM TURMA",
        startTime: lessonItem.startTime,
        endTime: lessonItem.endTime,
      };
    });

    const attendanceTotalLessons = attendanceHistory.length;
    const attendanceTotalPresent = attendanceHistory.filter(
      (attendance) => attendance.status === "PRESENTE",
    ).length;
    const attendanceTotalAbsent = attendanceHistory.filter(
      (attendance) => attendance.status === "FALTOU",
    ).length;

    const gradesBySubject = new Map<
      string,
      {
        subjectId: string | null;
        subjectName: string;
        teacherName: string;
        scores: number[];
        latestReleasedAt: Date | null;
        assessments: Array<{
          id: string;
          title: string;
          assessmentType: string;
          score: number | null;
          maxScore: number | null;
          remarks: string | null;
          releasedAt: Date | null;
          lessonDate: Date | null;
          schoolYear: number | null;
        }>;
      }
    >();

    assessmentGrades.forEach((grade) => {
      const assessment = grade.lessonAssessment;
      const lessonItem = assessment.lessonCalendarItem;
      const subjectId = lessonItem?.teacherSubject?.subject?.id || null;
      const subjectName =
        lessonItem?.teacherSubject?.subject?.name || "DISCIPLINA";
      const teacherName =
        lessonItem?.teacherSubject?.teacher?.name || "PROFESSOR";
      const subjectKey = `${subjectId || subjectName}:${subjectName}`;
      const currentSubject = gradesBySubject.get(subjectKey) || {
        subjectId,
        subjectName,
        teacherName,
        scores: [],
        latestReleasedAt: null,
        assessments: [],
      };

      if (typeof grade.score === "number") {
        currentSubject.scores.push(grade.score);
      }

      if (
        grade.releasedAt &&
        (!currentSubject.latestReleasedAt ||
          grade.releasedAt.getTime() >
            currentSubject.latestReleasedAt.getTime())
      ) {
        currentSubject.latestReleasedAt = grade.releasedAt;
      }

      currentSubject.assessments.push({
        id: grade.id,
        title: assessment.title,
        assessmentType: assessment.assessmentType,
        score: grade.score,
        maxScore: assessment.maxScore,
        remarks: grade.remarks,
        releasedAt: grade.releasedAt,
        lessonDate: lessonItem?.lessonDate || null,
        schoolYear:
          lessonItem?.schoolYear?.year !== undefined &&
          lessonItem?.schoolYear?.year !== null
            ? lessonItem.schoolYear.year
            : null,
      });
      gradesBySubject.set(subjectKey, currentSubject);
    });

    const releasedScores = assessmentGrades
      .map((grade) => grade.score)
      .filter((score): score is number => typeof score === "number");

    return {
      student: sanitizeStudentForViewer(
        this.mapStudentAccess(student),
        currentUser,
      ),
      currentEnrollment: currentEnrollment
        ? {
            id: currentEnrollment.id,
            status: currentEnrollment.status,
            schoolYearId: currentEnrollment.schoolYearId,
            schoolYear: currentEnrollment.schoolYear?.year || null,
            seriesName:
              currentEnrollment.seriesClass?.series?.name || "SEM SÉRIE",
            className:
              currentEnrollment.seriesClass?.class?.name || "SEM TURMA",
            shift: currentEnrollment.seriesClass?.class?.shift || null,
          }
        : null,
      attendance: {
        totalLessons: attendanceTotalLessons,
        totalPresent: attendanceTotalPresent,
        totalAbsent: attendanceTotalAbsent,
        overallFrequency: this.calculatePercentage(
          attendanceTotalPresent,
          attendanceTotalLessons,
        ),
        bySubject: Array.from(attendanceBySubject.values())
          .map((subject) => ({
            ...subject,
            frequency: this.calculatePercentage(
              subject.totalPresent,
              subject.totalLessons,
            ),
          }))
          .sort((left, right) => right.frequency - left.frequency),
        history: attendanceHistoryItems,
      },
      grades: {
        totalReleasedGrades: releasedScores.length,
        overallAverage: this.calculateAverage(releasedScores),
        bySubject: Array.from(gradesBySubject.values())
          .map((subject) => ({
            subjectId: subject.subjectId,
            subjectName: subject.subjectName,
            teacherName: subject.teacherName,
            averageScore: this.calculateAverage(subject.scores),
            totalReleasedGrades: subject.scores.length,
            latestReleasedAt: subject.latestReleasedAt,
            assessments: subject.assessments.sort((left, right) => {
              const rightDate =
                right.releasedAt || right.lessonDate || new Date(0);
              const leftDate =
                left.releasedAt || left.lessonDate || new Date(0);
              return rightDate.getTime() - leftDate.getTime();
            }),
          }))
          .sort((left, right) => {
            if (right.averageScore !== left.averageScore) {
              return right.averageScore - left.averageScore;
            }
            return left.subjectName.localeCompare(right.subjectName);
          }),
      },
      syncedAt: new Date().toISOString(),
    };
  }

  async update(
    id: string,
    updateDto: UpdateStudentDto,
    currentUser?: ICurrentUser,
  ) {
    const currentStudent = await this.findStudentEntity(id);
    const sanitizedDto = this.sanitizeStudentMutationDto(
      updateDto,
      currentUser,
    );

    await this.sharedProfilesService.hydrateMissingFieldsFromCpf(
      this.tenantId(),
      sanitizedDto,
      "STUDENT",
      id,
    );

    if (
      sanitizedDto.cpf &&
      this.normalizeDocument(sanitizedDto.cpf) !==
        this.normalizeDocument(currentStudent.cpf)
    ) {
      await this.assertUniqueStudentCpf(this.tenantId(), sanitizedDto.cpf, id);
    }

    // Autocompleta o endereço rebatendo no ViaCEP antes da atualização caso ele tenha mudado de CEP
    await this.fillAddressFromViaCep(sanitizedDto);

    if (sanitizedDto.email)
      sanitizedDto.email = sanitizedDto.email.toUpperCase();

    let hashedPassword: string | undefined;
    if (sanitizedDto.password) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(sanitizedDto.password, salt);
    }
    const accessProfile =
      normalizeAccessProfileCode(
        sanitizedDto.accessProfile ?? currentStudent.accessProfile,
        "ALUNO",
      ) || getDefaultAccessProfileForRole("ALUNO");
    const explicitPermissions =
      Array.isArray(sanitizedDto.permissions) &&
      sanitizedDto.permissions.length > 0
        ? serializePermissions(sanitizedDto.permissions)
        : Object.prototype.hasOwnProperty.call(sanitizedDto, "permissions")
          ? null
          : currentStudent.permissions;
    const resolvedStudentName = this.sharedProfilesService.resolveWritableName(
      sanitizedDto.name,
      currentStudent.name || currentStudent.person?.name,
    );
    const shouldDetachBlankCpfPersonLink =
      !this.normalizeDocument(sanitizedDto.cpf || currentStudent.cpf) &&
      Boolean(currentStudent.personId) &&
      !this.normalizeDocument(currentStudent.person?.cpf);

    const rawData = this.transformToUpperCase(sanitizedDto);
    delete rawData.password;
    delete rawData.permissions;
    delete rawData.accessProfile;

    const updatedStudent = await this.prisma.student.update({
      where: { id },
      data: {
        ...rawData,
        name: resolvedStudentName,
        password: hashedPassword || undefined,
        accessProfile,
        permissions: explicitPermissions,
        photoUrl: Object.prototype.hasOwnProperty.call(sanitizedDto, "photoUrl")
          ? sanitizedDto.photoUrl?.trim() || null
          : undefined,
        monthlyFee: Object.prototype.hasOwnProperty.call(
          sanitizedDto,
          "monthlyFee",
        )
          ? this.normalizeMonthlyFee(sanitizedDto.monthlyFee)
          : undefined,
        personId: shouldDetachBlankCpfPersonLink ? null : undefined,
        birthDate: sanitizedDto.birthDate
          ? new Date(sanitizedDto.birthDate)
          : undefined,
        updatedBy: this.userId(),
      },
    });

    await this.sharedProfilesService.syncSharedProfile(
      this.tenantId(),
      "STUDENT",
      updatedStudent.id,
      {
        ...updatedStudent,
        name: resolvedStudentName,
      },
      this.userId(),
      currentStudent.cpf,
    );

    const emailForPasswordSync = sanitizedDto.email || currentStudent.email;
    if (emailForPasswordSync && hashedPassword) {
      await this.sharedProfilesService.syncSharedPasswordByEmail(
        this.tenantId(),
        emailForPasswordSync,
        hashedPassword,
        { kind: "STUDENT", id: updatedStudent.id },
        this.userId(),
      );
    }

    return sanitizeStudentForViewer(
      this.mapStudentAccess(
        this.normalizeStudentDisplayName({
          ...updatedStudent,
          name: resolvedStudentName,
          person: currentStudent.person || null,
        }),
      ),
      currentUser,
    );
  }

  async assignSeriesClass(
    studentId: string,
    assignDto: AssignStudentSeriesClassDto,
  ) {
    const student = await this.prisma.student.findFirst({
      where: {
        id: studentId,
        tenantId: this.tenantId(),
        canceledAt: null,
      },
    });

    if (!student) {
      throw new NotFoundException("Aluno não encontrado na sua Instituição.");
    }

    const activeSchoolYear = await this.prisma.schoolYear.findFirst({
      where: {
        tenantId: this.tenantId(),
        canceledAt: null,
        isActive: true,
      },
      orderBy: { year: "desc" },
    });

    const requestedSeriesClassId = assignDto.seriesClassId?.trim() || null;

    if (!requestedSeriesClassId) {
      if (!activeSchoolYear) {
        return { enrollment: null };
      }

      const currentEnrollment = await this.prisma.enrollment.findFirst({
        where: {
          tenantId: this.tenantId(),
          studentId,
          schoolYearId: activeSchoolYear.id,
          canceledAt: null,
        },
      });

      if (!currentEnrollment) {
        return { enrollment: null };
      }

      await this.prisma.enrollment.update({
        where: { id: currentEnrollment.id },
        data: {
          status: "CANCELADO",
          canceledAt: new Date(),
          canceledBy: this.userId(),
          updatedBy: this.userId(),
        },
      });

      return { enrollment: null };
    }

    if (!activeSchoolYear) {
      throw new ConflictException(
        "Cadastre ou ative um ano letivo antes de vincular uma turma ao aluno.",
      );
    }

    const seriesClass = await this.prisma.seriesClass.findFirst({
      where: {
        id: requestedSeriesClassId,
        tenantId: this.tenantId(),
        canceledAt: null,
      },
      include: {
        series: true,
        class: true,
      },
    });

    if (!seriesClass) {
      throw new NotFoundException("Turma + Série inválida para esta escola.");
    }

    const enrollment = await this.prisma.$transaction(async (tx) => {
      const currentEnrollment = await tx.enrollment.findFirst({
        where: {
          tenantId: this.tenantId(),
          studentId,
          schoolYearId: activeSchoolYear.id,
          canceledAt: null,
        },
      });

      if (currentEnrollment?.seriesClassId === seriesClass.id) {
        return tx.enrollment.findUnique({
          where: { id: currentEnrollment.id },
          include: {
            seriesClass: {
              include: {
                series: true,
                class: true,
              },
            },
          },
        });
      }

      if (currentEnrollment) {
        await tx.enrollment.update({
          where: { id: currentEnrollment.id },
          data: {
            status: "CANCELADO",
            canceledAt: new Date(),
            canceledBy: this.userId(),
            updatedBy: this.userId(),
          },
        });
      }

      return tx.enrollment.create({
        data: {
          tenantId: this.tenantId(),
          studentId,
          classId: seriesClass.classId,
          seriesClassId: seriesClass.id,
          schoolYearId: activeSchoolYear.id,
          status: "ATIVO",
          createdBy: this.userId(),
        },
        include: {
          seriesClass: {
            include: {
              series: true,
              class: true,
            },
          },
        },
      });
    });

    return { enrollment };
  }

  async remove(id: string) {
    await this.findStudentEntity(id);

    // Soft Delete OBRIGATÓRIO da Diretiva
    return this.prisma.student.updateMany({
      where: { id },
      data: {
        canceledAt: new Date(),
        canceledBy: this.userId(),
      },
    });
  }

  async setActiveStatus(id: string, active: boolean) {
    await this.findStudentEntity(id);

    const updatedStudent = await this.prisma.student.update({
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
        ? "Aluno ativado com sucesso."
        : "Aluno inativado com sucesso.",
      student: this.mapStudentAccess(updatedStudent),
    };
  }
}
