import {
  Injectable,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../../../../prisma/prisma.service";
import { CreateEnrollmentDto } from "../dto/create-enrollment.dto";
import { getTenantContext } from "../../../../common/tenant/tenant.context";
import { NotificationsService } from "../../../notifications/application/services/notifications.service";

@Injectable()
export class EnrollmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

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
        student: { include: { person: true } },
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
        student: { include: { person: true } },
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
    const enrollment = await this.findOne(id);
    const normalizedStatus = newStatus.toUpperCase();

    const result = await this.prisma.enrollment.update({
      where: { id },
      data: {
        status: normalizedStatus,
        updatedBy: getTenantContext()!.userId,
      },
    });
    if (normalizedStatus === "CANCELADO" || normalizedStatus === "TRANSFERIDO") {
      void this.notificationsService.dispatchConfiguredEventNotification({
        eventType: normalizedStatus === "TRANSFERIDO" ? "ENROLLMENT_TRANSFERRED" : "ENROLLMENT_CANCELED",
        title: normalizedStatus === "TRANSFERIDO" ? "MATRÍCULA TRANSFERIDA" : "MATRÍCULA CANCELADA",
        message: `A MATRÍCULA DO ALUNO ${enrollment.student.person?.name || enrollment.studentId} FOI ${normalizedStatus}.`,
        sourceType: "ENROLLMENT_STATUS",
        sourceId: id,
        metadata: { enrollmentId: id, studentId: enrollment.studentId, status: normalizedStatus },
      }).catch(() => undefined);
    }
    return result;
  }

  async remove(id: string) {
    const enrollment = await this.findOne(id);

    // Soft Delete da Diretiva
    const result = await this.prisma.enrollment.updateMany({
      where: { id },
      data: {
        status: "CANCELADO",
        canceledAt: new Date(),
        canceledBy: getTenantContext()!.userId,
      },
    });
    void this.notificationsService.dispatchConfiguredEventNotification({
      eventType: "ENROLLMENT_CANCELED",
      title: "MATRÍCULA CANCELADA",
      message: `A MATRÍCULA DO ALUNO ${enrollment.student.person?.name || enrollment.studentId} FOI CANCELADA.`,
      sourceType: "ENROLLMENT_STATUS",
      sourceId: id,
      metadata: { enrollmentId: id, studentId: enrollment.studentId, status: "CANCELADO" },
    }).catch(() => undefined);
    return result;
  }
}
