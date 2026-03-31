import {
  Injectable,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../../prisma/prisma.service";
import { CreateSchoolYearDto } from "../dto/create-school-year.dto";
import { UpdateSchoolYearDto } from "../dto/update-school-year.dto";
import { getTenantContext } from "../../../../common/tenant/tenant.context";

@Injectable()
export class SchoolYearsService {
  constructor(private readonly prisma: PrismaService) {}

  private tenantId() {
    return getTenantContext()!.tenantId;
  }

  private userId() {
    return getTenantContext()!.userId;
  }

  async create(createDto: CreateSchoolYearDto) {
    const conflict = await this.prisma.schoolYear.findFirst({
      where: {
        tenantId: this.tenantId(),
        year: createDto.year,
        canceledAt: null,
      },
    });

    if (conflict) {
      throw new ConflictException(
        `O Ano Letivo ${createDto.year} já existe na sua escola.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (createDto.isActive) {
        await tx.schoolYear.updateMany({
          data: { isActive: false },
          where: {
            tenantId: this.tenantId(),
            canceledAt: null,
          },
        });
      }

      return tx.schoolYear.create({
        data: {
          year: createDto.year,
          startDate: new Date(createDto.startDate),
          endDate: new Date(createDto.endDate),
          isActive: createDto.isActive || false,
          tenantId: this.tenantId(),
          createdBy: this.userId(),
        },
      });
    });
  }

  async findAll() {
    return this.prisma.schoolYear.findMany({
      where: {
        tenantId: this.tenantId(),
        canceledAt: null,
      },
      orderBy: { year: "desc" },
    });
  }

  async findOne(id: string) {
    const year = await this.prisma.schoolYear.findFirst({
      where: {
        id,
        tenantId: this.tenantId(),
        canceledAt: null,
      },
    });

    if (!year)
      throw new NotFoundException("Ano letivo não encontrado na sua base.");
    return year;
  }

  async update(id: string, updateDto: UpdateSchoolYearDto) {
    const currentYear = await this.findOne(id);

    if (
      typeof updateDto.year === "number" &&
      updateDto.year !== currentYear.year
    ) {
      const conflict = await this.prisma.schoolYear.findFirst({
        where: {
          tenantId: this.tenantId(),
          year: updateDto.year,
          canceledAt: null,
          id: { not: id },
        },
      });

      if (conflict) {
        throw new ConflictException(
          `O Ano Letivo ${updateDto.year} já existe na sua escola.`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      if (updateDto.isActive) {
        await tx.schoolYear.updateMany({
          data: { isActive: false },
          where: {
            tenantId: this.tenantId(),
            canceledAt: null,
          },
        });
      }

      return tx.schoolYear.update({
        where: { id },
        data: {
          year: updateDto.year,
          startDate: updateDto.startDate
            ? new Date(updateDto.startDate)
            : undefined,
          endDate: updateDto.endDate ? new Date(updateDto.endDate) : undefined,
          isActive: updateDto.isActive,
          updatedBy: this.userId(),
        },
      });
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.schoolYear.updateMany({
      where: {
        id,
        tenantId: this.tenantId(),
      },
      data: {
        canceledAt: new Date(),
        canceledBy: this.userId(),
        isActive: false,
      },
    });
  }
}
