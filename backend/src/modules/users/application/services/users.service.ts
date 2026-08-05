import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import { assertStrongPassword } from "../../../../common/security/password-policy";
import {
  getComplementaryProfilePermissions,
  getDefaultAccessProfileForRole,
  normalizeAccessProfileCode,
  normalizeComplementaryAccessProfiles,
  resolveAccountPermissions,
  serializeComplementaryAccessProfiles,
} from "../../../../common/auth/access-profiles";
import {
  getDefaultPermissionsForRole,
  normalizePermissions,
  serializePermissions,
} from "../../../../common/auth/user-permissions";
import {
  DEFAULT_BRANCH_CODE,
  normalizeBranchCode,
} from "../../../../common/tenant/branch.constants";
import { listTenantBranches } from "../../../../common/tenant/tenant-branches";
import type { ICurrentUser } from "../../../../common/decorators/current-user.decorator";
import { PrismaService } from "../../../../prisma/prisma.service";
import { SharedProfilesService } from "../../../shared-profiles/application/services/shared-profiles.service";
import type {
  CreateUserDto,
  UpdateUserDto,
} from "../dto/user-access.dto";

const USER_ROLES = ["ADMIN", "SECRETARIA", "COORDENACAO"] as const;
type UserRole = (typeof USER_ROLES)[number];

type UserAccessPayload = Partial<CreateUserDto>;

type SharedPersonData = {
  birthDate?: Date | null;
  rg?: string | null;
  cpf?: string | null;
  cnpj?: string | null;
  nickname?: string | null;
  corporateName?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  cellphone1?: string | null;
  cellphone2?: string | null;
  zipCode?: string | null;
  street?: string | null;
  number?: string | null;
  city?: string | null;
  state?: string | null;
  neighborhood?: string | null;
  complement?: string | null;
  name: string;
  email: string;
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sharedProfilesService: SharedProfilesService,
  ) {}

  private normalizeEmail(value?: string | null) {
    const email = String(value || "").trim().toUpperCase();
    if (!email || !email.includes("@")) {
      throw new BadRequestException("Informe um e-mail válido para o usuário.");
    }
    return email;
  }

  private normalizeAccessUsername(value?: string | null) {
    const normalized = String(value || "").normalize("NFKC").trim().toUpperCase();
    if (normalized && !/^\S{3,160}$/u.test(normalized)) {
      throw new BadRequestException(
        "Informe o usuário de acesso com 3 a 160 caracteres e sem espaços.",
      );
    }
    return normalized || null;
  }

  private normalizeText(value?: string | null) {
    const normalized = String(value || "").trim().toUpperCase();
    return normalized || null;
  }

  private normalizeDate(value?: string | null) {
    const normalized = String(value || "").trim();
    if (!normalized) return null;
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException("A data de nascimento informada é inválida.");
    }
    return parsed;
  }

  private normalizeRole(value?: string | null): UserRole {
    const normalized = String(value || "SECRETARIA").trim().toUpperCase() as UserRole;
    if (!USER_ROLES.includes(normalized)) {
      throw new BadRequestException("O papel informado não é válido para um usuário administrativo.");
    }
    return normalized;
  }

  private normalizePayload(payload: UserAccessPayload) {
    const role = this.normalizeRole(payload.role);
    const email = this.normalizeEmail(payload.email);
    const accessUsername = this.normalizeAccessUsername(payload.accessUsername);
    const name = this.normalizeText(payload.name);
    if (!name) {
      throw new BadRequestException("Informe o nome completo do usuário.");
    }

    const birthDate = this.normalizeDate(payload.birthDate);
    const accessProfile = normalizeAccessProfileCode(payload.accessProfile, role);
    const complementaryProfiles =
      role === "ADMIN"
        ? []
        : normalizeComplementaryAccessProfiles(payload.complementaryProfiles);
    const cashierOnly = role !== "ADMIN" && payload.cashierOnly === true;
    const effectiveComplementaryProfiles = cashierOnly
      ? Array.from(new Set([...complementaryProfiles, "CAIXA"]))
      : complementaryProfiles;
    const explicitPermissions = normalizePermissions(payload.permissions);
    const effectivePermissions =
      role === "ADMIN"
        ? []
        : explicitPermissions.length > 0
          ? explicitPermissions
          : resolveAccountPermissions({
              role,
              accessProfile,
              complementaryProfiles: effectiveComplementaryProfiles,
              permissions: null,
            });

    const sharedPerson: SharedPersonData = {
      name,
      email,
      birthDate,
      rg: this.normalizeText(payload.rg),
      cpf: this.normalizeText(payload.cpf),
      cnpj: this.normalizeText(payload.cnpj),
      nickname: this.normalizeText(payload.nickname),
      corporateName: this.normalizeText(payload.corporateName),
      phone: this.normalizeText(payload.phone),
      whatsapp: this.normalizeText(payload.whatsapp),
      cellphone1: this.normalizeText(payload.cellphone1),
      cellphone2: this.normalizeText(payload.cellphone2),
      zipCode: this.normalizeText(payload.zipCode),
      street: this.normalizeText(payload.street),
      number: this.normalizeText(payload.number),
      city: this.normalizeText(payload.city),
      state: this.normalizeText(payload.state),
      neighborhood: this.normalizeText(payload.neighborhood),
      complement: this.normalizeText(payload.complement),
    };

    return {
      role,
      email,
      accessUsername,
      name,
      birthDate,
      accessProfile,
      effectiveComplementaryProfiles,
      effectivePermissions,
      cashierOnly,
      sharedPerson,
      password: String(payload.password || "").trim(),
    };
  }

  private async assertUniqueEmail(
    tenantId: string,
    email: string,
    currentUserId?: string,
  ) {
    const users = await this.prisma.user.findMany({
      where: { tenantId, canceledAt: null },
      select: { id: true, email: true },
    });
    const duplicate = users.find(
      (user) =>
        user.id !== currentUserId &&
        this.sharedProfilesService.normalizeEmail(user.email) === email,
    );
    if (duplicate) {
      throw new ConflictException("Este e-mail já está sendo usado por outro usuário da escola.");
    }
  }

  private async assertUniqueAccessUsername(
    tenantId: string,
    accessUsername?: string | null,
    currentUserId?: string,
  ) {
    const normalizedUsername = this.normalizeAccessUsername(accessUsername);
    if (!normalizedUsername) return;

    const [user, teacher, student, guardian] = await Promise.all([
      this.prisma.user.findFirst({
        where: {
          tenantId,
          accessUsername: normalizedUsername,
          canceledAt: null,
          ...(currentUserId ? { id: { not: currentUserId } } : {}),
        },
        select: { id: true, name: true },
      }),
      this.prisma.teacher.findFirst({
        where: { tenantId, accessUsername: normalizedUsername, canceledAt: null },
        select: { id: true, person: { select: { name: true } } },
      }),
      this.prisma.student.findFirst({
        where: { tenantId, accessUsername: normalizedUsername, canceledAt: null },
        select: { id: true },
      }),
      this.prisma.guardian.findFirst({
        where: { tenantId, accessUsername: normalizedUsername, canceledAt: null },
        select: { id: true },
      }),
    ]);

    if (user || teacher || student || guardian) {
      throw new ConflictException(
        user
          ? `O usuário de acesso já está cadastrado para ${user.name || "outro usuário"}.`
          : "O usuário de acesso já pertence a outro perfil desta escola.",
      );
    }
  }

  private async resolveBranchAccess(
    tenantId: string,
    role: UserRole,
    requestedCodes: number[] | undefined,
    fallbackBranchCode = DEFAULT_BRANCH_CODE,
  ) {
    const branches = await listTenantBranches(this.prisma, tenantId);
    const activeCodes = branches.map((branch) => branch.branchCode);

    if (role === "ADMIN") {
      return { branchCode: DEFAULT_BRANCH_CODE, branchAccessCodes: [] as number[] };
    }

    const requested = Array.isArray(requestedCodes)
      ? Array.from(new Set(requestedCodes.map((code) => normalizeBranchCode(code, -1))))
          .filter((code) => code > 0)
      : [];
    const selected = Array.isArray(requestedCodes)
      ? (requested.length > 0 ? requested : activeCodes)
      : [normalizeBranchCode(fallbackBranchCode, DEFAULT_BRANCH_CODE)];
    const invalid = selected.find((code) => !activeCodes.includes(code));
    if (invalid) {
      throw new BadRequestException("Uma das filiais selecionadas não existe ou está inativa.");
    }

    return {
      branchCode: selected.length === 1 ? selected[0] : 0,
      branchAccessCodes: selected,
    };
  }

  private async syncUserBranchAccesses(
    tenantId: string,
    userId: string,
    branchAccessCodes: number[],
    actorId: string,
  ) {
    const selected = new Set(branchAccessCodes);
    const now = new Date();
    await this.prisma.userBranchAccess.updateMany({
      where: {
        tenantId,
        userId,
        canceledAt: null,
        branchCode: { notIn: Array.from(selected) },
      },
      data: { canceledAt: now, canceledBy: actorId, updatedBy: actorId },
    });

    for (const [index, branchCode] of branchAccessCodes.entries()) {
      await this.prisma.userBranchAccess.upsert({
        where: {
          tenantId_userId_branchCode: { tenantId, userId, branchCode },
        },
        create: {
          tenantId,
          userId,
          branchCode,
          isDefault: index === 0,
          createdBy: actorId,
          updatedBy: actorId,
        },
        update: {
          canceledAt: null,
          canceledBy: null,
          isDefault: index === 0,
          updatedBy: actorId,
        },
      });
    }
  }

  private async syncCredential(email: string, password: string, actorId: string) {
    if (password) {
      assertStrongPassword(password);
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      await this.sharedProfilesService.updateEmailCredentialPassword(
        email,
        hashedPassword,
        actorId,
      );
      return;
    }

    await this.sharedProfilesService.ensureEmailCredential(email, { userId: actorId });
  }

  private async mapUsers(users: Array<any>, tenantId: string) {
    const emails = Array.from(
      new Set(users.map((user) => this.sharedProfilesService.normalizeEmail(user.email)).filter(Boolean)),
    );
    const people = emails.length
      ? await this.prisma.person.findMany({
          where: { tenantId, canceledAt: null, email: { in: emails } },
          orderBy: { updatedAt: "desc" },
        })
      : [];
    const personByEmail = new Map<string, any>();
    for (const person of people) {
      const email = this.sharedProfilesService.normalizeEmail(person.email);
      if (email && !personByEmail.has(email)) personByEmail.set(email, person);
    }

    return users.map((user) => {
      const person = personByEmail.get(this.sharedProfilesService.normalizeEmail(user.email));
      const effectivePermissions = resolveAccountPermissions({
        role: user.role,
        accessProfile: user.accessProfile,
        complementaryProfiles: user.complementaryProfiles,
        permissions: user.permissions,
      });
      return {
        id: user.id,
        tenantId: user.tenantId,
        name: user.name || person?.name || "USUÁRIO",
        email: user.email,
        accessUsername: user.accessUsername || null,
        role: user.role,
        accessProfile: user.accessProfile,
        permissions: effectivePermissions,
        complementaryProfiles: normalizeComplementaryAccessProfiles(user.complementaryProfiles),
        cashierOnly: Boolean(user.cashierOnly),
        branchCode: user.branchCode,
        branchAccessCodes: user.branchAccesses.map((access: { branchCode: number }) => access.branchCode),
        birthDate: person?.birthDate || null,
        rg: person?.rg || null,
        cpf: person?.cpf || null,
        cnpj: person?.cnpj || null,
        nickname: person?.nickname || null,
        corporateName: person?.corporateName || null,
        phone: person?.phone || null,
        whatsapp: person?.whatsapp || null,
        cellphone1: person?.cellphone1 || null,
        cellphone2: person?.cellphone2 || null,
        zipCode: person?.zipCode || null,
        street: person?.street || null,
        number: person?.number || null,
        city: person?.city || null,
        state: person?.state || null,
        neighborhood: person?.neighborhood || null,
        complement: person?.complement || null,
        updatedAt: user.updatedAt,
        canceledAt: user.canceledAt,
        active: !user.canceledAt,
      };
    });
  }

  async create(createUserDto: CreateUserDto, currentUser: ICurrentUser) {
    const normalized = this.normalizePayload(createUserDto);
    await this.assertUniqueEmail(currentUser.tenantId, normalized.email);
    await this.assertUniqueAccessUsername(currentUser.tenantId, normalized.accessUsername);
    const branchAccess = await this.resolveBranchAccess(
      currentUser.tenantId,
      normalized.role,
      createUserDto.branchAccessCodes,
      currentUser.branchCode,
    );

    await this.syncCredential(normalized.email, normalized.password, currentUser.userId);
    await this.sharedProfilesService.syncSharedProfileFromAdministrativeUser(
      currentUser.tenantId,
      normalized.sharedPerson,
      currentUser.userId,
      normalized.sharedPerson.cpf,
    );

    try {
      const user = await this.prisma.user.create({
        data: {
          tenantId: currentUser.tenantId,
          branchCode: branchAccess.branchCode,
          name: normalized.name,
          email: normalized.email,
          accessUsername: normalized.accessUsername,
          password: null,
          role: normalized.role,
          accessProfile: normalized.role === "ADMIN" ? getDefaultAccessProfileForRole(normalized.role) : normalized.accessProfile,
          permissions: normalized.role === "ADMIN" ? null : serializePermissions(normalized.effectivePermissions),
          complementaryProfiles: normalized.role === "ADMIN" ? null : serializeComplementaryAccessProfiles(normalized.effectiveComplementaryProfiles),
          cashierOnly: normalized.cashierOnly,
          createdBy: currentUser.userId,
          updatedBy: currentUser.userId,
        },
        select: { id: true },
      });
      await this.syncUserBranchAccesses(
        currentUser.tenantId,
        user.id,
        branchAccess.branchAccessCodes,
        currentUser.userId,
      );
      return { message: "Usuário de acesso criado com sucesso.", userId: user.id };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Este e-mail já está sendo usado por outro usuário da escola.");
      }
      throw error;
    }
  }

  async findAllByTenantId(tenantId: string) {
    const users = await this.prisma.user.findMany({
      where: { tenantId },
      orderBy: [{ canceledAt: "asc" }, { name: "asc" }],
      include: {
        branchAccesses: {
          where: { canceledAt: null },
          orderBy: [{ isDefault: "desc" }, { branchCode: "asc" }],
          select: { branchCode: true, isDefault: true },
        },
      },
    });
    return this.mapUsers(users, tenantId);
  }

  async update(id: string, updateUserDto: UpdateUserDto, currentUser: ICurrentUser) {
    const current = await this.prisma.user.findFirst({
      where: { id, tenantId: currentUser.tenantId, canceledAt: null },
      include: {
        branchAccesses: {
          where: { canceledAt: null },
          select: { branchCode: true },
        },
      },
    });
    if (!current) throw new NotFoundException("Usuário de acesso não encontrado.");

    const incomingEmail = updateUserDto.email
      ? this.normalizeEmail(updateUserDto.email)
      : this.sharedProfilesService.normalizeEmail(current.email);
    if (incomingEmail !== this.sharedProfilesService.normalizeEmail(current.email)) {
      throw new BadRequestException("O e-mail de login não pode ser alterado nesta edição.");
    }

    const existingPerson = await this.prisma.person.findFirst({
      where: { tenantId: currentUser.tenantId, canceledAt: null, email: current.email },
      orderBy: { updatedAt: "desc" },
    });
    const base: Record<string, any> = existingPerson || {};
    const payload = {
      ...updateUserDto,
      name: updateUserDto.name ?? current.name,
      email: current.email,
      birthDate: updateUserDto.birthDate ?? (base.birthDate ? base.birthDate.toISOString().slice(0, 10) : undefined),
      rg: updateUserDto.rg ?? base.rg,
      cpf: updateUserDto.cpf ?? base.cpf,
      cnpj: updateUserDto.cnpj ?? base.cnpj,
      nickname: updateUserDto.nickname ?? base.nickname,
      corporateName: updateUserDto.corporateName ?? base.corporateName,
      phone: updateUserDto.phone ?? base.phone,
      whatsapp: updateUserDto.whatsapp ?? base.whatsapp,
      cellphone1: updateUserDto.cellphone1 ?? base.cellphone1,
      cellphone2: updateUserDto.cellphone2 ?? base.cellphone2,
      zipCode: updateUserDto.zipCode ?? base.zipCode,
      street: updateUserDto.street ?? base.street,
      number: updateUserDto.number ?? base.number,
      city: updateUserDto.city ?? base.city,
      state: updateUserDto.state ?? base.state,
      neighborhood: updateUserDto.neighborhood ?? base.neighborhood,
      complement: updateUserDto.complement ?? base.complement,
      role: updateUserDto.role ?? current.role,
      accessUsername: Object.prototype.hasOwnProperty.call(updateUserDto, "accessUsername")
        ? updateUserDto.accessUsername
        : current.accessUsername,
      accessProfile: updateUserDto.accessProfile ?? current.accessProfile ?? undefined,
      permissions: updateUserDto.permissions ?? normalizePermissions(current.permissions),
      complementaryProfiles: updateUserDto.complementaryProfiles ?? normalizeComplementaryAccessProfiles(current.complementaryProfiles),
      cashierOnly: updateUserDto.cashierOnly ?? current.cashierOnly,
      branchAccessCodes: updateUserDto.branchAccessCodes ?? current.branchAccesses.map((access) => access.branchCode),
    };
    const normalized = this.normalizePayload(payload);
    await this.assertUniqueAccessUsername(
      currentUser.tenantId,
      normalized.accessUsername,
      current.id,
    );
    const branchAccess = await this.resolveBranchAccess(
      currentUser.tenantId,
      normalized.role,
      payload.branchAccessCodes,
      current.branchCode,
    );

    if (normalized.password) {
      await this.syncCredential(normalized.email, normalized.password, currentUser.userId);
    }
    await this.sharedProfilesService.syncSharedProfileFromAdministrativeUser(
      currentUser.tenantId,
      normalized.sharedPerson,
      currentUser.userId,
      base.cpf || normalized.sharedPerson.cpf,
    );

    await this.prisma.user.update({
      where: { id: current.id },
      data: {
        branchCode: branchAccess.branchCode,
        name: normalized.name,
        accessUsername: normalized.accessUsername,
        role: normalized.role,
        accessProfile: normalized.role === "ADMIN" ? getDefaultAccessProfileForRole(normalized.role) : normalized.accessProfile,
        permissions: normalized.role === "ADMIN" ? null : serializePermissions(normalized.effectivePermissions),
        complementaryProfiles: normalized.role === "ADMIN" ? null : serializeComplementaryAccessProfiles(normalized.effectiveComplementaryProfiles),
        cashierOnly: normalized.cashierOnly,
        updatedBy: currentUser.userId,
      },
    });
    await this.syncUserBranchAccesses(
      currentUser.tenantId,
      current.id,
      branchAccess.branchAccessCodes,
      currentUser.userId,
    );
    return { message: "Usuário de acesso alterado com sucesso.", userId: current.id };
  }

  async updateStatus(id: string, active: boolean, currentUser: ICurrentUser) {
    const target = await this.prisma.user.findFirst({
      where: { id, tenantId: currentUser.tenantId },
      select: { id: true, canceledAt: true },
    });
    if (!target) throw new NotFoundException("Usuário de acesso não encontrado.");
    if (target.id === currentUser.userId && !active) {
      throw new BadRequestException("O usuário atualmente logado não pode ser inativado.");
    }

    await this.prisma.user.update({
      where: { id: target.id },
      data: {
        canceledAt: active ? null : new Date(),
        canceledBy: active ? null : currentUser.userId,
        updatedBy: currentUser.userId,
      },
    });
    return { message: active ? "Usuário ativado com sucesso." : "Usuário inativado com sucesso." };
  }
}
