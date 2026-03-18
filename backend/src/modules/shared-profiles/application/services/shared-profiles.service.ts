import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../../prisma/prisma.service";

type SharedProfileKind = "TEACHER" | "STUDENT" | "GUARDIAN";
type SharedEmailAccountKind =
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
  password: string | null;
  resetPasswordToken: string | null;
  resetPasswordExpires: Date | null;
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
    for (let candidateIndex = 0; candidateIndex < candidate.length; candidateIndex += 1) {
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
    const allQueryTokensIncluded = queryTokens.length > 0
      && queryTokens.every((token) => nameTokens.some((nameToken) => nameToken.includes(token)));
    if (allQueryTokensIncluded) return 90;

    const compactQuery = normalizedQuery.replace(/\s+/g, "");
    const compactName = normalizedName.replace(/\s+/g, "");
    if (compactQuery.length >= 3 && this.isSubsequence(compactQuery, compactName)) {
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
      password: record.password ?? null,
      resetPasswordToken: record.resetPasswordToken ?? null,
      resetPasswordExpires: record.resetPasswordExpires ?? null,
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
      password: person.password ?? null,
      resetPasswordToken: person.resetPasswordToken ?? null,
      resetPasswordExpires: person.resetPasswordExpires ?? null,
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
    const normalizedRole = String(role || "").trim().toUpperCase();
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
          .filter(
            (user) => this.normalizeEmail(user.email) === normalizedEmail,
          )
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
          ...(exclude?.kind === "GUARDIAN"
            ? { id: { not: exclude.id } }
            : {}),
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
          ...(exclude?.kind === "GUARDIAN"
            ? { id: { not: exclude.id } }
            : {}),
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
      name: String(payload.name || "").trim() || "PESSOA SEM NOME",
      birthDate: payload.birthDate instanceof Date ? payload.birthDate : null,
      rg: this.isBlank(payload.rg) ? null : String(payload.rg),
      cpf: this.isBlank(payload.cpf) ? null : String(payload.cpf),
      cpfDigits: normalizedCpf || null,
      cnpj: this.isBlank(payload.cnpj) ? null : String(payload.cnpj),
      nickname: this.isBlank(payload.nickname) ? null : String(payload.nickname),
      corporateName: this.isBlank(payload.corporateName)
        ? null
        : String(payload.corporateName),
      phone: this.isBlank(payload.phone) ? null : String(payload.phone),
      whatsapp: this.isBlank(payload.whatsapp) ? null : String(payload.whatsapp),
      cellphone1: this.isBlank(payload.cellphone1)
        ? null
        : String(payload.cellphone1),
      cellphone2: this.isBlank(payload.cellphone2)
        ? null
        : String(payload.cellphone2),
      email: normalizedEmail || null,
      password: this.isBlank(payload.password) ? null : String(payload.password),
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

    const emailOwnedByOtherPerson =
      Boolean(nextData.email) &&
      Boolean(emailPerson) &&
      emailPerson!.id !== basePerson.id;

    const updateData = {
      name: this.getMergedValue(nextData.name, basePerson.name) || "PESSOA SEM NOME",
      birthDate: this.getMergedValue(nextData.birthDate, basePerson.birthDate),
      rg: this.getMergedValue(nextData.rg, basePerson.rg),
      cpf: this.getMergedValue(nextData.cpf, basePerson.cpf),
      cpfDigits: this.getMergedValue(nextData.cpfDigits, basePerson.cpfDigits),
      cnpj: this.getMergedValue(nextData.cnpj, basePerson.cnpj),
      nickname: this.getMergedValue(nextData.nickname, basePerson.nickname),
      corporateName: this.getMergedValue(
        nextData.corporateName,
        basePerson.corporateName,
      ),
      phone: this.getMergedValue(nextData.phone, basePerson.phone),
      whatsapp: this.getMergedValue(nextData.whatsapp, basePerson.whatsapp),
      cellphone1: this.getMergedValue(nextData.cellphone1, basePerson.cellphone1),
      cellphone2: this.getMergedValue(nextData.cellphone2, basePerson.cellphone2),
      email: emailOwnedByOtherPerson
        ? basePerson.email ?? null
        : this.getMergedValue(nextData.email, basePerson.email),
      password: emailOwnedByOtherPerson
        ? basePerson.password ?? null
        : this.getMergedValue(nextData.password, basePerson.password),
      resetPasswordToken: emailOwnedByOtherPerson
        ? basePerson.resetPasswordToken ?? null
        : this.getMergedValue(
            nextData.resetPasswordToken,
            basePerson.resetPasswordToken,
          ),
      resetPasswordExpires: emailOwnedByOtherPerson
        ? basePerson.resetPasswordExpires ?? null
        : this.getMergedValue(
            nextData.resetPasswordExpires,
            basePerson.resetPasswordExpires,
          ),
      zipCode: this.getMergedValue(nextData.zipCode, basePerson.zipCode),
      street: this.getMergedValue(nextData.street, basePerson.street),
      number: this.getMergedValue(nextData.number, basePerson.number),
      city: this.getMergedValue(nextData.city, basePerson.city),
      state: this.getMergedValue(nextData.state, basePerson.state),
      neighborhood: this.getMergedValue(
        nextData.neighborhood,
        basePerson.neighborhood,
      ),
      complement: this.getMergedValue(nextData.complement, basePerson.complement),
      updatedBy: userId || undefined,
    };

    return this.prisma.person.update({
      where: { id: basePerson.id },
      data: updateData,
      select: this.selectPersonFields(),
    });
  }

  private async collectRoleMatchesForPerson(
    tenantId: string,
    person: SharedPersonRecord,
    source?: { kind: SharedProfileKind; id: string },
  ) {
    const normalizedCpf = this.normalizeDocument(person.cpf);
    const normalizedEmail = this.normalizeEmail(person.email);

    const [teachers, students, guardians] = await Promise.all([
      this.prisma.teacher.findMany({
        where: {
          tenantId,
          OR: [
            { personId: person.id },
            ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
            { cpf: { not: null } },
          ],
        },
        select: this.selectSharedFields(),
      }),
      this.prisma.student.findMany({
        where: {
          tenantId,
          OR: [
            { personId: person.id },
            ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
            { cpf: { not: null } },
          ],
        },
        select: this.selectSharedFields(),
      }),
      this.prisma.guardian.findMany({
        where: {
          tenantId,
          OR: [
            { personId: person.id },
            ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
            { cpf: { not: null } },
          ],
        },
        select: this.selectSharedFields(),
      }),
    ]);

    const predicate = (record: SharedProfileRecord) =>
      record.personId === person.id ||
      (normalizedEmail && this.normalizeEmail(record.email) === normalizedEmail) ||
      (normalizedCpf && this.normalizeDocument(record.cpf) === normalizedCpf);

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
      ({ kind, record }) =>
        !(source?.kind === kind && source.id === record.id),
    );
  }

  private async syncLinkedRolesFromPerson(
    tenantId: string,
    person: SharedPersonRecord,
    userId?: string | null,
    source?: { kind: SharedProfileKind; id: string },
  ) {
    const matches = await this.collectRoleMatchesForPerson(tenantId, person, source);
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
      const linkedRoles = await this.collectRoleMatchesForPerson(tenantId, person);
      const administrativeRoles = await this.loadAdministrativeRoleLabelsByEmail(
        tenantId,
        person.email,
      );
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

  async findSharedProfileByEmail(
    tenantId: string,
    email?: string | null,
  ) {
    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail) return null;

    const person = await this.findPersonByEmail(tenantId, normalizedEmail);
    if (person) {
      const linkedRoles = await this.collectRoleMatchesForPerson(tenantId, person);
      const administrativeRoles = await this.loadAdministrativeRoleLabelsByEmail(
        tenantId,
        person.email,
      );
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

    if (latest.kind === "TEACHER" || latest.kind === "STUDENT" || latest.kind === "GUARDIAN") {
      roleCandidates.push(this.getSourceRoleLabel(latest.kind));
    }

    return {
      sourceType: latest.kind,
      roles: Array.from(new Set(roleCandidates)),
      ...this.getSharedPayload(latest.record as SharedProfileRecord),
      birthDate:
        "birthDate" in latest.record &&
        latest.record.birthDate instanceof Date
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
      const score = this.computeNameSimilarityScore(normalizedQuery, payload.name);
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

      const mergedRoles = Array.from(new Set([...existing.roles, ...payload.roles]));
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
  ) {
    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail) return null;

    const person = await this.findPersonByEmail(
      tenantId,
      normalizedEmail,
      exclude?.kind === "PERSON" ? exclude.id : null,
    );
    if (person?.password) {
      return person.password;
    }

    const matches = await this.loadEmailMatches(tenantId, normalizedEmail, exclude);
    const latest = matches
      .filter(({ record }) => !!record.password)
      .sort(
        (left, right) =>
          right.record.updatedAt.getTime() - left.record.updatedAt.getTime(),
      )[0];

    return latest?.record.password || null;
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

    const [people, users, teachers, students, guardians] = await Promise.all([
      this.prisma.person.findMany({
        where: {
          tenantId,
          email: normalizedEmail,
          ...(source?.kind === "PERSON" ? { id: { not: source.id } } : {}),
        },
        select: { id: true },
      }),
      this.prisma.user.findMany({
        where: {
          tenantId,
          canceledAt: null,
          email: normalizedEmail,
          ...(source?.kind === "USER" ? { id: { not: source.id } } : {}),
        },
        select: { id: true },
      }),
      this.prisma.teacher.findMany({
        where: {
          tenantId,
          email: normalizedEmail,
          ...(source?.kind === "TEACHER" ? { id: { not: source.id } } : {}),
        },
        select: { id: true },
      }),
      this.prisma.student.findMany({
        where: {
          tenantId,
          email: normalizedEmail,
          ...(source?.kind === "STUDENT" ? { id: { not: source.id } } : {}),
        },
        select: { id: true },
      }),
      this.prisma.guardian.findMany({
        where: {
          tenantId,
          email: normalizedEmail,
          ...(source?.kind === "GUARDIAN" ? { id: { not: source.id } } : {}),
        },
        select: { id: true },
      }),
    ]);

    const operations = [
      ...people.map((record) =>
        this.prisma.person.update({
          where: { id: record.id },
          data: {
            password: passwordHash,
            updatedBy: userId || undefined,
          },
        }),
      ),
      ...users.map((record) =>
        this.prisma.user.update({
          where: { id: record.id },
          data: {
            password: passwordHash,
            updatedBy: userId || undefined,
          },
        }),
      ),
      ...teachers.map((record) =>
        this.prisma.teacher.update({
          where: { id: record.id },
          data: {
            password: passwordHash,
            updatedBy: userId || undefined,
          },
        }),
      ),
      ...students.map((record) =>
        this.prisma.student.update({
          where: { id: record.id },
          data: {
            password: passwordHash,
            updatedBy: userId || undefined,
          },
        }),
      ),
      ...guardians.map((record) =>
        this.prisma.guardian.update({
          where: { id: record.id },
          data: {
            password: passwordHash,
            updatedBy: userId || undefined,
          },
        }),
      ),
    ];

    if (operations.length === 0) return;

    await this.prisma.$transaction(operations);
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
}
