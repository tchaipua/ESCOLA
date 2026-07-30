import { getDataEncryptionKey } from "./secret-encryption";
import { readFileSync } from "node:fs";

const LOCAL_DEVELOPMENT_JWT_SECRET =
  "local-development-only-escola-jwt-secret-never-use-in-production";

const FILE_BACKED_SECRETS = [
  "DATABASE_URL",
  "JWT_SECRET",
  "DATA_ENCRYPTION_KEY",
  "MSINFOR_CENTRAL_SYSTEM_KEY",
  "FINANCEIRO_HMAC_ESCOLA_SECRET",
  "SOURCE_SYSTEM_ESCOLA_HMAC_SECRET",
] as const;

export function loadRuntimeSecretsFromFiles() {
  for (const name of FILE_BACKED_SECRETS) {
    const filePath = String(process.env[`${name}_FILE`] || "").trim();
    if (!filePath) continue;
    if (String(process.env[name] || "").trim()) {
      throw new Error(`Configure apenas ${name} ou ${name}_FILE, nunca ambos.`);
    }
    const value = readFileSync(filePath, "utf8").trim();
    if (!value) {
      throw new Error(`O arquivo indicado por ${name}_FILE está vazio.`);
    }
    process.env[name] = value;
  }
}
function normalizedEnvironment() {
  return String(process.env.NODE_ENV || "")
    .trim()
    .toLowerCase();
}

function parseOrigins(value?: string) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      try {
        return new URL(item).origin;
      } catch {
        throw new Error(`Origem CORS inválida: ${item}`);
      }
    });
}

function requireProductionHttpsUrl(name: string) {
  const configured = String(process.env[name] || "").trim();
  if (!configured) {
    throw new Error(`${name} é obrigatória em produção.`);
  }

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error(`${name} deve ser uma URL HTTPS válida em produção.`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error(
      `${name} deve usar HTTPS e não pode conter credenciais na URL.`,
    );
  }
}

export function isProductionEnvironment() {
  return normalizedEnvironment() === "production";
}

export function getTrustProxyHops() {
  const configured = String(process.env.TRUST_PROXY_HOPS || "").trim();
  if (!configured) {
    if (isProductionEnvironment()) {
      throw new Error("TRUST_PROXY_HOPS é obrigatório em produção.");
    }
    return 0;
  }
  const hops = Number(configured);
  if (!Number.isSafeInteger(hops) || hops < 0 || hops > 3) {
    throw new Error("TRUST_PROXY_HOPS deve ser um inteiro entre 0 e 3.");
  }
  if (isProductionEnvironment() && hops < 1) {
    throw new Error("TRUST_PROXY_HOPS deve ser pelo menos 1 em produção.");
  }
  return hops;
}

export function isCentralIdentityEnabled() {
  const configured = String(
    process.env.MSINFOR_CENTRAL_IDENTITY_ENABLED || "",
  )
    .trim()
    .toLowerCase();
  if (configured && configured !== "true" && configured !== "false") {
    throw new Error(
      "MSINFOR_CENTRAL_IDENTITY_ENABLED deve ser true ou false.",
    );
  }
  if (isProductionEnvironment()) return true;
  // O fallback local existe apenas para desenvolvimento explicitamente isolado.
  return configured !== "false";
}

export function getJwtSecret() {
  const configuredSecret = String(process.env.JWT_SECRET || "").trim();
  if (configuredSecret) return configuredSecret;

  if (isProductionEnvironment()) {
    throw new Error("JWT_SECRET é obrigatório em produção.");
  }

  return LOCAL_DEVELOPMENT_JWT_SECRET;
}

export function getCorsAllowedOrigins() {
  const configuredOrigins = [
    ...parseOrigins(process.env.CORS_ALLOWED_ORIGINS),
    ...parseOrigins(process.env.FRONTEND_URL),
  ];

  if (!isProductionEnvironment()) {
    configuredOrigins.push("http://localhost:3000", "http://127.0.0.1:3000");
  }

  return Array.from(new Set(configuredOrigins));
}

export function assertSecureProductionDatabaseUrl(databaseUrlRaw: string) {
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(databaseUrlRaw);
  } catch {
    throw new Error(
      "DATABASE_URL deve ser uma URL PostgreSQL válida em produção.",
    );
  }
  const expectedRole = String(
    process.env.ESCOLA_DATABASE_RUNTIME_ROLE || "escola_app",
  ).trim();
  const expectedHost = String(
    process.env.ESCOLA_DATABASE_HOST || "postgres",
  ).trim();
  const expectedDatabase = String(
    process.env.ESCOLA_DATABASE_NAME || "escola_01",
  ).trim();
  const databaseName = decodeURIComponent(
    databaseUrl.pathname.replace(/^\/+/, ""),
  );
  const connectionLimit = Number(
    databaseUrl.searchParams.get("connection_limit") || "",
  );
  if (
    !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
    decodeURIComponent(databaseUrl.username) !== expectedRole ||
    !databaseUrl.password ||
    databaseUrl.hostname !== expectedHost ||
    databaseName !== expectedDatabase ||
    databaseUrl.hash ||
    databaseUrl.searchParams.get("schema") !== "public" ||
    databaseUrl.searchParams.get("sslmode") !== "require" ||
    databaseUrl.searchParams.get("sslaccept") !== "strict" ||
    databaseUrl.searchParams.get("sslrootcert") !==
      "/run/secrets/postgres_tls_ca.pem" ||
    !Number.isInteger(connectionLimit) ||
    connectionLimit < 1 ||
    connectionLimit > 10
  ) {
    throw new Error(
      "DATABASE_URL de produção deve usar banco/role esperados, TLS com validação estrita da CA e connection_limit entre 1 e 10.",
    );
  }
}

export function assertSecureRuntimeConfiguration() {
  if (!isProductionEnvironment()) return;

  if (
    String(process.env.MIGRATION_DATABASE_URL || "").trim() ||
    String(process.env.MIGRATION_DATABASE_URL_FILE || "").trim()
  ) {
    throw new Error(
      "O runtime da aplicação não pode receber credencial de migração.",
    );
  }
  getTrustProxyHops();
  const maximumSessions = Number(
    process.env.AUTH_SESSION_MAX_PER_ACCOUNT || 10,
  );
  if (
    !Number.isSafeInteger(maximumSessions) ||
    maximumSessions < 1 ||
    maximumSessions > 50
  ) {
    throw new Error(
      "AUTH_SESSION_MAX_PER_ACCOUNT deve ser um inteiro entre 1 e 50.",
    );
  }
  const expectedDatabaseRole = String(
    process.env.ESCOLA_DATABASE_RUNTIME_ROLE || "",
  ).trim();
  if (!/^[a-z_][a-z0-9_$-]{0,62}$/i.test(expectedDatabaseRole)) {
    throw new Error(
      "ESCOLA_DATABASE_RUNTIME_ROLE é obrigatória e inválida em produção.",
    );
  }

  if (
    String(process.env.MSINFOR_CENTRAL_IDENTITY_ENABLED || "")
      .trim()
      .toLowerCase() === "false"
  ) {
    throw new Error(
      "A identidade do MSINFOR Central não pode ser desativada em produção.",
    );
  }

  const jwtSecret = String(process.env.JWT_SECRET || "").trim();
  if (!jwtSecret) {
    throw new Error("JWT_SECRET é obrigatório em produção.");
  }
  if (Buffer.byteLength(jwtSecret, "utf8") < 32) {
    throw new Error("JWT_SECRET deve possuir pelo menos 32 bytes em produção.");
  }

  if (!getDataEncryptionKey()) {
    throw new Error("DATA_ENCRYPTION_KEY é obrigatória em produção.");
  }

  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL é obrigatória em produção.");
  }
  assertSecureProductionDatabaseUrl(databaseUrl);

  requireProductionHttpsUrl("FINANCEIRO_API_URL");
  requireProductionHttpsUrl("MSINFOR_CENTRAL_API_URL");
  requireProductionHttpsUrl("BACKEND_PUBLIC_URL");

  if (String(process.env.TELEGRAM_POLLING_ENABLED || "").trim() !== "false") {
    throw new Error(
      "TELEGRAM_POLLING_ENABLED deve ser false em produção; use o webhook autenticado.",
    );
  }
  if (String(process.env.TELEGRAM_DEBUG_LOG_ENABLED || "").trim() !== "false") {
    throw new Error(
      "TELEGRAM_DEBUG_LOG_ENABLED deve ser false em produção.",
    );
  }
  if (String(process.env.TELEGRAM_BOT_TOKEN || "").trim()) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN global não é permitido em produção; use o segredo criptografado por empresa.",
    );
  }

  const centralSystemId = String(
    process.env.MSINFOR_CENTRAL_SYSTEM_ID || "",
  )
    .trim()
    .toUpperCase();
  if (centralSystemId !== "ESCOLA") {
    throw new Error(
      "MSINFOR_CENTRAL_SYSTEM_ID deve ser ESCOLA em produção.",
    );
  }
  const databaseAlias = String(
    process.env.MSINFOR_DATABASE_ALIAS || "",
  )
    .trim()
    .toUpperCase();
  if (!/^[A-Z][A-Z0-9_:-]{0,63}$/.test(databaseAlias)) {
    throw new Error(
      "MSINFOR_DATABASE_ALIAS é obrigatório e deve ser um alias técnico válido em produção.",
    );
  }

  const centralSystemKey = String(
    process.env.MSINFOR_CENTRAL_SYSTEM_KEY || "",
  ).trim();
  if (Buffer.byteLength(centralSystemKey, "utf8") < 32) {
    throw new Error(
      "MSINFOR_CENTRAL_SYSTEM_KEY deve possuir pelo menos 32 bytes em produção.",
    );
  }

  const financeiroOutboundSecret = String(
    process.env.FINANCEIRO_HMAC_ESCOLA_SECRET || "",
  ).trim();
  const financeiroCallbackSecret = String(
    process.env.SOURCE_SYSTEM_ESCOLA_HMAC_SECRET || "",
  ).trim();
  if (Buffer.byteLength(financeiroOutboundSecret, "utf8") < 32) {
    throw new Error(
      "FINANCEIRO_HMAC_ESCOLA_SECRET deve possuir pelo menos 32 bytes em produção.",
    );
  }
  if (Buffer.byteLength(financeiroCallbackSecret, "utf8") < 32) {
    throw new Error(
      "SOURCE_SYSTEM_ESCOLA_HMAC_SECRET deve possuir pelo menos 32 bytes em produção.",
    );
  }
  if (financeiroOutboundSecret === financeiroCallbackSecret) {
    throw new Error(
      "As chaves HMAC direcionais do Financeiro devem ser diferentes.",
    );
  }

  const allowedOrigins = getCorsAllowedOrigins();
  if (!allowedOrigins.length) {
    throw new Error(
      "CORS_ALLOWED_ORIGINS ou FRONTEND_URL é obrigatório em produção.",
    );
  }
  if (
    allowedOrigins.some(
      (origin) => origin.includes("*") || !origin.startsWith("https://"),
    )
  ) {
    throw new Error(
      "Em produção, todas as origens CORS devem usar HTTPS e não podem conter wildcard.",
    );
  }
}
