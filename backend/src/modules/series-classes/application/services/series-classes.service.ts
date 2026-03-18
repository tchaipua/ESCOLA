import {
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
import { getTenantContext } from "../../../../common/tenant/tenant.context";
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
          ? sanitizeStudentForViewer(enrollment.student, currentUser)
          : enrollment?.student,
      })),
    };
  }

  private async validateReferences(
    seriesId: string,
    classId: string,
  ) {
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
    await this.validateReferences(createDto.seriesId, createDto.classId);
    await this.ensureUniqueLink(createDto.seriesId, createDto.classId);

    return this.prisma.seriesClass.create({
      data: {
        tenantId: this.tenantId(),
        seriesId: createDto.seriesId,
        classId: createDto.classId,
        createdBy: this.userId(),
      },
      include: {
        series: true,
        class: true,
      },
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
                name: true,
                monthlyFee: true,
                canceledAt: true,
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
                name: true,
                monthlyFee: true,
                canceledAt: true,
              },
            },
          },
        },
      },
    });

    if (!link) throw new NotFoundException("Vínculo Série x Turma não encontrado.");
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
                name: true,
                cpf: true,
                rg: true,
                phone: true,
                whatsapp: true,
                cellphone1: true,
                cellphone2: true,
                email: true,
                street: true,
                number: true,
                city: true,
                state: true,
                neighborhood: true,
                zipCode: true,
                updatedAt: true,
              },
            },
          },
        },
      },
    });

    const studentsMap = new Map<string, {
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
    }>();

    links.forEach((link) => {
      const sanitizedLink = this.mapSeriesClassForViewer(link, currentUser);
      sanitizedLink.enrollments.forEach((enrollment) => {
        const student = enrollment?.student;
        if (!student?.id) return;

        if (!studentsMap.has(student.id)) {
          const contactPhone =
            student.whatsapp ||
            student.phone ||
            student.cellphone1 ||
            student.cellphone2 ||
            null;
          studentsMap.set(student.id, {
            id: student.id,
            name: student.name,
            cpf: student.cpf ?? null,
            email: student.email ?? null,
            phone: contactPhone,
            street: student.street ?? null,
            number: student.number ?? null,
            city: student.city ?? null,
            state: student.state ?? null,
            neighborhood: student.neighborhood ?? null,
            zipCode: student.zipCode ?? null,
            updatedAt: student.updatedAt ?? null,
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

  async update(id: string, updateDto: UpdateSeriesClassDto) {
    const currentLink = await this.findOne(id);
    const nextSeriesId = updateDto.seriesId || currentLink.seriesId;
    const nextClassId = updateDto.classId || currentLink.classId;

    await this.validateReferences(nextSeriesId, nextClassId);
    await this.ensureUniqueLink(nextSeriesId, nextClassId, id);

    return this.prisma.seriesClass.update({
      where: { id },
      data: {
        seriesId: updateDto.seriesId,
        classId: updateDto.classId,
        updatedBy: this.userId(),
      },
      include: {
        series: true,
        class: true,
      },
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

    const updatedSeriesClass = await this.prisma.seriesClass.update({
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
      include: {
        series: true,
        class: true,
      },
    });

    return {
      message: active
        ? "Turma ativada com sucesso."
        : "Turma inativada com sucesso.",
      seriesClass: updatedSeriesClass,
    };
  }
}
