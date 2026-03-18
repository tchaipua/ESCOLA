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

  private sanitizeStudentMutationDto<T extends CreateStudentDto | UpdateStudentDto>(
    dto: T,
    viewer?: ICurrentUser | null,
  ): T {
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

  private mapStudentAccess<T extends { accessProfile?: string | null; permissions?: string | null }>(
    student: T,
  ) {
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
    const sanitizedDto = this.sanitizeStudentMutationDto(createDto, currentUser);

    await this.sharedProfilesService.hydrateMissingFieldsFromCpf(
      this.tenantId(),
      sanitizedDto,
      "STUDENT",
    );

    await this.assertUniqueStudentCpf(this.tenantId(), sanitizedDto.cpf);

    // 1. Completa Endereços faltantes batendo na API Externa ViaCEP
    await this.fillAddressFromViaCep(sanitizedDto);

    if (sanitizedDto.email) sanitizedDto.email = sanitizedDto.email.toUpperCase();

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
      Array.isArray(sanitizedDto.permissions) && sanitizedDto.permissions.length > 0
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
      sanitizeStudentForViewer(this.mapStudentAccess(student), currentUser),
    );
  }

  async findOne(id: string, currentUser?: ICurrentUser) {
    const student = await this.findStudentEntity(id);
    return sanitizeStudentForViewer(this.mapStudentAccess(student), currentUser);
  }

  async findMe(userId: string, tenantId: string, currentUser?: ICurrentUser) {
    const student = await this.prisma.student.findFirst({
      where: {
        id: userId,
        tenantId,
        canceledAt: null,
      },
      include: {
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

    return sanitizeStudentForViewer(this.mapStudentAccess(student), currentUser);
  }

  async update(id: string, updateDto: UpdateStudentDto, currentUser?: ICurrentUser) {
    const currentStudent = await this.findStudentEntity(id);
    const sanitizedDto = this.sanitizeStudentMutationDto(updateDto, currentUser);

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

    if (sanitizedDto.email) sanitizedDto.email = sanitizedDto.email.toUpperCase();

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
      Array.isArray(sanitizedDto.permissions) && sanitizedDto.permissions.length > 0
        ? serializePermissions(sanitizedDto.permissions)
        : Object.prototype.hasOwnProperty.call(sanitizedDto, "permissions")
          ? null
          : currentStudent.permissions;

    const rawData = this.transformToUpperCase(sanitizedDto);
    delete rawData.password;
    delete rawData.permissions;
    delete rawData.accessProfile;

    const updatedStudent = await this.prisma.student.update({
      where: { id },
      data: {
        ...rawData,
        password: hashedPassword || undefined,
        accessProfile,
        permissions: explicitPermissions,
        photoUrl: Object.prototype.hasOwnProperty.call(sanitizedDto, "photoUrl")
          ? sanitizedDto.photoUrl?.trim() || null
          : undefined,
        monthlyFee: Object.prototype.hasOwnProperty.call(sanitizedDto, "monthlyFee")
          ? this.normalizeMonthlyFee(sanitizedDto.monthlyFee)
          : undefined,
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
      updatedStudent,
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
      this.mapStudentAccess(updatedStudent),
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
      message: active ? "Aluno ativado com sucesso." : "Aluno inativado com sucesso.",
      student: this.mapStudentAccess(updatedStudent),
    };
  }
}
