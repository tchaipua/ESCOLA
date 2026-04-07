import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../prisma/prisma.service";
import { getTenantContext } from "../../../../common/tenant/tenant.context";
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
    kinship: string;
    kinshipDescription: string | null;
  }[];
};

type BasicPersonIdentity = {
  id: string;
  tenantId: string;
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

  private getPrimaryRoleRecord(records: LinkedRoleRecord[]) {
    return records[0] || null;
  }

  private collectGuardianContacts(person: PersonWithRoles) {
    const guardians = new Map<string, GuardianContact>();
    for (const student of person.students) {
      for (const link of student.guardians ?? []) {
        const guardian = link.guardian;
        if (!guardian || guardians.has(guardian.id)) continue;
        guardians.set(guardian.id, {
          id: guardian.id,
          name: guardian.name,
          phone: guardian.phone,
          whatsapp: guardian.whatsapp,
          cellphone1: guardian.cellphone1,
          cellphone2: guardian.cellphone2,
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
        studentName: string;
        kinship: string;
        kinshipDescription: string | null;
      }>
    >`
      SELECT
        gs.guardianId,
        s.id AS studentId,
        s.name AS studentName,
        gs.kinship,
        gs.kinshipDescription
      FROM guardian_students gs
      INNER JOIN students s ON s.id = gs.studentId
      WHERE gs.tenantId = ${this.tenantId()}
        AND gs.canceledBy IS NULL
        AND gs.guardianId IN (${Prisma.join(guardianIds)})
    `;

    return assignments.map((assignment) => ({
      guardianId: assignment.guardianId,
      studentId: assignment.studentId,
      studentName: assignment.studentName,
      kinship: assignment.kinship,
      kinshipDescription: assignment.kinshipDescription,
    }));
  }

  private async mapPersonResponse(person: PersonWithRoles) {
    const roles = [
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

    return person as PersonWithRoles;
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
    if (!this.sharedProfilesService.normalizeDocument(person.cpf)) {
      return;
    }

    const sharedData = {
      ...this.buildSharedRoleSnapshot(person),
      updatedBy: this.userId(),
    };

    await this.prisma.$transaction([
      this.prisma.teacher.updateMany({
        where: { tenantId: this.tenantId(), personId: person.id },
        data: sharedData,
      }),
      this.prisma.student.updateMany({
        where: { tenantId: this.tenantId(), personId: person.id },
        data: sharedData,
      }),
      this.prisma.guardian.updateMany({
        where: { tenantId: this.tenantId(), personId: person.id },
        data: sharedData,
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
    const sharedData = this.buildSharedRoleSnapshot(person);

    if (roleDto.role === "PROFESSOR") {
      await this.prisma.teacher.create({
        data: {
          ...sharedData,
          tenantId: this.tenantId(),
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
          ...sharedData,
          tenantId: this.tenantId(),
          accessProfile,
          permissions,
          createdBy: this.userId(),
        },
      });
      return;
    }

    await this.prisma.guardian.create({
      data: {
        ...sharedData,
        tenantId: this.tenantId(),
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

    const [people, teachers, students, guardians, studentGuardians] =
      await Promise.all([
        this.prisma.$queryRaw<
          Array<{
            id: string;
            tenantId: string;
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
            id, tenantId, name, rg, cpf, cnpj, nickname, corporateName,
            phone, whatsapp, cellphone1, cellphone2, email, password,
            zipCode, street, number, city, state, neighborhood, complement
          FROM people
          WHERE tenantId = ${tenantId}
          ORDER BY name ASC
        `,
        this.prisma.$queryRaw<
          Array<{
            id: string;
            name: string;
            email: string | null;
            cpf: string | null;
            personId: string | null;
            accessProfile: string | null;
            permissions: string | null;
            canceledBy: string | null;
          }>
        >`
          SELECT id, name, email, cpf, personId, accessProfile, permissions, canceledBy
          FROM teachers
          WHERE tenantId = ${tenantId}
          ORDER BY id ASC
        `,
        this.prisma.$queryRaw<
          Array<{
            id: string;
            name: string;
            email: string | null;
            cpf: string | null;
            personId: string | null;
            accessProfile: string | null;
            permissions: string | null;
            canceledBy: string | null;
            photoUrl: string | null;
          }>
        >`
          SELECT id, name, email, cpf, personId, accessProfile, permissions, canceledBy, photoUrl
          FROM students
          WHERE tenantId = ${tenantId}
          ORDER BY id ASC
        `,
        this.prisma.$queryRaw<
          Array<{
            id: string;
            name: string;
            email: string | null;
            cpf: string | null;
            personId: string | null;
            accessProfile: string | null;
            permissions: string | null;
            canceledBy: string | null;
          }>
        >`
          SELECT id, name, email, cpf, personId, accessProfile, permissions, canceledBy
          FROM guardians
          WHERE tenantId = ${tenantId}
          ORDER BY id ASC
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
            g.name AS guardianName,
            g.phone AS guardianPhone,
            g.whatsapp AS guardianWhatsapp,
            g.cellphone1 AS guardianCellphone1,
            g.cellphone2 AS guardianCellphone2
          FROM guardian_students gs
          INNER JOIN guardians g ON g.id = gs.guardianId
          WHERE gs.tenantId = ${tenantId}
            AND gs.canceledBy IS NULL
            AND g.tenantId = ${tenantId}
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

    return Promise.all(
      people.map((person) =>
        this.mapPersonResponse({
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
        }),
      ),
    );
  }

  async findOne(id: string) {
    const person = await this.findPersonEntity(id);
    return this.mapPersonResponse(person);
  }

  async create(createDto: CreatePersonDto, currentUser?: ICurrentUser) {
    const mutableData = this.transformToUpperCase({ ...createDto });
    await this.fillAddressFromViaCep(mutableData);
    mutableData.name = this.sharedProfilesService.resolveWritableName(
      mutableData.name,
    );

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
  }

  async update(
    id: string,
    updateDto: UpdatePersonDto,
    currentUser?: ICurrentUser,
  ) {
    const currentPerson = await this.findPersonEntity(id);
    const mutableData = this.transformToUpperCase({ ...updateDto });
    await this.fillAddressFromViaCep(mutableData);
    mutableData.name = this.sharedProfilesService.resolveWritableName(
      mutableData.name,
      currentPerson.name,
    );

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
        birthDate: Object.prototype.hasOwnProperty.call(updateDto, "birthDate")
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
          ? this.sharedProfilesService.normalizeDocument(updateDto.cpf) || null
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
