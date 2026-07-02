import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../../prisma/prisma.service";
import { CreateTeacherDto } from "../dto/create-teacher.dto";
import { UpdateTeacherDto } from "../dto/update-teacher.dto";
import {
  getTenantContext,
  runWithTenantBranchScope,
} from "../../../../common/tenant/tenant.context";
import {
  filterRoleBranchRecordsForCurrentBranch,
  isRoleBranchRecordVisibleInCurrentBranch,
  resolveRoleBranchSelection,
  syncRoleBranchAccesses,
  withRoleBranchAccessCodes,
} from "../../../../common/tenant/role-branch-accesses";
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
  canViewTeacherAccessData,
  sanitizeTeacherForViewer,
} from "../../../../common/auth/entity-visibility";

@Injectable()
export class TeachersService {
  private readonly normalizedTeacherDateTimeTenants = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly sharedProfilesService: SharedProfilesService,
  ) {}

  private async normalizeLegacyTeacherDateTimes(tenantId: string) {
    if (this.normalizedTeacherDateTimeTenants.has(tenantId)) {
      return;
    }

    const dateTimeColumns = [
      "createdAt",
      "updatedAt",
      "canceledAt",
    ] as const;

    for (const column of dateTimeColumns) {
      await this.prisma.$executeRawUnsafe(
        `
          UPDATE teachers
          SET ${column} = REPLACE(${column}, ' ', 'T') || '.000Z'
          WHERE tenantId = ?
            AND ${column} IS NOT NULL
            AND ${column} GLOB '????-??-?? ??:??:??'
        `,
        tenantId,
      );

      await this.prisma.$executeRawUnsafe(
        `
          UPDATE teachers
          SET ${column} = ${column} || '.000Z'
          WHERE tenantId = ?
            AND ${column} IS NOT NULL
            AND ${column} GLOB '????-??-??T??:??:??'
        `,
        tenantId,
      );

      await this.prisma.$executeRawUnsafe(
        `
          UPDATE teachers
          SET ${column} = SUBSTR(${column}, 1, 23) || 'Z'
          WHERE tenantId = ?
            AND ${column} IS NOT NULL
            AND ${column} GLOB '????-??-??T??:??:??.??????'
        `,
        tenantId,
      );
    }

    this.normalizedTeacherDateTimeTenants.add(tenantId);
  }

  private normalizeDocument(value?: string | null): string {
    return String(value || "").replace(/\D/g, "");
  }

  private async assertUniqueTeacherCpf(
    tenantId: string,
    cpf?: string | null,
    excludeTeacherId?: string,
  ) {
    const normalizedCpf = this.normalizeDocument(cpf);
    if (!normalizedCpf) return;

    const person = await this.prisma.person.findFirst({
      where: {
        tenantId,
        cpfDigits: normalizedCpf,
        canceledAt: null,
        teachers: {
          some: {
            canceledAt: null,
            ...(excludeTeacherId ? { id: { not: excludeTeacherId } } : {}),
          },
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (person) {
      throw new ConflictException(
        `Já existe um professor com este CPF nesta escola: ${person.name}.`,
      );
    }
  }

  private stripSharedProfileFields<T extends Record<string, any>>(data: T): T {
    const stripped = { ...data };
    [
      "birthDate",
      "name",
      "rg",
      "cpf",
      "cnpj",
      "nickname",
      "corporateName",
      "phone",
      "whatsapp",
      "cellphone1",
      "cellphone2",
      "email",
      "password",
      "resetPasswordToken",
      "resetPasswordExpires",
      "telegramChatId",
      "telegramUsername",
      "telegramOptInAt",
      "telegramOptOutAt",
      "zipCode",
      "street",
      "number",
      "city",
      "state",
      "neighborhood",
      "complement",
    ].forEach((field) => delete stripped[field]);
    return stripped;
  }

  private withPersonSharedFields<T extends { person?: Record<string, any> | null }>(
    record: T,
  ) {
    const { person, ...rest } = record as any;
    return { ...rest, ...(person || {}), person };
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

  private sanitizeTeacherMutationDto<
    T extends CreateTeacherDto | UpdateTeacherDto,
  >(dto: T, viewer?: ICurrentUser | null): T {
    const sanitizedDto = { ...dto };

    if (!canViewTeacherAccessData(viewer)) {
      delete sanitizedDto.email;
      delete sanitizedDto.password;
      delete sanitizedDto.accessProfile;
      delete sanitizedDto.permissions;
      delete sanitizedDto.telegramChatId;
      delete sanitizedDto.telegramUsername;
      delete sanitizedDto.telegramOptInEnabled;
    }

    return sanitizedDto;
  }

  private mapTeacherAccess<
    T extends {
      accessProfile?: string | null;
      permissions?: string | null;
      person?: Record<string, any> | null;
    },
  >(teacher: T) {
    const teacherWithSharedFields = this.withPersonSharedFields(teacher);
    return {
      ...withRoleBranchAccessCodes(
        teacherWithSharedFields as T & { branchCode: number },
      ),
      accessProfile:
        normalizeAccessProfileCode(teacher.accessProfile, "PROFESSOR") ||
        getDefaultAccessProfileForRole("PROFESSOR"),
      permissions: resolveAccountPermissions({
        role: "PROFESSOR",
        accessProfile: teacher.accessProfile,
        permissions: teacher.permissions,
      }),
    };
  }

  private async findTeacherEntity(id: string) {
    const tenantId = getTenantContext()!.tenantId;
    await this.normalizeLegacyTeacherDateTimes(tenantId);

    const teacher = await this.prisma.teacher.findFirst({
      where: {
        id,
        tenantId,
      },
      include: {
        teacherSubjects: {
          where: {
            canceledAt: null,
            subject: { canceledAt: null },
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
        },
        branchAccesses: {
          where: { canceledAt: null },
          orderBy: [{ isDefault: "desc" }, { branchCode: "asc" }],
        },
        person: true,
      },
    });

    if (!teacher || !isRoleBranchRecordVisibleInCurrentBranch(teacher)) {
      throw new NotFoundException("Professor não encontrado.");
    }

    return teacher;
  }

  async create(createDto: CreateTeacherDto, currentUser?: ICurrentUser) {
    const tenantId = getTenantContext()!.tenantId;
    const branchSelection = await resolveRoleBranchSelection(
      this.prisma,
      tenantId,
      createDto.branchCode,
      createDto.branchAccessCodes,
      getTenantContext()!.branchCode,
    );
    const targetBranchCode = branchSelection.branchCode;

    return runWithTenantBranchScope(targetBranchCode, async () => {
    const sanitizedDto = this.sanitizeTeacherMutationDto(
      createDto,
      currentUser,
    );

    if (sanitizedDto.email)
      sanitizedDto.email = sanitizedDto.email.toUpperCase();

    await this.sharedProfilesService.hydrateMissingFieldsFromCpf(
      tenantId,
      sanitizedDto,
      "TEACHER",
    );

    sanitizedDto.name = this.sharedProfilesService.resolveWritableName(
      sanitizedDto.name,
    );

    await this.assertUniqueTeacherCpf(tenantId, sanitizedDto.cpf);

    await this.fillAddressFromViaCep(sanitizedDto);

    let hashedPassword = undefined;
    if (sanitizedDto.password) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(sanitizedDto.password, salt);
    }

    const accessProfile =
      normalizeAccessProfileCode(sanitizedDto.accessProfile, "PROFESSOR") ||
      getDefaultAccessProfileForRole("PROFESSOR");
    const explicitPermissions =
      Array.isArray(sanitizedDto.permissions) &&
      sanitizedDto.permissions.length > 0
        ? serializePermissions(sanitizedDto.permissions)
        : null;

    const rawData = this.stripSharedProfileFields(
      this.transformToUpperCase(sanitizedDto),
    );
    delete rawData.permissions;
    delete rawData.accessProfile;
    delete rawData.branchAccessCodes;
    delete rawData.telegramOptInEnabled;

    const createdTeacher = await this.prisma.$transaction(async (tx) => {
      const teacher = await tx.teacher.create({
        data: {
          ...rawData,
          accessProfile,
          permissions: explicitPermissions,
          tenantId,
          branchCode: targetBranchCode,
          createdBy: getTenantContext()!.userId,
        },
      });

      await syncRoleBranchAccesses(
        tx,
        "teacher",
        tenantId,
        teacher.id,
        branchSelection.explicitBranchCodes,
        getTenantContext()!.userId,
      );

      return {
        ...teacher,
        branchAccesses: branchSelection.explicitBranchCodes.map(
          (branchCode, index) => ({
            branchCode,
            isDefault: index === 0,
            canceledAt: null,
          }),
        ),
      };
    });

    await this.sharedProfilesService.syncSharedProfile(
      tenantId,
      "TEACHER",
      createdTeacher.id,
      {
        ...createdTeacher,
        ...sanitizedDto,
        password: null,
        resetPasswordToken: null,
        resetPasswordExpires: null,
      },
      getTenantContext()!.userId,
    );

    if (sanitizedDto.email) {
      if (hashedPassword) {
        await this.sharedProfilesService.updateEmailCredentialPassword(
          sanitizedDto.email,
          hashedPassword,
          getTenantContext()!.userId,
        );
      } else {
        await this.sharedProfilesService.ensureEmailCredential(
          sanitizedDto.email,
          { userId: getTenantContext()!.userId },
        );
      }
    }

    const refreshedTeacher = await this.findTeacherEntity(createdTeacher.id);
    return sanitizeTeacherForViewer(
      this.mapTeacherAccess(refreshedTeacher),
      currentUser,
    );
    });
  }

  async findAll(currentUser?: ICurrentUser) {
    const tenantId = getTenantContext()!.tenantId;
    await this.normalizeLegacyTeacherDateTimes(tenantId);

    const teachers = await this.prisma.teacher.findMany({
      where: {
        tenantId,
      },
      orderBy: [{ canceledAt: "asc" }, { updatedAt: "desc" }],
      include: {
        teacherSubjects: {
          where: {
            canceledAt: null,
            subject: { canceledAt: null },
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
        },
        branchAccesses: {
          where: { canceledAt: null },
          orderBy: [{ isDefault: "desc" }, { branchCode: "asc" }],
        },
        person: true,
      },
    });

    return filterRoleBranchRecordsForCurrentBranch(teachers)
      .sort((left, right) =>
        String(left.person?.name || "").localeCompare(
          String(right.person?.name || ""),
          "pt-BR",
        ),
      )
      .map((teacher) =>
        sanitizeTeacherForViewer(this.mapTeacherAccess(teacher), currentUser),
      );
  }

  async findOne(id: string, currentUser?: ICurrentUser) {
    const teacher = await this.findTeacherEntity(id);
    return sanitizeTeacherForViewer(
      this.mapTeacherAccess(teacher),
      currentUser,
    );
  }

  async findMe(userId: string, tenantId: string, currentUser?: ICurrentUser) {
    await this.normalizeLegacyTeacherDateTimes(tenantId);

    const teacher = await this.prisma.teacher.findFirst({
      where: {
        id: userId,
        tenantId,
        canceledAt: null,
      },
      include: {
        teacherSubjects: {
          where: {
            canceledAt: null,
            subject: { canceledAt: null },
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
        },
        branchAccesses: {
          where: { canceledAt: null },
          orderBy: [{ isDefault: "desc" }, { branchCode: "asc" }],
        },
        person: true,
      },
    });

    if (!teacher || !isRoleBranchRecordVisibleInCurrentBranch(teacher)) {
      throw new NotFoundException("Professor não encontrado para esta escola.");
    }

    return sanitizeTeacherForViewer(
      this.mapTeacherAccess(teacher),
      currentUser,
    );
  }

  async update(
    id: string,
    updateDto: UpdateTeacherDto,
    currentUser?: ICurrentUser,
  ) {
    const tenantId = getTenantContext()!.tenantId;
    await this.normalizeLegacyTeacherDateTimes(tenantId);
    const teacher = await this.findTeacherEntity(id);
    const sanitizedDto = this.sanitizeTeacherMutationDto(
      updateDto,
      currentUser,
    );
    const branchSelection = await resolveRoleBranchSelection(
      this.prisma,
      tenantId,
      sanitizedDto.branchCode,
      sanitizedDto.branchAccessCodes,
      teacher.branchCode,
    );
    const targetBranchCode = branchSelection.branchCode;

    return runWithTenantBranchScope(teacher.branchCode, async () => {
    if (sanitizedDto.email)
      sanitizedDto.email = sanitizedDto.email.toUpperCase();

    const normalizedCurrentEmail = this.sharedProfilesService.normalizeEmail(
      teacher.person?.email,
    );
    const normalizedIncomingEmail = Object.prototype.hasOwnProperty.call(
      sanitizedDto,
      "email",
    )
      ? this.sharedProfilesService.normalizeEmail(sanitizedDto.email)
      : normalizedCurrentEmail;
    const shouldResolvePasswordForEmailChange =
      Boolean(normalizedIncomingEmail) &&
      normalizedIncomingEmail !== normalizedCurrentEmail;

    await this.sharedProfilesService.hydrateMissingFieldsFromCpf(
      tenantId,
      sanitizedDto,
      "TEACHER",
      id,
    );

    sanitizedDto.name = this.sharedProfilesService.resolveWritableName(
      sanitizedDto.name,
      teacher.person?.name,
    );

    if (
      sanitizedDto.cpf &&
      this.normalizeDocument(sanitizedDto.cpf) !==
        this.normalizeDocument(teacher.person?.cpf)
    ) {
      await this.assertUniqueTeacherCpf(tenantId, sanitizedDto.cpf, id);
    }

    await this.fillAddressFromViaCep(sanitizedDto);

    let hashedPassword = undefined;
    if (sanitizedDto.password) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(sanitizedDto.password, salt);
    }

    const accessProfile =
      normalizeAccessProfileCode(
        sanitizedDto.accessProfile ?? teacher.accessProfile,
        "PROFESSOR",
      ) || getDefaultAccessProfileForRole("PROFESSOR");
    const explicitPermissions =
      Array.isArray(sanitizedDto.permissions) &&
      sanitizedDto.permissions.length > 0
        ? serializePermissions(sanitizedDto.permissions)
        : Object.prototype.hasOwnProperty.call(sanitizedDto, "permissions")
          ? null
          : teacher.permissions;

    const rawData = this.stripSharedProfileFields(
      this.transformToUpperCase(sanitizedDto),
    );
    delete rawData.password;
    delete rawData.permissions;
    delete rawData.accessProfile;
    delete rawData.branchAccessCodes;
    if (
      Object.prototype.hasOwnProperty.call(
        sanitizedDto,
        "telegramOptInEnabled",
      )
    ) {
    }
    delete rawData.telegramOptInEnabled;

    const updatedTeacher = await this.prisma.$transaction(async (tx) => {
      const teacherResult = await tx.teacher.update({
        where: { id },
        data: {
          ...rawData,
          accessProfile,
          permissions: explicitPermissions,
          branchCode: targetBranchCode,
          updatedBy: getTenantContext()!.userId,
        },
      });

      await syncRoleBranchAccesses(
        tx,
        "teacher",
        tenantId,
        id,
        branchSelection.explicitBranchCodes,
        getTenantContext()!.userId,
      );

      return {
        ...teacherResult,
        branchAccesses: branchSelection.explicitBranchCodes.map(
          (branchCode, index) => ({
            branchCode,
            isDefault: index === 0,
            canceledAt: null,
          }),
        ),
      };
    });

    await this.sharedProfilesService.syncSharedProfile(
      tenantId,
      "TEACHER",
      updatedTeacher.id,
      {
        ...updatedTeacher,
        ...sanitizedDto,
        password: null,
        resetPasswordToken: null,
        resetPasswordExpires: null,
      },
      getTenantContext()!.userId,
      teacher.person?.cpf,
    );

    const emailForPasswordSync = sanitizedDto.email || teacher.person?.email;
    if (emailForPasswordSync) {
      if (hashedPassword) {
        await this.sharedProfilesService.updateEmailCredentialPassword(
          emailForPasswordSync,
          hashedPassword,
          getTenantContext()!.userId,
        );
      } else if (shouldResolvePasswordForEmailChange) {
        await this.sharedProfilesService.ensureEmailCredential(
          emailForPasswordSync,
          { userId: getTenantContext()!.userId },
        );
      }
    }

    const refreshedTeacher = await this.findTeacherEntity(updatedTeacher.id);
    return sanitizeTeacherForViewer(
      this.mapTeacherAccess(refreshedTeacher),
      currentUser,
    );
    });
  }

  async remove(id: string) {
    await this.findTeacherEntity(id);
    const tenantId = getTenantContext()!.tenantId;
    return this.prisma.teacher.updateMany({
      where: {
        id,
        tenantId,
      },
      data: {
        canceledAt: new Date(),
        canceledBy: getTenantContext()!.userId,
        updatedBy: getTenantContext()!.userId,
      },
    });
  }

  async setActiveStatus(id: string, active: boolean) {
    await this.findTeacherEntity(id);
    const tenantId = getTenantContext()!.tenantId;

    await this.prisma.teacher.updateMany({
      where: {
        id,
        tenantId,
      },
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

    const updatedTeacher = await this.findTeacherEntity(id);

    return {
      message: active
        ? "Professor ativado com sucesso."
        : "Professor inativado com sucesso.",
      teacher: this.mapTeacherAccess(updatedTeacher),
    };
  }
}
