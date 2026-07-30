import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { ICurrentUser } from "../../common/decorators/current-user.decorator";
import { PrismaService } from "../../prisma/prisma.service";
import {
  FinanceiroInternalClient,
} from "./financeiro-internal.client";
import {
  authorizeFinanceiroGatewayRequest,
  expectedFinanceiroBinaryContentType,
} from "./financeiro-gateway.policy";
import { CentralTenantConfigurationService } from "../msinfor-central/central-tenant-configuration.service";

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
      registeredPersonId?: string;
      registeredPersonSourceType?: string;
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

export type FinanceiroCustomerSyncPayload = {
  requestedBy?: string;
  companyName?: string;
  companyDocument?: string;
  sourceSystem: string;
  sourceTenantId: string;
  sourceBranchCode?: number;
  customers: Array<{
    externalEntityType: "ALUNO" | "RESPONSAVEL";
    externalEntityId: string;
    registeredPersonId?: string;
    registeredPersonSourceType?: string;
    name: string;
    document?: string;
    email?: string;
    phone?: string;
    addressLine1?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  }>;
};

export type FinanceiroSourceIntegrationSettingsPayload = {
  requestedBy?: string;
  sourceSystem: string;
  sourceTenantId: string;
  sourceBranchCode: number;
  activeBranchCodes?: number[];
  companyName?: string;
  companyDocument?: string;
  branchName?: string;
  branchLegalName?: string;
  branchTradeName?: string;
  branchDocument?: string;
  branchStreet?: string;
  branchNumber?: string;
  branchComplement?: string;
  branchNeighborhood?: string;
  branchCity?: string;
  branchState?: string;
  branchPostalCode?: string;
  branchPhone?: string;
  branchEmail?: string;
  s3Endpoint?: string;
  s3Region?: string;
  s3Bucket?: string;
  s3BasePrefix?: string;
  s3AccessKey?: string;
  s3SecretKey?: string;
  s3ForcePathStyle?: boolean;
  s3CapacityGb?: number;
  s3ImagesFolderName?: string;
  storageDefaultAcl?: string;
  storageDefaultExpiration?: number;
  storageSourceScope?: "SOFTHOUSE" | "COMPANY" | "BRANCH";
  smtpHost?: string;
  smtpPort?: number;
  smtpTimeout?: number;
  smtpAuthenticate?: boolean;
  smtpSecure?: boolean;
  smtpAuthType?: string;
  smtpEmail?: string;
  smtpPassword?: string;
  smtpSourceScope?: "SOFTHOUSE" | "COMPANY" | "BRANCH";
  telegramEnabled?: boolean;
  telegramBotToken?: string;
  telegramBotUsername?: string;
  telegramSourceScope?: "COMPANY" | "BRANCH";
  interestRate?: number | null;
  interestGracePeriod?: number | null;
  penaltyRate?: number | null;
  penaltyValue?: number | null;
  penaltyGracePeriod?: number | null;
  stockControlMode?: "NO" | "YES" | "BY_PRODUCT";
  stockIntegerQuantityMode?: "NO" | "YES" | "BY_PRODUCT";
  stockLotControlMode?: "NO" | "YES" | "BY_PRODUCT";
  stockExpirationControlMode?: "NO" | "YES" | "BY_PRODUCT";
  stockGridControlMode?: "NO" | "YES" | "BY_PRODUCT";
  stockNegativeControlMode?: "NO" | "YES" | "BY_PRODUCT";
  allowSaleUnitPriceEdit?: boolean;
  allowSaleItemDiscount?: boolean;
  groupSameProduct?: boolean;
  allowProductImageEdit?: boolean;
  requirePasswordToRemoveSaleItems?: boolean;
};

export type FinanceiroCustomerSyncResponse = {
  synchronizedCustomers: number;
  inactivatedCustomers: number;
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

export type FinanceiroUpdateInstallmentPayload = {
  requestedBy?: string;
  sourceSystem: string;
  sourceTenantId: string;
  dueDate?: string;
  amount?: number;
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

const SOURCE_SYSTEM = "ESCOLA";
const AUTHORITY_FIELDS = new Set([
  "sourceSystem",
  "sourceTenantId",
  "tenantId",
  "schoolId",
  "sourceBranchCode",
  "branchCode",
  "sourceUserId",
  "requestedBy",
  "cashierUserId",
  "cashierDisplayName",
  "companyId",
  "branchId",
  "userRole",
  "role",
  "scopes",
  "permissions",
  "companyName",
  "companyDocument",
]);
const AUTHORITY_FIELDS_LOWERCASE = new Set(
  Array.from(AUTHORITY_FIELDS, (field) => field.toLowerCase()),
);

type FinanceiroRuntimeContext = Awaited<
  ReturnType<FinanceiroService["buildRuntimeContext"]>
>;

function canonicalizeDeclaredContext(
  value: unknown,
  context: FinanceiroRuntimeContext,
  visited = new WeakSet<object>(),
): unknown {
  if (!value || typeof value !== "object") return value;
  if (visited.has(value)) {
    throw new BadRequestException("Corpo circular não permitido.");
  }
  visited.add(value);
  if (Array.isArray(value)) {
    const result = value.map((item) =>
      canonicalizeDeclaredContext(item, context, visited),
    );
    visited.delete(value);
    return result;
  }

  const result: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (!AUTHORITY_FIELDS_LOWERCASE.has(key.toLowerCase())) {
      result[key] = canonicalizeDeclaredContext(
        nestedValue,
        context,
        visited,
      );
      continue;
    }
    if (!AUTHORITY_FIELDS.has(key)) {
      // Variações de caixa não fazem parte do contrato e são removidas.
      continue;
    }
    switch (key) {
      case "sourceSystem":
        result[key] = SOURCE_SYSTEM;
        break;
      case "sourceTenantId":
        result[key] = context.sourceTenantId;
        break;
      case "sourceBranchCode":
      case "branchCode":
        result[key] = context.sourceBranchCode;
        break;
      case "sourceUserId":
      case "requestedBy":
      case "cashierUserId":
        result[key] = context.cashierUserId;
        break;
      case "cashierDisplayName":
        result[key] = context.cashierDisplayName;
        break;
      case "companyName":
        result[key] = context.companyName;
        break;
      case "companyDocument":
        result[key] = context.companyDocument || undefined;
        break;
      case "companyId":
      case "branchId":
      case "tenantId":
      case "schoolId":
      case "userRole":
      case "role":
      case "scopes":
      case "permissions":
        // IDs internos e autorização são resolvidos pelo contexto HMAC.
        break;
    }
  }
  visited.delete(value);
  return result;
}

@Injectable()
export class FinanceiroService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financeiroClient: FinanceiroInternalClient,
    private readonly centralConfiguration: CentralTenantConfigurationService,
  ) {}

  async buildRuntimeContext(currentUser: ICurrentUser) {
    const requestedBranchCode = Number(currentUser.branchCode);
    const branchCode =
      requestedBranchCode >= 1
        ? requestedBranchCode
        : (await this.centralConfiguration.listBranches(currentUser.tenantId))[0]
            ?.branchCode;
    if (!branchCode) {
      throw new NotFoundException("Nenhuma filial ativa foi localizada.");
    }
    const central = await this.centralConfiguration.findConfiguration(
      currentUser.tenantId,
      branchCode,
    );
    const company = this.centralConfiguration.mergeCompany(
      central.tenant.company,
      central.branch?.company,
    );
    const commerce = central.effective.commerce;
    return {
      embedded: true,
      sourceSystem: SOURCE_SYSTEM,
      sourceTenantId: currentUser.tenantId.toUpperCase(),
      sourceBranchCode: branchCode,
      stockControlMode: commerce?.stockControlMode || "NO",
      stockIntegerQuantityMode: commerce?.stockIntegerQuantityMode || "NO",
      stockLotControlMode: commerce?.stockLotControlMode || "NO",
      stockExpirationControlMode:
        commerce?.stockExpirationControlMode || "NO",
      stockGridControlMode: commerce?.stockGridControlMode || "NO",
      stockNegativeControlMode: commerce?.stockNegativeControlMode || "NO",
      companyName:
        company.tradeName ||
        company.legalName ||
        central.tenant.displayName,
      companyDocument: company.documentNumber || null,
      logoUrl: company.logoReference || null,
      cashierUserId: currentUser.userId,
      cashierDisplayName:
        currentUser.name || currentUser.email || currentUser.userId,
      userRole: currentUser.role,
      permissions: [...(currentUser.permissions || [])],
    };
  }

  async proxyGatewayRequest(
    currentUser: ICurrentUser,
    input: {
      method: string;
      path: string;
      searchParams: URLSearchParams;
      body?: unknown;
      bodyBytes?: Buffer;
      contentType?: string;
      idempotencyKey?: string;
    },
  ) {
    authorizeFinanceiroGatewayRequest(
      currentUser,
      input.method,
      input.path,
    );
    const context = await this.buildRuntimeContext(currentUser);
    const searchParams = new URLSearchParams(input.searchParams);
    const replacements: Record<string, string> = {
      sourceSystem: SOURCE_SYSTEM,
      sourceTenantId: context.sourceTenantId,
      sourceBranchCode: String(context.sourceBranchCode),
      branchCode: String(context.sourceBranchCode),
      sourceUserId: context.cashierUserId,
      requestedBy: context.cashierUserId,
      cashierUserId: context.cashierUserId,
      cashierDisplayName: context.cashierDisplayName,
      companyName: context.companyName,
      companyDocument: context.companyDocument || "",
    };
    const replacementByLowercase = new Map(
      Object.entries(replacements).map(([key, value]) => [
        key.toLowerCase(),
        { key, value },
      ]),
    );
    const blockedQueryNames = new Set([
      ...Array.from(replacementByLowercase.keys()),
      "companyid",
      "branchid",
      "tenantid",
      "schoolid",
      "userrole",
      "role",
      "permissions",
      "scopes",
    ]);
    for (const key of Array.from(searchParams.keys())) {
      const normalizedKey = key.toLowerCase();
      if (!blockedQueryNames.has(normalizedKey)) continue;
      searchParams.delete(key);
    }
    const gatewayPath = input.path.startsWith("/")
      ? input.path
      : `/${input.path}`;
    const requiresBranchInQuery = [
      "/s3-control",
      "/supertef",
      "/printing",
    ].some(
      (prefix) =>
        gatewayPath === prefix || gatewayPath.startsWith(`${prefix}/`),
    );
    const protectedQueryReplacements = [
      replacementByLowercase.get("sourcesystem")!,
      replacementByLowercase.get("sourcetenantid")!,
      ...(requiresBranchInQuery
        ? [replacementByLowercase.get("sourcebranchcode")!]
        : []),
    ];
    for (const replacement of protectedQueryReplacements) {
      if (replacement.value) {
        searchParams.set(replacement.key, replacement.value);
      }
    }

    const query = searchParams.toString();
    const path = `${input.path}${query ? `?${query}` : ""}`;
    const headers: Record<string, string> = {};
    if (input.idempotencyKey) {
      headers["x-idempotency-key"] = input.idempotencyKey;
    }
    const expectedBinaryContentType =
      expectedFinanceiroBinaryContentType(input.method, input.path);
    const financeCurrentUser =
      currentUser.branchCode === context.sourceBranchCode
        ? currentUser
        : { ...currentUser, branchCode: context.sourceBranchCode };
    return this.financeiroClient.request({
      method: input.method,
      path,
      currentUser: financeCurrentUser,
      ...(input.bodyBytes
        ? {
            bodyBytes: input.bodyBytes,
            contentType: input.contentType,
          }
        : input.body !== undefined
          ? { json: canonicalizeDeclaredContext(input.body, context) }
          : {}),
      headers,
      ...(expectedBinaryContentType
        ? { expectedBinaryContentType }
        : {}),
    });
  }

  private async request<T>(
    currentUser: ICurrentUser,
    path: string,
    options: {
      method?: string;
      json?: unknown;
      technicalScopes?: readonly "SOURCE_SETTINGS_SYNC"[];
    } = {},
  ) {
    const context = await this.buildRuntimeContext(currentUser);
    const financeCurrentUser =
      currentUser.branchCode === context.sourceBranchCode
        ? currentUser
        : { ...currentUser, branchCode: context.sourceBranchCode };
    return this.financeiroClient.request<T>({
      path,
      method: options.method,
      currentUser: financeCurrentUser,
      ...(options.json !== undefined
        ? { json: canonicalizeDeclaredContext(options.json, context) }
        : {}),
      ...(options.technicalScopes
        ? { technicalScopes: options.technicalScopes }
        : {}),
    });
  }

  async importReceivables(
    currentUser: ICurrentUser,
    payload: FinanceiroImportPayload,
  ) {
    return this.request<FinanceiroImportResponse>(
      currentUser,
      "/receivables/import",
      {
      method: "POST",
        json: payload,
      },
    );
  }

  async syncCustomers(
    currentUser: ICurrentUser,
    payload: FinanceiroCustomerSyncPayload,
  ) {
    return this.request<FinanceiroCustomerSyncResponse>(
      currentUser,
      "/customers/sync",
      {
      method: "POST",
        json: payload,
      },
    );
  }

  async syncSourceIntegrationSettings(
    currentUser: ICurrentUser,
    payload: FinanceiroSourceIntegrationSettingsPayload,
  ) {
    return this.request<{
        companyId: string;
        branchCode: number;
        s3Configured: boolean;
        smtpConfigured: boolean;
        telegramConfigured: boolean;
        synchronizedAt: string;
      }>(
      currentUser,
      "/companies/sync-source-integration-settings",
      {
        method: "POST",
        json: payload,
        technicalScopes: ["SOURCE_SETTINGS_SYNC"],
      },
    );
  }

  async existingBusinessKeys(
    currentUser: ICurrentUser,
    payload: {
      sourceSystem: string;
      sourceTenantId: string;
      businessKeys: string[];
    },
  ) {
    return this.request<FinanceiroExistingBusinessKeysResponse>(
      currentUser,
      "/receivables/existing-business-keys",
      {
        method: "POST",
        json: payload,
      },
    );
  }

  async listReceivableBatches(
    currentUser: ICurrentUser,
    _filters: {
      sourceSystem: string;
      sourceTenantId: string;
    },
  ) {
    const query = new URLSearchParams({
      sourceSystem: SOURCE_SYSTEM,
      sourceTenantId: currentUser.tenantId.toUpperCase(),
    });

    return this.request<FinanceiroBatchSummary[]>(
      currentUser,
      `/receivables/batches?${query.toString()}`,
    );
  }

  async getReceivableBatch(
    currentUser: ICurrentUser,
    batchId: string,
    _filters: {
      sourceSystem: string;
      sourceTenantId: string;
    },
  ) {
    const query = new URLSearchParams({
      sourceSystem: SOURCE_SYSTEM,
      sourceTenantId: currentUser.tenantId.toUpperCase(),
    });

    return this.request<FinanceiroBatchDetails>(
      currentUser,
      `/receivables/batches/${batchId}?${query.toString()}`,
    );
  }

  async getCurrentCashSession(
    currentUser: ICurrentUser,
    _filters: {
      sourceSystem: string;
      sourceTenantId: string;
      cashierUserId: string;
    },
  ) {
    const query = new URLSearchParams({
      sourceSystem: SOURCE_SYSTEM,
      sourceTenantId: currentUser.tenantId.toUpperCase(),
      cashierUserId: currentUser.userId,
    });

    return this.request<FinanceiroCashSession | null>(
      currentUser,
      `/cash-sessions/current?${query.toString()}`,
    );
  }

  async openCashSession(
    currentUser: ICurrentUser,
    payload: FinanceiroOpenCashSessionPayload,
  ) {
    return this.request<FinanceiroCashSession>(
      currentUser,
      "/cash-sessions/open",
      { method: "POST", json: payload },
    );
  }

  async closeCurrentCashSession(
    currentUser: ICurrentUser,
    payload: FinanceiroCloseCurrentCashSessionPayload,
  ) {
    return this.request<FinanceiroCashSession>(
      currentUser,
      "/cash-sessions/close-current",
      { method: "POST", json: payload },
    );
  }

  async listOpenInstallments(
    currentUser: ICurrentUser,
    filters: {
      sourceSystem: string;
      sourceTenantId: string;
      status?: FinanceiroInstallmentFilterStatus;
      studentName?: string;
      payerName?: string;
      search?: string;
    },
  ) {
    const query = new URLSearchParams({
      sourceSystem: SOURCE_SYSTEM,
      sourceTenantId: currentUser.tenantId.toUpperCase(),
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
      currentUser,
      `/receivables/installments?${query.toString()}`,
    );
  }

  async listInstallments(
    currentUser: ICurrentUser,
    filters: {
      sourceSystem: string;
      sourceTenantId: string;
      status?: FinanceiroInstallmentFilterStatus;
      studentName?: string;
      payerName?: string;
      search?: string;
    },
  ) {
    return this.listOpenInstallments(currentUser, filters);
  }

  async settleCashInstallment(
    currentUser: ICurrentUser,
    installmentId: string,
    payload: FinanceiroSettleCashInstallmentPayload,
  ) {
    return this.request<FinanceiroSettleCashInstallmentResponse>(
      currentUser,
      `/receivables/installments/${installmentId}/settle-cash`,
      {
        method: "POST",
        json: payload,
      },
    );
  }

  async updateInstallment(
    currentUser: ICurrentUser,
    installmentId: string,
    payload: FinanceiroUpdateInstallmentPayload,
  ) {
    return this.request<FinanceiroInstallment>(
      currentUser,
      `/receivables/installments/${installmentId}`,
      {
        method: "PATCH",
        json: payload,
      },
    );
  }
}
