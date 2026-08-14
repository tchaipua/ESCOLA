import {
  BadGatewayException,
  ForbiddenException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { isProductionEnvironment } from "../../common/security/security-config";

const SIGNATURE_VERSION = "v1";
const MAX_RESPONSE_BYTES = 1024 * 1024;
const PUBLIC_BRANCH_LOGO_KEY_PATTERN = /^logos\/filiais\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9._-]+\.(?:png|jpe?g|webp)$/i;
const PUBLIC_COMPANY_LOGO_KEY_PATTERN = /^logos\/empresas\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9._-]+\.(?:png|jpe?g|webp)$/i;

type CachedSettings = {
  value: Record<string, unknown>;
  expiresAt: number;
  staleUntil: number;
};

export type CentralCompanyMasterData = {
  legalName: string;
  tradeName: string;
  documentNumber: string;
  stateRegistration: string;
  municipalRegistration: string;
  address: {
    postalCode: string;
    street: string;
    number: string;
    complement: string;
    district: string;
    city: string;
    state: string;
    country: string;
  };
  contacts: {
    phone: string;
    mobile: string;
    secondaryMobile: string;
    whatsapp: string;
    email: string;
    website: string;
  };
  logoReference: string;
};

export type CentralS3Configuration = {
  description: string;
  endpoint: string;
  customEndpoint: string;
  region: string;
  bucket: string;
  basePath: string;
  defaultAcl: string;
  defaultExpiration: number | null;
  capacityGb: number | null;
  imagesFolderName: string;
  forcePathStyle: boolean;
  useSsl: boolean;
  accessKeyId: string | null;
  secretAccessKey: string | null;
};

export type CentralSmtpConfiguration = {
  description: string;
  host: string;
  port: number;
  secure: boolean;
  authenticate: boolean;
  timeout: number;
  authType: string;
  username: string | null;
  password: string | null;
  fromName: string;
  fromEmail: string;
  replyTo: string;
};

export type CentralTelegramConfiguration = {
  enabled: boolean;
  botUsername: string;
  headerImageUrl: string;
  botToken: string | null;
};

export type CentralFinancialConfiguration = {
  interestRate: number;
  interestGracePeriod: number;
  penaltyRate: number;
  penaltyValue: number;
  penaltyGracePeriod: number;
};

export type CentralCommerceConfiguration = {
  stockControlMode: string;
  stockIntegerQuantityMode: string;
  stockLotControlMode: string;
  stockExpirationControlMode: string;
  stockGridControlMode: string;
  stockNegativeControlMode: string;
  stockClassificationMode: string;
  notifyMinimumStockOnMovement: boolean;
  allowSaleUnitPriceEdit: boolean;
  allowSaleItemDiscount: boolean;
  groupSameProduct: boolean;
  allowProductImageEdit: boolean;
  requirePasswordToRemoveSaleItems: boolean;
  businessType: string;
};

export type CentralTenantConfiguration = {
  tenant: {
    id: string;
    code: string;
    displayName: string;
    status: string;
    company: CentralCompanyMasterData;
  };
  branch: null | {
    id: string;
    tenantId: string;
    branchCode: number;
    displayName: string;
    status: string;
    company: CentralCompanyMasterData;
  };
  effective: {
    scope: "BRANCH" | "TENANT" | "SYSTEM" | "GLOBAL";
    s3: CentralS3Configuration | null;
    smtp: CentralSmtpConfiguration | null;
    receipt: null | { type: string; templateId: string | null };
    telegram: CentralTelegramConfiguration | null;
    financial: CentralFinancialConfiguration | null;
    commerce: CentralCommerceConfiguration | null;
  };
  sources: {
    s3: "BRANCH" | "TENANT" | "SYSTEM" | "GLOBAL" | null;
    smtp: "BRANCH" | "TENANT" | "SYSTEM" | "GLOBAL" | null;
    receipt: "BRANCH" | "TENANT" | "SYSTEM" | "GLOBAL" | null;
    telegram: "BRANCH" | "TENANT" | "SYSTEM" | "GLOBAL" | null;
    financial: "BRANCH" | "TENANT" | "SYSTEM" | "GLOBAL" | null;
    commerce: "BRANCH" | "TENANT" | "SYSTEM" | "GLOBAL" | null;
  };
};

export type CentralTenantBranch = {
  id: string;
  tenantId: string;
  branchCode: number;
  displayName: string;
  status: string;
  company: CentralCompanyMasterData;
};

export type CentralIdentityMembership = {
  tenantId: string;
  tenantCode: string;
  tenantDisplayName: string;
  tenantDocumentNumber: string;
  tenantCity: string;
  tenantLogoUrl?: string;
  roleCode: string;
  branchCodes: number[];
};

export type CentralIdentityDiscovery = {
  authenticated: true;
  status: "SINGLE_TENANT" | "MULTIPLE_TENANTS";
  account: { id: string; displayName: string };
  systemCode: string;
  memberships: CentralIdentityMembership[];
  mfaRequired: false;
};

export type CentralIdentityResolution = {
  authenticated: true;
  account: { id: string; displayName: string };
  tenantId: string;
  systemCode: string;
  databaseAlias: string;
  routeVersion: number;
  effectiveAt: string;
  roleCode: string;
  branchCodes: number[];
  mfaRequired: false;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE_PATTERN = /^[A-Z][A-Z0-9_:-]{0,63}$/;

function validatedCode(value: unknown, field: string) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  if (!CODE_PATTERN.test(normalized)) {
    throw new BadGatewayException(
      `Resposta de identidade inválida da Central (${field}).`,
    );
  }
  return normalized;
}

function validatedUuid(value: unknown, field: string) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new BadGatewayException(
      `Resposta de identidade inválida da Central (${field}).`,
    );
  }
  return normalized;
}

function validatedAccount(value: any) {
  const displayName = String(value?.displayName || "").trim();
  if (!displayName || displayName.length > 200) {
    throw new BadGatewayException(
      "Resposta de identidade inválida da Central (account).",
    );
  }
  return {
    id: validatedUuid(value?.id, "account.id"),
    displayName,
  };
}

function validatedText(
  value: unknown,
  field: string,
  maximumLength = 2_048,
) {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string" || value.length > maximumLength) {
    throw new BadGatewayException(
      `Resposta de configuração inválida da Central (${field}).`,
    );
  }
  return value.trim();
}

function validatedNullableText(
  value: unknown,
  field: string,
  maximumLength = 2_048,
) {
  return value === null || value === undefined
    ? null
    : validatedText(value, field, maximumLength);
}

function validatedBoolean(value: unknown, field: string) {
  if (typeof value !== "boolean") {
    throw new BadGatewayException(
      `Resposta de configuração inválida da Central (${field}).`,
    );
  }
  return value;
}

function validatedNumber(
  value: unknown,
  field: string,
  options: { integer?: boolean; minimum?: number; maximum?: number } = {},
) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    (options.integer && !Number.isInteger(value)) ||
    (options.minimum !== undefined && value < options.minimum) ||
    (options.maximum !== undefined && value > options.maximum)
  ) {
    throw new BadGatewayException(
      `Resposta de configuração inválida da Central (${field}).`,
    );
  }
  return value;
}

function validatedNullableNumber(
  value: unknown,
  field: string,
  options: { integer?: boolean; minimum?: number; maximum?: number } = {},
) {
  return value === null || value === undefined
    ? null
    : validatedNumber(value, field, options);
}

function validatedCompany(value: any, field: string): CentralCompanyMasterData {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadGatewayException(
      `Resposta de configuração inválida da Central (${field}).`,
    );
  }
  const address = value.address;
  const contacts = value.contacts;
  if (
    !address ||
    typeof address !== "object" ||
    Array.isArray(address) ||
    !contacts ||
    typeof contacts !== "object" ||
    Array.isArray(contacts)
  ) {
    throw new BadGatewayException(
      `Resposta de configuração inválida da Central (${field}).`,
    );
  }
  return {
    legalName: validatedText(value.legalName, `${field}.legalName`, 200),
    tradeName: validatedText(value.tradeName, `${field}.tradeName`, 200),
    documentNumber: validatedText(
      value.documentNumber,
      `${field}.documentNumber`,
      64,
    ),
    stateRegistration: validatedText(
      value.stateRegistration,
      `${field}.stateRegistration`,
      64,
    ),
    municipalRegistration: validatedText(
      value.municipalRegistration,
      `${field}.municipalRegistration`,
      64,
    ),
    address: {
      postalCode: validatedText(
        address.postalCode,
        `${field}.address.postalCode`,
        32,
      ),
      street: validatedText(address.street, `${field}.address.street`, 200),
      number: validatedText(address.number, `${field}.address.number`, 40),
      complement: validatedText(
        address.complement,
        `${field}.address.complement`,
        120,
      ),
      district: validatedText(
        address.district,
        `${field}.address.district`,
        120,
      ),
      city: validatedText(address.city, `${field}.address.city`, 120),
      state: validatedText(address.state, `${field}.address.state`, 32),
      country: validatedText(address.country, `${field}.address.country`, 80),
    },
    contacts: {
      phone: validatedText(contacts.phone, `${field}.contacts.phone`, 40),
      mobile: validatedText(contacts.mobile, `${field}.contacts.mobile`, 40),
      secondaryMobile: validatedText(
        contacts.secondaryMobile,
        `${field}.contacts.secondaryMobile`,
        40,
      ),
      whatsapp: validatedText(
        contacts.whatsapp,
        `${field}.contacts.whatsapp`,
        40,
      ),
      email: validatedText(contacts.email, `${field}.contacts.email`, 254),
      website: validatedText(contacts.website, `${field}.contacts.website`, 512),
    },
    logoReference: validatedText(
      value.logoReference,
      `${field}.logoReference`,
      2_048,
    ),
  };
}

function validatedBranch(value: any, field: string): CentralTenantBranch {
  const branchCode = validatedNumber(value?.branchCode, `${field}.branchCode`, {
    integer: true,
    minimum: 1,
    maximum: 999_999,
  });
  const displayName = validatedText(
    value?.displayName,
    `${field}.displayName`,
    200,
  );
  if (!displayName) {
    throw new BadGatewayException(
      `Resposta de configuração inválida da Central (${field}.displayName).`,
    );
  }
  return {
    id: validatedUuid(value?.id, `${field}.id`),
    tenantId: validatedUuid(value?.tenantId, `${field}.tenantId`),
    branchCode,
    displayName,
    status: validatedCode(value?.status, `${field}.status`),
    company: validatedCompany(value?.company, `${field}.company`),
  };
}

function validatedScopeSource(value: unknown, field: string) {
  if (value === null || value === undefined) return null;
  const normalized = validatedCode(value, field);
  if (
    !(["BRANCH", "TENANT", "SYSTEM", "GLOBAL"] as const).includes(
      normalized as any,
    )
  ) {
    throw new BadGatewayException(
      `Resposta de configuração inválida da Central (${field}).`,
    );
  }
  return normalized as "BRANCH" | "TENANT" | "SYSTEM" | "GLOBAL";
}

function validatedNullableObject(value: unknown, field: string) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new BadGatewayException(
      `Resposta de configuração inválida da Central (${field}).`,
    );
  }
  return value as Record<string, unknown>;
}

function validatedTenantConfiguration(
  payload: any,
  expectedTenantId: string,
  expectedBranchCode?: number,
): CentralTenantConfiguration {
  const tenantId = validatedUuid(payload?.tenant?.id, "tenant.id");
  const tenantDisplayName = validatedText(
    payload?.tenant?.displayName,
    "tenant.displayName",
    200,
  );
  if (tenantId !== expectedTenantId || !tenantDisplayName) {
    throw new BadGatewayException(
      "Resposta de configuração inválida da Central (tenant).",
    );
  }
  const branch = payload?.branch
    ? validatedBranch(payload.branch, "branch")
    : null;
  if (
    (expectedBranchCode !== undefined &&
      (!branch || branch.branchCode !== expectedBranchCode)) ||
    (branch && branch.tenantId !== tenantId)
  ) {
    throw new BadGatewayException(
      "Resposta de configuração inválida da Central (branch).",
    );
  }
  const effective = validatedNullableObject(payload?.effective, "effective");
  const sources = validatedNullableObject(payload?.sources, "sources");
  if (!effective || !sources) {
    throw new BadGatewayException(
      "Resposta de configuração inválida da Central.",
    );
  }
  const scope = validatedCode(effective.scope, "effective.scope");
  if (
    !(["BRANCH", "TENANT", "SYSTEM", "GLOBAL"] as const).includes(
      scope as any,
    )
  ) {
    throw new BadGatewayException(
      "Resposta de configuração inválida da Central (effective.scope).",
    );
  }

  const s3 = validatedNullableObject(effective.s3, "effective.s3");
  const smtp = validatedNullableObject(effective.smtp, "effective.smtp");
  const receipt = validatedNullableObject(
    effective.receipt,
    "effective.receipt",
  );
  const telegram = validatedNullableObject(
    effective.telegram,
    "effective.telegram",
  );
  const financial = validatedNullableObject(
    effective.financial,
    "effective.financial",
  );
  const commerce = validatedNullableObject(
    effective.commerce,
    "effective.commerce",
  );

  const mappedS3: CentralS3Configuration | null = s3
    ? {
        description: validatedText(s3.description, "effective.s3.description", 200),
        endpoint: validatedText(s3.endpoint, "effective.s3.endpoint", 2_048),
        customEndpoint: validatedText(
          s3.customEndpoint,
          "effective.s3.customEndpoint",
          2_048,
        ),
        region: validatedText(s3.region, "effective.s3.region", 120),
        bucket: validatedText(s3.bucket, "effective.s3.bucket", 255),
        basePath: validatedText(s3.basePath, "effective.s3.basePath", 1_024),
        defaultAcl: validatedText(s3.defaultAcl, "effective.s3.defaultAcl", 120),
        defaultExpiration: validatedNullableNumber(
          s3.defaultExpiration,
          "effective.s3.defaultExpiration",
          { integer: true, minimum: 0 },
        ),
        capacityGb: validatedNullableNumber(
          s3.capacityGb,
          "effective.s3.capacityGb",
          { minimum: 0 },
        ),
        imagesFolderName: validatedText(
          s3.imagesFolderName,
          "effective.s3.imagesFolderName",
          1_024,
        ),
        forcePathStyle: validatedBoolean(
          s3.forcePathStyle,
          "effective.s3.forcePathStyle",
        ),
        useSsl: validatedBoolean(s3.useSsl, "effective.s3.useSsl"),
        accessKeyId: validatedNullableText(
          s3.accessKeyId,
          "effective.s3.accessKeyId",
          2_048,
        ),
        secretAccessKey: validatedNullableText(
          s3.secretAccessKey,
          "effective.s3.secretAccessKey",
          4_096,
        ),
      }
    : null;

  const mappedSmtp: CentralSmtpConfiguration | null = smtp
    ? {
        description: validatedText(
          smtp.description,
          "effective.smtp.description",
          200,
        ),
        host: validatedText(smtp.host, "effective.smtp.host", 255),
        port: validatedNumber(smtp.port, "effective.smtp.port", {
          integer: true,
          minimum: 1,
          maximum: 65_535,
        }),
        secure: validatedBoolean(smtp.secure, "effective.smtp.secure"),
        authenticate: validatedBoolean(
          smtp.authenticate,
          "effective.smtp.authenticate",
        ),
        timeout: validatedNumber(smtp.timeout, "effective.smtp.timeout", {
          integer: true,
          minimum: 1,
          maximum: 3_600,
        }),
        authType: validatedText(
          smtp.authType,
          "effective.smtp.authType",
          80,
        ),
        username: validatedNullableText(
          smtp.username,
          "effective.smtp.username",
          254,
        ),
        password: validatedNullableText(
          smtp.password,
          "effective.smtp.password",
          4_096,
        ),
        fromName: validatedText(
          smtp.fromName,
          "effective.smtp.fromName",
          200,
        ),
        fromEmail: validatedText(
          smtp.fromEmail,
          "effective.smtp.fromEmail",
          254,
        ),
        replyTo: validatedText(
          smtp.replyTo,
          "effective.smtp.replyTo",
          254,
        ),
      }
    : null;

  const mappedTelegram: CentralTelegramConfiguration | null = telegram
    ? {
        enabled: validatedBoolean(
          telegram.enabled,
          "effective.telegram.enabled",
        ),
        botUsername: validatedText(
          telegram.botUsername,
          "effective.telegram.botUsername",
          200,
        ),
        headerImageUrl: validatedText(
          telegram.headerImageUrl,
          "effective.telegram.headerImageUrl",
          2_048,
        ),
        botToken: validatedNullableText(
          telegram.botToken,
          "effective.telegram.botToken",
          2_048,
        ),
      }
    : null;

  const mappedFinancial: CentralFinancialConfiguration | null = financial
    ? {
        interestRate: validatedNumber(
          financial.interestRate,
          "effective.financial.interestRate",
        ),
        interestGracePeriod: validatedNumber(
          financial.interestGracePeriod,
          "effective.financial.interestGracePeriod",
          { integer: true, minimum: 0 },
        ),
        penaltyRate: validatedNumber(
          financial.penaltyRate,
          "effective.financial.penaltyRate",
        ),
        penaltyValue: validatedNumber(
          financial.penaltyValue,
          "effective.financial.penaltyValue",
        ),
        penaltyGracePeriod: validatedNumber(
          financial.penaltyGracePeriod,
          "effective.financial.penaltyGracePeriod",
          { integer: true, minimum: 0 },
        ),
      }
    : null;

  const mapMode = (value: unknown, field: string) => {
    const mode = validatedCode(value, field);
    if (!(["NO", "YES", "BY_PRODUCT"] as const).includes(mode as any)) {
      throw new BadGatewayException(
        `Resposta de configuração inválida da Central (${field}).`,
      );
    }
    return mode;
  };
  const mapClassificationMode = (value: unknown, field: string) => {
    const mode = validatedCode(value, field);
    if (
      !(["NONE", "GROUP_ONLY", "GROUP_AND_SUBGROUP"] as const).includes(
        mode as any,
      )
    ) {
      throw new BadGatewayException(
        `Resposta de configuração inválida da Central (${field}).`,
      );
    }
    return mode;
  };
  const mappedCommerce: CentralCommerceConfiguration | null = commerce
    ? {
        stockControlMode: mapMode(
          commerce.stockControlMode,
          "effective.commerce.stockControlMode",
        ),
        stockIntegerQuantityMode: mapMode(
          commerce.stockIntegerQuantityMode,
          "effective.commerce.stockIntegerQuantityMode",
        ),
        stockLotControlMode: mapMode(
          commerce.stockLotControlMode,
          "effective.commerce.stockLotControlMode",
        ),
        stockExpirationControlMode: mapMode(
          commerce.stockExpirationControlMode,
          "effective.commerce.stockExpirationControlMode",
        ),
        stockGridControlMode: mapMode(
          commerce.stockGridControlMode,
          "effective.commerce.stockGridControlMode",
        ),
        stockNegativeControlMode: mapMode(
          commerce.stockNegativeControlMode,
          "effective.commerce.stockNegativeControlMode",
        ),
        stockClassificationMode: mapClassificationMode(
          commerce.stockClassificationMode,
          "effective.commerce.stockClassificationMode",
        ),
        notifyMinimumStockOnMovement: validatedBoolean(
          commerce.notifyMinimumStockOnMovement,
          "effective.commerce.notifyMinimumStockOnMovement",
        ),
        allowSaleUnitPriceEdit: validatedBoolean(
          commerce.allowSaleUnitPriceEdit,
          "effective.commerce.allowSaleUnitPriceEdit",
        ),
        allowSaleItemDiscount: validatedBoolean(
          commerce.allowSaleItemDiscount,
          "effective.commerce.allowSaleItemDiscount",
        ),
        groupSameProduct: validatedBoolean(
          commerce.groupSameProduct,
          "effective.commerce.groupSameProduct",
        ),
        allowProductImageEdit: validatedBoolean(
          commerce.allowProductImageEdit,
          "effective.commerce.allowProductImageEdit",
        ),
        requirePasswordToRemoveSaleItems: validatedBoolean(
          commerce.requirePasswordToRemoveSaleItems,
          "effective.commerce.requirePasswordToRemoveSaleItems",
        ),
        businessType: validatedText(
          commerce.businessType,
          "effective.commerce.businessType",
          100,
        ),
      }
    : null;

  return {
    tenant: {
      id: tenantId,
      code: validatedCode(payload.tenant.code, "tenant.code"),
      displayName: tenantDisplayName,
      status: validatedCode(payload.tenant.status, "tenant.status"),
      company: validatedCompany(payload.tenant.company, "tenant.company"),
    },
    branch,
    effective: {
      scope: scope as "BRANCH" | "TENANT" | "SYSTEM" | "GLOBAL",
      s3: mappedS3,
      smtp: mappedSmtp,
      receipt: receipt
        ? {
            type: validatedText(receipt.type, "effective.receipt.type", 100),
            templateId:
              receipt.templateId === null || receipt.templateId === undefined
                ? null
                : validatedText(
                    receipt.templateId,
                    "effective.receipt.templateId",
                    255,
                  ),
          }
        : null,
      telegram: mappedTelegram,
      financial: mappedFinancial,
      commerce: mappedCommerce,
    },
    sources: {
      s3: validatedScopeSource(sources.s3, "sources.s3"),
      smtp: validatedScopeSource(sources.smtp, "sources.smtp"),
      receipt: validatedScopeSource(sources.receipt, "sources.receipt"),
      telegram: validatedScopeSource(sources.telegram, "sources.telegram"),
      financial: validatedScopeSource(sources.financial, "sources.financial"),
      commerce: validatedScopeSource(sources.commerce, "sources.commerce"),
    },
  };
}

function rfc3986(value: string) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function canonicalizeCentralTarget(target: string) {
  const url = new URL(target, "https://central.msinfor.invalid");
  const query = Array.from(url.searchParams.entries())
    .map(([key, value]) => [rfc3986(key), rfc3986(value)] as const)
    .sort(([keyA, valueA], [keyB, valueB]) =>
      keyA < keyB
        ? -1
        : keyA > keyB
          ? 1
          : valueA < valueB
            ? -1
            : valueA > valueB
              ? 1
              : 0,
    )
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return `${url.pathname}${query ? `?${query}` : ""}`;
}

async function readLimitedJson(response: Response) {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    const value = Number(declaredLength);
    if (
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value > MAX_RESPONSE_BYTES
    ) {
      throw new BadGatewayException("Resposta inválida da Central MSINFOR.");
    }
  }
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new BadGatewayException(
          "Resposta inválida da Central MSINFOR.",
        );
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  if (!total) return null;
  try {
    return JSON.parse(Buffer.concat(chunks, total).toString("utf8"));
  } catch {
    throw new BadGatewayException("Resposta inválida da Central MSINFOR.");
  }
}

@Injectable()
export class MsInforCentralSettingsClient {
  private cache?: CachedSettings;

  resolvePublicLogoUrl(
    reference?: string | null,
    scope: "branch" | "company" = "company",
  ) {
    const normalized = String(reference || "").trim();
    if (!normalized) return null;
    if (/^https:\/\//i.test(normalized)) return normalized;

    const pattern =
      scope === "branch"
        ? PUBLIC_BRANCH_LOGO_KEY_PATTERN
        : PUBLIC_COMPANY_LOGO_KEY_PATTERN;
    if (!pattern.test(normalized)) return null;

    try {
      const base = new URL(`${this.baseUrl}/`);
      if (isProductionEnvironment() && base.protocol !== "https:") return null;
      const target = new URL(
        `public/${scope === "branch" ? "branch-logo" : "company-logo"}`,
        base,
      );
      target.searchParams.set("key", normalized);
      return target.toString();
    } catch {
      return null;
    }
  }

  async synchronizeTechnicalIdentity(payload: {
    login: string;
    email: string;
    displayName: string;
    credential?: string;
    externalSubjectId: string;
    tenantId: string;
    branchCodes: number[];
    roleCode: string;
    enabled: boolean;
  }) {
    return this.request("/identity/technical/synchronize", {
      method: "POST",
      json: payload,
    });
  }

  private get baseUrl() {
    return String(
      process.env.MSINFOR_CENTRAL_API_URL ||
        "http://localhost:3201/api/v1",
    )
      .trim()
      .replace(/\/+$/, "");
  }

  private get systemId() {
    const value = String(
      process.env.MSINFOR_CENTRAL_SYSTEM_ID || "ESCOLA",
    )
      .trim()
      .toUpperCase();
    if (!/^[A-Z][A-Z0-9_:-]{0,63}$/.test(value)) {
      throw new ServiceUnavailableException(
        "Identidade técnica da Central inválida.",
      );
    }
    return value;
  }

  private buildTarget(path: string) {
    const rawPathname = path.split("?", 1)[0];
    if (
      !path.startsWith("/") ||
      path.startsWith("//") ||
      path.includes("\\") ||
      rawPathname.includes("%") ||
      rawPathname
        .split("/")
        .some((segment) => segment === "." || segment === "..") ||
      /[\u0000-\u001f\u007f]/.test(path)
    ) {
      throw new Error("Rota técnica da Central inválida.");
    }
    const base = new URL(`${this.baseUrl}/`);
    if (
      !["http:", "https:"].includes(base.protocol) ||
      base.username ||
      base.password ||
      base.search ||
      base.hash
    ) {
      throw new ServiceUnavailableException(
        "URL técnica da Central inválida.",
      );
    }
    const target = new URL(path.replace(/^\/+/, ""), base);
    const basePath = base.pathname.endsWith("/")
      ? base.pathname
      : `${base.pathname}/`;
    if (
      target.origin !== base.origin ||
      !target.pathname.startsWith(basePath) ||
      target.hash
    ) {
      throw new Error("Rota técnica da Central inválida.");
    }
    if (isProductionEnvironment() && target.protocol !== "https:") {
      throw new ServiceUnavailableException(
        "Transporte técnico da Central deve usar HTTPS.",
      );
    }
    return target;
  }

  private async request(
    path: string,
    input: {
      method?: string;
      json?: unknown;
      identityOperation?: boolean;
    } = {},
  ) {
    const secret = String(
      process.env.MSINFOR_CENTRAL_SYSTEM_KEY || "",
    ).trim();
    if (Buffer.byteLength(secret, "utf8") < 32) {
      throw new ServiceUnavailableException(
        "Credencial técnica da Central não configurada.",
      );
    }
    const method = String(input.method || "GET").trim().toUpperCase();
    if (!["GET", "POST"].includes(method)) {
      throw new Error("Método técnico da Central não permitido.");
    }
    const body =
      input.json === undefined
        ? Buffer.alloc(0)
        : Buffer.from(JSON.stringify(input.json), "utf8");
    const target = this.buildTarget(path);
    const timestamp = Date.now().toString();
    const nonce = randomBytes(24).toString("base64url");
    const bodyHash = createHash("sha256").update(body).digest("hex");
    const canonicalPayload = [
      SIGNATURE_VERSION,
      this.systemId,
      method,
      canonicalizeCentralTarget(`${target.pathname}${target.search}`),
      timestamp,
      nonce,
      bodyHash,
    ].join("\n");
    const signature = createHmac("sha256", secret)
      .update(canonicalPayload)
      .digest("hex");

    let response: Response;
    try {
      response = await fetch(target, {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(8_000),
        headers: {
          Accept: "application/json",
          ...(body.length ? { "Content-Type": "application/json" } : {}),
          "x-msinfor-signature-version": SIGNATURE_VERSION,
          "x-msinfor-system-id": this.systemId,
          "x-msinfor-timestamp": timestamp,
          "x-msinfor-nonce": nonce,
          "x-msinfor-content-sha256": bodyHash,
          "x-msinfor-signature": signature,
        },
        body: body.length ? body : undefined,
      });
    } catch {
      throw new BadGatewayException("A Central MSINFOR está indisponível.");
    }
    const payload = await readLimitedJson(response);
    if (!response.ok) {
      if (input.identityOperation) {
        if (response.status === 401) {
          throw new UnauthorizedException(
            "Não foi possível autenticar a conta.",
          );
        }
        if (response.status === 403) {
          if (
            String(payload?.error || "").toUpperCase() ===
            "EMAIL_CONFIRMATION_REQUIRED"
          ) {
            throw new HttpException(
              {
                statusCode: 403,
                error: "EMAIL_CONFIRMATION_REQUIRED",
                message:
                  "Seu e-mail ainda precisa ser confirmado para liberar o acesso.",
              },
              403,
            );
          }
          throw new ForbiddenException(
            "A conta não possui acesso ativo à Escola.",
          );
        }
        if (
          response.status === 428 &&
          String(payload?.error || "").toUpperCase() === "MFA_REQUIRED"
        ) {
          throw new HttpException(
            {
              statusCode: 428,
              error: "MFA_REQUIRED",
              message:
                "A conta exige uma etapa adicional de autenticação no MSINFOR Central.",
            },
            428,
          );
        }
        if (response.status === 429 || response.status === 503) {
          throw new ServiceUnavailableException(
            "A identidade do MSINFOR Central está temporariamente indisponível.",
          );
        }
      }
      const upstreamMessage = isProductionEnvironment()
        ? ""
        : (Array.isArray(payload?.message)
            ? payload.message.join("; ")
            : String(payload?.message || ""))
          .replace(/[\r\n]+/g, " ")
          .slice(0, 300);
      throw new BadGatewayException(
        `A Central MSINFOR recusou a operação técnica (HTTP ${response.status})${upstreamMessage ? `: ${upstreamMessage}` : "."}`,
      );
    }
    return payload;
  }

  async authenticateAndResolve(
    login: string,
    credential: string,
    tenantId?: string,
    branchCode?: number,
  ): Promise<CentralIdentityDiscovery | CentralIdentityResolution> {
    const normalizedLogin = String(login || "").trim().toLowerCase();
    const normalizedCredential = String(credential || "");
    const selectedTenantId = tenantId
      ? validatedUuid(tenantId, "tenantId")
      : undefined;
    if (
      !normalizedLogin ||
      normalizedLogin.length > 254 ||
      !normalizedCredential ||
      normalizedCredential.length > 256
    ) {
      throw new UnauthorizedException(
        "Não foi possível autenticar a conta.",
      );
    }

    const payload: any = await this.request(
      "/identity/technical/authenticate-and-resolve",
      {
        method: "POST",
        json: {
          login: normalizedLogin,
          credential: normalizedCredential,
          ...(selectedTenantId ? { tenantId: selectedTenantId } : {}),
          ...(branchCode !== undefined
            ? { branchCode: String(branchCode) }
            : {}),
        },
        identityOperation: true,
      },
    );
    if (
      payload?.authenticated !== true ||
      payload?.mfaRequired !== false ||
      validatedCode(payload?.systemCode, "systemCode") !== this.systemId
    ) {
      throw new BadGatewayException(
        "Resposta de identidade inválida da Central.",
      );
    }
    const account = validatedAccount(payload.account);

    if (!selectedTenantId) {
      if (
        !["SINGLE_TENANT", "MULTIPLE_TENANTS"].includes(payload.status) ||
        !Array.isArray(payload.memberships) ||
        payload.memberships.length < 1 ||
        payload.memberships.length > 1_000
      ) {
        throw new BadGatewayException(
          "Resposta de descoberta inválida da Central.",
        );
      }
      const memberships: CentralIdentityMembership[] =
        payload.memberships.map(
        (membership: any): CentralIdentityMembership => {
          const tenantDisplayName = String(
            membership?.tenantDisplayName || "",
          ).trim();
          if (!tenantDisplayName || tenantDisplayName.length > 200) {
            throw new BadGatewayException(
              "Resposta de descoberta inválida da Central.",
            );
          }
          return {
            tenantId: validatedUuid(
              membership?.tenantId,
              "membership.tenantId",
            ),
            tenantCode: validatedCode(
              membership?.tenantCode,
              "membership.tenantCode",
            ),
            tenantDisplayName,
            tenantDocumentNumber: String(
              membership?.tenantDocumentNumber || "",
            ).trim(),
            tenantCity: String(membership?.tenantCity || "").trim(),
            ...(String(membership?.tenantLogoUrl || "").trim()
              ? { tenantLogoUrl: String(membership.tenantLogoUrl).trim() }
              : {}),
            roleCode: validatedCode(
              membership?.roleCode,
              "membership.roleCode",
            ),
            branchCodes: Array.isArray(membership?.branchCodes)
              ? membership.branchCodes.map((value: unknown) => validatedNumber(value, "membership.branchCodes", { integer: true, minimum: 1, maximum: 999_999 }))
              : (() => { throw new BadGatewayException("Resposta de descoberta inválida da Central."); })(),
          };
        },
      );
      const tenantIds = new Set(
        memberships.map((membership) => membership.tenantId),
      );
      if (
        tenantIds.size !== memberships.length ||
        (payload.status === "SINGLE_TENANT" &&
          memberships.length !== 1) ||
        (payload.status === "MULTIPLE_TENANTS" &&
          memberships.length < 2)
      ) {
        throw new BadGatewayException(
          "Resposta de descoberta inválida da Central.",
        );
      }
      return {
        authenticated: true,
        status: payload.status,
        account,
        systemCode: this.systemId,
        memberships,
        mfaRequired: false,
      };
    }

    const resolvedTenantId = validatedUuid(payload.tenantId, "tenantId");
    const routeVersion = Number(payload.routeVersion);
    const effectiveAt = String(payload.effectiveAt || "").trim();
    if (
      resolvedTenantId !== selectedTenantId ||
      !Number.isSafeInteger(routeVersion) ||
      routeVersion < 1 ||
      !effectiveAt ||
      Number.isNaN(Date.parse(effectiveAt))
    ) {
      throw new BadGatewayException(
        "Resposta de resolução inválida da Central.",
      );
    }
    return {
      authenticated: true,
      account,
      tenantId: resolvedTenantId,
      systemCode: this.systemId,
      databaseAlias: validatedCode(
        payload.databaseAlias,
        "databaseAlias",
      ),
      routeVersion,
      effectiveAt,
      roleCode: validatedCode(payload.roleCode, "roleCode"),
      branchCodes: Array.isArray(payload.branchCodes)
        ? payload.branchCodes.map((value: unknown) => validatedNumber(value, "branchCodes", { integer: true, minimum: 1, maximum: 999_999 }))
        : (() => { throw new BadGatewayException("Resposta de resolução inválida da Central."); })(),
      mfaRequired: false,
    };
  }

  async findEffective() {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) return this.cache.value;
    const secret = String(
      process.env.MSINFOR_CENTRAL_SYSTEM_KEY || "",
    ).trim();
    if (!secret) return null;
    try {
      const value = (await this.request(
        "/global-settings/effective",
      )) as Record<string, unknown>;
      this.cache = {
        value,
        expiresAt: now + 60_000,
        staleUntil: now + 15 * 60_000,
      };
      return value;
    } catch (error) {
      throw error;
    }
  }

  async findTenantConfiguration(
    tenantIdRaw: string,
    branchCodeRaw?: number,
  ): Promise<CentralTenantConfiguration> {
    const tenantId = validatedUuid(tenantIdRaw, "tenantId");
    const branchCode =
      branchCodeRaw === undefined
        ? undefined
        : validatedNumber(branchCodeRaw, "branchCode", {
            integer: true,
            minimum: 1,
            maximum: 999_999,
          });
    const suffix =
      branchCode === undefined ? "" : `?branchCode=${branchCode}`;
    const payload = await this.request(
      `/control-plane/technical/tenants/${tenantId}/configuration${suffix}`,
    );
    return validatedTenantConfiguration(payload, tenantId, branchCode);
  }

  async listTenantBranches(
    tenantIdRaw: string,
  ): Promise<{ tenantId: string; items: CentralTenantBranch[] }> {
    const tenantId = validatedUuid(tenantIdRaw, "tenantId");
    const payload: any = await this.request(
      `/control-plane/technical/tenants/${tenantId}/branches`,
    );
    if (
      validatedUuid(payload?.tenantId, "tenantId") !== tenantId ||
      !Array.isArray(payload?.items) ||
      payload.items.length > 10_000
    ) {
      throw new BadGatewayException(
        "Resposta de filiais inválida da Central.",
      );
    }
    const items = payload.items.map((item: any, index: number) =>
      validatedBranch(item, `items[${index}]`),
    );
    const codes = new Set(items.map((item: CentralTenantBranch) => item.branchCode));
    const ids = new Set(items.map((item: CentralTenantBranch) => item.id));
    if (codes.size !== items.length || ids.size !== items.length) {
      throw new BadGatewayException(
        "Resposta de filiais inválida da Central (duplicidade).",
      );
    }
    return { tenantId, items };
  }
}
