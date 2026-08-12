import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../../prisma/prisma.service";
import { CreateSeriesDto } from "../dto/create-series.dto";
import { UpdateSeriesDto } from "../dto/update-series.dto";
import {
  getTenantContext,
  runWithTenantBranchScope,
} from "../../../../common/tenant/tenant.context";
import { resolveWritableTenantBranchCode } from "../../../../common/tenant/tenant-branches";
import { NotificationsService } from "../../../notifications/application/services/notifications.service";

@Injectable()
export class SeriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private normalizeText(value?: string | null) {
    return String(value || "")
      .trim()
      .toUpperCase();
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
        "A ordem de exibição informada já está em uso por outra série nesta escola.",
      );
    }
  }

  private async ensureValidNextSeries(
    nextSeriesId: string | null | undefined,
    currentSeriesId?: string,
  ) {
    if (!nextSeriesId) return;
    if (nextSeriesId === currentSeriesId) {
      throw new ConflictException(
        "A próxima série padrão não pode ser a própria série.",
      );
    }

    const visitedSeriesIds = new Set<string>();
    let candidateSeriesId: string | null = nextSeriesId;

    while (candidateSeriesId) {
      if (candidateSeriesId === currentSeriesId) {
        throw new ConflictException(
          "A configuração da próxima série criaria um ciclo de progressão.",
        );
      }
      if (visitedSeriesIds.has(candidateSeriesId)) {
        throw new ConflictException(
          "A configuração da próxima série contém um ciclo de progressão.",
        );
      }
      visitedSeriesIds.add(candidateSeriesId);

      const nextSeries: { id: string; nextSeriesId: string | null } | null =
        await this.prisma.series.findFirst({
          where: {
            id: candidateSeriesId,
            tenantId: getTenantContext()!.tenantId,
            canceledAt: null,
          },
          select: { id: true, nextSeriesId: true },
        });
      if (!nextSeries) {
        throw new NotFoundException(
          "A próxima série padrão não foi encontrada ou está inativa.",
        );
      }

      candidateSeriesId = nextSeries.nextSeriesId;
    }
  }

  async create(createDto: CreateSeriesDto) {
    const targetBranchCode = await resolveWritableTenantBranchCode(
      this.prisma,
      getTenantContext()!.tenantId,
      createDto.branchCode,
      getTenantContext()!.branchCode,
    );

    return runWithTenantBranchScope(targetBranchCode, async () => {
      const name = this.normalizeText(createDto.name);
      const code = createDto.code
        ? this.normalizeText(createDto.code)
        : undefined;
      await this.ensureUniqueSeries(name);
      await this.ensureUniqueSortOrder(createDto.sortOrder);
      await this.ensureValidNextSeries(createDto.nextSeriesId);

      return this.prisma.series.create({
        data: {
          tenantId: getTenantContext()!.tenantId,
          name,
          code,
          sortOrder: createDto.sortOrder,
          nextSeriesId: createDto.nextSeriesId || null,
          branchCode: targetBranchCode,
          createdBy: getTenantContext()!.userId,
        },
      });
    });
  }

  async findAll() {
    return this.prisma.series.findMany({
      where: {
        tenantId: getTenantContext()!.tenantId,
      },
      include: {
        nextSeries: {
          select: { id: true, name: true },
        },
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
        nextSeries: {
          select: { id: true, name: true },
        },
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
    const targetBranchCode = await resolveWritableTenantBranchCode(
      this.prisma,
      getTenantContext()!.tenantId,
      updateDto.branchCode,
      currentSeries.branchCode,
    );

    return runWithTenantBranchScope(targetBranchCode, async () => {
      const nextName = updateDto.name
        ? this.normalizeText(updateDto.name)
        : currentSeries.name;
      const nextSortOrder =
        updateDto.sortOrder !== undefined
          ? updateDto.sortOrder
          : currentSeries.sortOrder;
      const nextSeriesId =
        updateDto.nextSeriesId !== undefined
          ? updateDto.nextSeriesId || null
          : currentSeries.nextSeriesId;

      await this.ensureUniqueSeries(nextName, id);
      await this.ensureUniqueSortOrder(nextSortOrder ?? undefined, id);
      await this.ensureValidNextSeries(nextSeriesId, id);

      return this.prisma.series.update({
        where: { id },
        data: {
          name: updateDto.name ? nextName : undefined,
          code:
            updateDto.code !== undefined
              ? this.normalizeText(updateDto.code) || null
              : undefined,
          sortOrder: updateDto.sortOrder,
          nextSeriesId:
            updateDto.nextSeriesId !== undefined ? nextSeriesId : undefined,
          branchCode: targetBranchCode,
          updatedBy: getTenantContext()!.userId,
        },
      });
    });
  }

  async remove(id: string) {
    const series = await this.findOne(id);

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

    const result = await this.prisma.series.updateMany({
      where: { id },
      data: {
        canceledAt: new Date(),
        canceledBy: getTenantContext()!.userId,
      },
    });
    void this.notificationsService.dispatchConfiguredEventNotification({
      eventType: "SERIES_INACTIVATED",
      title: "SÉRIE INATIVADA",
      message: `A SÉRIE ${series.name} FOI INATIVADA.`,
      sourceType: "SERIES_STATUS",
      sourceId: id,
      metadata: { seriesId: id },
    }).catch(() => undefined);
    return result;
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
    if (!active) {
      void this.notificationsService.dispatchConfiguredEventNotification({
        eventType: "SERIES_INACTIVATED",
        title: "SÉRIE INATIVADA",
        message: `A SÉRIE ${updatedSeries.name} FOI INATIVADA.`,
        sourceType: "SERIES_STATUS",
        sourceId: id,
        metadata: { seriesId: id },
      }).catch(() => undefined);
    }

    return {
      message: active
        ? "Série ativada com sucesso."
        : "Série inativada com sucesso.",
      series: updatedSeries,
    };
  }
}
