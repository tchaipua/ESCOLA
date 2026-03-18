import {
  Injectable,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../../../../prisma/prisma.service";
import { CreateEnrollmentDto } from "../dto/create-enrollment.dto";
import { getTenantContext } from "../../../../common/tenant/tenant.context";

@Injectable()
export class EnrollmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createDto: CreateEnrollmentDto) {
    const { studentId, seriesClassId, status } = createDto;
    const tenantId = getTenantContext()!.tenantId;

    // 1. Valida se o aluno existe
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, canceledAt: null },
    });
    if (!student) throw new NotFoundException("Aluno inválido.");

    // 2. Valida se a turma existe e bate com a escola
    const seriesClass = await this.prisma.seriesClass.findFirst({
      where: {
        id: seriesClassId,
        tenantId,
        canceledAt: null,
      },
      include: {
        class: true,
        series: true,
      },
    });
    if (!seriesClass) throw new NotFoundException("Série x Turma inválida.");

    const activeSchoolYear = await this.prisma.schoolYear.findFirst({
      where: {
        tenantId,
        canceledAt: null,
        isActive: true,
      },
      orderBy: { year: "desc" },
    });

    if (!activeSchoolYear) {
      throw new ConflictException(
        "Cadastre ou ative um ano letivo antes de matricular o aluno.",
      );
    }

    // 3. Regra de Negócio: O aluno não pode ter 2 matrículas ATIVAS no mesmo Ano Letivo!
    const existingEnrollment = await this.prisma.enrollment.findFirst({
      where: {
        studentId,
        schoolYearId: activeSchoolYear.id,
        canceledAt: null,
      },
    });

    if (existingEnrollment) {
      throw new ConflictException(
        "Este Aluno já possui uma matrícula neste Ano Letivo.",
      );
    }

    // Grava a Matrícula
    return this.prisma.enrollment.create({
      data: {
        studentId,
        classId: seriesClass.classId,
        seriesClassId,
        schoolYearId: activeSchoolYear.id,
        status: status || "ATIVO",
        tenantId,
        createdBy: getTenantContext()!.userId,
      },
    });
  }

  async findAll() {
    return this.prisma.enrollment.findMany({
      where: { canceledAt: null },
      include: {
        student: true,
        class: true,
        seriesClass: {
          include: {
            series: true,
            class: true,
          },
        },
        schoolYear: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(id: string) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { id, canceledAt: null },
      include: {
        student: true,
        class: true,
        seriesClass: {
          include: {
            series: true,
            class: true,
          },
        },
      },
    });

    if (!enrollment) throw new NotFoundException("Matrícula não encontrada.");
    return enrollment;
  }

  async updateStatus(id: string, newStatus: string) {
    await this.findOne(id);

    return this.prisma.enrollment.update({
      where: { id },
      data: {
        status: newStatus.toUpperCase(),
        updatedBy: getTenantContext()!.userId,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    // Soft Delete da Diretiva
    return this.prisma.enrollment.updateMany({
      where: { id },
      data: {
        status: "CANCELADO",
        canceledAt: new Date(),
        canceledBy: getTenantContext()!.userId,
      },
    });
  }
}
