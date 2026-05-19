import {
  Injectable,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../../../../prisma/prisma.service";
import { CreateSubjectDto } from "../dto/create-subject.dto";
import { UpdateSubjectDto } from "../dto/update-subject.dto";
import {
  getTenantContext,
  runWithTenantBranchScope,
} from "../../../../common/tenant/tenant.context";
import { resolveWritableTenantBranchCode } from "../../../../common/tenant/tenant-branches";

type FindAllOptions = {
  activeOnly?: boolean;
};

@Injectable()
export class SubjectsService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeName(name: string) {
    return name.trim().toUpperCase();
  }

  private async ensureUniqueName(name: string, subjectId?: string) {
    const existing = await this.prisma.subject.findFirst({
      where: {
        tenantId: getTenantContext()!.tenantId,
        name,
        canceledAt: null,
        id: subjectId ? { not: subjectId } : undefined,
      },
    });

    if (existing) {
      throw new ConflictException(
        "Já existe uma disciplina com este nome nesta escola.",
      );
    }
  }

  async create(createDto: CreateSubjectDto) {
    const targetBranchCode = await resolveWritableTenantBranchCode(
      this.prisma,
      getTenantContext()!.tenantId,
      createDto.branchCode,
      getTenantContext()!.branchCode,
    );

    return runWithTenantBranchScope(targetBranchCode, async () => {
    const normalizedName = this.normalizeName(createDto.name);
    await this.ensureUniqueName(normalizedName);

    return this.prisma.subject.create({
      data: {
        name: normalizedName,
        tenantId: getTenantContext()!.tenantId,
        branchCode: targetBranchCode,
        createdBy: getTenantContext()!.userId,
      },
    });
    });
  }

  async findAll(options?: FindAllOptions) {
    return this.prisma.subject.findMany({
      where: {
        tenantId: getTenantContext()!.tenantId,
        canceledAt: options?.activeOnly ? null : undefined,
      },
      orderBy: [{ canceledAt: "asc" }, { name: "asc" }],
    });
  }

  async findOne(id: string) {
    const subject = await this.prisma.subject.findFirst({
      where: {
        id,
        tenantId: getTenantContext()!.tenantId,
      },
    });
    if (!subject) throw new NotFoundException("Matéria não encontrada.");
    return subject;
  }

  async update(id: string, updateDto: UpdateSubjectDto) {
    const currentSubject = await this.findOne(id);
    const targetBranchCode = await resolveWritableTenantBranchCode(
      this.prisma,
      getTenantContext()!.tenantId,
      updateDto.branchCode,
      currentSubject.branchCode,
    );

    return runWithTenantBranchScope(targetBranchCode, async () => {
    const normalizedName = updateDto.name
      ? this.normalizeName(updateDto.name)
      : undefined;
    if (normalizedName) {
      await this.ensureUniqueName(normalizedName, id);
    }

    return this.prisma.subject.update({
      where: { id },
      data: {
        name: normalizedName,
        branchCode: targetBranchCode,
        updatedBy: getTenantContext()!.userId,
      },
    });
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.subject.updateMany({
      where: { id },
      data: {
        canceledAt: new Date(),
        canceledBy: getTenantContext()!.userId,
      },
    });
  }

  async setActiveStatus(id: string, active: boolean) {
    await this.findOne(id);

    const updatedSubject = await this.prisma.subject.update({
      where: { id },
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

    return {
      message: active
        ? "Disciplina ativada com sucesso."
        : "Disciplina inativada com sucesso.",
      subject: updatedSubject,
    };
  }
}
