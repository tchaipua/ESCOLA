import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../../prisma/prisma.service";
import { CreateTeacherDto } from "../dto/create-teacher.dto";
import { UpdateTeacherDto } from "../dto/update-teacher.dto";
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
  canViewTeacherAccessData,
  sanitizeTeacherForViewer,
} from "../../../../common/auth/entity-visibility";

@Injectable()
export class TeachersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sharedProfilesService: SharedProfilesService,
  ) {}

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

    const teachers = await this.prisma.teacher.findMany({
      where: {
        tenantId,
        cpf: { not: null },
        ...(excludeTeacherId ? { id: { not: excludeTeacherId } } : {}),
      },
      select: {
        id: true,
        name: true,
        cpf: true,
      },
    });

    const conflict = teachers.find(
      (teacher) => this.normalizeDocument(teacher.cpf) === normalizedCpf,
    );

    if (conflict) {
      throw new ConflictException(
        `Já existe um professor com este CPF nesta escola: ${conflict.name}.`,
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

  private sanitizeTeacherMutationDto<
    T extends CreateTeacherDto | UpdateTeacherDto,
  >(dto: T, viewer?: ICurrentUser | null): T {
    const sanitizedDto = { ...dto };

    if (!canViewTeacherAccessData(viewer)) {
      delete sanitizedDto.email;
      delete sanitizedDto.password;
      delete sanitizedDto.accessProfile;
      delete sanitizedDto.permissions;
    }

    return sanitizedDto;
  }

  private mapTeacherAccess<
    T extends { accessProfile?: string | null; permissions?: string | null },
  >(teacher: T) {
    return {
      ...teacher,
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
    const teacher = await this.prisma.teacher.findFirst({
      where: {
        id,
        tenantId: getTenantContext()!.tenantId,
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
      },
    });

    if (!teacher) {
      throw new NotFoundException("Professor não encontrado.");
    }

    return teacher;
  }

  async create(createDto: CreateTeacherDto, currentUser?: ICurrentUser) {
    const sanitizedDto = this.sanitizeTeacherMutationDto(
      createDto,
      currentUser,
    );
    const tenantId = getTenantContext()!.tenantId;

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

    if (sanitizedDto.email) {
      const existing = await this.prisma.teacher.findFirst({
        where: {
          tenantId,
          email: sanitizedDto.email,
          canceledAt: null,
        },
      });
      if (existing) {
        throw new ConflictException(
          `E R R O ! ! !\nEmail Já Utilizado\nJá existe um professor com este e-mail no sistema.`,
        );
      }
    }

    await this.fillAddressFromViaCep(sanitizedDto);

    let hashedPassword = undefined;
    if (sanitizedDto.password) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(sanitizedDto.password, salt);
    } else if (sanitizedDto.email) {
      hashedPassword =
        (await this.sharedProfilesService.findSharedPasswordByEmail(
          getTenantContext()!.tenantId,
          sanitizedDto.email,
        )) || undefined;
    }

    const accessProfile =
      normalizeAccessProfileCode(sanitizedDto.accessProfile, "PROFESSOR") ||
      getDefaultAccessProfileForRole("PROFESSOR");
    const explicitPermissions =
      Array.isArray(sanitizedDto.permissions) &&
      sanitizedDto.permissions.length > 0
        ? serializePermissions(sanitizedDto.permissions)
        : null;

    const rawData = this.transformToUpperCase(sanitizedDto);
    delete rawData.permissions;
    delete rawData.accessProfile;

    const createdTeacher = await this.prisma.teacher.create({
      data: {
        ...rawData,
        password: hashedPassword, // Segurança PWA
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
      "TEACHER",
      createdTeacher.id,
      createdTeacher,
      getTenantContext()!.userId,
    );

    if (sanitizedDto.email && hashedPassword) {
      await this.sharedProfilesService.syncSharedPasswordByEmail(
        tenantId,
        sanitizedDto.email,
        hashedPassword,
        { kind: "TEACHER", id: createdTeacher.id },
        getTenantContext()!.userId,
      );
    }

    return sanitizeTeacherForViewer(
      this.mapTeacherAccess(createdTeacher),
      currentUser,
    );
  }

  async findAll(currentUser?: ICurrentUser) {
    const teachers = await this.prisma.teacher.findMany({
      where: {
        tenantId: getTenantContext()!.tenantId,
      },
      orderBy: [{ canceledAt: "asc" }, { name: "asc" }],
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
      },
    });

    return teachers.map((teacher) =>
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
      },
    });

    if (!teacher) {
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
    const teacher = await this.findTeacherEntity(id);
    const sanitizedDto = this.sanitizeTeacherMutationDto(
      updateDto,
      currentUser,
    );
    const tenantId = getTenantContext()!.tenantId;

    if (sanitizedDto.email)
      sanitizedDto.email = sanitizedDto.email.toUpperCase();

    if (sanitizedDto.email && sanitizedDto.email !== teacher.email) {
      const existing = await this.prisma.teacher.findFirst({
        where: {
          tenantId: getTenantContext()!.tenantId,
          email: sanitizedDto.email,
          canceledAt: null,
        },
      });
      if (existing) {
        throw new ConflictException(
          `E R R O ! ! !\nEmail Já Utilizado\nJá existe um professor com este e-mail no sistema.`,
        );
      }
    }

    await this.sharedProfilesService.hydrateMissingFieldsFromCpf(
      tenantId,
      sanitizedDto,
      "TEACHER",
      id,
    );

    sanitizedDto.name = this.sharedProfilesService.resolveWritableName(
      sanitizedDto.name,
      teacher.name,
    );

    if (
      sanitizedDto.cpf &&
      this.normalizeDocument(sanitizedDto.cpf) !==
        this.normalizeDocument(teacher.cpf)
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

    const rawData = this.transformToUpperCase(sanitizedDto);
    delete rawData.permissions;
    delete rawData.accessProfile;

    const updatedTeacher = await this.prisma.teacher.update({
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
      tenantId,
      "TEACHER",
      updatedTeacher.id,
      updatedTeacher,
      getTenantContext()!.userId,
      teacher.cpf,
    );

    const emailForPasswordSync = sanitizedDto.email || teacher.email;
    if (emailForPasswordSync && hashedPassword) {
      await this.sharedProfilesService.syncSharedPasswordByEmail(
        tenantId,
        emailForPasswordSync,
        hashedPassword,
        { kind: "TEACHER", id: updatedTeacher.id },
        getTenantContext()!.userId,
      );
    }

    return sanitizeTeacherForViewer(
      this.mapTeacherAccess(updatedTeacher),
      currentUser,
    );
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
