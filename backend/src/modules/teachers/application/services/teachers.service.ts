import {
  BadRequestException,
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
import { assertStrongPassword } from "../../../../common/security/password-policy";
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
import { CentralIdentityProvisioningService } from "../../../../integrations/msinfor-central/central-identity-provisioning.service";
import { SHARED_BRANCH_CODE } from "../../../../common/tenant/branch.constants";
import { listTenantBranches } from "../../../../common/tenant/tenant-branches";
import { isCentralIdentityEnabled } from "../../../../common/security/security-config";
import { NotificationsService } from "../../../notifications/application/services/notifications.service";

@Injectable()
export class TeachersService {
  private readonly normalizedTeacherDateTimeTenants = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly sharedProfilesService: SharedProfilesService,
    private readonly centralIdentityProvisioning: CentralIdentityProvisioningService,
    private readonly notificationsService: NotificationsService,
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

  private normalizeAccessUsername(value?: string | null): string | null {
    return this.sharedProfilesService.normalizeAccessUsername(value) || null;
  }

  private async assertUniqueAccessUsername(
    tenantId: string,
    accessUsername?: string | null,
    excludePersonId?: string | null,
  ) {
    await this.sharedProfilesService.assertUniqueAccessUsername(
      tenantId,
      accessUsername,
      excludePersonId,
    );
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

  private async assertCpfIsNotAlreadyRegistered(
    tenantId: string,
    cpf?: string | null,
    excludePersonId?: string | null,
  ) {
    const normalizedCpf = this.normalizeDocument(cpf);
    if (!normalizedCpf) return;

    const person = await this.prisma.person.findFirst({
      where: {
        tenantId,
        cpfDigits: normalizedCpf,
        ...(excludePersonId ? { id: { not: excludePersonId } } : {}),
      },
      select: { id: true, name: true },
    });

    if (person) {
      throw new ConflictException(
        `O CPF INFORMADO JÁ ESTÁ CADASTRADO PARA ${person.name || "OUTRA PESSOA"}. NÃO É POSSÍVEL PROSSEGUIR COM UM NOVO CADASTRO DE PROFESSOR.`,
      );
    }
  }

  private async assertTeacherPersonIsNotShared(
    tenantId: string,
    teacherId: string,
    personId?: string | null,
  ) {
    if (!personId) return;

    const linkedTeacherCount = await this.prisma.teacher.count({
      where: {
        tenantId,
        personId,
        canceledAt: null,
        id: { not: teacherId },
      },
    });

    if (linkedTeacherCount > 0) {
      throw new ConflictException(
        "Este professor está vinculado ao mesmo cadastro-base de outro professor. Regularize o CPF/cadastro-base antes de alterar o nome, para não modificar os demais registros.",
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
      "accessUsername",
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
    return { ...(person || {}), ...rest, person };
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
      delete sanitizedDto.accessUsername;
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

  private async resolveCentralBranchCodes(
    tenantId: string,
    branchCode: number,
    explicitBranchCodes: number[],
  ) {
    if (explicitBranchCodes.length > 0) {
      return explicitBranchCodes;
    }

    if (branchCode !== SHARED_BRANCH_CODE) {
      return [branchCode];
    }

    const branches = await listTenantBranches(this.prisma, tenantId);
    return branches
      .filter((branch) => branch.isActive)
      .map((branch) => branch.branchCode)
      .filter((code) => code >= 1)
      .sort((left, right) => left - right);
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
    const centralBranchCodes = await this.resolveCentralBranchCodes(
      tenantId,
      targetBranchCode,
      branchSelection.explicitBranchCodes,
    );

    return runWithTenantBranchScope(targetBranchCode, async () => {
    const sanitizedDto = this.sanitizeTeacherMutationDto(
      createDto,
      currentUser,
    );
    this.sharedProfilesService.assertValidCpfIfProvided(sanitizedDto.cpf);

    if (sanitizedDto.email)
      sanitizedDto.email = sanitizedDto.email.toUpperCase();
    sanitizedDto.accessUsername = this.normalizeAccessUsername(
      sanitizedDto.accessUsername,
    );
    if (sanitizedDto.accessUsername && !sanitizedDto.email) {
      throw new BadRequestException(
        "Informe o e-mail quando informar o usuário de acesso do PWA.",
      );
    }
    if (sanitizedDto.accessUsername && !sanitizedDto.password) {
      throw new BadRequestException(
        "Informe a senha inicial ao cadastrar o login utilizado do professor.",
      );
    }
    if (sanitizedDto.password && !sanitizedDto.accessUsername) {
      throw new BadRequestException(
        "Informe o login utilizado ao cadastrar uma senha de acesso do professor.",
      );
    }

    await this.sharedProfilesService.hydrateMissingFieldsFromCpf(
      tenantId,
      sanitizedDto,
      "TEACHER",
    );

    sanitizedDto.name = this.sharedProfilesService.resolveWritableName(
      sanitizedDto.name,
    );

    await this.assertUniqueTeacherCpf(tenantId, sanitizedDto.cpf);
    const existingSharedProfile = sanitizedDto.cpf
      ? await this.sharedProfilesService.findSharedProfileByCpf(
          tenantId,
          sanitizedDto.cpf,
        )
      : null;
    await this.assertUniqueAccessUsername(
      tenantId,
      sanitizedDto.accessUsername,
      (existingSharedProfile as { personId?: string | null } | null)?.personId,
    );

    await this.fillAddressFromViaCep(sanitizedDto);

    let hashedPassword = undefined;
    if (sanitizedDto.password) {
      assertStrongPassword(sanitizedDto.password);
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
      if (hashedPassword && !isCentralIdentityEnabled()) {
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

    if (sanitizedDto.accessUsername && sanitizedDto.email && hashedPassword) {
      await this.centralIdentityProvisioning.synchronize({
        tenantId,
        login: sanitizedDto.accessUsername || sanitizedDto.email,
        email: sanitizedDto.email,
        displayName: sanitizedDto.name,
        credential: String(sanitizedDto.password),
        externalSubjectId: `PERSON:${createdTeacher.personId || createdTeacher.id}`,
        branchCodes: centralBranchCodes,
        roleCode: accessProfile || "PROFESSOR",
      });
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

    const visibleTeachers = filterRoleBranchRecordsForCurrentBranch(teachers).sort(
      (left, right) =>
        String(left.person?.name || "").localeCompare(
          String(right.person?.name || ""),
          "pt-BR",
        ),
    );
    const emailVerificationByEmail =
      await this.sharedProfilesService.getEmailVerificationMap(
        visibleTeachers.map((teacher) => teacher.person?.email),
      );

    return visibleTeachers.map((teacher) => {
      const email = this.sharedProfilesService.normalizeEmail(teacher.person?.email);
      return sanitizeTeacherForViewer(
        {
          ...this.mapTeacherAccess(teacher),
          emailVerified: email ? emailVerificationByEmail.get(email) === true : false,
        },
        currentUser,
      );
    });
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
    await this.assertTeacherPersonIsNotShared(tenantId, id, teacher.personId);
    const sanitizedDto = this.sanitizeTeacherMutationDto(
      updateDto,
      currentUser,
    );
    this.sharedProfilesService.assertValidCpfIfProvided(sanitizedDto.cpf);
    const branchSelection = await resolveRoleBranchSelection(
      this.prisma,
      tenantId,
      sanitizedDto.branchCode,
      sanitizedDto.branchAccessCodes,
      teacher.branchCode,
    );
    const targetBranchCode = branchSelection.branchCode;
    const centralBranchCodes = await this.resolveCentralBranchCodes(
      tenantId,
      targetBranchCode,
      branchSelection.explicitBranchCodes,
    );

    return runWithTenantBranchScope(targetBranchCode, async () => {
    if (sanitizedDto.email)
      sanitizedDto.email = sanitizedDto.email.toUpperCase();
    if (Object.prototype.hasOwnProperty.call(sanitizedDto, "accessUsername")) {
      sanitizedDto.accessUsername = this.normalizeAccessUsername(
        sanitizedDto.accessUsername,
      );
    }
    if (
      sanitizedDto.accessUsername &&
      !sanitizedDto.email &&
      !teacher.person?.email
    ) {
      throw new BadRequestException(
        "Informe o e-mail quando informar o usuário de acesso do PWA.",
      );
    }
    const accessUsernameForSync =
      Object.prototype.hasOwnProperty.call(sanitizedDto, "accessUsername")
        ? sanitizedDto.accessUsername
        : teacher.person?.accessUsername || teacher.accessUsername;
    if (sanitizedDto.password && !accessUsernameForSync) {
      throw new BadRequestException(
        "Informe o login utilizado ao cadastrar uma senha de acesso do professor.",
      );
    }
    if (
      accessUsernameForSync &&
      !teacher.person?.accessUsername &&
      !teacher.accessUsername &&
      !sanitizedDto.password
    ) {
      throw new BadRequestException(
        "Informe a senha inicial ao liberar o primeiro acesso do professor.",
      );
    }

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

    const cpfBeingSaved = Object.prototype.hasOwnProperty.call(
      sanitizedDto,
      "cpf",
    )
      ? sanitizedDto.cpf
      : teacher.person?.cpf;

    // A Person é compartilhada por CPF dentro do tenant. Se dados legados
    // deixaram mais de um professor apontando para o mesmo CPF, atualizar o
    // nome de um deles alteraria todos os vínculos daquela pessoa. Bloqueie
    // antes da sincronização para preservar a integridade do cadastro.
    await this.assertUniqueTeacherCpf(tenantId, cpfBeingSaved, id);
    await this.assertUniqueAccessUsername(
      tenantId,
      Object.prototype.hasOwnProperty.call(sanitizedDto, "accessUsername")
        ? sanitizedDto.accessUsername
        : teacher.person?.accessUsername || teacher.accessUsername,
      teacher.personId,
    );

    await this.fillAddressFromViaCep(sanitizedDto);

    let hashedPassword = undefined;
    if (sanitizedDto.password) {
      assertStrongPassword(sanitizedDto.password);
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
      const updateResult = await tx.teacher.updateMany({
        where: { id },
        data: {
          ...rawData,
          accessProfile,
          permissions: explicitPermissions,
          branchCode: targetBranchCode,
          updatedBy: getTenantContext()!.userId,
        },
      });
      if (updateResult.count !== 1) {
        throw new NotFoundException("Professor não encontrado para esta escola.");
      }

      const teacherResult = await tx.teacher.findFirst({ where: { id } });
      if (!teacherResult) {
        throw new NotFoundException("Professor não encontrado para esta escola.");
      }

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
      id,
      {
        ...updatedTeacher,
        ...sanitizedDto,
        personId: updatedTeacher.personId || teacher.personId,
        password: null,
        resetPasswordToken: null,
        resetPasswordExpires: null,
      },
      getTenantContext()!.userId,
      teacher.person?.cpf,
    );

    const emailForPasswordSync = sanitizedDto.email || teacher.person?.email;
    if (emailForPasswordSync) {
      if (hashedPassword && !isCentralIdentityEnabled()) {
        await this.sharedProfilesService.updateEmailCredentialPassword(
          emailForPasswordSync,
          hashedPassword,
          getTenantContext()!.userId,
        );
      } else if (shouldResolvePasswordForEmailChange || hashedPassword) {
        await this.sharedProfilesService.ensureEmailCredential(
          emailForPasswordSync,
          { userId: getTenantContext()!.userId },
        );
      }
    }

    if (accessUsernameForSync && emailForPasswordSync) {
      await this.centralIdentityProvisioning.synchronize({
        tenantId,
        login: accessUsernameForSync,
        email: emailForPasswordSync,
        displayName: sanitizedDto.name || teacher.person?.name || "Professor",
        ...(sanitizedDto.password ? { credential: String(sanitizedDto.password) } : {}),
        externalSubjectId: `PERSON:${updatedTeacher.personId || teacher.personId || id}`,
        branchCodes: centralBranchCodes,
        roleCode: accessProfile || "PROFESSOR",
      });
    }

    const refreshedTeacher = await this.findTeacherEntity(id);
    return sanitizeTeacherForViewer(
      this.mapTeacherAccess(refreshedTeacher),
      currentUser,
    );
    });
  }

  async remove(id: string) {
    const teacher = await this.findTeacherEntity(id);
    const tenantId = getTenantContext()!.tenantId;
    const result = await this.prisma.teacher.updateMany({
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

    await this.synchronizeTeacherStatus(teacher, false);
    void this.notificationsService
      .dispatchConfiguredEventNotification({
        eventType: "TEACHER_INACTIVATED",
        title: "PROFESSOR INATIVADO",
        message: `O PROFESSOR ${teacher.person?.name || id} FOI INATIVADO.`,
        sourceType: "TEACHER_STATUS",
        sourceId: id,
        metadata: { teacherId: id },
      })
      .catch(() => undefined);
    return result;
  }

  async setActiveStatus(id: string, active: boolean) {
    const teacher = await this.findTeacherEntity(id);
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

    await this.synchronizeTeacherStatus(teacher, active);
    if (!active && !teacher.canceledAt) {
      void this.notificationsService
        .dispatchConfiguredEventNotification({
          eventType: "TEACHER_INACTIVATED",
          title: "PROFESSOR INATIVADO",
          message: `O PROFESSOR ${teacher.person?.name || id} FOI INATIVADO.`,
          sourceType: "TEACHER_STATUS",
          sourceId: id,
          metadata: { teacherId: id },
        })
        .catch(() => undefined);
    }

    const updatedTeacher = await this.findTeacherEntity(id);

    return {
      message: active
        ? "Professor ativado com sucesso."
        : "Professor inativado com sucesso.",
      teacher: this.mapTeacherAccess(updatedTeacher),
    };
  }

  private async synchronizeTeacherStatus(
    teacher: Awaited<ReturnType<TeachersService["findTeacherEntity"]>>,
    enabled: boolean,
  ) {
    const login = (teacher.person?.accessUsername || teacher.accessUsername)?.trim();
    const email = teacher.person?.email?.trim();
    if (!login || !email) return;

    await this.centralIdentityProvisioning.synchronize({
      tenantId: getTenantContext()!.tenantId,
      login,
      email,
      displayName: teacher.person?.name || "Professor",
      externalSubjectId: `PERSON:${teacher.personId || teacher.id}`,
      branchCodes: await this.resolveCentralBranchCodes(
        getTenantContext()!.tenantId,
        teacher.branchCode,
        teacher.branchAccesses.map((access) => access.branchCode),
      ),
      roleCode:
        normalizeAccessProfileCode(teacher.accessProfile, "PROFESSOR") ||
        "PROFESSOR",
      enabled,
    });
  }
}
