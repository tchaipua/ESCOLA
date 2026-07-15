import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../prisma/prisma.service";
import {
  getTenantContext,
  runWithTenantBranchScope,
} from "../../../../common/tenant/tenant.context";
import type { ICurrentUser } from "../../../../common/decorators/current-user.decorator";
import { SharedProfilesService } from "../../../shared-profiles/application/services/shared-profiles.service";
import { CreatePersonDto } from "../dto/create-person.dto";
import { UpdatePersonDto } from "../dto/update-person.dto";
import {
  type PersonRoleDto,
  type PersonRoleValue,
} from "../dto/person-role.dto";
import {
  getDefaultAccessProfileForRole,
  normalizeAccessProfileCode,
  resolveAccountPermissions,
} from "../../../../common/auth/access-profiles";
import { serializePermissions } from "../../../../common/auth/user-permissions";
import { getVisibleBranchCodes } from "../../../../common/tenant/branch.constants";
import { resolveWritableTenantBranchCode } from "../../../../common/tenant/tenant-branches";
import {
  isValidCnpj,
  normalizeCnpj,
} from "../../../../common/validation/cnpj";

type GuardianContact = {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  cellphone1: string | null;
  cellphone2: string | null;
};

type GuardianLink = {
  guardian: GuardianContact | null;
};

type LinkedRoleRecord = {
  id: string;
  canceledAt?: Date | null;
  canceledBy?: string | null;
  accessProfile: string | null;
  permissions: string | null;
  photoUrl?: string | null;
  guardians?: GuardianLink[];
};

type PersonWithRoles = {
  id: string;
  tenantId: string;
  branchCode: number;
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
  createdAt?: Date | null;
  updatedAt?: Date | null;
  canceledAt?: Date | null;
  canceledBy?: string | null;
  teachers: LinkedRoleRecord[];
  students: Array<LinkedRoleRecord & { guardians: GuardianLink[] }>;
  guardians: LinkedRoleRecord[];
  guardianAssignments?: {
    guardianId: string;
    studentId: string;
    studentName: string;
    currentClassLabel: string | null;
    kinship: string;
    kinshipDescription: string | null;
  }[];
};

type AdministrativeRoleRecord = {
  id: string;
  canceledAt?: Date | null;
  canceledBy?: string | null;
  accessProfile: string | null;
  permissions: string | null;
};

type BasicPersonIdentity = {
  id: string;
  tenantId: string;
  branchCode: number;
  name: string;
  email?: string | null;
  cpf?: string | null;
};

@Injectable()
export class PeopleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sharedProfilesService: SharedProfilesService,
  ) {}

  private tenantId() {
    return getTenantContext()!.tenantId;
  }

  private userId() {
    return getTenantContext()!.userId;
  }

  private branchCode() {
    return getTenantContext()!.branchCode;
  }

  private visibleBranchCodes() {
    return getVisibleBranchCodes(this.branchCode());
  }

  private transformToUpperCase(data: Record<string, any>) {
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

  private async fillAddressFromViaCep(data: Record<string, any>) {
    if (!data.zipCode) return;

    try {
      const cleanZip = String(data.zipCode).replace(/\D/g, "");
      if (cleanZip.length < 8) return;

      const response = await fetch(
        `https://viacep.com.br/ws/${cleanZip}/json/`,
      );
      const viaCepData = await response.json();
      if (viaCepData.erro) return;

      data.street = data.street || viaCepData.logradouro;
      data.neighborhood = data.neighborhood || viaCepData.bairro;
      data.city = data.city || viaCepData.localidade;
      data.state = data.state || viaCepData.uf;
    } catch {}
  }

  private getRoleLabel(role: PersonRoleValue) {
    if (role === "PROFESSOR") return "PROFESSOR";
    if (role === "ALUNO") return "ALUNO";
    return "RESPONSAVEL";
  }

  private getNormalizedRole(role: PersonRoleValue) {
    if (role === "PROFESSOR") return "PROFESSOR";
    if (role === "ALUNO") return "ALUNO";
    return "RESPONSAVEL";
  }

  private getRoleAccessProfile(
    role: PersonRoleValue,
    accessProfile?: string | null,
  ) {
    const normalizedRole = this.getNormalizedRole(role);
    return (
      normalizeAccessProfileCode(accessProfile, normalizedRole) ||
      getDefaultAccessProfileForRole(normalizedRole)
    );
  }

  private getRolePermissions(
    role: PersonRoleValue,
    roleRecord: LinkedRoleRecord,
  ) {
    return resolveAccountPermissions({
      role: this.getNormalizedRole(role),
      accessProfile: roleRecord.accessProfile,
      permissions: roleRecord.permissions,
    });
  }

  private serializeRolePermissions(roleDto: PersonRoleDto) {
    if (Array.isArray(roleDto.permissions) && roleDto.permissions.length > 0) {
      return serializePermissions(roleDto.permissions);
    }

    return null;
  }

  private normalizeIdentityText(value?: string | null) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase();
  }

  private normalizeIdentityDocument(value?: string | null) {
    return this.sharedProfilesService.normalizeDocument(value) || "";
  }

  private resolveRolePersonId<
    T extends {
      personId?: string | null;
      name?: string | null;
      email?: string | null;
      cpf?: string | null;
    },
  >(roleRecord: T, peopleById: Map<string, BasicPersonIdentity>) {
    if (roleRecord.personId && peopleById.has(roleRecord.personId)) {
      return roleRecord.personId;
    }

    const normalizedRoleCpf = this.normalizeIdentityDocument(roleRecord.cpf);
    const normalizedRoleEmail = this.normalizeIdentityText(roleRecord.email);
    const normalizedRoleName = this.normalizeIdentityText(roleRecord.name);

    for (const person of peopleById.values()) {
      const normalizedPersonCpf = this.normalizeIdentityDocument(person.cpf);
      if (
        normalizedRoleCpf &&
        normalizedPersonCpf &&
        normalizedRoleCpf === normalizedPersonCpf
      ) {
        return person.id;
      }

      const normalizedPersonEmail = this.normalizeIdentityText(person.email);
      if (
        normalizedRoleEmail &&
        normalizedPersonEmail &&
        normalizedRoleEmail === normalizedPersonEmail
      ) {
        return person.id;
      }

      const normalizedPersonName = this.normalizeIdentityText(person.name);
      if (
        normalizedRoleName &&
        normalizedPersonName &&
        normalizedRoleName === normalizedPersonName
      ) {
        return person.id;
      }
    }

    return null;
  }

  private mapRoleSummary(role: PersonRoleValue, roleRecord: LinkedRoleRecord) {
    return {
      role,
      roleLabel: this.getRoleLabel(role),
      recordId: roleRecord.id,
      active: !roleRecord.canceledAt && !roleRecord.canceledBy,
      accessProfile:
        this.getRoleAccessProfile(role, roleRecord.accessProfile) || null,
      permissions: this.getRolePermissions(role, roleRecord),
    };
  }

  private mapAdministrativeRoleSummary(roleRecord: AdministrativeRoleRecord) {
    return {
      role: "ADMINISTRADOR",
      roleLabel: "ADMINISTRADOR",
      recordId: roleRecord.id,
      active: !roleRecord.canceledAt && !roleRecord.canceledBy,
      accessProfile: roleRecord.accessProfile || null,
      permissions: roleRecord.permissions || null,
    };
  }

  private getPrimaryRoleRecord(records: LinkedRoleRecord[]) {
    return records[0] || null;
  }

  private collectGuardianContacts(person: PersonWithRoles) {
    const guardians = new Map<string, GuardianContact>();
    for (const student of person.students) {
      for (const link of student.guardians ?? []) {
        const guardian = link.guardian;
        if (!guardian || guardians.has(guardian.id)) continue;
        const guardianPerson = (guardian as any).person || {};
        guardians.set(guardian.id, {
          id: guardian.id,
          name: guardianPerson.name || guardian.name || "RESPONSAVEL",
          phone: guardianPerson.phone ?? guardian.phone ?? null,
          whatsapp: guardianPerson.whatsapp ?? guardian.whatsapp ?? null,
          cellphone1: guardianPerson.cellphone1 ?? guardian.cellphone1 ?? null,
          cellphone2: guardianPerson.cellphone2 ?? guardian.cellphone2 ?? null,
        });
      }
    }

    return Array.from(guardians.values());
  }

  private async collectGuardianAssignments(guardianIds: string[]) {
    if (!guardianIds.length) return [];

    const assignments = await this.prisma.$queryRaw<
        Array<{
          guardianId: string;
          studentId: string;
          studentName: string | null;
          schoolYear: number | null;
          seriesName: string | null;
          className: string | null;
          kinship: string;
          kinshipDescription: string | null;
        }>
    >`
      SELECT
          gs.guardianId,
          s.id AS studentId,
          sp.name AS studentName,
          sy.year AS schoolYear,
          se.name AS seriesName,
          c.name AS className,
          gs.kinship,
          gs.kinshipDescription
        FROM guardian_students gs
        INNER JOIN students s ON s.id = gs.studentId
        LEFT JOIN people sp ON sp.id = s.personId AND sp.tenantId = s.tenantId
        LEFT JOIN enrollments e
          ON e.id = (
            SELECT e2.id
            FROM enrollments e2
            INNER JOIN school_years sy2 ON sy2.id = e2.schoolYearId
            WHERE e2.studentId = s.id
              AND e2.tenantId = gs.tenantId
              AND e2.branchCode IN (${Prisma.join(this.visibleBranchCodes())})
              AND e2.canceledAt IS NULL
            ORDER BY
              CASE WHEN e2.status = 'ATIVO' THEN 0 ELSE 1 END,
              sy2.year DESC,
              e2.createdAt DESC
            LIMIT 1
          )
        LEFT JOIN school_years sy ON sy.id = e.schoolYearId
        LEFT JOIN series_classes sc ON sc.id = e.seriesClassId
        LEFT JOIN series se ON se.id = sc.seriesId
        LEFT JOIN classes c ON c.id = COALESCE(sc.classId, e.classId)
        WHERE gs.tenantId = ${this.tenantId()}
          AND gs.branchCode IN (${Prisma.join(this.visibleBranchCodes())})
          AND gs.canceledBy IS NULL
          AND s.branchCode IN (${Prisma.join(this.visibleBranchCodes())})
          AND gs.guardianId IN (${Prisma.join(guardianIds)})
    `;

    return assignments.map((assignment) => ({
        guardianId: assignment.guardianId,
        studentId: assignment.studentId,
        studentName: assignment.studentName || "ALUNO",
        currentClassLabel:
          assignment.seriesName || assignment.className || assignment.schoolYear
            ? [
                assignment.schoolYear ? String(assignment.schoolYear) : null,
                assignment.seriesName,
                assignment.className,
              ]
                .filter(Boolean)
                .join(" - ")
            : null,
        kinship: assignment.kinship,
        kinshipDescription: assignment.kinshipDescription,
      }));
  }

  private async mapPersonResponse(
    person: PersonWithRoles,
    administrativeRoles: AdministrativeRoleRecord[] = [],
  ) {
    const roles = [
      ...administrativeRoles.map((roleRecord) =>
        this.mapAdministrativeRoleSummary(roleRecord),
      ),
      this.getPrimaryRoleRecord(person.teachers)
        ? this.mapRoleSummary(
            "PROFESSOR",
            this.getPrimaryRoleRecord(person.teachers)!,
          )
        : null,
      this.getPrimaryRoleRecord(person.students)
        ? this.mapRoleSummary(
            "ALUNO",
            this.getPrimaryRoleRecord(person.students)!,
          )
        : null,
      this.getPrimaryRoleRecord(person.guardians)
        ? this.mapRoleSummary(
            "RESPONSAVEL",
            this.getPrimaryRoleRecord(person.guardians)!,
          )
        : null,
    ].filter(Boolean);

    const primaryStudent = this.getPrimaryRoleRecord(person.students);
    const photoUrl = primaryStudent?.photoUrl ?? null;
    const sharedLoginEnabled = Boolean(person.email && person.password);
    const guardianContacts = this.collectGuardianContacts(person);
    const guardianIds = person.guardians.map((record) => record.id);
    const guardianAssignments =
      await this.collectGuardianAssignments(guardianIds);

    return {
      id: person.id,
      tenantId: person.tenantId,
      branchCode: person.branchCode,
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
      createdAt: person.createdAt ?? null,
      updatedAt: person.updatedAt ?? null,
      canceledAt: person.canceledAt ?? null,
      sharedLoginEnabled,
      photoUrl,
      guardians: guardianContacts,
      guardianAssignments,
      roles,
    };
  }

  private async ensureUniquePersonIdentity(
    payload: { cpf?: string | null; email?: string | null },
    excludePersonId?: string,
  ) {
    const normalizedCpf = this.sharedProfilesService.normalizeDocument(
      payload.cpf,
    );
    if (normalizedCpf) {
      const personByCpf = await this.prisma.person.findFirst({
        where: {
          tenantId: this.tenantId(),
          cpfDigits: normalizedCpf,
          ...(excludePersonId ? { id: { not: excludePersonId } } : {}),
        },
        select: { id: true, name: true },
      });

      if (personByCpf) {
        throw new ConflictException(
          `Já existe uma pessoa com este CPF na escola: ${personByCpf.name}.`,
        );
      }
    }
  }

  private async findPersonEntity(id: string) {
    const person = await this.prisma.person.findFirst({
      where: {
        id,
        tenantId: this.tenantId(),
      },
      include: {
        teachers: {
          select: {
            id: true,
            canceledAt: true,
            accessProfile: true,
            permissions: true,
          },
          orderBy: [{ canceledAt: "asc" }, { updatedAt: "desc" }],
        },
        students: {
          select: {
            id: true,
            canceledAt: true,
            accessProfile: true,
            permissions: true,
            photoUrl: true,
            guardians: {
              where: { canceledAt: null },
              include: {
                guardian: {
                  select: {
                    id: true,
                    person: {
                      select: {
                        name: true,
                        phone: true,
                        whatsapp: true,
                        cellphone1: true,
                        cellphone2: true,
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: [{ canceledAt: "asc" }, { updatedAt: "desc" }],
        },
        guardians: {
          select: {
            id: true,
            canceledAt: true,
            accessProfile: true,
            permissions: true,
          },
          orderBy: [{ canceledAt: "asc" }, { updatedAt: "desc" }],
        },
      },
    });

    if (!person) {
      throw new NotFoundException("Pessoa não encontrada nesta escola.");
    }

    return person as unknown as PersonWithRoles;
  }

  private buildSharedRoleSnapshot(person: PersonWithRoles) {
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
    };
  }

  private async syncAllLinkedRoles(person: PersonWithRoles) {
    await this.prisma.$transaction([
      this.prisma.teacher.updateMany({
        where: { tenantId: this.tenantId(), personId: person.id },
        data: { updatedBy: this.userId() },
      }),
      this.prisma.student.updateMany({
        where: { tenantId: this.tenantId(), personId: person.id },
        data: { updatedBy: this.userId() },
      }),
      this.prisma.guardian.updateMany({
        where: { tenantId: this.tenantId(), personId: person.id },
        data: { updatedBy: this.userId() },
      }),
    ]);
  }

  private async createRoleForPerson(
    person: PersonWithRoles,
    roleDto: PersonRoleDto,
  ) {
    const accessProfile =
      this.getRoleAccessProfile(roleDto.role, roleDto.accessProfile) || null;
    const permissions = this.serializeRolePermissions(roleDto);

    if (roleDto.role === "PROFESSOR") {
      await this.prisma.teacher.create({
        data: {
          tenantId: this.tenantId(),
          branchCode: person.branchCode,
          personId: person.id,
          accessProfile,
          permissions,
          createdBy: this.userId(),
        },
      });
      return;
    }

    if (roleDto.role === "ALUNO") {
      await this.prisma.student.create({
        data: {
          tenantId: this.tenantId(),
          branchCode: person.branchCode,
          personId: person.id,
          accessProfile,
          permissions,
          createdBy: this.userId(),
        },
      });
      return;
    }

    await this.prisma.guardian.create({
      data: {
        tenantId: this.tenantId(),
        branchCode: person.branchCode,
        personId: person.id,
        accessProfile,
        permissions,
        createdBy: this.userId(),
      },
    });
  }

  private async upsertRolesForPerson(
    person: PersonWithRoles,
    roles?: PersonRoleDto[],
  ) {
    if (!roles || roles.length === 0) return;

    for (const roleDto of roles) {
      if (roleDto.role === "PROFESSOR") {
        if (person.teachers.length === 0) {
          await this.createRoleForPerson(person, roleDto);
        } else {
          await this.prisma.teacher.updateMany({
            where: { tenantId: this.tenantId(), personId: person.id },
            data: {
              accessProfile:
                this.getRoleAccessProfile(
                  roleDto.role,
                  roleDto.accessProfile,
                ) || null,
              permissions: this.serializeRolePermissions(roleDto),
              updatedBy: this.userId(),
            },
          });
        }
      }

      if (roleDto.role === "ALUNO") {
        if (person.students.length === 0) {
          await this.createRoleForPerson(person, roleDto);
        } else {
          await this.prisma.student.updateMany({
            where: { tenantId: this.tenantId(), personId: person.id },
            data: {
              accessProfile:
                this.getRoleAccessProfile(
                  roleDto.role,
                  roleDto.accessProfile,
                ) || null,
              permissions: this.serializeRolePermissions(roleDto),
              updatedBy: this.userId(),
            },
          });
        }
      }

      if (roleDto.role === "RESPONSAVEL") {
        if (person.guardians.length === 0) {
          await this.createRoleForPerson(person, roleDto);
        } else {
          await this.prisma.guardian.updateMany({
            where: { tenantId: this.tenantId(), personId: person.id },
            data: {
              accessProfile:
                this.getRoleAccessProfile(
                  roleDto.role,
                  roleDto.accessProfile,
                ) || null,
              permissions: this.serializeRolePermissions(roleDto),
              updatedBy: this.userId(),
            },
          });
        }
      }
    }
  }

  async findAll() {
    const tenantId = this.tenantId();

    const [people, teachers, students, guardians, studentGuardians, users] =
        await Promise.all([
        this.prisma.$queryRaw<
          Array<{
            id: string;
            tenantId: string;
            branchCode: number;
            name: string;
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
            zipCode: string | null;
            street: string | null;
            number: string | null;
            city: string | null;
            state: string | null;
            neighborhood: string | null;
            complement: string | null;
          }>
        >`
          SELECT
            id, tenantId, branchCode, name, rg, cpf, cnpj, nickname, corporateName,
            phone, whatsapp, cellphone1, cellphone2, email, password,
            zipCode, street, number, city, state, neighborhood, complement
          FROM people
          WHERE tenantId = ${tenantId}
            AND branchCode IN (${Prisma.join(this.visibleBranchCodes())})
          ORDER BY name ASC
        `,
        this.prisma.$queryRaw<
          Array<{
            id: string;
            name: string;
            email: string | null;
            cpf: string | null;
            personId: string | null;
            branchCode: number;
            accessProfile: string | null;
            permissions: string | null;
            canceledBy: string | null;
          }>
        >`
          SELECT
            t.id,
            p.name,
            p.email,
            p.cpf,
            t.personId,
            t.branchCode,
            t.accessProfile,
            t.permissions,
            t.canceledBy
          FROM teachers t
          LEFT JOIN people p ON p.id = t.personId AND p.tenantId = t.tenantId
          WHERE t.tenantId = ${tenantId}
            AND t.branchCode IN (${Prisma.join(this.visibleBranchCodes())})
          ORDER BY t.id ASC
        `,
        this.prisma.$queryRaw<
          Array<{
            id: string;
            name: string;
            email: string | null;
            cpf: string | null;
            personId: string | null;
            branchCode: number;
            accessProfile: string | null;
            permissions: string | null;
            canceledBy: string | null;
            photoUrl: string | null;
          }>
        >`
          SELECT
            s.id,
            p.name,
            p.email,
            p.cpf,
            s.personId,
            s.branchCode,
            s.accessProfile,
            s.permissions,
            s.canceledBy,
            s.photoUrl
          FROM students s
          LEFT JOIN people p ON p.id = s.personId AND p.tenantId = s.tenantId
          WHERE s.tenantId = ${tenantId}
            AND s.branchCode IN (${Prisma.join(this.visibleBranchCodes())})
          ORDER BY s.id ASC
        `,
        this.prisma.$queryRaw<
          Array<{
            id: string;
            name: string;
            email: string | null;
            cpf: string | null;
            personId: string | null;
            branchCode: number;
            accessProfile: string | null;
            permissions: string | null;
            canceledBy: string | null;
          }>
        >`
          SELECT
            g.id,
            p.name,
            p.email,
            p.cpf,
            g.personId,
            g.branchCode,
            g.accessProfile,
            g.permissions,
            g.canceledBy
          FROM guardians g
          LEFT JOIN people p ON p.id = g.personId AND p.tenantId = g.tenantId
          WHERE g.tenantId = ${tenantId}
            AND g.branchCode IN (${Prisma.join(this.visibleBranchCodes())})
          ORDER BY g.id ASC
        `,
          this.prisma.$queryRaw<
            Array<{
              studentId: string;
              guardianId: string;
            guardianName: string;
            guardianPhone: string | null;
            guardianWhatsapp: string | null;
            guardianCellphone1: string | null;
            guardianCellphone2: string | null;
          }>
        >`
          SELECT
            gs.studentId,
            g.id AS guardianId,
            p.name AS guardianName,
            p.phone AS guardianPhone,
            p.whatsapp AS guardianWhatsapp,
            p.cellphone1 AS guardianCellphone1,
            p.cellphone2 AS guardianCellphone2
            FROM guardian_students gs
            INNER JOIN guardians g ON g.id = gs.guardianId
            LEFT JOIN people p ON p.id = g.personId AND p.tenantId = g.tenantId
            WHERE gs.tenantId = ${tenantId}
              AND gs.branchCode IN (${Prisma.join(this.visibleBranchCodes())})
              AND gs.canceledBy IS NULL
              AND g.tenantId = ${tenantId}
              AND g.branchCode IN (${Prisma.join(this.visibleBranchCodes())})
          `,
          this.prisma.$queryRaw<
            Array<{
              id: string;
              name: string;
              email: string | null;
              role: string;
              canceledAt: Date | null;
              canceledBy: string | null;
            }>
          >`
            SELECT id, name, email, role, canceledAt, canceledBy
            FROM users
            WHERE tenantId = ${tenantId}
              AND branchCode IN (${Prisma.join(this.visibleBranchCodes())})
              AND canceledAt IS NULL
          `,
        ]);

    const peopleById = new Map<string, BasicPersonIdentity>();
    for (const person of people) {
      peopleById.set(person.id, person);
    }

    const teachersByPersonId = new Map<string, LinkedRoleRecord[]>();
    for (const teacher of teachers) {
      const personId = this.resolveRolePersonId(teacher, peopleById);
      if (!personId) continue;
      const current = teachersByPersonId.get(personId) || [];
      current.push({
        id: teacher.id,
        canceledBy: teacher.canceledBy,
        accessProfile: teacher.accessProfile,
        permissions: teacher.permissions,
      });
      teachersByPersonId.set(personId, current);
    }

    const studentGuardiansByStudentId = new Map<string, GuardianLink[]>();
    for (const link of studentGuardians) {
      const current = studentGuardiansByStudentId.get(link.studentId) || [];
      current.push({
        guardian: {
          id: link.guardianId,
          name: link.guardianName,
          phone: link.guardianPhone,
          whatsapp: link.guardianWhatsapp,
          cellphone1: link.guardianCellphone1,
          cellphone2: link.guardianCellphone2,
        },
      });
      studentGuardiansByStudentId.set(link.studentId, current);
    }

    const studentsByPersonId = new Map<
      string,
      Array<LinkedRoleRecord & { guardians: GuardianLink[] }>
    >();
    for (const student of students) {
      const personId = this.resolveRolePersonId(student, peopleById);
      if (!personId) continue;
      const current = studentsByPersonId.get(personId) || [];
      current.push({
        id: student.id,
        canceledBy: student.canceledBy,
        accessProfile: student.accessProfile,
        permissions: student.permissions,
        photoUrl: student.photoUrl,
        guardians: studentGuardiansByStudentId.get(student.id) || [],
      });
      studentsByPersonId.set(personId, current);
    }

    const guardiansByPersonId = new Map<string, LinkedRoleRecord[]>();
      for (const guardian of guardians) {
        const personId = this.resolveRolePersonId(guardian, peopleById);
        if (!personId) continue;
        const current = guardiansByPersonId.get(personId) || [];
      current.push({
        id: guardian.id,
        canceledBy: guardian.canceledBy,
        accessProfile: guardian.accessProfile,
        permissions: guardian.permissions,
      });
        guardiansByPersonId.set(personId, current);
      }

      const administrativeRolesByEmail = new Map<string, AdministrativeRoleRecord[]>();
      for (const user of users) {
        const normalizedEmail = this.sharedProfilesService.normalizeEmail(user.email);
        if (!normalizedEmail || user.role !== "ADMIN") continue;

        const current = administrativeRolesByEmail.get(normalizedEmail) || [];
        current.push({
          id: user.id,
          canceledAt: user.canceledAt,
          canceledBy: user.canceledBy,
          accessProfile: "ADMINISTRADOR",
          permissions: null,
        });
        administrativeRolesByEmail.set(normalizedEmail, current);
      }

      return Promise.all(
        people.map((person) =>
          this.mapPersonResponse(
            {
              ...person,
              birthDate: null,
              resetPasswordToken: null,
              resetPasswordExpires: null,
              createdAt: null,
              updatedAt: null,
              canceledAt: null,
              canceledBy: null,
              teachers: teachersByPersonId.get(person.id) || [],
              students: studentsByPersonId.get(person.id) || [],
              guardians: guardiansByPersonId.get(person.id) || [],
            },
            administrativeRolesByEmail.get(
              this.sharedProfilesService.normalizeEmail(person.email) || "",
            ) || [],
          ),
        ),
      );
  }

  async findOne(id: string) {
    const person = await this.findPersonEntity(id);
    const administrativeRoleRecords = person.email
      ? await this.prisma.user.findMany({
          where: {
            tenantId: person.tenantId,
            email: this.sharedProfilesService.normalizeEmail(person.email) || "",
            role: "ADMIN",
            canceledAt: null,
          },
          select: {
            id: true,
            canceledAt: true,
            canceledBy: true,
          },
        }).then((users) =>
          users.map((user) => ({
            id: user.id,
            canceledAt: user.canceledAt,
            canceledBy: user.canceledBy,
            accessProfile: "ADMINISTRADOR",
            permissions: null,
          })),
        )
      : [];
    return this.mapPersonResponse(person, administrativeRoleRecords);
  }

  async create(createDto: CreatePersonDto, currentUser?: ICurrentUser) {
    const targetBranchCode = await resolveWritableTenantBranchCode(
      this.prisma,
      this.tenantId(),
      createDto.branchCode,
      this.branchCode(),
    );

    return runWithTenantBranchScope(targetBranchCode, async () => {
      const mutableData = this.transformToUpperCase({ ...createDto });
      await this.fillAddressFromViaCep(mutableData);
      mutableData.name = this.sharedProfilesService.resolveWritableName(
        mutableData.name,
      );
      if (mutableData.cnpj) {
        mutableData.cnpj = normalizeCnpj(mutableData.cnpj);
        if (!isValidCnpj(mutableData.cnpj)) {
          throw new BadRequestException("CNPJ inválido.");
        }
      }

      const normalizedEmail = this.sharedProfilesService.normalizeEmail(
        createDto.email,
      );
      await this.ensureUniquePersonIdentity({
        cpf: createDto.cpf,
        email: normalizedEmail,
      });

      let hashedPassword: string | null = null;
      if (createDto.password) {
        const salt = await bcrypt.genSalt(10);
        hashedPassword = await bcrypt.hash(createDto.password, salt);
      }

      const createdPerson = await this.prisma.person.create({
        data: {
          name: mutableData.name,
          birthDate: createDto.birthDate ? new Date(createDto.birthDate) : null,
          rg: mutableData.rg || null,
          cpf: mutableData.cpf || null,
          cpfDigits:
            this.sharedProfilesService.normalizeDocument(createDto.cpf) || null,
          cnpj: mutableData.cnpj || null,
          nickname: mutableData.nickname || null,
          corporateName: mutableData.corporateName || null,
          phone: mutableData.phone || null,
          whatsapp: mutableData.whatsapp || null,
          cellphone1: mutableData.cellphone1 || null,
          cellphone2: mutableData.cellphone2 || null,
          email: normalizedEmail || null,
          password: null,
          zipCode: mutableData.zipCode || null,
          street: mutableData.street || null,
          number: mutableData.number || null,
          city: mutableData.city || null,
          state: mutableData.state || null,
          neighborhood: mutableData.neighborhood || null,
          complement: mutableData.complement || null,
          tenantId: this.tenantId(),
          branchCode: targetBranchCode,
          createdBy: currentUser?.userId || this.userId(),
        },
      });

      if (normalizedEmail) {
        if (hashedPassword) {
          await this.sharedProfilesService.updateEmailCredentialPassword(
            normalizedEmail,
            hashedPassword,
            currentUser?.userId || this.userId(),
          );
        } else {
          await this.sharedProfilesService.ensureEmailCredential(
            normalizedEmail,
            {
              userId: currentUser?.userId || this.userId(),
            },
          );
        }
      }

      await this.upsertRolesForPerson(
        await this.findPersonEntity(createdPerson.id),
        createDto.roles,
      );

      const reloadedPerson = await this.findPersonEntity(createdPerson.id);
      await this.syncAllLinkedRoles(reloadedPerson);
      await this.ensurePersonHasRole(reloadedPerson.id);

      const finalPerson = await this.findPersonEntity(createdPerson.id);
      return this.mapPersonResponse(finalPerson);
    });
  }

  async update(
    id: string,
    updateDto: UpdatePersonDto,
    currentUser?: ICurrentUser,
  ) {
    const currentPerson = await this.findPersonEntity(id);
    const targetBranchCode = await resolveWritableTenantBranchCode(
      this.prisma,
      this.tenantId(),
      updateDto.branchCode,
      currentPerson.branchCode,
    );

    return runWithTenantBranchScope(targetBranchCode, async () => {
      const mutableData = this.transformToUpperCase({ ...updateDto });
      await this.fillAddressFromViaCep(mutableData);
      mutableData.name = this.sharedProfilesService.resolveWritableName(
        mutableData.name,
        currentPerson.name,
      );
      if (Object.prototype.hasOwnProperty.call(updateDto, "cnpj")) {
        mutableData.cnpj = mutableData.cnpj
          ? normalizeCnpj(mutableData.cnpj)
          : "";
        if (mutableData.cnpj && !isValidCnpj(mutableData.cnpj)) {
          throw new BadRequestException("CNPJ inválido.");
        }
      }

      const normalizedEmail = Object.prototype.hasOwnProperty.call(
        updateDto,
        "email",
      )
        ? this.sharedProfilesService.normalizeEmail(updateDto.email)
        : currentPerson.email;
      const normalizedCurrentEmail = this.sharedProfilesService.normalizeEmail(
        currentPerson.email,
      );
      const shouldResolvePasswordForEmailChange =
        Boolean(normalizedEmail) && normalizedEmail !== normalizedCurrentEmail;

      await this.ensureUniquePersonIdentity(
        {
          cpf: Object.prototype.hasOwnProperty.call(updateDto, "cpf")
            ? updateDto.cpf
            : currentPerson.cpf,
          email: normalizedEmail,
        },
        id,
      );

      let hashedPassword: string | undefined;
      if (updateDto.password) {
        const salt = await bcrypt.genSalt(10);
        hashedPassword = await bcrypt.hash(updateDto.password, salt);
      }

      await this.prisma.person.update({
        where: { id },
        data: {
          name: Object.prototype.hasOwnProperty.call(updateDto, "name")
            ? mutableData.name || currentPerson.name
            : undefined,
          birthDate: Object.prototype.hasOwnProperty.call(
            updateDto,
            "birthDate",
          )
            ? updateDto.birthDate
              ? new Date(updateDto.birthDate)
              : null
            : undefined,
          rg: Object.prototype.hasOwnProperty.call(updateDto, "rg")
            ? mutableData.rg || null
            : undefined,
          cpf: Object.prototype.hasOwnProperty.call(updateDto, "cpf")
            ? mutableData.cpf || null
            : undefined,
          cpfDigits: Object.prototype.hasOwnProperty.call(updateDto, "cpf")
            ? this.sharedProfilesService.normalizeDocument(updateDto.cpf) ||
              null
            : undefined,
          cnpj: Object.prototype.hasOwnProperty.call(updateDto, "cnpj")
            ? mutableData.cnpj || null
            : undefined,
          nickname: Object.prototype.hasOwnProperty.call(updateDto, "nickname")
            ? mutableData.nickname || null
            : undefined,
          corporateName: Object.prototype.hasOwnProperty.call(
            updateDto,
            "corporateName",
          )
            ? mutableData.corporateName || null
            : undefined,
          phone: Object.prototype.hasOwnProperty.call(updateDto, "phone")
            ? mutableData.phone || null
            : undefined,
          whatsapp: Object.prototype.hasOwnProperty.call(updateDto, "whatsapp")
            ? mutableData.whatsapp || null
            : undefined,
          cellphone1: Object.prototype.hasOwnProperty.call(
            updateDto,
            "cellphone1",
          )
            ? mutableData.cellphone1 || null
            : undefined,
          cellphone2: Object.prototype.hasOwnProperty.call(
            updateDto,
            "cellphone2",
          )
            ? mutableData.cellphone2 || null
            : undefined,
          email: Object.prototype.hasOwnProperty.call(updateDto, "email")
            ? normalizedEmail || null
            : undefined,
          password:
            hashedPassword || shouldResolvePasswordForEmailChange
              ? null
              : undefined,
          zipCode: Object.prototype.hasOwnProperty.call(updateDto, "zipCode")
            ? mutableData.zipCode || null
            : undefined,
          street: Object.prototype.hasOwnProperty.call(updateDto, "street")
            ? mutableData.street || null
            : undefined,
          number: Object.prototype.hasOwnProperty.call(updateDto, "number")
            ? mutableData.number || null
            : undefined,
          city: Object.prototype.hasOwnProperty.call(updateDto, "city")
            ? mutableData.city || null
            : undefined,
          state: Object.prototype.hasOwnProperty.call(updateDto, "state")
            ? mutableData.state || null
            : undefined,
          neighborhood: Object.prototype.hasOwnProperty.call(
            updateDto,
            "neighborhood",
          )
            ? mutableData.neighborhood || null
            : undefined,
          complement: Object.prototype.hasOwnProperty.call(
            updateDto,
            "complement",
          )
            ? mutableData.complement || null
            : undefined,
          branchCode: targetBranchCode,
          updatedBy: currentUser?.userId || this.userId(),
        },
      });

      if (normalizedEmail) {
        if (hashedPassword) {
          await this.sharedProfilesService.updateEmailCredentialPassword(
            normalizedEmail,
            hashedPassword,
            currentUser?.userId || this.userId(),
          );
        } else if (shouldResolvePasswordForEmailChange) {
          await this.sharedProfilesService.ensureEmailCredential(
            normalizedEmail,
            {
              userId: currentUser?.userId || this.userId(),
            },
          );
        }
      }

      await this.upsertRolesForPerson(
        await this.findPersonEntity(id),
        updateDto.roles,
      );
      const reloadedPerson = await this.findPersonEntity(id);
      await this.syncAllLinkedRoles(reloadedPerson);
      await this.ensurePersonHasRole(reloadedPerson.id);

      return this.mapPersonResponse(reloadedPerson);
    });
  }

  private async ensurePersonHasRole(personId: string) {
    if (!personId) return;

    const hasStudent = await this.prisma.student.findFirst({
      where: { personId },
      select: { id: true },
    });
    if (hasStudent) return;

    const hasTeacher = await this.prisma.teacher.findFirst({
      where: { personId },
      select: { id: true },
    });
    if (hasTeacher) return;

    const hasGuardian = await this.prisma.guardian.findFirst({
      where: { personId },
      select: { id: true },
    });
    if (hasGuardian) return;

    throw new BadRequestException(
      "Este cadastro precisa estar vinculado a pelo menos um papel operacional (ALUNO, PROFESSOR ou RESPONSÁVEL).",
    );
  }
}
