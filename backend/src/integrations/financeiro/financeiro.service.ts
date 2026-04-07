import { BadGatewayException, Injectable } from "@nestjs/common";

export type FinanceiroBatchMetadata = {
  scope?: string;
  targetLabel?: string;
  installmentCount?: number;
  firstDueDate?: string;
  schoolYear?: {
    id: string;
    year: number;
  } | null;
};

export type FinanceiroSkippedItem = {
  studentId: string;
  studentName: string;
  reason: string;
  classLabel?: string | null;
};

export type FinanceiroImportPayload = {
  requestedBy?: string;
  companyId?: string;
  companyName?: string;
  companyDocument?: string;
  sourceSystem: string;
  sourceTenantId: string;
  sourceBatchType: string;
  sourceBatchId: string;
  referenceDate?: string;
  metadata?: FinanceiroBatchMetadata;
  skippedItems?: FinanceiroSkippedItem[];
  items: Array<{
    sourceEntityType: string;
    sourceEntityId: string;
    sourceEntityName?: string;
    classLabel?: string | null;
    businessKey: string;
    description: string;
    categoryCode?: string;
    issueDate: string;
    payer: {
      externalEntityType: string;
      externalEntityId: string;
      name: string;
      document?: string;
      email?: string;
      phone?: string;
    };
    installments: Array<{
      installmentNumber: number;
      installmentCount: number;
      dueDate: string;
      amount: number;
      sourceInstallmentKey: string;
    }>;
  }>;
};

export type FinanceiroImportResponse = {
  batchId: string;
  importedTitles: number;
  importedInstallments: number;
  duplicates: number;
  errors: number;
  message: string;
};

export type FinanceiroExistingBusinessKeysResponse = {
  existingBusinessKeys: string[];
};

export type FinanceiroBatchSummary = {
  id: string;
  companyId: string;
  sourceSystem: string;
  sourceTenantId: string;
  sourceBatchType: string;
  sourceBatchId: string;
  referenceDate?: string | null;
  status: string;
  itemCount: number;
  processedCount: number;
  duplicateCount: number;
  errorCount: number;
  payloadSnapshot?: string | null;
  createdAt: string;
  createdBy?: string | null;
  updatedAt: string;
  updatedBy?: string | null;
  metadata?: FinanceiroBatchMetadata | null;
  skippedItems?: FinanceiroSkippedItem[];
  receivableTitles?: Array<{
    totalAmount: number;
  }>;
};

export type FinanceiroBatchDetails = FinanceiroBatchSummary & {
  receivableTitles: Array<{
    id: string;
    sourceEntityType: string;
    sourceEntityId: string;
    businessKey: string;
    description: string;
    totalAmount: number;
    payerNameSnapshot: string;
    payerDocumentSnapshot?: string | null;
    installments: Array<{
      id: string;
      sourceInstallmentKey: string;
      installmentNumber: number;
      installmentCount: number;
      dueDate: string;
      amount: number;
      descriptionSnapshot: string;
      payerNameSnapshot: string;
      payerDocumentSnapshot?: string | null;
    }>;
  }>;
};

export type FinanceiroCashMovement = {
  id: string;
  movementType: string;
  direction: string;
  paymentMethod?: string | null;
  amount: number;
  description: string;
  occurredAt: string;
  referenceType?: string | null;
  referenceId?: string | null;
};

export type FinanceiroCashSession = {
  id: string;
  companyId: string;
  sourceSystem: string;
  sourceTenantId: string;
  cashierUserId: string;
  cashierDisplayName: string;
  status: string;
  openingAmount: number;
  totalReceivedAmount: number;
  expectedClosingAmount: number;
  declaredClosingAmount?: number | null;
  openedAt: string;
  closedAt?: string | null;
  notes?: string | null;
  createdAt: string;
  createdBy?: string | null;
  updatedAt: string;
  updatedBy?: string | null;
  movementCount: number;
  settlementCount: number;
  movements: FinanceiroCashMovement[];
};

export type FinanceiroInstallmentFilterStatus =
  | "OPEN"
  | "PAID"
  | "OVERDUE"
  | "ALL";

export type FinanceiroInstallment = {
  id: string;
  titleId: string;
  batchId: string;
  sourceEntityType: string;
  sourceEntityId: string;
  sourceEntityName: string;
  classLabel?: string | null;
  businessKey: string;
  sourceInstallmentKey: string;
  description: string;
  payerNameSnapshot: string;
  payerDocumentSnapshot?: string | null;
  installmentNumber: number;
  installmentCount: number;
  dueDate: string;
  amount: number;
  openAmount: number;
  paidAmount: number;
  status: string;
  settlementMethod?: string | null;
  settledAt?: string | null;
  isOverdue: boolean;
};

export type FinanceiroOpenInstallment = FinanceiroInstallment;

export type FinanceiroOpenCashSessionPayload = {
  requestedBy?: string;
  sourceSystem: string;
  sourceTenantId: string;
  cashierUserId: string;
  cashierDisplayName: string;
  openingAmount?: number;
  notes?: string;
};

export type FinanceiroCloseCurrentCashSessionPayload = {
  requestedBy?: string;
  sourceSystem: string;
  sourceTenantId: string;
  cashierUserId: string;
  declaredClosingAmount?: number;
  closedAt?: string;
  notes?: string;
};

export type FinanceiroSettleCashInstallmentPayload = {
  requestedBy?: string;
  sourceSystem: string;
  sourceTenantId: string;
  cashierUserId: string;
  cashierDisplayName: string;
  receivedAt?: string;
  discountAmount?: number;
  interestAmount?: number;
  penaltyAmount?: number;
  notes?: string;
};

export type FinanceiroSettleCashInstallmentResponse = {
  installmentId: string;
  settlementId: string;
  cashSessionId: string;
  status: string;
  openAmount: number;
  paidAmount: number;
  receivedAmount: number;
  settledAt: string;
  paymentMethod: string;
  discountAmount: number;
  interestAmount: number;
  penaltyAmount: number;
  message: string;
};

@Injectable()
export class FinanceiroService {
  private getBaseUrl() {
    return (
      process.env.FINANCEIRO_API_URL?.trim() || "http://localhost:3002/api/v1"
    ).replace(/\/+$/, "");
  }

  private async request<T>(
    path: string,
    init?: RequestInit & { fallbackMessage?: string },
  ): Promise<T> {
    const fallbackMessage =
      init?.fallbackMessage || "Não foi possível comunicar com o Financeiro.";

    try {
      const response = await fetch(`${this.getBaseUrl()}${path}`, {
        ...init,
        headers: {
          ...(init?.body ? { "Content-Type": "application/json" } : {}),
          ...(init?.headers || {}),
        },
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new BadGatewayException(
          payload?.message || payload?.error || fallbackMessage,
        );
      }

      return payload as T;
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      throw new BadGatewayException(fallbackMessage);
    }
  }

  async importReceivables(payload: FinanceiroImportPayload) {
    return this.request<FinanceiroImportResponse>("/receivables/import", {
      method: "POST",
      body: JSON.stringify(payload),
      fallbackMessage:
        "Não foi possível gravar os lançamentos no sistema Financeiro.",
    });
  }

  async existingBusinessKeys(payload: {
    sourceSystem: string;
    sourceTenantId: string;
    businessKeys: string[];
  }) {
    return this.request<FinanceiroExistingBusinessKeysResponse>(
      "/receivables/existing-business-keys",
      {
        method: "POST",
        body: JSON.stringify(payload),
        fallbackMessage:
          "Não foi possível validar duplicidades no sistema Financeiro.",
      },
    );
  }

  async listReceivableBatches(filters: {
    sourceSystem: string;
    sourceTenantId: string;
  }) {
    const query = new URLSearchParams({
      sourceSystem: filters.sourceSystem,
      sourceTenantId: filters.sourceTenantId,
    });

    return this.request<FinanceiroBatchSummary[]>(
      `/receivables/batches?${query.toString()}`,
      {
        fallbackMessage:
          "Não foi possível carregar o histórico financeiro no sistema Financeiro.",
      },
    );
  }

  async getReceivableBatch(
    batchId: string,
    filters: {
      sourceSystem: string;
      sourceTenantId: string;
    },
  ) {
    const query = new URLSearchParams({
      sourceSystem: filters.sourceSystem,
      sourceTenantId: filters.sourceTenantId,
    });

    return this.request<FinanceiroBatchDetails>(
      `/receivables/batches/${batchId}?${query.toString()}`,
      {
        fallbackMessage:
          "Não foi possível carregar os detalhes do lote financeiro.",
      },
    );
  }

  async getCurrentCashSession(filters: {
    sourceSystem: string;
    sourceTenantId: string;
    cashierUserId: string;
  }) {
    const query = new URLSearchParams({
      sourceSystem: filters.sourceSystem,
      sourceTenantId: filters.sourceTenantId,
      cashierUserId: filters.cashierUserId,
    });

    return this.request<FinanceiroCashSession | null>(
      `/cash-sessions/current?${query.toString()}`,
      {
        fallbackMessage:
          "Não foi possível carregar o caixa atual no sistema Financeiro.",
      },
    );
  }

  async openCashSession(payload: FinanceiroOpenCashSessionPayload) {
    return this.request<FinanceiroCashSession>("/cash-sessions/open", {
      method: "POST",
      body: JSON.stringify(payload),
      fallbackMessage: "Não foi possível abrir o caixa no sistema Financeiro.",
    });
  }

  async closeCurrentCashSession(
    payload: FinanceiroCloseCurrentCashSessionPayload,
  ) {
    return this.request<FinanceiroCashSession>("/cash-sessions/close-current", {
      method: "POST",
      body: JSON.stringify(payload),
      fallbackMessage: "Não foi possível fechar o caixa no sistema Financeiro.",
    });
  }

  async listOpenInstallments(filters: {
    sourceSystem: string;
    sourceTenantId: string;
    status?: FinanceiroInstallmentFilterStatus;
    studentName?: string;
    payerName?: string;
    search?: string;
  }) {
    const query = new URLSearchParams({
      sourceSystem: filters.sourceSystem,
      sourceTenantId: filters.sourceTenantId,
    });

    if (filters.status?.trim()) {
      query.set("status", filters.status.trim().toUpperCase());
    }

    if (filters.studentName?.trim()) {
      query.set("studentName", filters.studentName.trim());
    }

    if (filters.payerName?.trim()) {
      query.set("payerName", filters.payerName.trim());
    }

    if (filters.search?.trim()) {
      query.set("search", filters.search.trim());
    }

    return this.request<FinanceiroInstallment[]>(
      `/receivables/installments?${query.toString()}`,
      {
        fallbackMessage:
          "Não foi possível carregar as parcelas no sistema Financeiro.",
      },
    );
  }

  async listInstallments(filters: {
    sourceSystem: string;
    sourceTenantId: string;
    status?: FinanceiroInstallmentFilterStatus;
    studentName?: string;
    payerName?: string;
    search?: string;
  }) {
    return this.listOpenInstallments(filters);
  }

  async settleCashInstallment(
    installmentId: string,
    payload: FinanceiroSettleCashInstallmentPayload,
  ) {
    return this.request<FinanceiroSettleCashInstallmentResponse>(
      `/receivables/installments/${installmentId}/settle-cash`,
      {
        method: "POST",
        body: JSON.stringify(payload),
        fallbackMessage:
          "Não foi possível registrar a baixa em dinheiro no sistema Financeiro.",
      },
    );
  }
}
