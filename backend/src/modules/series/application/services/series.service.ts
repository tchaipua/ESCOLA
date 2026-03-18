import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../../prisma/prisma.service";
import { CreateSeriesDto } from "../dto/create-series.dto";
import { UpdateSeriesDto } from "../dto/update-series.dto";
import { getTenantContext } from "../../../../common/tenant/tenant.context";

@Injectable()
export class SeriesService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeText(value?: string | null) {
    return String(value || "").trim().toUpperCase();
  }

  private async ensureUniqueSeries(name: string, seriesId?: string) {
    const existing = await this.prisma.series.findFirst({
      where: {
        tenantId: getTenantContext()!.tenantId,
        name,
        canceledAt: null,
        id: seriesId ? { not: seriesId } : undefined,
      },
    });

    if (existing) {
      throw new ConflictException(
        "Já existe uma série com este nome nesta escola.",
      );
    }
  }

  private async ensureUniqueSortOrder(sortOrder?: number, seriesId?: string) {
    if (sortOrder === undefined || sortOrder === null) return;

    const existing = await this.prisma.series.findFirst({
      where: {
        tenantId: getTenantContext()!.tenantId,
        sortOrder,
        canceledAt: null,
        id: seriesId ? { not: seriesId } : undefined,
      },
    });

    if (existing) {
      throw new ConflictException(
        "A ordem de aprendizado informada ja esta em uso por outra serie nesta escola.",
      );
    }
  }

  async create(createDto: CreateSeriesDto) {
    const name = this.normalizeText(createDto.name);
    const code = createDto.code ? this.normalizeText(createDto.code) : undefined;
    await this.ensureUniqueSeries(name);
    await this.ensureUniqueSortOrder(createDto.sortOrder);

    return this.prisma.series.create({
      data: {
        tenantId: getTenantContext()!.tenantId,
        name,
        code,
        sortOrder: createDto.sortOrder,
        createdBy: getTenantContext()!.userId,
      },
    });
  }

  async findAll() {
    return this.prisma.series.findMany({
      where: {
        tenantId: getTenantContext()!.tenantId,
      },
      orderBy: [{ canceledAt: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    });
  }

  async findOne(id: string) {
    const series = await this.prisma.series.findFirst({
      where: {
        id,
        tenantId: getTenantContext()!.tenantId,
      },
      include: {
        seriesClasses: {
          where: { canceledAt: null },
          include: {
            class: true,
          },
        },
      },
    });

    if (!series) throw new NotFoundException("Série não encontrada.");
    return series;
  }

  async update(id: string, updateDto: UpdateSeriesDto) {
    const currentSeries = await this.findOne(id);
    const nextName = updateDto.name
      ? this.normalizeText(updateDto.name)
      : currentSeries.name;
    const nextSortOrder =
      updateDto.sortOrder !== undefined
        ? updateDto.sortOrder
        : currentSeries.sortOrder;

    await this.ensureUniqueSeries(nextName, id);
    await this.ensureUniqueSortOrder(nextSortOrder ?? undefined, id);

    return this.prisma.series.update({
      where: { id },
      data: {
        name: updateDto.name ? nextName : undefined,
        code: updateDto.code !== undefined
          ? this.normalizeText(updateDto.code) || null
          : undefined,
        sortOrder: updateDto.sortOrder,
        updatedBy: getTenantContext()!.userId,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    const activeLinks = await this.prisma.seriesClass.count({
      where: {
        seriesId: id,
        canceledAt: null,
      },
    });

    if (activeLinks > 0) {
      throw new ConflictException(
        "Não é possível desativar a série enquanto existir vínculo ativo em Série x Turma.",
      );
    }

    return this.prisma.series.updateMany({
      where: { id },
      data: {
        canceledAt: new Date(),
        canceledBy: getTenantContext()!.userId,
      },
    });
  }

  async setActiveStatus(id: string, active: boolean) {
    await this.findOne(id);

    if (!active) {
      const activeLinks = await this.prisma.seriesClass.count({
        where: {
          seriesId: id,
          canceledAt: null,
        },
      });

      if (activeLinks > 0) {
        throw new ConflictException(
          "Não é possível inativar a série enquanto existir vínculo ativo em Série x Turma.",
        );
      }
    }

    const updatedSeries = await this.prisma.series.update({
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
      message: active ? "Série ativada com sucesso." : "Série inativada com sucesso.",
      series: updatedSeries,
    };
  }
}
