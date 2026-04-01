import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../../../prisma/prisma.service";

type SharedProfileKind = "TEACHER" | "STUDENT" | "GUARDIAN";
type SharedEmailAccountKind =
  | "TENANT"
  | "USER"
  | "TEACHER"
  | "STUDENT"
  | "GUARDIAN"
  | "PERSON";

type SharedProfileRecord = {
  id: string;
  personId?: string | null;
  updatedAt: Date;
  name: string;
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
  email?: string | null;
  password?: string | null;
  resetPasswordToken?: string | null;
  resetPasswordExpires?: Date | null;
};

type SharedProfileSource = {
  kind: SharedProfileKind;
  record: SharedProfileRecord;
};

type SharedEmailAccountRecord = {
  id: string;
  email?: string | null;
  password?: string | null;
  updatedAt: Date;
};

type SharedEmailAccountSource = {
  kind: SharedEmailAccountKind;
  record: SharedEmailAccountRecord;
};

type SharedPersonRecord = {
  id: string;
  tenantId: string;
  updatedAt: Date;
  name: string;
  birthDate?: Date | null;
  rg?: string | null;
  cpf?: string | null;
  cpfDigits?: string | null;
  cnpj?: string | null;
  nickname?: string | null;
  corporateName?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  cellphone1?: string | null;
  cellphone2?: string | null;
  email?: string | null;
  password?: string | null;
  resetPasswordToken?: string | null;
  resetPasswordExpires?: Date | null;
  zipCode?: string | null;
  street?: string | null;
  number?: string | null;
  city?: string | null;
  state?: string | null;
  neighborhood?: string | null;
  complement?: string | null;
};

type SharedProfilePayload = Partial<
  Record<
    | "name"
    | "birthDate"
    | "rg"
    | "cpf"
    | "cnpj"
    | "nickname"
    | "corporateName"
    | "phone"
    | "whatsapp"
    | "cellphone1"
    | "cellphone2"
    | "email"
    | "password"
    | "resetPasswordToken"
    | "resetPasswordExpires"
    | "zipCode"
    | "street"
    | "number"
    | "city"
    | "state"
    | "neighborhood"
    | "complement",
    string | Date | null | undefined
  >
>;

type AdministrativeSharedProfilePayload = {
  name?: string | null;
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
  email?: string | null;
  password?: string | null;
  resetPasswordToken?: string | null;
  resetPasswordExpires?: Date | null;
  zipCode?: string | null;
  street?: string | null;
  number?: string | null;
  city?: string | null;
  state?: string | null;
  neighborhood?: string | null;
  complement?: string | null;
};

type SharedProfileSyncUpdate = {
  personId: string;
  name: string;
  birthDate: Date | null;
  rg: string | null;
  cpf: string | null;
  cnpj: string | null;
  nickname: string | null;
  corporateName: string | null;
  phone: string | null;
  whatsapp: string | null;
  cellphone1: string | null;
  cellphone2: string | null;
  email: string | null;
  zipCode: string | null;
  street: string | null;
  number: string | null;
  city: string | null;
  state: string | null;
  neighborhood: string | null;
  complement: string | null;
  updatedBy?: string;
};

type SharedNameSuggestion = {
  id: string;
  name: string;
  roles: string[];
  cpf: string | null;
  email: string | null;
  active: boolean;
  updatedAt: Date;
  score: number;
};

type EmailUsageRecord = {
  entityType: SharedEmailAccountKind;
  entityLabel: string;
  recordId: string;
  recordName: string;
  email: string;
  tenantId: string;
  tenantName: string;
  tenantDocument: string | null;
  tenantLogoUrl: string | null;
  updatedAt: Date;
  updatedBy: string | null;
};

const PROTECTED_PLACEHOLDER_NAME = "PESSOA SEM NOME";

const SHARED_PROFILE_FIELDS = [
  "name",
  "birthDate",
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
  "zipCode",
  "street",
  "number",
  "city",
  "state",
  "neighborhood",
  "complement",
] as const;

@Injectable()
export class SharedProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  normalizeDocument(value?: string | null) {
    return String(value || "").replace(/\D/g, "");
  }

  normalizeEmail(value?: string | null) {
    const normalized = String(value || "")
      .trim()
      .toUpperCase();
    return normalized || "";
  }

  private normalizeEmailVariants(value?: string | null) {
    const clean = String(value || "").trim();
    if (!clean) return [] as string[];

    return Array.from(new Set([clean, clean.toUpperCase(), clean.toLowerCase()]));
  }

  private getCrossTenantPrisma(): any {
    const prismaWithUnscoped = this.prisma as PrismaService & {
      getUnscopedClient?: () => unknown;
    };

    return typeof prismaWithUnscoped.getUnscopedClient === "function"
      ? prismaWithUnscoped.getUnscopedClient()
      : this.prisma;
  }

  async findEmailCredential(email?: string | null) {
    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail) return null;

    return this.prisma.emailCredential.findUnique({
      where: { email: normalizedEmail },
    });
  }

  async ensureEmailCredential(
    email?: string | null,
    options?: {
      passwordHash?: string | null;
      verified?: boolean;
      userId?: string | null;
    },
  ) {
    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail) return null;

    const existing = await this.findEmailCredential(normalizedEmail);
    const now = new Date();

    if (!existing) {
      return this.prisma.emailCredential.create({
        data: {
          email: normalizedEmail,
          passwordHash: options?.passwordHash ?? null,
          emailVerified: options?.verified === true,
          verifiedAt: options?.verified === true ? now : null,
          createdBy: options?.userId || undefined,
          updatedBy: options?.userId || undefined,
        },
      });
    }

    const data: Record<string, unknown> = {
      updatedBy: options?.userId || undefined,
    };

    if (options?.passwordHash !== undefined) {
      data.passwordHash = options.passwordHash || null;
    }

    if (options?.verified !== undefined) {
      data.emailVerified = options.verified;
      data.verifiedAt = options.verified
        ? existing.verifiedAt || now
        : null;
      if (options.verified) {
        data.verificationToken = null;
        data.verificationExpires = null;
      }
    }

    return this.prisma.emailCredential.update({
      where: { id: existing.id },
      data,
    });
  }

  async getOrCreateEmailCredentialFromLegacy(
    email?: string | null,
    options?: {
      exclude?: { kind: SharedEmailAccountKind; id: string };
      userId?: string | null;
    },
  ) {
    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail) return null;

    const existing = await this.findEmailCredential(normalizedEmail);
    if (existing) return existing;

    const legacyPasswordHash = await this.findSharedPasswordByEmailAcrossTenants(
      normalizedEmail,
      options?.exclude,
      options?.userId,
    );

    return this.ensureEmailCredential(normalizedEmail, {
      passwordHash: legacyPasswordHash || null,
      verified: Boolean(legacyPasswordHash),
      userId: options?.userId,
    });
  }

  async updateEmailCredentialPassword(
    email?: string | null,
    passwordHash?: string | null,
    userId?: string | null,
  ) {
    return this.ensureEmailCredential(email, {
      passwordHash: passwordHash || null,
      userId,
    });
  }

  async storeEmailCredentialResetToken(
    email: string,
    tokenHash: string,
    expiresAt: Date,
    userId?: string | null,
  ) {
    const credential = await this.getOrCreateEmailCredentialFromLegacy(email, {
      userId,
    });
    if (!credential) return null;

    return this.prisma.emailCredential.update({
      where: { id: credential.id },
      data: {
        resetPasswordToken: tokenHash,
        resetPasswordExpires: expiresAt,
        updatedBy: userId || undefined,
      },
    });
  }

  async clearEmailCredentialResetToken(id: string, userId?: string | null) {
    return this.prisma.emailCredential.update({
      where: { id },
      data: {
        resetPasswordToken: null,
        resetPasswordExpires: null,
        updatedBy: userId || undefined,
      },
    });
  }

  async findEmailCredentialByResetToken(tokenHash: string) {
    return this.prisma.emailCredential.findFirst({
      where: {
        resetPasswordToken: tokenHash,
        resetPasswordExpires: { gt: new Date() },
        canceledAt: null,
      },
    });
  }

  async storeEmailCredentialVerificationToken(
    email: string,
    tokenHash: string,
    expiresAt: Date,
    userId?: string | null,
  ) {
    const credential = await this.getOrCreateEmailCredentialFromLegacy(email, {
      userId,
    });
    if (!credential) return null;

    return this.prisma.emailCredential.update({
      where: { id: credential.id },
      data: {
        verificationToken: tokenHash,
        verificationExpires: expiresAt,
        updatedBy: userId || undefined,
      },
    });
  }

  async findEmailCredentialByVerificationToken(tokenHash: string) {
    return this.prisma.emailCredential.findFirst({
      where: {
        verificationToken: tokenHash,
        verificationExpires: { gt: new Date() },
        canceledAt: null,
      },
    });
  }

  async markEmailCredentialVerified(id: string, userId?: string | null) {
    return this.prisma.emailCredential.update({
      where: { id },
      data: {
        emailVerified: true,
        verifiedAt: new Date(),
        verificationToken: null,
        verificationExpires: null,
        updatedBy: userId || undefined,
      },
    });
  }

  private filterByNormalizedEmail<T extends { id: string; email?: string | null }>(
    records: T[],
    normalizedEmail: string,
  ) {
    return records.filter(
      (record) => this.normalizeEmail(record.email) === normalizedEmail,
    );
  }

  private async loadPasswordSyncTargetsByEmail(
    email: string,
    options?: {
      tenantId?: string | null;
      exclude?: { kind: SharedEmailAccountKind; id: string };
    },
  ) {
    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail) {
      return {
        people: [] as Array<{ id: string }>,
        users: [] as Array<{ id: string }>,
        teachers: [] as Array<{ id: string }>,
        students: [] as Array<{ id: string }>,
        guardians: [] as Array<{ id: string }>,
      };
    }

    const tenantScope = options?.tenantId ? { tenantId: options.tenantId } : {};
    const exclude = options?.exclude;
    const prismaClient = options?.tenantId
      ? this.prisma
      : this.getCrossTenantPrisma();

    const [people, users, teachers, students, guardians] = await Promise.all([
      prismaClient.person.findMany({
        where: {
          ...tenantScope,
          email: { not: null },
          ...(exclude?.kind === "PERSON" ? { id: { not: exclude.id } } : {}),
        },
        select: { id: true, email: true },
      }),
      prismaClient.user.findMany({
        where: {
          ...tenantScope,
          ...(exclude?.kind === "USER" ? { id: { not: exclude.id } } : {}),
        },
        select: { id: true, email: true },
      }),
      prismaClient.teacher.findMany({
        where: {
          ...tenantScope,
          email: { not: null },
          ...(exclude?.kind === "TEACHER" ? { id: { not: exclude.id } } : {}),
        },
        select: { id: true, email: true },
      }),
      prismaClient.student.findMany({
        where: {
          ...tenantScope,
          email: { not: null },
          ...(exclude?.kind === "STUDENT" ? { id: { not: exclude.id } } : {}),
        },
        select: { id: true, email: true },
      }),
      prismaClient.guardian.findMany({
        where: {
          ...tenantScope,
          email: { not: null },
          ...(exclude?.kind === "GUARDIAN" ? { id: { not: exclude.id } } : {}),
        },
        select: { id: true, email: true },
      }),
    ]);

    return {
      people: this.filterByNormalizedEmail(people, normalizedEmail).map(
        ({ id }) => ({ id }),
      ),
      users: this.filterByNormalizedEmail(users, normalizedEmail).map(
        ({ id }) => ({ id }),
      ),
      teachers: this.filterByNormalizedEmail(teachers, normalizedEmail).map(
        ({ id }) => ({ id }),
      ),
      students: this.filterByNormalizedEmail(students, normalizedEmail).map(
        ({ id }) => ({ id }),
      ),
      guardians: this.filterByNormalizedEmail(guardians, normalizedEmail).map(
        ({ id }) => ({ id }),
      ),
    };
  }

  private normalizeWritableName(value?: string | null) {
    return String(value || "")
      .trim()
      .toUpperCase();
  }

  private isProtectedPlaceholderName(value?: string | null) {
    return this.normalizeWritableName(value) === PROTECTED_PLACEHOLDER_NAME;
  }

  resolveWritableName(value?: string | null, fallback?: string | null) {
    const candidate =
      this.normalizeWritableName(value) || this.normalizeWritableName(fallback);

    if (!candidate || candidate === PROTECTED_PLACEHOLDER_NAME) {
      throw new BadRequestException(
        "NOME INVÁLIDO. NÃO É PERMITIDO GRAVAR PESSOA SEM NOME.",
      );
    }

    return candidate;
  }

  private isBlank(value: unknown) {
    return (
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim() === "")
    );
  }

  private normalizeSearchText(value?: string | null) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9\s]/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  }

  private isSubsequence(query: string, candidate: string) {
    if (!query || !candidate) return false;
    let queryIndex = 0;
    for (
      let candidateIndex = 0;
      candidateIndex < candidate.length;
      candidateIndex += 1
    ) {
      if (candidate[candidateIndex] === query[queryIndex]) {
        queryIndex += 1;
      }
      if (queryIndex === query.length) {
        return true;
      }
    }
    return false;
  }

  private computeNameSimilarityScore(query: string, name: string) {
    const normalizedQuery = this.normalizeSearchText(query);
    const normalizedName = this.normalizeSearchText(name);
    if (!normalizedQuery || !normalizedName) return 0;

    if (normalizedName === normalizedQuery) return 120;
    if (normalizedName.startsWith(normalizedQuery)) return 110;
    if (normalizedName.includes(normalizedQuery)) return 100;

    const queryTokens = normalizedQuery.split(" ").filter(Boolean);
    const nameTokens = normalizedName.split(" ").filter(Boolean);
    const allQueryTokensIncluded =
      queryTokens.length > 0 &&
      queryTokens.every((token) =>
        nameTokens.some((nameToken) => nameToken.includes(token)),
      );
    if (allQueryTokensIncluded) return 90;

    const compactQuery = normalizedQuery.replace(/\s+/g, "");
    const compactName = normalizedName.replace(/\s+/g, "");
    if (
      compactQuery.length >= 3 &&
      this.isSubsequence(compactQuery, compactName)
    ) {
      return 80;
    }

    return 0;
  }

  private getSharedPayload(
    record: SharedProfileRecord | SharedPersonRecord,
  ): SharedProfilePayload {
    return {
      name: record.name,
      birthDate: record.birthDate ?? null,
      rg: record.rg ?? null,
      cpf: record.cpf ?? null,
      cnpj: record.cnpj ?? null,
      nickname: record.nickname ?? null,
      corporateName: record.corporateName ?? null,
      phone: record.phone ?? null,
      whatsapp: record.whatsapp ?? null,
      cellphone1: record.cellphone1 ?? null,
      cellphone2: record.cellphone2 ?? null,
      email: record.email ?? null,
      zipCode: record.zipCode ?? null,
      street: record.street ?? null,
      number: record.number ?? null,
      city: record.city ?? null,
      state: record.state ?? null,
      neighborhood: record.neighborhood ?? null,
      complement: record.complement ?? null,
    };
  }

  private buildSyncUpdateData(
    person: SharedPersonRecord,
    userId?: string | null,
  ): SharedProfileSyncUpdate {
    return {
      personId: person.id,
      name: person.name,
      birthDate: person.birthDate ?? null,
      rg: person.rg ?? null,
      cpf: person.cpf ?? null,
      cnpj: person.cnpj ?? null,
      nickname: person.nickname ?? null,
      corporateName: person.corporateName ?? null,
      phone: person.phone ?? null,
      whatsapp: person.whatsapp ?? null,
      cellphone1: person.cellphone1 ?? null,
      cellphone2: person.cellphone2 ?? null,
      email: person.email ?? null,
      zipCode: person.zipCode ?? null,
      street: person.street ?? null,
      number: person.number ?? null,
      city: person.city ?? null,
      state: person.state ?? null,
      neighborhood: person.neighborhood ?? null,
      complement: person.complement ?? null,
      updatedBy: userId || undefined,
    };
  }

  private selectSharedFields() {
    return {
      id: true,
      personId: true,
      updatedAt: true,
      name: true,
      birthDate: true,
      rg: true,
      cpf: true,
      cnpj: true,
      nickname: true,
      corporateName: true,
      phone: true,
      whatsapp: true,
      cellphone1: true,
      cellphone2: true,
      email: true,
      password: true,
      resetPasswordToken: true,
      resetPasswordExpires: true,
      zipCode: true,
      street: true,
      number: true,
      city: true,
      state: true,
      neighborhood: true,
      complement: true,
    } as const;
  }

  private selectPersonFields() {
    return {
      id: true,
      tenantId: true,
      updatedAt: true,
      name: true,
      birthDate: true,
      rg: true,
      cpf: true,
      cpfDigits: true,
      cnpj: true,
      nickname: true,
      corporateName: true,
      phone: true,
      whatsapp: true,
      cellphone1: true,
      cellphone2: true,
      email: true,
      password: true,
      resetPasswordToken: true,
      resetPasswordExpires: true,
      zipCode: true,
      street: true,
      number: true,
      city: true,
      state: true,
      neighborhood: true,
      complement: true,
    } as const;
  }

  private getSourceRoleLabel(kind: SharedProfileKind) {
    switch (kind) {
      case "TEACHER":
        return "PROFESSOR";
      case "STUDENT":
        return "ALUNO";
      case "GUARDIAN":
        return "RESPONSAVEL";
    }
  }

  private getAdministrativeRoleLabel(role?: string | null) {
    const normalizedRole = String(role || "")
      .trim()
      .toUpperCase();
    if (!normalizedRole) return null;

    if (normalizedRole === "ADMIN") return "ADMINISTRADOR";
    if (normalizedRole === "SECRETARIA") return "SECRETARIA";
    if (normalizedRole === "COORDENACAO") return "COORDENACAO";

    return normalizedRole;
  }

  private async loadAdministrativeRoleLabelsByEmail(
    tenantId: string,
    email?: string | null,
  ) {
    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail) return [] as string[];

    const users = await this.prisma.user.findMany({
      where: {
        tenantId,
        canceledAt: null,
      },
      select: {
        email: true,
        role: true,
      },
    });

    return Array.from(
      new Set(
        users
          .filter((user) => this.normalizeEmail(user.email) === normalizedEmail)
          .map((user) => this.getAdministrativeRoleLabel(user.role))
          .filter((role): role is string => Boolean(role)),
      ),
    );
  }

  private getMergedValue<T>(
    incoming: T | null | undefined,
    current: T | null | undefined,
  ) {
    if (incoming === undefined || incoming === null) {
      return current ?? null;
    }

    if (typeof incoming === "string" && incoming.trim() === "") {
      return current ?? null;
    }

    return incoming;
  }

  private async loadMatches(
    tenantId: string,
    cpf: string,
    exclude?: { kind: SharedProfileKind; id: string },
  ) {
    const normalizedCpf = this.normalizeDocument(cpf);
    if (!normalizedCpf) return [] as SharedProfileSource[];

    const [teachers, students, guardians] = await Promise.all([
      this.prisma.teacher.findMany({
        where: {
          tenantId,
          cpf: { not: null },
          ...(exclude?.kind === "TEACHER" ? { id: { not: exclude.id } } : {}),
        },
        select: this.selectSharedFields(),
      }),
      this.prisma.student.findMany({
        where: {
          tenantId,
          cpf: { not: null },
          ...(exclude?.kind === "STUDENT" ? { id: { not: exclude.id } } : {}),
        },
        select: this.selectSharedFields(),
      }),
      this.prisma.guardian.findMany({
        where: {
          tenantId,
          cpf: { not: null },
          ...(exclude?.kind === "GUARDIAN" ? { id: { not: exclude.id } } : {}),
        },
        select: this.selectSharedFields(),
      }),
    ]);

    return [
      ...teachers.map((record) => ({ kind: "TEACHER" as const, record })),
      ...students.map((record) => ({ kind: "STUDENT" as const, record })),
      ...guardians.map((record) => ({ kind: "GUARDIAN" as const, record })),
    ].filter(
      ({ record }) => this.normalizeDocument(record.cpf) === normalizedCpf,
    );
  }

  private async loadEmailMatches(
    tenantId: string,
    email: string,
    exclude?: { kind: SharedEmailAccountKind; id: string },
  ) {
    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail) return [] as SharedEmailAccountSource[];

    const [people, users, teachers, students, guardians] = await Promise.all([
      this.prisma.person.findMany({
        where: {
          tenantId,
          email: { not: null },
          ...(exclude?.kind === "PERSON" ? { id: { not: exclude.id } } : {}),
        },
        select: {
          id: true,
          email: true,
          password: true,
          updatedAt: true,
        },
      }),
      this.prisma.user.findMany({
        where: {
          tenantId,
          canceledAt: null,
          ...(exclude?.kind === "USER" ? { id: { not: exclude.id } } : {}),
        },
        select: {
          id: true,
          email: true,
          password: true,
          updatedAt: true,
        },
      }),
      this.prisma.teacher.findMany({
        where: {
          tenantId,
          email: { not: null },
          ...(exclude?.kind === "TEACHER" ? { id: { not: exclude.id } } : {}),
        },
        select: {
          id: true,
          email: true,
          password: true,
          updatedAt: true,
        },
      }),
      this.prisma.student.findMany({
        where: {
          tenantId,
          email: { not: null },
          ...(exclude?.kind === "STUDENT" ? { id: { not: exclude.id } } : {}),
        },
        select: {
          id: true,
          email: true,
          password: true,
          updatedAt: true,
        },
      }),
      this.prisma.guardian.findMany({
        where: {
          tenantId,
          email: { not: null },
          ...(exclude?.kind === "GUARDIAN" ? { id: { not: exclude.id } } : {}),
        },
        select: {
          id: true,
          email: true,
          password: true,
          updatedAt: true,
        },
      }),
    ]);

    return [
      ...people.map((record) => ({ kind: "PERSON" as const, record })),
      ...users.map((record) => ({ kind: "USER" as const, record })),
      ...teachers.map((record) => ({ kind: "TEACHER" as const, record })),
      ...students.map((record) => ({ kind: "STUDENT" as const, record })),
      ...guardians.map((record) => ({ kind: "GUARDIAN" as const, record })),
    ].filter(
      ({ record }) => this.normalizeEmail(record.email) === normalizedEmail,
    );
  }

  private async findPersonById(id?: string | null) {
    if (!id) return null;

    return this.prisma.person.findUnique({
      where: { id },
      select: this.selectPersonFields(),
    });
  }

  private async findPersonByCpf(
    tenantId: string,
    cpf?: string | null,
    excludePersonId?: string | null,
  ) {
    const normalizedCpf = this.normalizeDocument(cpf);
    if (!normalizedCpf) return null;

    return this.prisma.person.findFirst({
      where: {
        tenantId,
        cpfDigits: normalizedCpf,
        ...(excludePersonId ? { id: { not: excludePersonId } } : {}),
      },
      select: this.selectPersonFields(),
    });
  }

  private async findPersonByEmail(
    tenantId: string,
    email?: string | null,
    excludePersonId?: string | null,
  ) {
    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail) return null;

    const people = await this.prisma.person.findMany({
      where: {
        tenantId,
        email: { not: null },
        ...(excludePersonId ? { id: { not: excludePersonId } } : {}),
      },
      orderBy: { updatedAt: "desc" },
      select: this.selectPersonFields(),
    });

    return (
      people.find(
        (person) => this.normalizeEmail(person.email) === normalizedEmail,
      ) || null
    );
  }

  private buildPersonCreateData(
    tenantId: string,
    payload: SharedProfilePayload,
    userId?: string | null,
  ) {
    const normalizedEmail = this.normalizeEmail(
      typeof payload.email === "string" ? payload.email : null,
    );
    const normalizedCpf = this.normalizeDocument(
      typeof payload.cpf === "string" ? payload.cpf : null,
    );

    return {
      tenantId,
      name: this.resolveWritableName(
        typeof payload.name === "string" ? payload.name : null,
      ),
      birthDate: payload.birthDate instanceof Date ? payload.birthDate : null,
      rg: this.isBlank(payload.rg) ? null : String(payload.rg),
      cpf: this.isBlank(payload.cpf) ? null : String(payload.cpf),
      cpfDigits: normalizedCpf || null,
      cnpj: this.isBlank(payload.cnpj) ? null : String(payload.cnpj),
      nickname: this.isBlank(payload.nickname)
        ? null
        : String(payload.nickname),
      corporateName: this.isBlank(payload.corporateName)
        ? null
        : String(payload.corporateName),
      phone: this.isBlank(payload.phone) ? null : String(payload.phone),
      whatsapp: this.isBlank(payload.whatsapp)
        ? null
        : String(payload.whatsapp),
      cellphone1: this.isBlank(payload.cellphone1)
        ? null
        : String(payload.cellphone1),
      cellphone2: this.isBlank(payload.cellphone2)
        ? null
        : String(payload.cellphone2),
      email: normalizedEmail || null,
      password: this.isBlank(payload.password)
        ? null
        : String(payload.password),
      resetPasswordToken: this.isBlank(payload.resetPasswordToken)
        ? null
        : String(payload.resetPasswordToken),
      resetPasswordExpires:
        payload.resetPasswordExpires instanceof Date
          ? payload.resetPasswordExpires
          : null,
      zipCode: this.isBlank(payload.zipCode) ? null : String(payload.zipCode),
      street: this.isBlank(payload.street) ? null : String(payload.street),
      number: this.isBlank(payload.number) ? null : String(payload.number),
      city: this.isBlank(payload.city) ? null : String(payload.city),
      state: this.isBlank(payload.state) ? null : String(payload.state),
      neighborhood: this.isBlank(payload.neighborhood)
        ? null
        : String(payload.neighborhood),
      complement: this.isBlank(payload.complement)
        ? null
        : String(payload.complement),
      updatedBy: userId || undefined,
      createdBy: userId || undefined,
    };
  }

  private buildPersonUpdateData(
    tenantId: string,
    payload: SharedProfilePayload,
    userId?: string | null,
  ) {
    const nextData = this.buildPersonCreateData(tenantId, payload, userId);

    return {
      name: nextData.name,
      birthDate: nextData.birthDate,
      rg: nextData.rg,
      cpf: nextData.cpf,
      cpfDigits: nextData.cpfDigits,
      cnpj: nextData.cnpj,
      nickname: nextData.nickname,
      corporateName: nextData.corporateName,
      phone: nextData.phone,
      whatsapp: nextData.whatsapp,
      cellphone1: nextData.cellphone1,
      cellphone2: nextData.cellphone2,
      email: nextData.email,
      password: nextData.password,
      resetPasswordToken: nextData.resetPasswordToken,
      resetPasswordExpires: nextData.resetPasswordExpires,
      zipCode: nextData.zipCode,
      street: nextData.street,
      number: nextData.number,
      city: nextData.city,
      state: nextData.state,
      neighborhood: nextData.neighborhood,
      complement: nextData.complement,
      updatedBy: userId || undefined,
    };
  }

  private async upsertSharedPerson(
    tenantId: string,
    sourceRecord: SharedProfileRecord | AdministrativeSharedProfilePayload,
    userId?: string | null,
    previousCpf?: string | null,
  ) {
    const payload = this.getSharedPayload(sourceRecord as SharedProfileRecord);
    const payloadCpf = typeof payload.cpf === "string" ? payload.cpf : null;
    const payloadEmail =
      typeof payload.email === "string" ? payload.email : null;
    const currentPerson = await this.findPersonById(
      (sourceRecord as { personId?: string | null }).personId,
    );
    const cpfPerson = await this.findPersonByCpf(
      tenantId,
      payloadCpf || previousCpf || null,
      currentPerson?.id,
    );
    const emailPerson = await this.findPersonByEmail(
      tenantId,
      payloadEmail,
      currentPerson?.id,
    );

    const basePerson = currentPerson || cpfPerson || emailPerson || null;
    const nextData = this.buildPersonCreateData(tenantId, payload, userId);

    if (!basePerson) {
      return this.prisma.person.create({
        data: nextData,
        select: this.selectPersonFields(),
      });
    }

    return this.prisma.person.update({
      where: { id: basePerson.id },
      data: this.buildPersonUpdateData(tenantId, payload, userId),
      select: this.selectPersonFields(),
    });
  }

  private async collectRoleMatchesForPerson(
    tenantId: string,
    person: SharedPersonRecord,
    source?: { kind: SharedProfileKind; id: string },
  ) {
    const normalizedCpf = this.normalizeDocument(person.cpf);
    if (!normalizedCpf) return [];

    const [teachers, students, guardians] = await Promise.all([
      this.prisma.teacher.findMany({
        where: {
          tenantId,
          cpf: { not: null },
        },
        select: this.selectSharedFields(),
      }),
      this.prisma.student.findMany({
        where: {
          tenantId,
          cpf: { not: null },
        },
        select: this.selectSharedFields(),
      }),
      this.prisma.guardian.findMany({
        where: {
          tenantId,
          cpf: { not: null },
        },
        select: this.selectSharedFields(),
      }),
    ]);

    const predicate = (record: SharedProfileRecord) =>
      this.normalizeDocument(record.cpf) === normalizedCpf;

    return [
      ...teachers
        .filter(predicate)
        .map((record) => ({ kind: "TEACHER" as const, record })),
      ...students
        .filter(predicate)
        .map((record) => ({ kind: "STUDENT" as const, record })),
      ...guardians
        .filter(predicate)
        .map((record) => ({ kind: "GUARDIAN" as const, record })),
    ].filter(
      ({ kind, record }) => !(source?.kind === kind && source.id === record.id),
    );
  }

  private async syncLinkedRolesFromPerson(
    tenantId: string,
    person: SharedPersonRecord,
    userId?: string | null,
    source?: { kind: SharedProfileKind; id: string },
  ) {
    const matches = await this.collectRoleMatchesForPerson(
      tenantId,
      person,
      source,
    );
    if (matches.length === 0) return;

    const updateData = this.buildSyncUpdateData(person, userId);

    const operations = matches.map(({ kind, record }) => {
      if (kind === "TEACHER") {
        return this.prisma.teacher.update({
          where: { id: record.id },
          data: updateData,
        });
      }

      if (kind === "STUDENT") {
        return this.prisma.student.update({
          where: { id: record.id },
          data: updateData,
        });
      }

      return this.prisma.guardian.update({
        where: { id: record.id },
        data: updateData,
      });
    });

    if (operations.length > 0) {
      await this.prisma.$transaction(operations);
    }
  }

  async findSharedProfileByCpf(
    tenantId: string,
    cpf?: string | null,
    exclude?: { kind: SharedProfileKind; id: string },
  ) {
    const normalizedCpf = this.normalizeDocument(cpf);
    if (!normalizedCpf) return null;

    const person = await this.findPersonByCpf(tenantId, normalizedCpf);
    if (person) {
      const linkedRoles = await this.collectRoleMatchesForPerson(
        tenantId,
        person,
      );
      const administrativeRoles =
        await this.loadAdministrativeRoleLabelsByEmail(tenantId, person.email);
      const uniqueRoles = Array.from(
        new Set([
          ...linkedRoles.map((item) => this.getSourceRoleLabel(item.kind)),
          ...administrativeRoles,
        ]),
      );

      return {
        sourceType: "PERSON",
        personId: person.id,
        roles: uniqueRoles,
        ...this.getSharedPayload(person),
        birthDate: person.birthDate
          ? person.birthDate.toISOString().split("T")[0]
          : null,
      };
    }

    const matches = await this.loadMatches(tenantId, normalizedCpf, exclude);
    const latest = matches.sort(
      (left, right) =>
        right.record.updatedAt.getTime() - left.record.updatedAt.getTime(),
    )[0];

    if (!latest) return null;
    const administrativeRoles = await this.loadAdministrativeRoleLabelsByEmail(
      tenantId,
      latest.record.email,
    );
    const latestRoles = Array.from(
      new Set([this.getSourceRoleLabel(latest.kind), ...administrativeRoles]),
    );

    return {
      sourceType: latest.kind,
      roles: latestRoles,
      ...this.getSharedPayload(latest.record),
      birthDate: latest.record.birthDate
        ? latest.record.birthDate.toISOString().split("T")[0]
        : null,
    };
  }

  async findSharedProfileByEmail(tenantId: string, email?: string | null) {
    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail) return null;

    const person = await this.findPersonByEmail(tenantId, normalizedEmail);
    if (person) {
      const linkedRoles = await this.collectRoleMatchesForPerson(
        tenantId,
        person,
      );
      const administrativeRoles =
        await this.loadAdministrativeRoleLabelsByEmail(tenantId, person.email);
      const uniqueRoles = Array.from(
        new Set([
          ...linkedRoles.map((item) => this.getSourceRoleLabel(item.kind)),
          ...administrativeRoles,
        ]),
      );

      return {
        sourceType: "PERSON",
        personId: person.id,
        roles: uniqueRoles,
        ...this.getSharedPayload(person),
        birthDate: person.birthDate
          ? person.birthDate.toISOString().split("T")[0]
          : null,
      };
    }

    const matches = await this.loadEmailMatches(tenantId, normalizedEmail);
    const latest = matches.sort(
      (left, right) =>
        right.record.updatedAt.getTime() - left.record.updatedAt.getTime(),
    )[0];

    if (!latest) return null;

    const administrativeRoles = await this.loadAdministrativeRoleLabelsByEmail(
      tenantId,
      normalizedEmail,
    );
    const roleCandidates = [...administrativeRoles];

    if (
      latest.kind === "TEACHER" ||
      latest.kind === "STUDENT" ||
      latest.kind === "GUARDIAN"
    ) {
      roleCandidates.push(this.getSourceRoleLabel(latest.kind));
    }

    return {
      sourceType: latest.kind,
      roles: Array.from(new Set(roleCandidates)),
      ...this.getSharedPayload(latest.record as SharedProfileRecord),
      birthDate:
        "birthDate" in latest.record && latest.record.birthDate instanceof Date
          ? latest.record.birthDate.toISOString().split("T")[0]
          : null,
    };
  }

  async findNameSuggestions(tenantId: string, name?: string | null, limit = 8) {
    const normalizedQuery = this.normalizeSearchText(name);
    if (normalizedQuery.length < 2) {
      return [] as Array<{
        name: string;
        roles: string[];
        cpf: string | null;
        email: string | null;
        active: boolean;
      }>;
    }

    const safeLimit = Math.max(1, Math.min(Number(limit) || 8, 20));
    const searchPoolSize = 2000;
    const usersPoolSize = 1000;
    const [people, teachers, students, guardians, users] = await Promise.all([
      this.prisma.person.findMany({
        where: { tenantId },
        select: {
          id: true,
          name: true,
          cpf: true,
          email: true,
          updatedAt: true,
        },
        take: searchPoolSize,
        orderBy: { updatedAt: "desc" },
      }),
      this.prisma.teacher.findMany({
        where: { tenantId },
        select: {
          id: true,
          name: true,
          cpf: true,
          email: true,
          canceledAt: true,
          updatedAt: true,
        },
        take: searchPoolSize,
        orderBy: { updatedAt: "desc" },
      }),
      this.prisma.student.findMany({
        where: { tenantId },
        select: {
          id: true,
          name: true,
          cpf: true,
          email: true,
          canceledAt: true,
          updatedAt: true,
        },
        take: searchPoolSize,
        orderBy: { updatedAt: "desc" },
      }),
      this.prisma.guardian.findMany({
        where: { tenantId },
        select: {
          id: true,
          name: true,
          cpf: true,
          email: true,
          canceledAt: true,
          updatedAt: true,
        },
        take: searchPoolSize,
        orderBy: { updatedAt: "desc" },
      }),
      this.prisma.user.findMany({
        where: {
          tenantId,
          canceledAt: null,
        },
        select: {
          id: true,
          name: true,
          role: true,
          email: true,
          updatedAt: true,
        },
        take: usersPoolSize,
        orderBy: { updatedAt: "desc" },
      }),
    ]);

    const suggestionsMap = new Map<string, SharedNameSuggestion>();
    const upsertSuggestion = (payload: Omit<SharedNameSuggestion, "score">) => {
      const score = this.computeNameSimilarityScore(
        normalizedQuery,
        payload.name,
      );
      if (score <= 0) return;

      const normalizedEmail = this.normalizeEmail(payload.email);
      const normalizedCpf = this.normalizeDocument(payload.cpf);
      const normalizedName = this.normalizeSearchText(payload.name);
      const key = normalizedCpf
        ? `CPF:${normalizedCpf}`
        : normalizedEmail
          ? `EMAIL:${normalizedEmail}`
          : `NAME:${normalizedName}:${payload.id}`;

      const existing = suggestionsMap.get(key);
      if (!existing) {
        suggestionsMap.set(key, {
          ...payload,
          score,
          roles: Array.from(new Set(payload.roles)),
        });
        return;
      }

      const mergedRoles = Array.from(
        new Set([...existing.roles, ...payload.roles]),
      );
      const shouldReplaceIdentity =
        score > existing.score ||
        payload.updatedAt.getTime() > existing.updatedAt.getTime();

      suggestionsMap.set(key, {
        ...existing,
        ...(shouldReplaceIdentity
          ? {
              id: payload.id,
              name: payload.name,
              cpf: payload.cpf,
              email: payload.email,
              active: payload.active,
              updatedAt: payload.updatedAt,
              score,
            }
          : {}),
        roles: mergedRoles,
      });
    };

    people.forEach((record) => {
      upsertSuggestion({
        id: `PERSON:${record.id}`,
        name: record.name,
        roles: [],
        cpf: record.cpf ?? null,
        email: record.email ?? null,
        active: true,
        updatedAt: record.updatedAt,
      });
    });

    teachers.forEach((record) => {
      upsertSuggestion({
        id: `TEACHER:${record.id}`,
        name: record.name,
        roles: ["PROFESSOR"],
        cpf: record.cpf ?? null,
        email: record.email ?? null,
        active: !record.canceledAt,
        updatedAt: record.updatedAt,
      });
    });

    students.forEach((record) => {
      upsertSuggestion({
        id: `STUDENT:${record.id}`,
        name: record.name,
        roles: ["ALUNO"],
        cpf: record.cpf ?? null,
        email: record.email ?? null,
        active: !record.canceledAt,
        updatedAt: record.updatedAt,
      });
    });

    guardians.forEach((record) => {
      upsertSuggestion({
        id: `GUARDIAN:${record.id}`,
        name: record.name,
        roles: ["RESPONSAVEL"],
        cpf: record.cpf ?? null,
        email: record.email ?? null,
        active: !record.canceledAt,
        updatedAt: record.updatedAt,
      });
    });

    users.forEach((record) => {
      const administrativeRole = this.getAdministrativeRoleLabel(record.role);
      upsertSuggestion({
        id: `USER:${record.id}`,
        name: record.name || record.email || "USUARIO",
        roles: administrativeRole ? [administrativeRole] : [],
        cpf: null,
        email: record.email ?? null,
        active: true,
        updatedAt: record.updatedAt,
      });
    });

    return Array.from(suggestionsMap.values())
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return right.updatedAt.getTime() - left.updatedAt.getTime();
      })
      .slice(0, safeLimit)
      .map((item) => ({
        name: item.name,
        roles: Array.from(new Set(item.roles)),
        cpf: item.cpf,
        email: item.email,
        active: item.active,
      }));
  }

  async findSharedPasswordByEmail(
    tenantId: string,
    email?: string | null,
    exclude?: { kind: SharedEmailAccountKind; id: string },
    userId?: string | null,
  ) {
    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail) return null;

    const credential = await this.findEmailCredential(normalizedEmail);
    if (credential?.passwordHash) {
      return credential.passwordHash;
    }

    const person = await this.findPersonByEmail(
      tenantId,
      normalizedEmail,
      exclude?.kind === "PERSON" ? exclude.id : null,
    );
    if (person?.password) {
      await this.ensureEmailCredential(normalizedEmail, {
        passwordHash: person.password,
        verified: true,
        userId,
      });
      return person.password;
    }

    const matches = await this.loadEmailMatches(
      tenantId,
      normalizedEmail,
      exclude,
    );
    const latest = matches
      .filter(({ record }) => !!record.password)
      .sort(
        (left, right) =>
          right.record.updatedAt.getTime() - left.record.updatedAt.getTime(),
      )[0];

    if (!latest?.record.password) {
      return null;
    }

    await this.ensureEmailCredential(normalizedEmail, {
      passwordHash: latest.record.password,
      verified: true,
      userId,
    });

    return latest.record.password;
  }

  async findSharedPasswordByEmailAcrossTenants(
    email?: string | null,
    exclude?: { kind: SharedEmailAccountKind; id: string },
    userId?: string | null,
  ) {
    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail) return null;

    const credential = await this.findEmailCredential(normalizedEmail);
    if (credential?.passwordHash) {
      return credential.passwordHash;
    }

    const crossTenantPrisma = this.getCrossTenantPrisma();
    const [people, users, teachers, students, guardians] = await Promise.all([
      crossTenantPrisma.person.findMany({
        where: {
          canceledAt: null,
          email: { not: null },
          ...(exclude?.kind === "PERSON" ? { id: { not: exclude.id } } : {}),
        },
        select: {
          id: true,
          email: true,
          password: true,
          updatedAt: true,
        },
      }),
      crossTenantPrisma.user.findMany({
        where: {
          canceledAt: null,
          ...(exclude?.kind === "USER" ? { id: { not: exclude.id } } : {}),
        },
        select: {
          id: true,
          email: true,
          password: true,
          updatedAt: true,
        },
      }),
      crossTenantPrisma.teacher.findMany({
        where: {
          canceledAt: null,
          email: { not: null },
          ...(exclude?.kind === "TEACHER" ? { id: { not: exclude.id } } : {}),
        },
        select: {
          id: true,
          email: true,
          password: true,
          updatedAt: true,
        },
      }),
      crossTenantPrisma.student.findMany({
        where: {
          canceledAt: null,
          email: { not: null },
          ...(exclude?.kind === "STUDENT" ? { id: { not: exclude.id } } : {}),
        },
        select: {
          id: true,
          email: true,
          password: true,
          updatedAt: true,
        },
      }),
      crossTenantPrisma.guardian.findMany({
        where: {
          canceledAt: null,
          email: { not: null },
          ...(exclude?.kind === "GUARDIAN" ? { id: { not: exclude.id } } : {}),
        },
        select: {
          id: true,
          email: true,
          password: true,
          updatedAt: true,
        },
      }),
    ]);

    const latest = [
      ...people.map((record: SharedEmailAccountRecord) => ({
        kind: "PERSON" as const,
        record,
      })),
      ...users.map((record: SharedEmailAccountRecord) => ({
        kind: "USER" as const,
        record,
      })),
      ...teachers.map((record: SharedEmailAccountRecord) => ({
        kind: "TEACHER" as const,
        record,
      })),
      ...students.map((record: SharedEmailAccountRecord) => ({
        kind: "STUDENT" as const,
        record,
      })),
      ...guardians.map((record: SharedEmailAccountRecord) => ({
        kind: "GUARDIAN" as const,
        record,
      })),
    ]
      .filter(({ record }) => this.normalizeEmail(record.email) === normalizedEmail)
      .filter(({ record }) => !!record.password)
      .sort(
        (left, right) =>
          right.record.updatedAt.getTime() - left.record.updatedAt.getTime(),
      )[0];

    if (!latest?.record.password) {
      return null;
    }

    await this.ensureEmailCredential(normalizedEmail, {
      passwordHash: latest.record.password,
      verified: true,
      userId,
    });

    return latest.record.password;
  }

  async getReusablePasswordHashOrThrow(
    email?: string | null,
    exclude?: { kind: SharedEmailAccountKind; id: string },
  ) {
    const existingPasswordHash =
      await this.findSharedPasswordByEmailAcrossTenants(email, exclude);

    if (existingPasswordHash) {
      return existingPasswordHash;
    }

    throw new BadRequestException(
      "INFORME A SENHA. ESTE E-MAIL AINDA NÃO POSSUI ACESSO CADASTRADO NO SISTEMA.",
    );
  }

  async syncSharedPasswordByEmail(
    tenantId: string,
    email: string,
    passwordHash: string,
    source?: { kind: SharedEmailAccountKind; id: string },
    userId?: string | null,
  ) {
    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail || !passwordHash) return;
    await this.ensureEmailCredential(normalizedEmail, {
      passwordHash,
      userId,
    });
  }

  async syncSharedPasswordByEmailAcrossTenants(
    email: string,
    passwordHash: string,
    source?: { kind: SharedEmailAccountKind; id: string },
    userId?: string | null,
  ) {
    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail || !passwordHash) return;
    await this.ensureEmailCredential(normalizedEmail, {
      passwordHash,
      userId,
    });
  }

  async hydrateMissingFieldsFromCpf<T extends Record<string, any>>(
    tenantId: string,
    payload: T,
    kind: SharedProfileKind,
    excludeId?: string,
  ) {
    const profile = await this.findSharedProfileByCpf(tenantId, payload.cpf, {
      kind,
      id: excludeId || "",
    });

    if (!profile) return payload;

    const mutablePayload = payload as Record<string, any>;

    for (const field of SHARED_PROFILE_FIELDS) {
      if (!this.isBlank(payload[field])) continue;
      const incomingValue = profile[field];
      if (this.isBlank(incomingValue)) continue;
      if (
        field === "name" &&
        typeof incomingValue === "string" &&
        this.isProtectedPlaceholderName(incomingValue)
      ) {
        continue;
      }
      mutablePayload[field] = incomingValue;
    }

    return payload;
  }

  async syncSharedProfile(
    tenantId: string,
    kind: SharedProfileKind,
    sourceId: string,
    sourceRecord: SharedProfileRecord,
    userId?: string | null,
    previousCpf?: string | null,
  ) {
    const normalizedSourceCpf = this.normalizeDocument(sourceRecord.cpf);
    if (!normalizedSourceCpf) {
      return;
    }

    const person = await this.upsertSharedPerson(
      tenantId,
      sourceRecord,
      userId,
      previousCpf,
    );

    const updateData = this.buildSyncUpdateData(person, userId);

    if (kind === "TEACHER") {
      await this.prisma.teacher.update({
        where: { id: sourceId },
        data: updateData,
      });
    } else if (kind === "STUDENT") {
      await this.prisma.student.update({
        where: { id: sourceId },
        data: updateData,
      });
    } else {
      await this.prisma.guardian.update({
        where: { id: sourceId },
        data: updateData,
      });
    }

    await this.syncLinkedRolesFromPerson(tenantId, person, userId, {
      kind,
      id: sourceId,
    });
  }

  async syncSharedProfileFromAdministrativeUser(
    tenantId: string,
    sourceRecord: AdministrativeSharedProfilePayload,
    userId?: string | null,
    previousCpf?: string | null,
  ) {
    const person = await this.upsertSharedPerson(
      tenantId,
      sourceRecord,
      userId,
      previousCpf,
    );

    await this.syncLinkedRolesFromPerson(tenantId, person, userId);
    return person;
  }

  async findEmailUsage(email: string) {
    const normalizedEmail = this.normalizeEmail(email);

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      throw new BadRequestException("INFORME UM E-MAIL VÁLIDO PARA CONSULTA.");
    }

    const prismaClient = this.getCrossTenantPrisma();

    const [tenants, users, teachers, students, guardians, people] =
      await Promise.all([
        prismaClient.tenant.findMany({
          where: { canceledAt: null },
          select: {
            id: true,
            name: true,
            document: true,
            logoUrl: true,
            updatedAt: true,
            updatedBy: true,
            email: true,
          },
        }),
        prismaClient.user.findMany({
          where: { canceledAt: null },
          select: {
            id: true,
            name: true,
            email: true,
            updatedAt: true,
            updatedBy: true,
            tenant: { select: { id: true, name: true, document: true } },
          },
        }),
        prismaClient.teacher.findMany({
          where: { canceledAt: null },
          select: {
            id: true,
            name: true,
            email: true,
            updatedAt: true,
            updatedBy: true,
            tenant: { select: { id: true, name: true, document: true } },
          },
        }),
        prismaClient.student.findMany({
          where: { canceledAt: null },
          select: {
            id: true,
            name: true,
            email: true,
            updatedAt: true,
            updatedBy: true,
            tenant: { select: { id: true, name: true, document: true } },
          },
        }),
        prismaClient.guardian.findMany({
          where: { canceledAt: null },
          select: {
            id: true,
            name: true,
            email: true,
            updatedAt: true,
            updatedBy: true,
            tenant: { select: { id: true, name: true, document: true } },
          },
        }),
        prismaClient.person.findMany({
          where: { canceledAt: null },
          select: {
            id: true,
            name: true,
            email: true,
            updatedAt: true,
            updatedBy: true,
            tenant: { select: { id: true, name: true, document: true } },
          },
        }),
      ]);

    const mapUsage = (
      entityType: SharedEmailAccountKind,
      entityLabel: string,
      record: {
        id: string;
        name: string;
        email?: string | null;
        updatedAt: Date;
        updatedBy?: string | null;
        tenant?: { id: string; name: string; document?: string | null } | null;
      },
    ): EmailUsageRecord | null => {
      if (!record.email) return null;

      return {
        entityType,
        entityLabel,
        recordId: record.id,
        recordName: record.name,
        email: record.email,
        tenantId: record.tenant?.id || "",
        tenantName: record.tenant?.name || "",
        tenantDocument: record.tenant?.document ?? null,
        tenantLogoUrl: null,
        updatedAt: record.updatedAt,
        updatedBy: record.updatedBy ?? null,
      };
    };

    const result: EmailUsageRecord[] = [
      ...tenants.map((record: {
        id: string;
        name: string;
        document?: string | null;
        logoUrl?: string | null;
        updatedAt: Date;
        updatedBy?: string | null;
        email?: string | null;
      }) => ({
        entityType: "TENANT" as const,
        entityLabel: "ESCOLA",
        recordId: record.id,
        recordName: record.name,
        email: record.email || "",
        tenantId: record.id,
        tenantName: record.name,
        tenantDocument: record.document ?? null,
        tenantLogoUrl: record.logoUrl ?? null,
        updatedAt: record.updatedAt,
        updatedBy: record.updatedBy ?? null,
      })),
      ...users.map((record: {
        id: string;
        name: string;
        email?: string | null;
        updatedAt: Date;
        updatedBy?: string | null;
        tenant?: { id: string; name: string; document?: string | null } | null;
      }) => mapUsage("USER", "USUÁRIO", record)),
      ...teachers.map((record: {
        id: string;
        name: string;
        email?: string | null;
        updatedAt: Date;
        updatedBy?: string | null;
        tenant?: { id: string; name: string; document?: string | null } | null;
      }) => mapUsage("TEACHER", "PROFESSOR", record)),
      ...students.map((record: {
        id: string;
        name: string;
        email?: string | null;
        updatedAt: Date;
        updatedBy?: string | null;
        tenant?: { id: string; name: string; document?: string | null } | null;
      }) => mapUsage("STUDENT", "ALUNO", record)),
      ...guardians.map((record: {
        id: string;
        name: string;
        email?: string | null;
        updatedAt: Date;
        updatedBy?: string | null;
        tenant?: { id: string; name: string; document?: string | null } | null;
      }) => mapUsage("GUARDIAN", "RESPONSÁVEL", record)),
      ...people.map((record: {
        id: string;
        name: string;
        email?: string | null;
        updatedAt: Date;
        updatedBy?: string | null;
        tenant?: { id: string; name: string; document?: string | null } | null;
      }) => mapUsage("PERSON", "PESSOA", record)),
    ]
      .filter((item): item is EmailUsageRecord => !!item)
      .filter((item) => this.normalizeEmail(item.email) === normalizedEmail);

    return result.sort((left, right) => {
      return (
        left.tenantName.localeCompare(right.tenantName) ||
        left.entityLabel.localeCompare(right.entityLabel) ||
        left.recordName.localeCompare(right.recordName)
      );
    });
  }
}
