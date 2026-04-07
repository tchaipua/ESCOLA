import { BadRequestException, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import {
  FinanceiroBatchDetails,
  FinanceiroBatchSummary,
  FinanceiroImportPayload,
  FinanceiroService,
} from "../../../../integrations/financeiro/financeiro.service";
import { PrismaService } from "../../../../prisma/prisma.service";
import { getTenantContext } from "../../../../common/tenant/tenant.context";
import { CreateStudentFinancialLaunchDto } from "../dto/create-student-financial-launch.dto";

type LaunchScope = "ALL" | "SERIES" | "SERIES_CLASS";
type LaunchType = "MENSALIDADE" | "MATERIAL_ESCOLAR" | "FORMATURA" | "EXTRA";

type SkippedStudent = {
  studentId: string;
  studentName: string;
  reason: string;
  classLabel?: string | null;
};

type LaunchBatchDetailsItem = {
  status: "OK" | "PROBLEMA";
  studentId: string;
  studentName: string;
  classLabel: string | null;
  payerName: string | null;
  referenceMonthLabel: string;
  dueDate: Date | string | null;
  installmentLabel: string;
  amount: number | null;
  description: string | null;
  reason: string | null;
};

type ParsedFinancePayload = FinanceiroImportPayload & {
  requestedBy?: string;
};

@Injectable()
export class StudentFinancialLaunchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financeiroService: FinanceiroService,
  ) {}

  private tenantId() {
    return getTenantContext()!.tenantId;
  }

  private userId() {
    return getTenantContext()!.userId;
  }

  private financeFilters() {
    return {
      sourceSystem: "ESCOLA",
      sourceTenantId: this.tenantId(),
    };
  }

  private normalizeScope(value?: string | null): LaunchScope {
    const normalized = String(value || "")
      .trim()
      .toUpperCase();

    if (
      normalized === "ALL" ||
      normalized === "SERIES" ||
      normalized === "SERIES_CLASS"
    ) {
      return normalized;
    }

    throw new BadRequestException("Escopo de lançamento inválido.");
  }

  private normalizeLaunchType(value?: string | null): LaunchType {
    const normalized = String(value || "")
      .trim()
      .toUpperCase();

    if (
      normalized === "MENSALIDADE" ||
      normalized === "MATERIAL_ESCOLAR" ||
      normalized === "FORMATURA" ||
      normalized === "EXTRA"
    ) {
      return normalized;
    }

    throw new BadRequestException("Tipo de lançamento inválido.");
  }

  private parseReferenceMonth(value?: string | null) {
    const normalized = String(value || "").trim();
    const match = normalized.match(/^(\d{4})-(\d{2})$/);
    if (!match) {
      throw new BadRequestException(
        "Informe a competência no formato YYYY-MM.",
      );
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException("Competência mensal inválida.");
    }

    return {
      key: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`,
      label: `${String(month).padStart(2, "0")}/${year}`,
      date: new Date(Date.UTC(year, month - 1, 1, 12, 0, 0)),
    };
  }

  private parseDateOnly(value?: string | null, fieldLabel = "data") {
    const normalized = String(value || "").trim();
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      throw new BadRequestException(`Informe ${fieldLabel} válida.`);
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      throw new BadRequestException(`Informe ${fieldLabel} válida.`);
    }

    return parsed;
  }

  private dateToDateOnly(value?: Date | string | null) {
    if (!value) return null;

    if (value instanceof Date) {
      return value.toISOString().slice(0, 10);
    }

    const normalized = String(value).trim();
    if (!normalized) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;

    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
  }

  private referenceMonthFromDate(date: Date) {
    return {
      key: date.toISOString().slice(0, 7),
      label: `${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`,
      date,
    };
  }

  private addMonths(date: Date, monthsToAdd: number) {
    return new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth() + monthsToAdd,
        date.getUTCDate(),
        12,
        0,
        0,
      ),
    );
  }

  private getDayOfMonth(date: Date) {
    return date.getUTCDate();
  }

  private getShiftLabel(value?: string | null) {
    return String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .join(" / ");
  }

  private roundMoney(value: number) {
    return Number(value.toFixed(2));
  }

  private parseFinancePayloadSnapshot(value?: string | null) {
    if (!value) return null;

    try {
      return JSON.parse(value) as ParsedFinancePayload;
    } catch {
      return null;
    }
  }

  private buildInstallmentDescription(
    baseDescription?: string | null,
    installmentNumber?: number | null,
    installmentCount?: number | null,
  ) {
    const normalized = String(baseDescription || "").trim();
    if (!normalized) return null;

    const safeInstallmentNumber = Number(installmentNumber || 0);
    const safeInstallmentCount = Number(installmentCount || 0);
    const base = normalized.replace(/\s+-\s+PARCELA\s+\d+\/\d+$/i, "");

    if (safeInstallmentCount <= 1 || safeInstallmentNumber <= 0) {
      return base;
    }

    return `${base} - PARCELA ${safeInstallmentNumber}/${safeInstallmentCount}`;
  }

  private buildBusinessKey(studentId: string, referenceMonthKey: string) {
    return `ESCOLA:${this.tenantId()}:ALUNO:${studentId}:MENSALIDADE:${referenceMonthKey}`;
  }

  private buildInstallmentKey(
    studentId: string,
    referenceMonthKey: string,
    installmentNumber: number,
  ) {
    return `MENSALIDADE:${studentId}:${referenceMonthKey}:${installmentNumber}`;
  }

  private getScopeTargetLabel(batch: {
    scope: string;
    targetSeries?: { name?: string | null } | null;
    targetSeriesClass?: {
      series?: { name?: string | null } | null;
      class?: { name?: string | null; shift?: string | null } | null;
    } | null;
  }) {
    if (batch.scope === "ALL") return "TODOS OS ALUNOS";
    if (batch.scope === "SERIES") return batch.targetSeries?.name || "SÉRIE";

    const seriesName = batch.targetSeriesClass?.series?.name || "SÉRIE";
    const className = batch.targetSeriesClass?.class?.name || "TURMA";
    const shiftLabel = this.getShiftLabel(batch.targetSeriesClass?.class?.shift);
    return shiftLabel
      ? `${seriesName} - ${className} (${shiftLabel})`
      : `${seriesName} - ${className}`;
  }

  private extractInstallmentCountFromPayload(payload?: ParsedFinancePayload | null) {
    if (!payload?.items?.length) return null;

    for (const item of payload.items) {
      const installmentCount = item.installments?.[0]?.installmentCount;
      if (installmentCount && installmentCount > 0) {
        return installmentCount;
      }
    }

    return null;
  }

  private extractFirstDueDateFromPayload(payload?: ParsedFinancePayload | null) {
    if (!payload?.items?.length) return null;

    const allDueDates = payload.items
      .flatMap((item) => item.installments || [])
      .map((installment) => this.dateToDateOnly(installment.dueDate))
      .filter((value): value is string => Boolean(value))
      .sort();

    return allDueDates[0] || null;
  }

  private inferReferenceMonth(
    batch: FinanceiroBatchSummary | FinanceiroBatchDetails,
    payload?: ParsedFinancePayload | null,
  ) {
    const batchReferenceDate = this.dateToDateOnly(batch.referenceDate);
    if (batchReferenceDate) {
      return this.referenceMonthFromDate(
        this.parseDateOnly(batchReferenceDate, "a data de referência"),
      );
    }

    const payloadReferenceDate = this.dateToDateOnly(payload?.referenceDate);
    if (payloadReferenceDate) {
      return this.referenceMonthFromDate(
        this.parseDateOnly(payloadReferenceDate, "a data de referência"),
      );
    }

    const fallbackDate =
      this.extractFirstDueDateFromPayload(payload) ||
      this.dateToDateOnly(batch.createdAt);

    return this.referenceMonthFromDate(
      this.parseDateOnly(fallbackDate, "a data de referência"),
    );
  }

  private inferInstallmentCount(
    batch: FinanceiroBatchSummary | FinanceiroBatchDetails,
    payload?: ParsedFinancePayload | null,
  ) {
    return (
      batch.metadata?.installmentCount ||
      payload?.metadata?.installmentCount ||
      this.extractInstallmentCountFromPayload(payload) ||
      1
    );
  }

  private inferFirstDueDate(
    batch: FinanceiroBatchSummary | FinanceiroBatchDetails,
    payload?: ParsedFinancePayload | null,
  ) {
    return (
      batch.metadata?.firstDueDate ||
      payload?.metadata?.firstDueDate ||
      this.extractFirstDueDateFromPayload(payload) ||
      this.dateToDateOnly(batch.referenceDate) ||
      this.dateToDateOnly(batch.createdAt)
    );
  }

  private inferScope(
    batch: FinanceiroBatchSummary | FinanceiroBatchDetails,
    payload?: ParsedFinancePayload | null,
  ) {
    const normalized = String(
      batch.metadata?.scope || payload?.metadata?.scope || "ALL",
    )
      .trim()
      .toUpperCase();

    if (
      normalized === "ALL" ||
      normalized === "SERIES" ||
      normalized === "SERIES_CLASS"
    ) {
      return normalized;
    }

    return "ALL";
  }

  private inferTargetLabel(
    batch: FinanceiroBatchSummary | FinanceiroBatchDetails,
    payload?: ParsedFinancePayload | null,
  ) {
    return batch.metadata?.targetLabel || payload?.metadata?.targetLabel || "TODOS OS ALUNOS";
  }

  private inferSkippedStudents(
    batch: FinanceiroBatchSummary | FinanceiroBatchDetails,
    payload?: ParsedFinancePayload | null,
  ) {
    if (batch.skippedItems?.length) {
      return batch.skippedItems.map((item) => ({
        studentId: item.studentId,
        studentName: item.studentName,
        reason: item.reason,
        classLabel: item.classLabel || null,
      }));
    }

    if (payload?.skippedItems?.length) {
      return payload.skippedItems.map((item) => ({
        studentId: item.studentId,
        studentName: item.studentName,
        reason: item.reason,
        classLabel: item.classLabel || null,
      }));
    }

    return [] as SkippedStudent[];
  }

  private sumBatchTotalAmount(batch: {
    receivableTitles?: Array<{ totalAmount?: number | null }>;
  }) {
    return this.roundMoney(
      (batch.receivableTitles || []).reduce(
        (accumulator, current) => accumulator + Number(current.totalAmount || 0),
        0,
      ),
    );
  }

  private buildPayloadItemMap(payload?: ParsedFinancePayload | null) {
    const map = new Map<string, any>();

    (payload?.items || []).forEach((item) => {
      if (item.businessKey) {
        map.set(item.businessKey, item);
      }
    });

    return map;
  }

  private mapFinanceBatchToHistoryItem(
    batch: FinanceiroBatchSummary | FinanceiroBatchDetails,
  ) {
    const payload = this.parseFinancePayloadSnapshot(batch.payloadSnapshot);
    const referenceMonth = this.inferReferenceMonth(batch, payload);
    const skippedStudents = this.inferSkippedStudents(batch, payload);

    return {
      id: batch.id,
      launchType: batch.sourceBatchType,
      scope: this.inferScope(batch, payload),
      referenceMonth: referenceMonth.key,
      referenceMonthLabel: referenceMonth.label,
      installmentCount: this.inferInstallmentCount(batch, payload),
      firstDueDate: this.inferFirstDueDate(batch, payload),
      totalStudents: batch.itemCount || 0,
      totalInstallments: batch.processedCount || 0,
      totalAmount: this.sumBatchTotalAmount(batch),
      skippedStudentsCount: skippedStudents.length,
      createdAt: batch.createdAt,
      createdBy: batch.createdBy || null,
      schoolYear:
        batch.metadata?.schoolYear || payload?.metadata?.schoolYear || null,
      targetLabel: this.inferTargetLabel(batch, payload),
    };
  }

  private async loadHistory() {
    const batches = await this.financeiroService.listReceivableBatches(
      this.financeFilters(),
    );

    return batches.map((batch) => this.mapFinanceBatchToHistoryItem(batch));
  }

  private async mapFinanceBatchToDetailsResponse(
    batch: FinanceiroBatchDetails,
  ) {
    const payload = this.parseFinancePayloadSnapshot(batch.payloadSnapshot);
    const payloadItemMap = this.buildPayloadItemMap(payload);
    const historyBatch = this.mapFinanceBatchToHistoryItem(batch);
    const receivableTitles = batch.receivableTitles as Array<any>;

    const successItems: LaunchBatchDetailsItem[] = receivableTitles.flatMap(
      (title) => {
        const payloadItem = payloadItemMap.get(title.businessKey);

        return (title.installments || []).map((installment: any) => ({
          status: "OK" as const,
          studentId: title.sourceEntityId,
          studentName: payloadItem?.sourceEntityName || title.sourceEntityId,
          classLabel: payloadItem?.classLabel || null,
          payerName:
            installment.payerNameSnapshot || title.payerNameSnapshot || null,
          referenceMonthLabel: historyBatch.referenceMonthLabel,
          dueDate: installment.dueDate,
          installmentLabel: `${installment.installmentNumber}/${installment.installmentCount}`,
          amount: installment.amount,
          description: this.buildInstallmentDescription(
            payloadItem?.description || title.description,
            installment.installmentNumber,
            installment.installmentCount,
          ),
          reason: null,
        }));
      },
    );

    const skippedItems = this.inferSkippedStudents(batch, payload);

    return {
      batch: {
        id: historyBatch.id,
        launchType: historyBatch.launchType,
        scope: historyBatch.scope,
        referenceMonthLabel: historyBatch.referenceMonthLabel,
        totalStudents: historyBatch.totalStudents,
        totalInstallments: historyBatch.totalInstallments,
        totalAmount: historyBatch.totalAmount,
        skippedStudentsCount: historyBatch.skippedStudentsCount,
        createdAt: historyBatch.createdAt,
        schoolYear: historyBatch.schoolYear,
      },
      items: [
        ...successItems,
        ...skippedItems.map((item) => ({
          status: "PROBLEMA" as const,
          studentId: item.studentId,
          studentName: item.studentName,
          classLabel: item.classLabel || null,
          payerName: null,
          referenceMonthLabel: historyBatch.referenceMonthLabel,
          dueDate: null,
          installmentLabel: `${historyBatch.installmentCount}/${historyBatch.installmentCount}`,
          amount: null,
          description: null,
          reason: item.reason,
        })),
      ],
    };
  }

  private async findTenantIdentity() {
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        id: this.tenantId(),
        canceledAt: null,
      },
      select: {
        id: true,
        name: true,
        document: true,
        cnpj: true,
        cpf: true,
      },
    });

    if (!tenant) {
      throw new BadRequestException("Escola inválida para o lançamento.");
    }

    return {
      id: tenant.id,
      name: tenant.name,
      document: tenant.document || tenant.cnpj || tenant.cpf || null,
    };
  }

  private async activeSchoolYear() {
    return this.prisma.schoolYear.findFirst({
      where: {
        tenantId: this.tenantId(),
        canceledAt: null,
        isActive: true,
      },
      select: {
        id: true,
        year: true,
      },
      orderBy: { year: "desc" },
    });
  }

  private async resolveTarget(scope: LaunchScope, payload: CreateStudentFinancialLaunchDto) {
    if (scope === "ALL") {
      return {
        targetSeries: null,
        targetSeriesClass: null,
        enrollmentWhere: {},
      };
    }

    if (scope === "SERIES") {
      const seriesId = String(payload.seriesId || "").trim();
      if (!seriesId) {
        throw new BadRequestException(
          "Selecione a série para gerar o lançamento filtrado.",
        );
      }

      const targetSeries = await this.prisma.series.findFirst({
        where: {
          id: seriesId,
          tenantId: this.tenantId(),
          canceledAt: null,
        },
      });

      if (!targetSeries) {
        throw new BadRequestException("Série inválida para o lançamento.");
      }

      return {
        targetSeries,
        targetSeriesClass: null,
        enrollmentWhere: {
          seriesClass: {
            seriesId: targetSeries.id,
            canceledAt: null,
          },
        },
      };
    }

    const seriesClassId = String(payload.seriesClassId || "").trim();
    if (!seriesClassId) {
      throw new BadRequestException(
        "Selecione a turma para gerar o lançamento filtrado.",
      );
    }

    const targetSeriesClass = await this.prisma.seriesClass.findFirst({
      where: {
        id: seriesClassId,
        tenantId: this.tenantId(),
        canceledAt: null,
      },
      include: {
        series: true,
        class: true,
      },
    });

    if (!targetSeriesClass) {
      throw new BadRequestException("Turma inválida para o lançamento.");
    }

    return {
      targetSeries: null,
      targetSeriesClass,
      enrollmentWhere: {
        seriesClassId: targetSeriesClass.id,
      },
    };
  }

  async details(batchId: string) {
    const normalizedBatchId = String(batchId || "").trim();
    if (!normalizedBatchId) {
      throw new BadRequestException("Lote de lançamento inválido.");
    }

    try {
      const financeBatch = await this.financeiroService.getReceivableBatch(
        normalizedBatchId,
        this.financeFilters(),
      );
      return this.mapFinanceBatchToDetailsResponse(financeBatch);
    } catch (error) {
      if (
        error instanceof Error &&
        /LOTE (NAO|NÃO) ENCONTRADO/i.test(error.message)
      ) {
        throw new BadRequestException("Lançamento não encontrado.");
      }

      throw error;
    }
  }

  async bootstrap() {
    const [activeSchoolYear, series, seriesClasses, history] = await Promise.all([
      this.activeSchoolYear(),
      this.prisma.series.findMany({
        where: {
          tenantId: this.tenantId(),
          canceledAt: null,
        },
        select: {
          id: true,
          name: true,
          sortOrder: true,
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      this.prisma.seriesClass.findMany({
        where: {
          tenantId: this.tenantId(),
          canceledAt: null,
        },
        include: {
          series: {
            select: {
              id: true,
              name: true,
              sortOrder: true,
            },
          },
          class: {
            select: {
              id: true,
              name: true,
              shift: true,
            },
          },
        },
      }),
      this.loadHistory(),
    ]);

    return {
      activeSchoolYear,
      series,
      seriesClasses: seriesClasses
        .sort((left, right) => {
          const leftOrder = left.series?.sortOrder ?? Number.MAX_SAFE_INTEGER;
          const rightOrder =
            right.series?.sortOrder ?? Number.MAX_SAFE_INTEGER;
          if (leftOrder !== rightOrder) return leftOrder - rightOrder;

          const leftSeries = left.series?.name || "";
          const rightSeries = right.series?.name || "";
          const seriesComparison = leftSeries.localeCompare(rightSeries);
          if (seriesComparison !== 0) return seriesComparison;

          return (left.class?.name || "").localeCompare(right.class?.name || "");
        })
        .map((item) => ({
          id: item.id,
          seriesId: item.seriesId,
          seriesName: item.series?.name || "SÉRIE",
          className: item.class?.name || "TURMA",
          shift: item.class?.shift || null,
          label: this.getScopeTargetLabel({
            scope: "SERIES_CLASS",
            targetSeriesClass: item,
          }),
        })),
      history,
    };
  }

  async create(payload: CreateStudentFinancialLaunchDto) {
    const scope = this.normalizeScope(payload.scope);
    const launchType = this.normalizeLaunchType(payload.launchType);
    const referenceMonth = this.parseReferenceMonth(payload.referenceMonth);
    const firstDueDate = this.parseDateOnly(
      payload.firstDueDate,
      "o primeiro vencimento",
    );
    const installmentCount = Number(payload.installmentCount);

    if (launchType !== "MENSALIDADE") {
      throw new BadRequestException(
        "Nesta primeira fase, somente o tipo MENSALIDADE está disponível para lançamento.",
      );
    }

    if (!Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > 24) {
      throw new BadRequestException(
        "Informe uma quantidade de parcelas entre 1 e 24.",
      );
    }

    const dueDay = this.getDayOfMonth(firstDueDate);
    if (dueDay < 1 || dueDay > 27) {
      throw new BadRequestException(
        "O dia do primeiro vencimento deve ficar entre 1 e 27.",
      );
    }

    const [{ targetSeries, targetSeriesClass, enrollmentWhere }, tenant, activeSchoolYear] =
      await Promise.all([
        this.resolveTarget(scope, payload),
        this.findTenantIdentity(),
        this.activeSchoolYear(),
      ]);

    const candidateStudents = await this.prisma.student.findMany({
      where: {
        tenantId: this.tenantId(),
        canceledAt: null,
        enrollments: {
          some: {
            tenantId: this.tenantId(),
            canceledAt: null,
            ...enrollmentWhere,
          },
        },
      },
      include: {
        billingGuardian: {
          select: {
            id: true,
            name: true,
            cpf: true,
            cnpj: true,
            canceledAt: true,
            email: true,
            phone: true,
            whatsapp: true,
          },
        },
        enrollments: {
          where: {
            tenantId: this.tenantId(),
            canceledAt: null,
            ...enrollmentWhere,
          },
          include: {
            seriesClass: {
              include: {
                series: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
                class: {
                  select: {
                    id: true,
                    name: true,
                    shift: true,
                    defaultMonthlyFee: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { name: "asc" },
    });

    if (candidateStudents.length === 0) {
      return {
        message:
          "Nenhum aluno ativo foi encontrado para o filtro informado.",
        batch: null,
        createdStudentsCount: 0,
        createdInstallmentsCount: 0,
        totalAmount: 0,
        skippedStudents: [] as SkippedStudent[],
      };
    }

    const businessKeyMap = new Map(
      candidateStudents.map((student) => [
        student.id,
        this.buildBusinessKey(student.id, referenceMonth.key),
      ]),
    );

    const existingBusinessKeys = new Set(
      (
        await this.financeiroService.existingBusinessKeys({
          ...this.financeFilters(),
          businessKeys: [...businessKeyMap.values()],
        })
      ).existingBusinessKeys,
    );

    const skippedStudents: SkippedStudent[] = [];
    const financeItems: FinanceiroImportPayload["items"] = [];

    candidateStudents.forEach((student) => {
      const enrollment = student.enrollments[0];
      const seriesClass = enrollment?.seriesClass || null;
      const classEntity = seriesClass?.class || null;
      const classLabel = this.getScopeTargetLabel({
        scope: "SERIES_CLASS",
        targetSeriesClass: seriesClass,
      });
      const businessKey = businessKeyMap.get(student.id)!;
      const effectiveAmount =
        typeof student.monthlyFee === "number" && Number.isFinite(student.monthlyFee)
          ? student.monthlyFee
          : typeof classEntity?.defaultMonthlyFee === "number" &&
              Number.isFinite(classEntity.defaultMonthlyFee)
            ? classEntity.defaultMonthlyFee
            : null;

      if (existingBusinessKeys.has(businessKey)) {
        skippedStudents.push({
          studentId: student.id,
          studentName: student.name,
          classLabel,
          reason:
            "Já existe lançamento de mensalidade para este aluno na competência informada.",
        });
        return;
      }

      if (effectiveAmount === null || effectiveAmount <= 0) {
        skippedStudents.push({
          studentId: student.id,
          studentName: student.name,
          classLabel,
          reason:
            "Aluno sem valor de mensalidade configurado no cadastro ou na turma.",
        });
        return;
      }

      const payerType =
        String(student.billingPayerType || "").trim().toUpperCase() ===
        "RESPONSAVEL"
          ? "RESPONSAVEL"
          : "ALUNO";
      const payerGuardian =
        payerType === "RESPONSAVEL" ? student.billingGuardian : null;

      if (payerType === "RESPONSAVEL" && (!payerGuardian || payerGuardian.canceledAt)) {
        skippedStudents.push({
          studentId: student.id,
          studentName: student.name,
          classLabel,
          reason:
            "Aluno sem responsável pagador válido definido no cadastro.",
        });
        return;
      }

      const payerName =
        payerType === "RESPONSAVEL"
          ? payerGuardian?.name || student.name
          : student.name;
      const payerDocument =
        payerType === "RESPONSAVEL"
          ? payerGuardian?.cpf || payerGuardian?.cnpj || undefined
          : student.cpf || student.cnpj || undefined;
      const payerEmail =
        payerType === "RESPONSAVEL"
          ? payerGuardian?.email || undefined
          : student.email || undefined;
      const payerPhone =
        payerType === "RESPONSAVEL"
          ? payerGuardian?.whatsapp || payerGuardian?.phone || undefined
          : student.whatsapp || student.phone || undefined;

      financeItems.push({
        sourceEntityType: "ALUNO",
        sourceEntityId: student.id,
        sourceEntityName: student.name,
        classLabel,
        businessKey,
        description: `${launchType} ${referenceMonth.label}`,
        categoryCode: launchType,
        issueDate: this.dateToDateOnly(new Date())!,
        payer: {
          externalEntityType: payerType,
          externalEntityId:
            payerType === "RESPONSAVEL"
              ? payerGuardian?.id || student.id
              : student.id,
          name: payerName,
          document: payerDocument,
          email: payerEmail,
          phone: payerPhone,
        },
        installments: Array.from({ length: installmentCount }, (_, index) => {
          const installmentNumber = index + 1;
          return {
            installmentNumber,
            installmentCount,
            dueDate: this.dateToDateOnly(this.addMonths(firstDueDate, index))!,
            amount: this.roundMoney(effectiveAmount),
            sourceInstallmentKey: this.buildInstallmentKey(
              student.id,
              referenceMonth.key,
              installmentNumber,
            ),
          };
        }),
      });
    });

    if (!financeItems.length) {
      return {
        message:
          "Nenhum lançamento foi criado. Ajuste as pendências dos alunos selecionados e tente novamente.",
        batch: null,
        createdStudentsCount: 0,
        createdInstallmentsCount: 0,
        totalAmount: 0,
        skippedStudents,
      };
    }

    const createdInstallmentsCount = financeItems.reduce(
      (accumulator, current) => accumulator + current.installments.length,
      0,
    );
    const totalAmount = this.roundMoney(
      financeItems.reduce(
        (accumulator, current) =>
          accumulator +
          current.installments.reduce(
            (installmentAccumulator, installment) =>
              installmentAccumulator + Number(installment.amount || 0),
            0,
          ),
        0,
      ),
    );

    const importResult = await this.financeiroService.importReceivables({
      requestedBy: this.userId(),
      companyName: tenant.name,
      companyDocument: tenant.document || undefined,
      sourceSystem: "ESCOLA",
      sourceTenantId: this.tenantId(),
      sourceBatchType: launchType,
      sourceBatchId: randomUUID(),
      referenceDate: `${referenceMonth.key}-01`,
      metadata: {
        scope,
        targetLabel: this.getScopeTargetLabel({
          scope,
          targetSeries,
          targetSeriesClass,
        }),
        installmentCount,
        firstDueDate: this.dateToDateOnly(firstDueDate)!,
        schoolYear: activeSchoolYear || null,
      },
      skippedItems: skippedStudents,
      items: financeItems,
    });

    const historyBatch = this.mapFinanceBatchToHistoryItem(
      await this.financeiroService.getReceivableBatch(
        importResult.batchId,
        this.financeFilters(),
      ),
    );

    const baseMessage =
      skippedStudents.length > 0
        ? `Mensalidades lançadas para ${financeItems.length} aluno(s), com ${skippedStudents.length} pendência(s) bloqueada(s).`
        : `Mensalidades lançadas com sucesso para ${financeItems.length} aluno(s).`;

    return {
      message:
        importResult.errors > 0 || importResult.duplicates > 0
          ? `${baseMessage} O Financeiro sinalizou ${importResult.errors} erro(s) e ${importResult.duplicates} duplicidade(s) internas no processamento.`
          : baseMessage,
      batch: historyBatch,
      createdStudentsCount: financeItems.length,
      createdInstallmentsCount,
      totalAmount,
      skippedStudents,
    };
  }
}
