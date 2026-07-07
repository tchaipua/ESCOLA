import {
  BadRequestException,
  Injectable,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../../prisma/prisma.service";
import { CreateSchoolYearDto } from "../dto/create-school-year.dto";
import { UpdateSchoolYearDto } from "../dto/update-school-year.dto";
import { ImportHolidaysQueryDto } from "../dto/import-holidays-query.dto";
import { SchoolHolidayQueryDto } from "../dto/school-holiday-query.dto";
import { SyncSchoolHolidaysDto } from "../dto/sync-school-holidays.dto";
import {
  getTenantContext,
  runWithTenantBranchScope,
} from "../../../../common/tenant/tenant.context";
import { resolveWritableTenantBranchCode } from "../../../../common/tenant/tenant-branches";

const SCHOOL_HOLIDAY_TYPES = [
  "NACIONAL",
  "ESTADUAL",
  "MUNICIPAL",
  "FACULTATIVO",
  "ESCOLA",
] as const;

type SchoolHolidayType = (typeof SCHOOL_HOLIDAY_TYPES)[number];

type ImportedHolidayType =
  | "NACIONAL"
  | "ESTADUAL"
  | "MUNICIPAL"
  | "FACULTATIVO";

type ImportedHoliday = {
  date: string;
  name: string;
  type: ImportedHolidayType;
  source: "BRASIL_API";
};

type BrasilApiHoliday = {
  date?: string;
  name?: string;
  type?: string;
};

type NormalizedSchoolHoliday = {
  date: string;
  name: string;
  type: SchoolHolidayType;
  appliesTo: string;
  source: string | null;
};

type SchoolHolidayRecord = {
  id: string;
  branchCode: number;
  year: number;
  date: Date;
  name: string;
  holidayType: string;
  appliesTo: string;
  source: string | null;
};

type SchoolYearPeriodRecord = {
  id: string;
  branchCode: number;
  periodType: string;
  startDate: Date;
  endDate: Date;
  appliesTo: string;
  sortOrder: number;
};

function normalizeHolidayName(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function normalizeHolidayType(value: unknown): ImportedHolidayType {
  const type = normalizeHolidayName(value);
  if (type === "ESTADUAL") return "ESTADUAL";
  if (type === "MUNICIPAL") return "MUNICIPAL";
  if (type === "FACULTATIVO") return "FACULTATIVO";
  return "NACIONAL";
}

function normalizeHolidayDate(value: unknown) {
  const rawValue = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) return rawValue;

  const brazilianDateMatch = rawValue.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brazilianDateMatch) {
    return `${brazilianDateMatch[3]}-${brazilianDateMatch[2]}-${brazilianDateMatch[1]}`;
  }

  return rawValue;
}

function normalizeSchoolHolidayType(value: unknown): SchoolHolidayType {
  const type = normalizeHolidayName(value);
  if (SCHOOL_HOLIDAY_TYPES.includes(type as SchoolHolidayType)) {
    return type as SchoolHolidayType;
  }
  return "NACIONAL";
}

function normalizeHolidayDateStrict(value: unknown) {
  const normalizedDate = normalizeHolidayDate(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
    throw new BadRequestException("Informe uma data de feriado válida.");
  }
  return normalizedDate;
}

function toUtcDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function buildHolidayKey(date: string, name: string, type: string) {
  return `${date}|${name}|${type}`;
}

function normalizePeriodName(value: unknown) {
  return normalizeHolidayName(value);
}

function dedupeAndSortHolidays(holidays: ImportedHoliday[]) {
  const uniqueHolidays = new Map<string, ImportedHoliday>();

  holidays.forEach((holiday) => {
    if (!holiday.date || !holiday.name) return;
    const key = `${holiday.date}|${holiday.name}|${holiday.type}`;
    uniqueHolidays.set(key, holiday);
  });

  return Array.from(uniqueHolidays.values()).sort((first, second) =>
    first.date.localeCompare(second.date) || first.name.localeCompare(second.name),
  );
}

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
    const targetBranchCode = await resolveWritableTenantBranchCode(
      this.prisma,
      this.tenantId(),
      createDto.branchCode,
      getTenantContext()!.branchCode,
    );

    return runWithTenantBranchScope(targetBranchCode, async () => {
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

      const schoolYear = await tx.schoolYear.create({
        data: {
          year: createDto.year,
          startDate: new Date(createDto.startDate),
          endDate: new Date(createDto.endDate),
          isActive: createDto.isActive || false,
          monday: createDto.monday ?? true,
          tuesday: createDto.tuesday ?? true,
          wednesday: createDto.wednesday ?? true,
          thursday: createDto.thursday ?? true,
          friday: createDto.friday ?? true,
          saturday: createDto.saturday ?? false,
          sunday: createDto.sunday ?? false,
          tenantId: this.tenantId(),
          branchCode: targetBranchCode,
          createdBy: this.userId(),
        },
      });

      await this.syncSchoolYearPeriods(
        tx,
        schoolYear.id,
        targetBranchCode,
        createDto.periods || [],
      );

      return tx.schoolYear.findUnique({
        where: { id: schoolYear.id },
        include: {
          periods: {
            where: { canceledAt: null },
            orderBy: [{ startDate: "asc" }, { sortOrder: "asc" }],
          },
        },
      });
    });
    });
  }

  async findAll() {
    const years = await this.prisma.schoolYear.findMany({
      where: {
        tenantId: this.tenantId(),
        canceledAt: null,
      },
      include: {
        periods: {
          where: { canceledAt: null },
          orderBy: [{ startDate: "asc" }, { sortOrder: "asc" }],
        },
      },
      orderBy: { year: "desc" },
    });

    return years.map((year) => this.mapSchoolYear(year));
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
    const fullYear = await this.prisma.schoolYear.findUnique({
      where: { id: year.id },
      include: {
        periods: {
          where: { canceledAt: null },
          orderBy: [{ startDate: "asc" }, { sortOrder: "asc" }],
        },
      },
    });
    return fullYear ? this.mapSchoolYear(fullYear) : year;
  }

  async importHolidays(query: ImportHolidaysQueryDto) {
    const holidays = await this.fetchBrasilApiNationalHolidays(query.year);
    return {
      scope: "NACIONAL",
      year: query.year,
      source: "BRASIL_API",
      holidays,
    };
  }

  async findHolidays(query: SchoolHolidayQueryDto) {
    const branchCode = getTenantContext()!.branchCode || 1;
    const holidays = await this.prisma.schoolHoliday.findMany({
      where: {
        tenantId: this.tenantId(),
        branchCode: { in: [0, branchCode] },
        year: query.year,
        canceledAt: null,
      },
      orderBy: [{ date: "asc" }, { name: "asc" }],
    });

    return holidays.map((holiday) => this.mapSchoolHoliday(holiday));
  }

  async syncHolidays(dto: SyncSchoolHolidaysDto) {
    const targetBranchCode = await resolveWritableTenantBranchCode(
      this.prisma,
      this.tenantId(),
      dto.branchCode,
      getTenantContext()!.branchCode,
    );
    const normalizedHolidays = this.normalizeSchoolHolidays(
      dto.year,
      dto.holidays || [],
    );

    return runWithTenantBranchScope(targetBranchCode, async () =>
      this.prisma.$transaction(async (tx) => {
        const existingHolidays = await tx.schoolHoliday.findMany({
          where: {
            tenantId: this.tenantId(),
            branchCode: targetBranchCode,
            year: dto.year,
          },
          orderBy: [{ date: "asc" }, { name: "asc" }],
        });

        const incomingKeys = new Set(
          normalizedHolidays.map((holiday) =>
            buildHolidayKey(holiday.date, holiday.name, holiday.type),
          ),
        );
        const existingByKey = new Map<string, (typeof existingHolidays)[number]>();
        const duplicateIdsToCancel: string[] = [];

        existingHolidays.forEach((holiday) => {
          const key = buildHolidayKey(
            formatDateOnly(holiday.date),
            normalizeHolidayName(holiday.name),
            normalizeSchoolHolidayType(holiday.holidayType),
          );
          if (existingByKey.has(key)) {
            duplicateIdsToCancel.push(holiday.id);
            return;
          }
          existingByKey.set(key, holiday);
        });

        const idsToCancel = existingHolidays
          .filter((holiday) => {
            if (holiday.canceledAt) return false;
            const key = buildHolidayKey(
              formatDateOnly(holiday.date),
              normalizeHolidayName(holiday.name),
              normalizeSchoolHolidayType(holiday.holidayType),
            );
            return !incomingKeys.has(key);
          })
          .map((holiday) => holiday.id);

        const cancelIds = Array.from(
          new Set([...idsToCancel, ...duplicateIdsToCancel]),
        );
        if (cancelIds.length > 0) {
          await tx.schoolHoliday.updateMany({
            where: {
              tenantId: this.tenantId(),
              id: { in: cancelIds },
            },
            data: {
              canceledAt: new Date(),
              canceledBy: this.userId(),
              updatedBy: this.userId(),
            },
          });
        }

        for (const holiday of normalizedHolidays) {
          const key = buildHolidayKey(holiday.date, holiday.name, holiday.type);
          const existingHoliday = existingByKey.get(key);
          const data = {
            date: toUtcDateOnly(holiday.date),
            name: holiday.name,
            holidayType: holiday.type,
            appliesTo: holiday.appliesTo,
            source: holiday.source,
            canceledAt: null,
            canceledBy: null,
            updatedBy: this.userId(),
          };

          if (existingHoliday) {
            await tx.schoolHoliday.update({
              where: { id: existingHoliday.id },
              data,
            });
          } else {
            await tx.schoolHoliday.create({
              data: {
                ...data,
                tenantId: this.tenantId(),
                branchCode: targetBranchCode,
                year: dto.year,
                createdBy: this.userId(),
              },
            });
          }
        }

        const savedHolidays = await tx.schoolHoliday.findMany({
          where: {
            tenantId: this.tenantId(),
            branchCode: targetBranchCode,
            year: dto.year,
            canceledAt: null,
          },
          orderBy: [{ date: "asc" }, { name: "asc" }],
        });

        return savedHolidays.map((holiday) => this.mapSchoolHoliday(holiday));
      }),
    );
  }

  private normalizeSchoolHolidays(
    year: number,
    holidays: SyncSchoolHolidaysDto["holidays"],
  ) {
    const uniqueHolidays = new Map<string, NormalizedSchoolHoliday>();

    holidays.forEach((holiday) => {
      const date = normalizeHolidayDateStrict(holiday.date);
      const dateYear = Number(date.slice(0, 4));
      if (dateYear !== year) {
        throw new BadRequestException(
          "O feriado informado não pertence ao ano letivo selecionado.",
        );
      }

      const name = normalizeHolidayName(holiday.name);
      if (!name) {
        throw new BadRequestException("Informe o nome do feriado.");
      }

      const type = normalizeSchoolHolidayType(holiday.type);
      const appliesTo =
        normalizeHolidayName(holiday.appliesTo) || "TODAS AS TURMAS";
      const source = normalizeHolidayName(holiday.source || "MANUAL") || null;
      const key = buildHolidayKey(date, name, type);

      uniqueHolidays.set(key, {
        date,
        name,
        type,
        appliesTo,
        source,
      });
    });

    return Array.from(uniqueHolidays.values()).sort(
      (first, second) =>
        first.date.localeCompare(second.date) ||
        first.name.localeCompare(second.name),
    );
  }

  private mapSchoolHoliday(holiday: SchoolHolidayRecord) {
    return {
      id: holiday.id,
      branchCode: holiday.branchCode,
      year: holiday.year,
      date: formatDateOnly(holiday.date),
      name: holiday.name,
      type: normalizeSchoolHolidayType(holiday.holidayType),
      appliesTo: holiday.appliesTo,
      source: holiday.source,
    };
  }

  private mapSchoolYearPeriod(period: SchoolYearPeriodRecord) {
    return {
      id: period.id,
      branchCode: period.branchCode,
      type: period.periodType,
      startDate: formatDateOnly(period.startDate),
      endDate: formatDateOnly(period.endDate),
      appliesTo: period.appliesTo,
      sortOrder: period.sortOrder,
    };
  }

  private mapSchoolYear<
    T extends {
      periods?: SchoolYearPeriodRecord[];
    },
  >(schoolYear: T) {
    return {
      ...schoolYear,
      periods: (schoolYear.periods || []).map((period) =>
        this.mapSchoolYearPeriod(period),
      ),
    };
  }

  private normalizeSchoolYearPeriods(
    schoolYearStartDate: Date,
    schoolYearEndDate: Date,
    periods: CreateSchoolYearDto["periods"],
  ) {
    return (periods || []).map((period, index) => {
      const startDate = toUtcDateOnly(normalizeHolidayDateStrict(period.startDate));
      const endDate = toUtcDateOnly(normalizeHolidayDateStrict(period.endDate));
      if (startDate.getTime() > endDate.getTime()) {
        throw new BadRequestException(
          "O início do período sem aula não pode ser posterior ao fim.",
        );
      }
      if (
        startDate.getTime() < schoolYearStartDate.getTime() ||
        endDate.getTime() > schoolYearEndDate.getTime()
      ) {
        throw new BadRequestException(
          `O período sem aula ${formatDateOnly(startDate)} A ${formatDateOnly(endDate)} precisa estar dentro do ano letivo ${formatDateOnly(schoolYearStartDate)} A ${formatDateOnly(schoolYearEndDate)}.`,
        );
      }
      return {
        periodType: normalizePeriodName(period.type || "FERIAS") || "FERIAS",
        startDate,
        endDate,
        appliesTo: normalizePeriodName(period.appliesTo) || "TODAS AS TURMAS",
        sortOrder: index,
      };
    });
  }

  private async syncSchoolYearPeriods(
    tx: any,
    schoolYearId: string,
    branchCode: number,
    periods: CreateSchoolYearDto["periods"],
  ) {
    const schoolYear = await tx.schoolYear.findUnique({
      where: { id: schoolYearId },
      select: { startDate: true, endDate: true },
    });
    if (!schoolYear) return;

    const normalizedPeriods = this.normalizeSchoolYearPeriods(
      schoolYear.startDate,
      schoolYear.endDate,
      periods || [],
    );

    await tx.schoolYearPeriod.updateMany({
      where: {
        tenantId: this.tenantId(),
        schoolYearId,
        canceledAt: null,
      },
      data: {
        canceledAt: new Date(),
        canceledBy: this.userId(),
        updatedBy: this.userId(),
      },
    });

    if (normalizedPeriods.length > 0) {
      await tx.schoolYearPeriod.createMany({
        data: normalizedPeriods.map((period) => ({
          tenantId: this.tenantId(),
          schoolYearId,
          branchCode,
          periodType: period.periodType,
          startDate: period.startDate,
          endDate: period.endDate,
          appliesTo: period.appliesTo,
          sortOrder: period.sortOrder,
          createdBy: this.userId(),
        })),
      });
    }
  }

  private async fetchBrasilApiNationalHolidays(year: number) {
    const response = await fetch(
      `https://brasilapi.com.br/api/feriados/v1/${year}`,
      { headers: { Accept: "application/json" } },
    );

    if (!response.ok) {
      throw new BadRequestException(
        "Não foi possível importar os feriados nacionais agora.",
      );
    }

    const data = (await response.json()) as unknown;
    if (!Array.isArray(data)) {
      throw new BadRequestException(
        "A fonte de feriados nacionais retornou um formato inesperado.",
      );
    }

    return dedupeAndSortHolidays(
      data.map((item: BrasilApiHoliday) => ({
        date: normalizeHolidayDate(item.date),
        name: normalizeHolidayName(item.name),
        type: normalizeHolidayType(item.type),
        source: "BRASIL_API",
      })),
    );
  }

  async update(id: string, updateDto: UpdateSchoolYearDto) {
    const currentYear = await this.findOne(id);
    const targetBranchCode = await resolveWritableTenantBranchCode(
      this.prisma,
      this.tenantId(),
      updateDto.branchCode,
      currentYear.branchCode,
    );

    return runWithTenantBranchScope(targetBranchCode, async () => {
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

      await tx.schoolYear.update({
        where: { id },
        data: {
          year: updateDto.year,
          startDate: updateDto.startDate
            ? new Date(updateDto.startDate)
            : undefined,
          endDate: updateDto.endDate ? new Date(updateDto.endDate) : undefined,
          isActive: updateDto.isActive,
          monday: updateDto.monday,
          tuesday: updateDto.tuesday,
          wednesday: updateDto.wednesday,
          thursday: updateDto.thursday,
          friday: updateDto.friday,
          saturday: updateDto.saturday,
          sunday: updateDto.sunday,
          branchCode: targetBranchCode,
          updatedBy: this.userId(),
        },
      });

      if (updateDto.periods) {
        await this.syncSchoolYearPeriods(
          tx,
          id,
          targetBranchCode,
          updateDto.periods,
        );
      }

      return tx.schoolYear.findUnique({
        where: { id },
        include: {
          periods: {
            where: { canceledAt: null },
            orderBy: [{ startDate: "asc" }, { sortOrder: "asc" }],
          },
        },
      });
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
