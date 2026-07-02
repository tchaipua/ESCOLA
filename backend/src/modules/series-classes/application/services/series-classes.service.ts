import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { ICurrentUser } from "../../../../common/decorators/current-user.decorator";
import {
  canViewStudentFinancialData,
  sanitizeStudentForViewer,
} from "../../../../common/auth/entity-visibility";
import { PrismaService } from "../../../../prisma/prisma.service";
import {
  getTenantContext,
  runWithTenantBranchScope,
} from "../../../../common/tenant/tenant.context";
import { resolveWritableTenantBranchCode } from "../../../../common/tenant/tenant-branches";
import { CreateSeriesClassDto } from "../dto/create-series-class.dto";
import { UpdateSeriesClassDto } from "../dto/update-series-class.dto";

@Injectable()
export class SeriesClassesService {
  constructor(private readonly prisma: PrismaService) {}

  private tenantId() {
    return getTenantContext()!.tenantId;
  }

  private userId() {
    return getTenantContext()!.userId;
  }

  private mapSeriesClassForViewer<T extends Record<string, any>>(
    link: T,
    currentUser?: ICurrentUser | null,
  ) {
    const activeEnrollments = Array.isArray(link.enrollments)
      ? link.enrollments.filter(
          (enrollment) =>
            !enrollment?.canceledAt && !enrollment?.student?.canceledAt,
        )
      : [];
    const canViewFinancial = canViewStudentFinancialData(currentUser);

    return {
      ...link,
      smtpPassword: null,
      studentCount: activeEnrollments.length,
      totalMonthlyFee: canViewFinancial
        ? activeEnrollments.reduce((total, enrollment) => {
            const studentMonthlyFee = enrollment?.student?.monthlyFee;
            const fallbackMonthlyFee = link?.class?.defaultMonthlyFee;
            const effectiveMonthlyFee =
              typeof studentMonthlyFee === "number"
                ? studentMonthlyFee
                : typeof fallbackMonthlyFee === "number"
                  ? fallbackMonthlyFee
                  : 0;
            return total + effectiveMonthlyFee;
          }, 0)
        : null,
      enrollments: activeEnrollments.map((enrollment) => ({
        ...enrollment,
        student: enrollment?.student
          ? sanitizeStudentForViewer(
              {
                ...enrollment.student,
                name:
                  enrollment.student.person?.name ||
                  enrollment.student.name ||
                  "ALUNO",
              },
              currentUser,
            )
          : enrollment?.student,
      })),
    };
  }

  private normalizeOptionalText(value?: string | null) {
    const trimmed = String(value || "").trim();
    return trimmed || null;
  }

  private buildSmtpData(
    dto: CreateSeriesClassDto | UpdateSeriesClassDto,
    currentPassword?: string | null,
  ) {
    const hasAnySmtpField = [
      "smtpEnabled",
      "smtpHost",
      "smtpPort",
      "smtpTimeout",
      "smtpAuthenticate",
      "smtpSecure",
      "smtpAuthType",
      "smtpEmail",
      "smtpPassword",
      "smtpSenderName",
      "smtpReplyTo",
    ].some((key) => Object.prototype.hasOwnProperty.call(dto, key));

    if (!hasAnySmtpField) {
      return {};
    }

    const smtpEnabled = Boolean(dto.smtpEnabled);
    const smtpAuthenticate = dto.smtpAuthenticate ?? true;
    const smtpPassword =
      this.normalizeOptionalText(dto.smtpPassword) ?? currentPassword ?? null;

    if (smtpEnabled) {
      if (
        !this.normalizeOptionalText(dto.smtpHost) ||
        !dto.smtpPort ||
        !this.normalizeOptionalText(dto.smtpEmail)
      ) {
        throw new BadRequestException(
          "SMTP da turma exige servidor, porta e e-mail remetente.",
        );
      }

      if (smtpAuthenticate && !smtpPassword) {
        throw new BadRequestException(
          "SMTP da turma com autenticação exige senha.",
        );
      }
    }

    return {
      smtpEnabled,
      smtpHost: this.normalizeOptionalText(dto.smtpHost),
      smtpPort: dto.smtpPort ?? null,
      smtpTimeout: dto.smtpTimeout ?? 60,
      smtpAuthenticate,
      smtpSecure: dto.smtpSecure ?? false,
      smtpAuthType: this.normalizeOptionalText(dto.smtpAuthType) ?? "SSL",
      smtpEmail: this.normalizeOptionalText(dto.smtpEmail)?.toUpperCase() ?? null,
      smtpPassword,
      smtpSenderName: this.normalizeOptionalText(dto.smtpSenderName),
      smtpReplyTo: this.normalizeOptionalText(dto.smtpReplyTo)?.toUpperCase() ?? null,
    };
  }

  private async validateReferences(seriesId: string, classId: string) {
    const [series, classEntity] = await Promise.all([
      this.prisma.series.findFirst({
        where: {
          id: seriesId,
          tenantId: this.tenantId(),
          canceledAt: null,
        },
      }),
      this.prisma.class.findFirst({
        where: {
          id: classId,
          tenantId: this.tenantId(),
          canceledAt: null,
        },
      }),
    ]);

    if (!series) throw new NotFoundException("Série inválida.");
    if (!classEntity) throw new NotFoundException("Turma inválida.");
  }

  private async ensureUniqueLink(
    seriesId: string,
    classId: string,
    linkId?: string,
  ) {
    const existing = await this.prisma.seriesClass.findFirst({
      where: {
        tenantId: this.tenantId(),
        seriesId,
        classId,
        canceledAt: null,
        id: linkId ? { not: linkId } : undefined,
      },
    });

    if (existing) {
      throw new ConflictException(
        "Esta série já está vinculada a esta turma neste ano letivo.",
      );
    }
  }

  async create(createDto: CreateSeriesClassDto) {
    const targetBranchCode = await resolveWritableTenantBranchCode(
      this.prisma,
      this.tenantId(),
      createDto.branchCode,
      getTenantContext()!.branchCode,
    );

    return runWithTenantBranchScope(targetBranchCode, async () => {
    await this.validateReferences(createDto.seriesId, createDto.classId);
    await this.ensureUniqueLink(createDto.seriesId, createDto.classId);

    return this.prisma.seriesClass.create({
      data: {
        tenantId: this.tenantId(),
        seriesId: createDto.seriesId,
        classId: createDto.classId,
        branchCode: targetBranchCode,
        ...this.buildSmtpData(createDto),
        createdBy: this.userId(),
      },
      include: {
        series: true,
        class: true,
      },
    });
    });
  }

  async findAll(currentUser?: ICurrentUser) {
    const links = await this.prisma.seriesClass.findMany({
      where: {
        tenantId: this.tenantId(),
      },
      include: {
        series: true,
        class: true,
        enrollments: {
          where: {
            canceledAt: null,
          },
          include: {
            student: {
              select: {
                id: true,
                monthlyFee: true,
                canceledAt: true,
                person: { select: { name: true } },
              },
            },
          },
        },
        _count: {
          select: {
            enrollments: {
              where: {
                canceledAt: null,
              },
            },
          },
        },
      },
      orderBy: [
        { canceledAt: "asc" },
        { series: { sortOrder: "asc" } },
        { series: { name: "asc" } },
        { class: { name: "asc" } },
      ],
    });

    return links.map((link) => this.mapSeriesClassForViewer(link, currentUser));
  }

  async findOne(id: string, currentUser?: ICurrentUser) {
    const link = await this.prisma.seriesClass.findFirst({
      where: {
        id,
        tenantId: this.tenantId(),
      },
      include: {
        series: true,
        class: true,
        enrollments: {
          where: { canceledAt: null },
          include: {
            student: {
              select: {
                id: true,
                monthlyFee: true,
                canceledAt: true,
                person: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    if (!link)
      throw new NotFoundException("Vínculo Série x Turma não encontrado.");
    return this.mapSeriesClassForViewer(link, currentUser);
  }

  async findSeriesStudents(seriesId: string, currentUser?: ICurrentUser) {
    const series = await this.prisma.series.findFirst({
      where: {
        id: seriesId,
        tenantId: this.tenantId(),
      },
    });

    if (!series) {
      throw new NotFoundException("Série não encontrada.");
    }

    const links = await this.prisma.seriesClass.findMany({
      where: {
        tenantId: this.tenantId(),
        seriesId,
        canceledAt: null,
      },
      include: {
        enrollments: {
          where: { canceledAt: null },
          include: {
            student: {
              select: {
                id: true,
                photoUrl: true,
                updatedAt: true,
                person: true,
              },
            },
          },
        },
      },
    });

    const studentsMap = new Map<
      string,
      {
        id: string;
        name: string;
        cpf: string | null;
        email: string | null;
        phone: string | null;
        street: string | null;
        number: string | null;
        city: string | null;
        state: string | null;
        neighborhood: string | null;
        zipCode: string | null;
        updatedAt: Date | null;
        photoUrl: string | null;
      }
    >();

    links.forEach((link) => {
      const sanitizedLink = this.mapSeriesClassForViewer(link, currentUser);
      sanitizedLink.enrollments.forEach((enrollment) => {
        const student = enrollment?.student;
        if (!student?.id) return;

        if (!studentsMap.has(student.id)) {
          const contactPhone =
            student.person?.whatsapp ||
            student.person?.phone ||
            student.person?.cellphone1 ||
            student.person?.cellphone2 ||
            null;
          studentsMap.set(student.id, {
            id: student.id,
            name: student.person?.name || "ALUNO",
            cpf: student.person?.cpf ?? null,
            email: student.person?.email ?? null,
            phone: contactPhone,
            street: student.person?.street ?? null,
            number: student.person?.number ?? null,
            city: student.person?.city ?? null,
            state: student.person?.state ?? null,
            neighborhood: student.person?.neighborhood ?? null,
            zipCode: student.person?.zipCode ?? null,
            updatedAt: student.updatedAt ?? null,
            photoUrl: student.photoUrl ?? null,
          });
        }
      });
    });

    const students = Array.from(studentsMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    return {
      seriesId: series.id,
      seriesName: series.name,
      students,
    };
  }

  async findSeriesClassStudents(
    seriesClassId: string,
    currentUser?: ICurrentUser,
  ) {
    const link = await this.prisma.seriesClass.findFirst({
      where: {
        id: seriesClassId,
        tenantId: this.tenantId(),
        canceledAt: null,
      },
      include: {
        series: true,
        class: true,
        enrollments: {
          where: { canceledAt: null },
          include: {
            student: {
              select: {
                id: true,
                photoUrl: true,
                updatedAt: true,
                person: true,
              },
            },
          },
        },
      },
    });

    if (!link) {
      throw new NotFoundException(
        "Vínculo entre série e turma não encontrado.",
      );
    }

    const sanitizedLink = this.mapSeriesClassForViewer(link, currentUser);
    const studentsMap = new Map<
      string,
      {
        id: string;
        name: string;
        cpf: string | null;
        email: string | null;
        phone: string | null;
        street: string | null;
        number: string | null;
        city: string | null;
        state: string | null;
        neighborhood: string | null;
        zipCode: string | null;
        updatedAt: Date | null;
        photoUrl: string | null;
      }
    >();

    sanitizedLink.enrollments.forEach((enrollment) => {
      const student = enrollment?.student;
      if (!student?.id) return;

      if (!studentsMap.has(student.id)) {
        const contactPhone =
          student.person?.whatsapp ||
          student.person?.phone ||
          student.person?.cellphone1 ||
          student.person?.cellphone2 ||
          null;
        studentsMap.set(student.id, {
          id: student.id,
          name: student.person?.name || "ALUNO",
          cpf: student.person?.cpf ?? null,
          email: student.person?.email ?? null,
          phone: contactPhone,
          street: student.person?.street ?? null,
          number: student.person?.number ?? null,
          city: student.person?.city ?? null,
          state: student.person?.state ?? null,
          neighborhood: student.person?.neighborhood ?? null,
          zipCode: student.person?.zipCode ?? null,
          updatedAt: student.updatedAt ?? null,
          photoUrl: student.photoUrl ?? null,
        });
      }
    });

    const students = Array.from(studentsMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    return {
      classId: sanitizedLink.class?.id ?? null,
      className: sanitizedLink.class?.name ?? null,
      seriesId: sanitizedLink.series?.id ?? null,
      seriesName: sanitizedLink.series?.name ?? null,
      students,
    };
  }

  async update(id: string, updateDto: UpdateSeriesClassDto) {
    const currentLink = await this.findOne(id);
    const currentRawLink = await this.prisma.seriesClass.findFirst({
      where: { id, tenantId: this.tenantId() },
      select: { smtpPassword: true },
    });
    const targetBranchCode = await resolveWritableTenantBranchCode(
      this.prisma,
      this.tenantId(),
      updateDto.branchCode,
      currentLink.branchCode,
    );

    return runWithTenantBranchScope(targetBranchCode, async () => {
    const nextSeriesId = updateDto.seriesId || currentLink.seriesId;
    const nextClassId = updateDto.classId || currentLink.classId;

    await this.validateReferences(nextSeriesId, nextClassId);
    await this.ensureUniqueLink(nextSeriesId, nextClassId, id);

    await this.prisma.seriesClass.updateMany({
      where: { id },
      data: {
        seriesId: updateDto.seriesId,
        classId: updateDto.classId,
        branchCode: targetBranchCode,
        ...this.buildSmtpData(updateDto, currentRawLink?.smtpPassword),
        updatedBy: this.userId(),
      },
    });

    return this.findOne(id);
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    const activeEnrollments = await this.prisma.enrollment.count({
      where: {
        seriesClassId: id,
        canceledAt: null,
      },
    });

    if (activeEnrollments > 0) {
      throw new ConflictException(
        "Não é possível desativar este vínculo porque existem alunos matriculados nele.",
      );
    }

    return this.prisma.seriesClass.updateMany({
      where: { id },
      data: {
        canceledAt: new Date(),
        canceledBy: this.userId(),
      },
    });
  }

  async setActiveStatus(id: string, active: boolean) {
    await this.findOne(id);

    if (!active) {
      const activeEnrollments = await this.prisma.enrollment.count({
        where: {
          seriesClassId: id,
          canceledAt: null,
        },
      });

      if (activeEnrollments > 0) {
        throw new ConflictException(
          "Não é possível inativar este vínculo porque existem alunos matriculados nele.",
        );
      }
    }

    await this.prisma.seriesClass.updateMany({
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
      message: active
        ? "Turma ativada com sucesso."
        : "Turma inativada com sucesso.",
      seriesClass: await this.findOne(id),
    };
  }
}
