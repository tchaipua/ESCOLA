require("dotenv/config");

const { createHash, createHmac, randomBytes } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { isEmail } = require("class-validator");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INVALID_SECRET = Symbol("INVALID_SECRET");

function canonicalTarget(target) {
  const url = new URL(target, "https://central.msinfor.invalid");
  const encode = (value) =>
    encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
  const query = Array.from(url.searchParams.entries())
    .map(([key, value]) => [encode(key), encode(value)])
    .sort(
      ([leftKey, leftValue], [rightKey, rightValue]) =>
        leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue),
    )
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return `${url.pathname}${query ? `?${query}` : ""}`;
}

function technicalConfiguration() {
  const baseUrl = String(
    process.env.MSINFOR_CENTRAL_API_URL || "http://localhost:3201/api/v1",
  )
    .trim()
    .replace(/\/+$/, "");
  const systemId = String(
    process.env.MSINFOR_CENTRAL_SYSTEM_ID || "ESCOLA",
  )
    .trim()
    .toUpperCase();
  const keyFile = String(
    process.env.MSINFOR_CENTRAL_SYSTEM_KEY_FILE || "",
  ).trim();
  const secret = String(
    process.env.MSINFOR_CENTRAL_SYSTEM_KEY ||
      (keyFile ? readFileSync(keyFile, "utf8") : ""),
  ).trim();
  if (
    !/^https?:\/\//i.test(baseUrl) ||
    systemId !== "ESCOLA" ||
    Buffer.byteLength(secret, "utf8") < 32
  ) {
    throw new Error(
      "A integração HMAC com o MSINFOR Central não está configurada.",
    );
  }
  return { baseUrl, systemId, secret };
}

function optional(value) {
  const normalized = String(value || "").trim();
  return normalized || undefined;
}

function recordOmission(diagnostics, path, reason) {
  diagnostics?.push({ path, reason });
  return undefined;
}

function boundedText(value, maximumLength, path, diagnostics) {
  const normalized = optional(value);
  if (normalized === undefined) return undefined;
  if (normalized.length > maximumLength) {
    return recordOmission(diagnostics, path, `MAX_LENGTH_${maximumLength}`);
  }
  return normalized;
}

function boundedEmail(value, path, diagnostics) {
  const normalized = boundedText(value, 254, path, diagnostics);
  if (normalized === undefined) return undefined;
  if (!isEmail(normalized)) {
    return recordOmission(diagnostics, path, "INVALID_EMAIL");
  }
  return normalized;
}

function boundedInteger(value, minimum, maximum, path, diagnostics) {
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = Number(value);
  if (
    !Number.isInteger(normalized) ||
    normalized < minimum ||
    (maximum !== undefined && normalized > maximum)
  ) {
    return recordOmission(diagnostics, path, "INVALID_INTEGER");
  }
  return normalized;
}

function boundedNumber(value, minimum, path, diagnostics) {
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < minimum) {
    return recordOmission(diagnostics, path, "INVALID_NUMBER");
  }
  return normalized;
}

function boundedEncryptedSecret(
  value,
  decrypt,
  encryptionContext,
  maximumLength,
  path,
  diagnostics,
) {
  const serialized = optional(value);
  if (serialized === undefined) return undefined;
  if (!serialized.startsWith("enc:v1:")) {
    recordOmission(diagnostics, path, "PLAINTEXT_SECRET_REJECTED");
    return INVALID_SECRET;
  }
  try {
    return boundedText(
      decrypt(serialized, encryptionContext),
      maximumLength,
      path,
      diagnostics,
    );
  } catch {
    recordOmission(diagnostics, path, "INVALID_ENCRYPTED_SECRET");
    return INVALID_SECRET;
  }
}

function stockMode(value, path, diagnostics) {
  const normalized = optional(value)?.toUpperCase();
  if (normalized === undefined) return undefined;
  if (!["NO", "YES", "BY_PRODUCT"].includes(normalized)) {
    return recordOmission(diagnostics, path, "INVALID_STOCK_MODE");
  }
  return normalized;
}

function hasAny(...values) {
  return values.some(
    (value) =>
      value !== null && value !== undefined && String(value).trim() !== "",
  );
}

function companyPayload(record, fallbackName, context, diagnostics) {
  const fallback = boundedText(
    fallbackName,
    160,
    `${context}.company.fallbackName`,
    diagnostics,
  );
  return {
    legalName:
      boundedText(
        record?.corporateName,
        160,
        `${context}.company.legalName`,
        diagnostics,
      ) || fallback,
    tradeName:
      boundedText(
        record?.nickname,
        160,
        `${context}.company.tradeName`,
        diagnostics,
      ) ||
      boundedText(
        record?.name,
        160,
        `${context}.company.name`,
        diagnostics,
      ) ||
      fallback,
    documentNumber: boundedText(
      optional(record?.cnpj) || optional(record?.cpf) || optional(record?.document),
      24,
      `${context}.company.documentNumber`,
      diagnostics,
    ),
    stateRegistration: boundedText(
      record?.rg,
      32,
      `${context}.company.stateRegistration`,
      diagnostics,
    ),
    address: {
      postalCode: boundedText(record?.zipCode, 16, `${context}.company.address.postalCode`, diagnostics),
      street: boundedText(record?.street, 160, `${context}.company.address.street`, diagnostics),
      number: boundedText(record?.number, 30, `${context}.company.address.number`, diagnostics),
      complement: boundedText(record?.complement, 120, `${context}.company.address.complement`, diagnostics),
      district: boundedText(record?.neighborhood, 120, `${context}.company.address.district`, diagnostics),
      city: boundedText(record?.city, 120, `${context}.company.address.city`, diagnostics),
      state: boundedText(record?.state, 32, `${context}.company.address.state`, diagnostics),
      country: "BRASIL",
    },
    contacts: {
      phone: boundedText(record?.phone, 40, `${context}.company.contacts.phone`, diagnostics),
      mobile: boundedText(record?.cellphone1, 40, `${context}.company.contacts.mobile`, diagnostics),
      secondaryMobile: boundedText(record?.cellphone2, 40, `${context}.company.contacts.secondaryMobile`, diagnostics),
      whatsapp: boundedText(record?.whatsapp, 40, `${context}.company.contacts.whatsapp`, diagnostics),
      email: boundedEmail(record?.email, `${context}.company.contacts.email`, diagnostics),
    },
    logoReference: boundedText(
      record?.logoUrl,
      2048,
      `${context}.company.logoReference`,
      diagnostics,
    ),
  };
}

function storagePayload(record, secret, context, diagnostics) {
  const configured = hasAny(
    record.storageProviderAccessKeyId,
    record.storageProviderSecretAccessKey,
    record.storageBucketName,
    record.storageFolderName,
    record.storageEndpoint,
    record.storageCustomEndpoint,
    record.storageDescription,
  );
  if (!configured) return undefined;
  const endpointMode = String(record.storageEndpoint || "").trim();
  const endpoint =
    endpointMode.toLowerCase() === "custom"
      ? boundedText(record.storageCustomEndpoint, 2048, `${context}.s3.endpoint`, diagnostics)
      : boundedText(record.storageCustomEndpoint, 2048, `${context}.s3.customEndpoint`, diagnostics) ||
        (/^https?:\/\//i.test(endpointMode)
          ? boundedText(endpointMode, 2048, `${context}.s3.endpoint`, diagnostics)
          : undefined);
  let accessKeyId = boundedText(
    record.storageProviderAccessKeyId,
    512,
    `${context}.s3.accessKeyId`,
    diagnostics,
  );
  let secretAccessKey = boundedEncryptedSecret(
    record.storageProviderSecretAccessKey,
    secret,
    `${context}.storageProviderSecretAccessKey`,
    1024,
    `${context}.s3.secretAccessKey`,
    diagnostics,
  );
  if (secretAccessKey === INVALID_SECRET) {
    recordOmission(diagnostics, `${context}.s3`, "INVALID_SECRET_BLOCK_OMITTED");
    return undefined;
  }
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
    recordOmission(diagnostics, `${context}.s3.credentials`, "INCOMPLETE_PAIR");
    recordOmission(diagnostics, `${context}.s3`, "INCOMPLETE_CONFIGURATION");
    return undefined;
  }
  const payload = {
    configured: true,
    description: boundedText(record.storageDescription, 160, `${context}.s3.description`, diagnostics),
    endpoint,
    customEndpoint: boundedText(record.storageCustomEndpoint, 2048, `${context}.s3.customEndpoint`, diagnostics),
    region: boundedText(record.storageRegion, 80, `${context}.s3.region`, diagnostics),
    bucket: boundedText(record.storageBucketName, 255, `${context}.s3.bucket`, diagnostics),
    basePath: boundedText(record.storageFolderName, 1024, `${context}.s3.basePath`, diagnostics),
    defaultAcl: boundedText(record.storageDefaultAcl, 120, `${context}.s3.defaultAcl`, diagnostics),
    defaultExpiration: boundedInteger(record.storageDefaultExpiration, 0, undefined, `${context}.s3.defaultExpiration`, diagnostics),
    capacityGb: boundedNumber(record.storageCapacityGb, 0, `${context}.s3.capacityGb`, diagnostics),
    imagesFolderName: boundedText(record.storageImagesFolderName, 1024, `${context}.s3.imagesFolderName`, diagnostics),
    forcePathStyle: Boolean(endpoint),
    useSsl: !endpoint || /^https:/i.test(endpoint),
    accessKeyId,
    secretAccessKey,
  };
  if (!Object.entries(payload).some(([key, value]) => key !== "configured" && value !== undefined)) {
    recordOmission(diagnostics, `${context}.s3`, "EMPTY_AFTER_NORMALIZATION");
    return undefined;
  }
  return payload;
}

function smtpPayload(record, secret, context, fallbackName, diagnostics) {
  const configured = hasAny(
    record.smtpHost,
    record.smtpEmail,
    record.smtpPassword,
  );
  if (!configured) return undefined;
  const host = boundedText(record.smtpHost, 255, `${context}.smtp.host`, diagnostics);
  const username = boundedEmail(record.smtpEmail, `${context}.smtp.username`, diagnostics);
  const password = boundedEncryptedSecret(
    record.smtpPassword,
    secret,
    `${context}.smtpPassword`,
    1024,
    `${context}.smtp.password`,
    diagnostics,
  );
  if (password === INVALID_SECRET) {
    recordOmission(diagnostics, `${context}.smtp`, "INVALID_SECRET_BLOCK_OMITTED");
    return undefined;
  }
  const authenticate =
    record.smtpAuthenticate === undefined || record.smtpAuthenticate === null
      ? Boolean(username || password)
      : Boolean(record.smtpAuthenticate);
  if (!host || !username || (authenticate && !password)) {
    recordOmission(diagnostics, `${context}.smtp`, "INCOMPLETE_CONFIGURATION");
    return undefined;
  }
  return {
    configured: true,
    host,
    port: boundedInteger(record.smtpPort, 1, 65535, `${context}.smtp.port`, diagnostics),
    secure: record.smtpSecure === true,
    authenticate,
    timeout: boundedInteger(record.smtpTimeout ?? 60, 1, 300, `${context}.smtp.timeout`, diagnostics),
    authType: boundedText(record.smtpAuthType, 80, `${context}.smtp.authType`, diagnostics),
    username,
    password,
    fromName: boundedText(fallbackName, 160, `${context}.smtp.fromName`, diagnostics),
    fromEmail: username,
    replyTo:
      boundedEmail(record.email, `${context}.smtp.replyTo`, diagnostics) || username,
  };
}

function telegramPayload(record, secret, context, diagnostics) {
  const configured = hasAny(
    record.telegramEnabled,
    record.telegramBotToken,
    record.telegramBotUsername,
    record.telegramHeaderImageUrl,
  );
  if (!configured) return undefined;
  const enabled = record.telegramEnabled === true;
  const botToken = boundedEncryptedSecret(
    record.telegramBotToken,
    secret,
    `${context}.telegramBotToken`,
    2048,
    `${context}.telegram.botToken`,
    diagnostics,
  );
  if (botToken === INVALID_SECRET) {
    recordOmission(diagnostics, `${context}.telegram`, "INVALID_SECRET_BLOCK_OMITTED");
    return undefined;
  }
  if (enabled && !botToken) {
    recordOmission(diagnostics, `${context}.telegram`, "INCOMPLETE_CONFIGURATION");
    return undefined;
  }
  return {
    configured: true,
    enabled,
    botUsername: boundedText(record.telegramBotUsername, 160, `${context}.telegram.botUsername`, diagnostics),
    headerImageUrl: boundedText(record.telegramHeaderImageUrl, 2048, `${context}.telegram.headerImageUrl`, diagnostics),
    botToken,
  };
}

function financialPayload(tenant, context, diagnostics) {
  if (
    !hasAny(
      tenant.interestRate,
      tenant.interestGracePeriod,
      tenant.penaltyRate,
      tenant.penaltyValue,
      tenant.penaltyGracePeriod,
    )
  ) {
    return undefined;
  }
  return {
    configured: true,
    interestRate: boundedNumber(tenant.interestRate ?? 0, 0, `${context}.financial.interestRate`, diagnostics),
    interestGracePeriod: boundedInteger(tenant.interestGracePeriod ?? 0, 0, undefined, `${context}.financial.interestGracePeriod`, diagnostics),
    penaltyRate: boundedNumber(tenant.penaltyRate ?? 0, 0, `${context}.financial.penaltyRate`, diagnostics),
    penaltyValue: boundedNumber(tenant.penaltyValue ?? 0, 0, `${context}.financial.penaltyValue`, diagnostics),
    penaltyGracePeriod: boundedInteger(tenant.penaltyGracePeriod ?? 0, 0, undefined, `${context}.financial.penaltyGracePeriod`, diagnostics),
  };
}

function commercePayload(branch, context, diagnostics) {
  return {
    configured: true,
    stockControlMode: stockMode(branch.stockControlMode, `${context}.commerce.stockControlMode`, diagnostics),
    stockIntegerQuantityMode: stockMode(branch.stockIntegerQuantityMode, `${context}.commerce.stockIntegerQuantityMode`, diagnostics),
    stockLotControlMode: stockMode(branch.stockLotControlMode, `${context}.commerce.stockLotControlMode`, diagnostics),
    stockExpirationControlMode: stockMode(branch.stockExpirationControlMode, `${context}.commerce.stockExpirationControlMode`, diagnostics),
    stockGridControlMode: stockMode(branch.stockGridControlMode, `${context}.commerce.stockGridControlMode`, diagnostics),
    stockNegativeControlMode: stockMode(branch.stockNegativeControlMode, `${context}.commerce.stockNegativeControlMode`, diagnostics),
    allowSaleUnitPriceEdit: branch.allowSaleUnitPriceEdit,
    allowSaleItemDiscount: branch.allowSaleItemDiscount,
    groupSameProduct: branch.groupSameProduct,
    allowProductImageEdit: branch.allowProductImageEdit,
    requirePasswordToRemoveSaleItems: branch.requirePasswordToRemoveSaleItems,
    businessType: "ESCOLA",
  };
}

function validationFields(result) {
  const messages = Array.isArray(result?.message)
    ? result.message
    : typeof result?.message === "string"
      ? [result.message]
      : [];
  const fields = new Set();
  for (const entry of messages) {
    const message = String(entry || "").replace(/[\r\n]/g, " ").trim();
    const property = message.match(/^property\s+([A-Za-z][A-Za-z0-9_.-]{0,120})\s+/i);
    const leading = message.match(/^([A-Za-z][A-Za-z0-9_.-]{0,120})\s+(?:must|should|is|has)\b/i);
    const field = property?.[1] || leading?.[1];
    if (field) fields.add(field);
  }
  return [...fields].slice(0, 12);
}

async function signedPost(
  configuration,
  path,
  payload,
  { conflictMeansExisting = false, operation = "IMPORT" } = {},
) {
  const target = new URL(path, `${configuration.baseUrl}/`);
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  const timestamp = Date.now().toString();
  const nonce = randomBytes(24).toString("base64url");
  const bodyHash = createHash("sha256").update(body).digest("hex");
  const signature = createHmac("sha256", configuration.secret)
    .update(
      [
        "v1",
        configuration.systemId,
        "POST",
        canonicalTarget(`${target.pathname}${target.search}`),
        timestamp,
        nonce,
        bodyHash,
      ].join("\n"),
    )
    .digest("hex");
  const response = await fetch(target, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-msinfor-signature-version": "v1",
      "x-msinfor-system-id": configuration.systemId,
      "x-msinfor-timestamp": timestamp,
      "x-msinfor-nonce": nonce,
      "x-msinfor-content-sha256": bodyHash,
      "x-msinfor-signature": signature,
    },
    body,
    redirect: "error",
    signal: AbortSignal.timeout(8_000),
  });
  if (response.status === 409 && conflictMeansExisting) {
    return "ALREADY_EXISTS";
  }
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    const fields = response.status === 400 ? validationFields(result) : [];
    const validation = fields.length
      ? ` Campos recusados: ${fields.join(", ")}.`
      : response.status === 400
        ? " Contrato de validação recusado."
        : "";
    throw new Error(
      `${operation} recusado (HTTP ${response.status}).${validation}`,
    );
  }
  return "COMPLETED";
}

async function signedBootstrap(configuration, tenantId, branchCode, payload) {
  const query = branchCode === undefined ? "" : `?branchCode=${branchCode}`;
  const result = await signedPost(
    configuration,
    `control-plane/technical/tenants/${tenantId}/configuration/bootstrap${query}`,
    payload,
    {
      conflictMeansExisting: true,
      operation:
        branchCode === undefined ? "TENANT_BOOTSTRAP" : `BRANCH_BOOTSTRAP:${branchCode}`,
    },
  );
  return result === "ALREADY_EXISTS" ? result : "IMPORTED";
}

async function importMissingBranches(configuration, tenantId, branches) {
  await signedPost(
    configuration,
    "control-plane/technical/tenant-branches/synchronize",
    {
      tenantId,
      branches: branches.map((branch) => ({
        branchCode: branch.branchCode,
        displayName: branch.displayName,
        isActive: true,
      })),
    },
    { operation: "BRANCH_IMPORT" },
  );
}

async function loadInventory() {
  const { PrismaClient } = require("@prisma/client");
  const { decryptOptionalSecret } = require("../dist/src/common/security/secret-encryption.js");
  const prisma = new PrismaClient();
  try {
    const tenants = await prisma.tenant.findMany({
      where: { canceledAt: null, centralTenantId: { not: null } },
      include: {
        branches: { where: { canceledAt: null }, orderBy: { branchCode: "asc" } },
      },
      orderBy: { id: "asc" },
    });
    return tenants.map((tenant) => {
      if (!UUID_PATTERN.test(String(tenant.centralTenantId || ""))) {
        throw new Error("Existe empresa local sem vínculo UUID válido com a Central.");
      }
      const defaultBranch = tenant.branches[0] || null;
      const diagnostics = [];
      const tenantPayload = {
        company: companyPayload(
          defaultBranch,
          tenant.name,
          "TENANT",
          diagnostics,
        ),
        s3: storagePayload(
          tenant,
          decryptOptionalSecret,
          "Tenant",
          diagnostics,
        ),
        smtp: smtpPayload(
          tenant,
          decryptOptionalSecret,
          "Tenant",
          tenant.name,
          diagnostics,
        ),
        telegram: telegramPayload(
          tenant,
          decryptOptionalSecret,
          "Tenant",
          diagnostics,
        ),
        financial: financialPayload(tenant, "TENANT", diagnostics),
      };
      const branchPayloads = tenant.branches.map((branch) => {
        const context = `BRANCH:${branch.branchCode}`;
        return {
          branchCode: branch.branchCode,
          displayName:
            boundedText(
              branch.name,
              160,
              `${context}.displayName`,
              diagnostics,
            ) || `FILIAL ${branch.branchCode}`,
          payload: {
            company: companyPayload(
              branch,
              branch.name || tenant.name,
              context,
              diagnostics,
            ),
            s3: storagePayload(
              branch,
              decryptOptionalSecret,
              "TenantBranch",
              diagnostics,
            ),
            smtp: smtpPayload(
              branch,
              decryptOptionalSecret,
              "TenantBranch",
              branch.name || tenant.name,
              diagnostics,
            ),
            telegram: telegramPayload(
              branch,
              decryptOptionalSecret,
              "TenantBranch",
              diagnostics,
            ),
            commerce: commercePayload(branch, context, diagnostics),
          },
        };
      });
      return {
        tenantId: tenant.centralTenantId.toLowerCase(),
        tenantPayload,
        branchPayloads,
        diagnostics,
      };
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const apply = process.argv.length === 3 && process.argv[2] === "--apply";
  if (process.argv.length > (apply ? 3 : 2)) {
    throw new Error("Use apenas --apply para executar o bootstrap.");
  }
  const inventory = await loadInventory();
  const scopeCount = inventory.reduce(
    (total, item) => total + 1 + item.branchPayloads.length,
    0,
  );
  if (!apply) {
    console.log(
      `Simulação concluída: ${inventory.length} empresa(s), ${scopeCount} escopo(s). Nenhum dado foi enviado. Execute novamente com --apply.`,
    );
    return;
  }
  const configuration = technicalConfiguration();
  let imported = 0;
  let existing = 0;
  for (const [index, item] of inventory.entries()) {
    for (const diagnostic of item.diagnostics) {
      console.log(
        `NORMALIZATION|TENANT_INDEX:${index + 1}|${diagnostic.path}|${diagnostic.reason}|OMITTED`,
      );
    }
    await importMissingBranches(
      configuration,
      item.tenantId,
      item.branchPayloads,
    );
    console.log("BRANCH_IMPORT|COMPLETED");
    const tenantStatus = await signedBootstrap(
      configuration,
      item.tenantId,
      undefined,
      item.tenantPayload,
    );
    tenantStatus === "IMPORTED" ? (imported += 1) : (existing += 1);
    console.log(`TENANT|${tenantStatus}`);
    for (const branch of item.branchPayloads) {
      const status = await signedBootstrap(
        configuration,
        item.tenantId,
        branch.branchCode,
        branch.payload,
      );
      status === "IMPORTED" ? (imported += 1) : (existing += 1);
      console.log(`BRANCH:${branch.branchCode}|${status}`);
    }
  }
  console.log(`Bootstrap concluído: ${imported} importado(s), ${existing} já existente(s).`);
}

module.exports = {
  boundedEmail,
  boundedEncryptedSecret,
  boundedInteger,
  boundedNumber,
  boundedText,
  companyPayload,
  smtpPayload,
  storagePayload,
  validationFields,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(String(error?.message || "Falha no bootstrap da Central."));
    process.exitCode = 1;
  });
}
