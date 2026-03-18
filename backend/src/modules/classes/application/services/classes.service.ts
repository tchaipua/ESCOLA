import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../../prisma/prisma.service";
import { CreateClassDto } from "../dto/create-class.dto";
import { UpdateClassDto } from "../dto/update-class.dto";
import { getTenantContext } from "../../../../common/tenant/tenant.context";

@Injectable()
export class ClassesService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeName(name: string) {
    return name.trim().toUpperCase();
  }

  private normalizeShift(shift: string) {
    const order = ["MANHA", "TARDE", "NOITE"];
    const values = shift
      .split(",")
      .map((item) => item.trim().toUpperCase())
      .filter((item) => order.includes(item));

    const uniqueValues = order.filter((item) => values.includes(item));
    if (uniqueValues.length === 0) {
      throw new ConflictException("Selecione pelo menos um turno válido.");
    }

    return uniqueValues.join(",");
  }

  private getDefaultMonthlyFeeValue(value?: number | null) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  private async ensureUniqueClass(
    name: string,
    classId?: string,
  ) {
    const existing = await this.prisma.class.findFirst({
      where: {
        tenantId: getTenantContext()!.tenantId,
        name,
        canceledAt: null,
        id: classId ? { not: classId } : undefined,
      },
    });

    if (existing) {
      throw new ConflictException(
        "Já existe uma turma com este nome nesta escola.",
      );
    }
  }

  async create(createDto: CreateClassDto) {
    const normalizedName = this.normalizeName(createDto.name);
    const normalizedShift = this.normalizeShift(createDto.shift);
    await this.ensureUniqueClass(normalizedName);

    return this.prisma.class.create({
      data: {
        name: normalizedName,
        shift: normalizedShift,
        defaultMonthlyFee: this.getDefaultMonthlyFeeValue(
          createDto.defaultMonthlyFee,
        ),
        tenantId: getTenantContext()!.tenantId,
        createdBy: getTenantContext()!.userId,
      },
    });
  }

  async findAll() {
    return this.prisma.class.findMany({
      where: {
        tenantId: getTenantContext()!.tenantId,
        canceledAt: null,
      },
      orderBy: [{ name: "asc" }],
    });
  }

  async findOne(id: string) {
    const classEntity = await this.prisma.class.findFirst({
      where: {
        id,
        tenantId: getTenantContext()!.tenantId,
        canceledAt: null,
      },
    });

    if (!classEntity)
      throw new NotFoundException("Turma não encontrada na sua base.");
    return classEntity;
  }

  async update(id: string, updateDto: UpdateClassDto) {
    const currentClass = await this.findOne(id);
    const nextName = updateDto.name
      ? this.normalizeName(updateDto.name)
      : currentClass.name;
    const nextShift = updateDto.shift
      ? this.normalizeShift(updateDto.shift)
      : currentClass.shift;

    await this.ensureUniqueClass(nextName, id);

    return this.prisma.class.update({
      where: { id },
      data: {
        name: updateDto.name ? nextName : undefined,
        shift: updateDto.shift ? nextShift : undefined,
        defaultMonthlyFee: Object.prototype.hasOwnProperty.call(
          updateDto,
          "defaultMonthlyFee",
        )
          ? this.getDefaultMonthlyFeeValue(updateDto.defaultMonthlyFee)
          : undefined,
        updatedBy: getTenantContext()!.userId,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    const activeSeriesClasses = await this.prisma.seriesClass.count({
      where: {
        classId: id,
        canceledAt: null,
      },
    });

    if (activeSeriesClasses > 0) {
      throw new ConflictException(
        "Não é possível desativar a turma enquanto existir vínculo ativo em Série x Turma.",
      );
    }

    return this.prisma.class.updateMany({
      where: { id },
      data: {
        canceledAt: new Date(),
        canceledBy: getTenantContext()!.userId,
      },
    });
  }

  async setActiveStatus(id: string, active: boolean) {
    const classEntity = await this.prisma.class.findFirst({
      where: {
        id,
        tenantId: getTenantContext()!.tenantId,
      },
    });

    if (!classEntity) {
      throw new NotFoundException("Turma não encontrada na sua base.");
    }

    if (!active) {
      const activeSeriesClasses = await this.prisma.seriesClass.count({
        where: {
          classId: id,
          canceledAt: null,
        },
      });

      if (activeSeriesClasses > 0) {
        throw new ConflictException(
          "Não é possível desativar a turma enquanto existir vínculo ativo em Série x Turma.",
        );
      }
    }

    const updatedClass = await this.prisma.class.update({
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
        ? "Turma base ativada com sucesso."
        : "Turma base inativada com sucesso.",
      class: updatedClass,
    };
  }
}
