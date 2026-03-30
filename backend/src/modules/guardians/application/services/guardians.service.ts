import {
  Injectable,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../../../../prisma/prisma.service";
import { CreateGuardianDto } from "../dto/create-guardian.dto";
import { UpdateGuardianDto } from "../dto/update-guardian.dto";
import { LinkStudentGuardianDto } from "../dto/link-student.dto";
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
  canViewGuardianAccessData,
  sanitizeGuardianSummaryForViewer,
} from "../../../../common/auth/entity-visibility";
import { StudentsService } from "../../../students/application/services/students.service";

@Injectable()
export class GuardiansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sharedProfilesService: SharedProfilesService,
    private readonly studentsService: StudentsService,
  ) {}

  private normalizeDocument(value?: string | null): string {
    return String(value || "").replace(/\D/g, "");
  }

  private async assertUniqueGuardianCpf(
    tenantId: string,
    cpf?: string | null,
    excludeGuardianId?: string,
  ) {
    const normalizedCpf = this.normalizeDocument(cpf);
    if (!normalizedCpf) return;

    const guardians = await this.prisma.guardian.findMany({
      where: {
        tenantId,
        cpf: { not: null },
        ...(excludeGuardianId ? { id: { not: excludeGuardianId } } : {}),
      },
      select: {
        id: true,
        name: true,
        cpf: true,
      },
    });

    const conflict = guardians.find(
      (guardian) => this.normalizeDocument(guardian.cpf) === normalizedCpf,
    );

    if (conflict) {
      throw new ConflictException(
        `Já existe um responsável com este CPF nesta escola: ${conflict.name}.`,
      );
    }
  }

  private transformToUpperCase(data: any): any {
    const transformed = { ...data };
    for (const key in transformed) {
      if (
        typeof transformed[key] === "string" &&
        key !== "password" &&
        key !== "email"
      ) {
        transformed[key] = transformed[key].toUpperCase();
      }
    }
    return transformed;
  }

  private async fillAddressFromViaCep(data: any): Promise<void> {
    if (data.zipCode) {
      try {
        const cleanZip = data.zipCode.replace(/\D/g, "");
        if (cleanZip.length >= 8) {
          const response = await fetch(
            `https://viacep.com.br/ws/${cleanZip}/json/`,
          );
          const viaCepData = await response.json();
          if (!viaCepData.erro) {
            data.street = data.street || viaCepData.logradouro;
            data.neighborhood = data.neighborhood || viaCepData.bairro;
            data.city = data.city || viaCepData.localidade;
            data.state = data.state || viaCepData.uf;
          }
        }
      } catch (err) {}
    }
  }

  private sanitizeGuardianMutationDto<
    T extends CreateGuardianDto | UpdateGuardianDto,
  >(dto: T, viewer?: ICurrentUser | null): T {
    const sanitizedDto = { ...dto };

    if (!canViewGuardianAccessData(viewer)) {
      delete sanitizedDto.email;
      delete sanitizedDto.password;
      delete sanitizedDto.accessProfile;
      delete sanitizedDto.permissions;
    }

    return sanitizedDto;
  }

  private mapGuardianAccess<T extends { accessProfile?: string | null; permissions?: string | null }>(
    guardian: T,
  ) {
    return {
      ...guardian,
      accessProfile:
        normalizeAccessProfileCode(guardian.accessProfile, "RESPONSAVEL") ||
        getDefaultAccessProfileForRole("RESPONSAVEL"),
      permissions: resolveAccountPermissions({
        role: "RESPONSAVEL",
        accessProfile: guardian.accessProfile,
        permissions: guardian.permissions,
      }),
    };
  }

  private async findGuardianEntity(id: string) {
    const guardian = await this.prisma.guardian.findFirst({
      where: { id, tenantId: getTenantContext()!.tenantId },
      include: {
        students: {
          include: { student: true },
        },
      },
    });

    if (!guardian) {
      throw new NotFoundException(
        "Responsável não encontrado na sua Instituição.",
      );
    }

    return guardian;
  }

  async create(createDto: CreateGuardianDto, currentUser?: ICurrentUser) {
    const sanitizedDto = this.sanitizeGuardianMutationDto(createDto, currentUser);

    await this.sharedProfilesService.hydrateMissingFieldsFromCpf(
      getTenantContext()!.tenantId,
      sanitizedDto,
      "GUARDIAN",
    );

    await this.fillAddressFromViaCep(sanitizedDto);

    if (sanitizedDto.email) sanitizedDto.email = sanitizedDto.email.toUpperCase();

    const tenantId = getTenantContext()!.tenantId;
    await this.assertUniqueGuardianCpf(tenantId, sanitizedDto.cpf);

    // Lógica Específica de Autenticação para o PWA (Hash da Senha)
    let hashedPassword = undefined;
    if (sanitizedDto.password) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(sanitizedDto.password, salt);
    } else if (sanitizedDto.email) {
      hashedPassword =
        (await this.sharedProfilesService.findSharedPasswordByEmail(
          tenantId,
          sanitizedDto.email,
        )) || undefined;
    }
    const accessProfile =
      normalizeAccessProfileCode(sanitizedDto.accessProfile, "RESPONSAVEL") ||
      getDefaultAccessProfileForRole("RESPONSAVEL");
    const explicitPermissions =
      Array.isArray(sanitizedDto.permissions) && sanitizedDto.permissions.length > 0
        ? serializePermissions(sanitizedDto.permissions)
        : null;

    const rawData = this.transformToUpperCase(sanitizedDto);
    delete rawData.permissions;
    delete rawData.accessProfile;

    const createdGuardian = await this.prisma.guardian.create({
      data: {
        ...rawData,
        password: hashedPassword, // Sobrescreve a senha aberta do UpperCase com o Hash seguro
        accessProfile,
        permissions: explicitPermissions,
        birthDate: sanitizedDto.birthDate
          ? new Date(sanitizedDto.birthDate)
          : undefined,
        tenantId,
        createdBy: getTenantContext()!.userId,
      },
    });

    await this.sharedProfilesService.syncSharedProfile(
      tenantId,
      "GUARDIAN",
      createdGuardian.id,
      createdGuardian,
      getTenantContext()!.userId,
    );

    if (sanitizedDto.email && hashedPassword) {
      await this.sharedProfilesService.syncSharedPasswordByEmail(
        tenantId,
        sanitizedDto.email,
        hashedPassword,
        { kind: "GUARDIAN", id: createdGuardian.id },
        getTenantContext()!.userId,
      );
    }

    return sanitizeGuardianSummaryForViewer(
      this.mapGuardianAccess(createdGuardian),
      currentUser,
    );
  }

  async findAll(currentUser?: ICurrentUser) {
    const guardians = await this.prisma.guardian.findMany({
      where: { tenantId: getTenantContext()!.tenantId },
      orderBy: [{ canceledAt: "asc" }, { name: "asc" }],
      include: {
        students: {
          include: { student: true }, // Mostra todos os alunos atrelados a ele
        },
      },
    });

    return guardians.map((guardian) =>
      sanitizeGuardianSummaryForViewer(
        this.mapGuardianAccess(guardian),
        currentUser,
      ),
    );
  }

  async findOne(id: string, currentUser?: ICurrentUser) {
    const guardian = await this.findGuardianEntity(id);
    return sanitizeGuardianSummaryForViewer(
      this.mapGuardianAccess(guardian),
      currentUser,
    );
  }

  async findMe(userId: string, tenantId: string, currentUser?: ICurrentUser) {
    const guardian = await this.prisma.guardian.findFirst({
      where: {
        id: userId,
        tenantId,
        canceledAt: null,
      },
      include: {
        students: {
          where: { canceledAt: null },
          include: {
            student: {
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
                  orderBy: [
                    { schoolYear: { year: "desc" } },
                    { createdAt: "desc" },
                  ],
                },
              },
            },
          },
        },
      },
    });

    if (!guardian) {
      throw new NotFoundException(
        "Responsável não encontrado para esta escola.",
      );
    }

    return sanitizeGuardianSummaryForViewer(
      this.mapGuardianAccess(guardian),
      currentUser,
    );
  }

  async findMyPwaSummary(
    userId: string,
    tenantId: string,
    currentUser?: ICurrentUser,
  ) {
    const guardian = await this.prisma.guardian.findFirst({
      where: {
        id: userId,
        tenantId,
        canceledAt: null,
      },
      include: {
        students: {
          where: { canceledAt: null },
          include: {
            student: true,
          },
          orderBy: [{ student: { name: "asc" } }],
        },
      },
    });

    if (!guardian) {
      throw new NotFoundException(
        "Responsável não encontrado para esta escola.",
      );
    }

    const studentSummaries = await Promise.all(
      guardian.students
        .filter((link) => !!link.student && !link.student.canceledAt)
        .map(async (link) => ({
          id: link.id,
          kinship: link.kinship,
          kinshipDescription: link.kinshipDescription,
          student: await this.studentsService.findMyPwaSummary(
            link.studentId,
            tenantId,
            currentUser,
          ),
        })),
    );

    return {
      guardian: sanitizeGuardianSummaryForViewer(
        this.mapGuardianAccess(guardian),
        currentUser,
      ),
      students: studentSummaries,
      syncedAt: new Date().toISOString(),
    };
  }

  async update(id: string, updateDto: UpdateGuardianDto, currentUser?: ICurrentUser) {
    const currentGuardian = await this.findGuardianEntity(id);
    const sanitizedDto = this.sanitizeGuardianMutationDto(updateDto, currentUser);

    await this.sharedProfilesService.hydrateMissingFieldsFromCpf(
      getTenantContext()!.tenantId,
      sanitizedDto,
      "GUARDIAN",
      id,
    );

    await this.fillAddressFromViaCep(sanitizedDto);

    if (sanitizedDto.email) sanitizedDto.email = sanitizedDto.email.toUpperCase();

    if (
      sanitizedDto.cpf !== undefined &&
      this.normalizeDocument(sanitizedDto.cpf) !==
        this.normalizeDocument(currentGuardian.cpf)
    ) {
      await this.assertUniqueGuardianCpf(
        getTenantContext()!.tenantId,
        sanitizedDto.cpf,
        id,
      );
    }

    let hashedPassword = undefined;
    if (sanitizedDto.password) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(sanitizedDto.password, salt);
    }
    const accessProfile =
      normalizeAccessProfileCode(
        sanitizedDto.accessProfile ?? currentGuardian.accessProfile,
        "RESPONSAVEL",
      ) || getDefaultAccessProfileForRole("RESPONSAVEL");
    const explicitPermissions =
      Array.isArray(sanitizedDto.permissions) && sanitizedDto.permissions.length > 0
        ? serializePermissions(sanitizedDto.permissions)
        : Object.prototype.hasOwnProperty.call(sanitizedDto, "permissions")
          ? null
          : currentGuardian.permissions;

    const rawData = this.transformToUpperCase(sanitizedDto);
    delete rawData.permissions;
    delete rawData.accessProfile;

    const updatedGuardian = await this.prisma.guardian.update({
      where: { id },
      data: {
        ...rawData,
        password: hashedPassword ? hashedPassword : rawData.password,
        accessProfile,
        permissions: explicitPermissions,
        birthDate: sanitizedDto.birthDate
          ? new Date(sanitizedDto.birthDate)
          : undefined,
        updatedBy: getTenantContext()!.userId,
      },
    });

    await this.sharedProfilesService.syncSharedProfile(
      getTenantContext()!.tenantId,
      "GUARDIAN",
      updatedGuardian.id,
      updatedGuardian,
      getTenantContext()!.userId,
      currentGuardian.cpf,
    );

    const emailForPasswordSync = sanitizedDto.email || currentGuardian.email;
    if (emailForPasswordSync && hashedPassword) {
      await this.sharedProfilesService.syncSharedPasswordByEmail(
        getTenantContext()!.tenantId,
        emailForPasswordSync,
        hashedPassword,
        { kind: "GUARDIAN", id: updatedGuardian.id },
        getTenantContext()!.userId,
      );
    }

    return sanitizeGuardianSummaryForViewer(
      this.mapGuardianAccess(updatedGuardian),
      currentUser,
    );
  }

  async remove(id: string) {
    await this.findGuardianEntity(id);
    return this.prisma.guardian.updateMany({
      where: { id },
      data: {
        canceledAt: new Date(),
        canceledBy: getTenantContext()!.userId,
      },
    });
  }

  async setActiveStatus(id: string, active: boolean) {
    await this.findGuardianEntity(id);

    const updatedGuardian = await this.prisma.guardian.update({
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
        ? "Responsável ativado com sucesso."
        : "Responsável inativado com sucesso.",
      guardian: this.mapGuardianAccess(updatedGuardian),
    };
  }

  // ==========================================
  // FUNÇÃO DE AMARRAÇÃO DE ALUNO (REGRA 2.011)
  // ==========================================
  async linkStudent(guardianId: string, linkDto: LinkStudentGuardianDto) {
    await this.findOne(guardianId);

    // Verifica se o aluno existe no tenant
    const student = await this.prisma.student.findFirst({
      where: {
        id: linkDto.studentId,
        tenantId: getTenantContext()!.tenantId,
        canceledAt: null,
      },
    });
    if (!student)
      throw new NotFoundException(
        "Aluno inválido ou não pertence a esta Escola.",
      );

    // Verifica se já estão vinculados para não dar erro
    const existingLink = await this.prisma.guardianStudent.findFirst({
      where: {
        guardianId,
        studentId: linkDto.studentId,
        tenantId: getTenantContext()!.tenantId,
        canceledAt: null,
      },
    });

    if (existingLink) {
      throw new ConflictException(
        "Este Responsável já está vinculado a este Aluno.",
      );
    }

    // Amarra e salva a relação no banco de dados
    return this.prisma.guardianStudent.create({
      data: {
        guardianId,
        studentId: linkDto.studentId,
        kinship: linkDto.kinship.toUpperCase(),
        kinshipDescription: linkDto.kinshipDescription?.toUpperCase(),
        tenantId: getTenantContext()!.tenantId,
        createdBy: getTenantContext()!.userId,
      },
    });
  }

  async unlinkStudent(guardianId: string, studentId: string) {
    // Soft Delete do Vínculo
    return this.prisma.guardianStudent.updateMany({
      where: { guardianId, studentId },
      data: {
        canceledAt: new Date(),
        canceledBy: getTenantContext()!.userId,
      },
    });
  }
}
