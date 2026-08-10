import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash, createHmac, randomBytes } from "node:crypto";
import type { ICurrentUser } from "../../common/decorators/current-user.decorator";
import { isProductionEnvironment } from "../../common/security/security-config";

const SIGNATURE_VERSION = "v1";
const SOURCE_SYSTEM = "ESCOLA";
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;

const FINANCE_ACCESS_PERMISSIONS = new Set([
  "VIEW_FINANCIAL",
  "MANAGE_FINANCIAL",
  "ISSUE_BOLETOS",
  "MANAGE_MONTHLY_FEES",
  "VIEW_CASHIER",
  "RECEIVE_PAYMENTS",
  "SETTLE_RECEIVABLES",
  "CLOSE_CASHIER",
]);

const FINANCE_MUTATION_PERMISSIONS = new Set([
  "MANAGE_FINANCIAL",
  "ISSUE_BOLETOS",
  "MANAGE_MONTHLY_FEES",
  "RECEIVE_PAYMENTS",
  "SETTLE_RECEIVABLES",
  "CLOSE_CASHIER",
]);

const PROTECTED_HEADERS = new Set([
  "authorization",
  "cookie",
  "forwarded",
  "host",
  "proxy-authorization",
  "x-api-key",
  "x-company-id",
  "x-branch-id",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-msinfor-signature-version",
  "x-msinfor-system-id",
  "x-msinfor-tenant-id",
  "x-msinfor-branch-code",
  "x-msinfor-user-id",
  "x-msinfor-scopes",
  "x-msinfor-timestamp",
  "x-msinfor-nonce",
  "x-msinfor-content-sha256",
  "x-msinfor-signature",
]);

type ExpectedBinaryContentType = "application/pdf" | "application/xml" | "image/*" | "s3-object";
type FinanceiroBinaryContentType = "application/pdf" | "application/xml" | "application/json" | "application/octet-stream" | "text/plain" | "text/csv" | "image/gif" | "image/jpeg" | "image/png" | "image/webp" | "image/bmp" | "image/tiff";

type InternalRequest = {
  method?: string;
  path: string;
  currentUser: ICurrentUser;
  json?: unknown;
  bodyBytes?: Buffer | Uint8Array;
  contentType?: string;
  headers?: Record<string, string>;
  technicalScopes?: readonly "SOURCE_SETTINGS_SYNC"[];
  expectedBinaryContentType?: ExpectedBinaryContentType;
};

export type FinanceiroBinaryResponse = {
  kind: "binary";
  body: Buffer;
  contentType: FinanceiroBinaryContentType;
  contentDisposition: string;
  cacheControl: string;
};

function encodeRfc3986(value: string) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function canonicalizeFinanceiroTarget(target: string) {
  const parsed = new URL(target, "http://internal.invalid");
  const entries = Array.from(parsed.searchParams.entries())
    .map(([key, value]) => [encodeRfc3986(key), encodeRfc3986(value)] as const)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      if (leftKey < rightKey) return -1;
      if (leftKey > rightKey) return 1;
      if (leftValue < rightValue) return -1;
      if (leftValue > rightValue) return 1;
      return 0;
    });
  const query = entries.map(([key, value]) => `${key}=${value}`).join("&");
  return `${parsed.pathname}${query ? `?${query}` : ""}`;
}

export function resolveFinanceiroScopes(
  currentUser: ICurrentUser,
  technicalScopes: readonly "SOURCE_SETTINGS_SYNC"[] = [],
) {
  if (technicalScopes.length) {
    return Array.from(new Set(technicalScopes)).sort();
  }

  const role = String(currentUser.role || "").trim().toUpperCase();
  const permissions = new Set(
    (currentUser.permissions || []).map((permission) =>
      String(permission).trim().toUpperCase(),
    ),
  );
  const isAdministrator =
    role === "ADMIN" || role === "SOFTHOUSE_ADMIN";
  const scopes = new Set<string>();

  if (
    isAdministrator ||
    Array.from(FINANCE_ACCESS_PERMISSIONS).some((permission) =>
      permissions.has(permission),
    )
  ) {
    scopes.add("FINANCE_ACCESS");
  }
  if (
    isAdministrator ||
    Array.from(FINANCE_MUTATION_PERMISSIONS).some((permission) =>
      permissions.has(permission),
    )
  ) {
    scopes.add("MANAGE_FINANCIAL");
  }
  if (isAdministrator) {
    scopes.add("FINANCE_ADMIN");
  }
  return Array.from(scopes).sort();
}

function serializeBody(request: InternalRequest) {
  if (request.json !== undefined && request.bodyBytes !== undefined) {
    throw new Error("Informe JSON ou bytes, nunca os dois.");
  }
  if (request.json !== undefined) {
    return {
      bytes: Buffer.from(JSON.stringify(request.json), "utf8"),
      contentType: "application/json",
    };
  }
  if (request.bodyBytes !== undefined) {
    return {
      bytes: Buffer.from(request.bodyBytes),
      contentType: request.contentType,
    };
  }
  return { bytes: Buffer.alloc(0), contentType: request.contentType };
}

function getConfiguration() {
  const apiUrl = String(
    process.env.FINANCEIRO_API_URL || "http://localhost:3002/api/v1",
  ).trim();
  const secret = String(
    process.env.FINANCEIRO_HMAC_ESCOLA_SECRET || "",
  ).trim();
  return { apiUrl, secret };
}

function buildTargetUrl(baseUrl: string, path: string) {
  const rawPathname = path.split("?", 1)[0];
  if (
    !path ||
    path.startsWith("//") ||
    path.includes("\\") ||
    rawPathname.includes("%") ||
    rawPathname
      .split("/")
      .some((segment) => segment === "." || segment === "..") ||
    /[\u0000-\u001f\u007f]/.test(path)
  ) {
    throw new Error("Destino interno do Financeiro inválido.");
  }
  const normalizedBase = new URL(
    baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
  );
  if (
    !["http:", "https:"].includes(normalizedBase.protocol) ||
    normalizedBase.username ||
    normalizedBase.password ||
    normalizedBase.search ||
    normalizedBase.hash
  ) {
    throw new Error("URL interna do Financeiro inválida.");
  }
  const target = new URL(path.replace(/^\/+/, ""), normalizedBase);
  const basePath = normalizedBase.pathname.endsWith("/")
    ? normalizedBase.pathname
    : `${normalizedBase.pathname}/`;
  if (
    target.origin !== normalizedBase.origin ||
    !target.pathname.startsWith(basePath) ||
    target.username ||
    target.password ||
    target.hash
  ) {
    throw new Error("Destino interno do Financeiro inválido.");
  }
  return target;
}

async function readLimitedBytes(response: Response, maximumBytes: number) {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    const contentLength = Number(declaredLength);
    if (
      !Number.isSafeInteger(contentLength) ||
      contentLength < 0 ||
      contentLength > maximumBytes
    ) {
      throw new BadGatewayException(
        "Resposta do Financeiro excedeu o limite.",
      );
    }
  }

  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new BadGatewayException(
          "Resposta do Financeiro excedeu o limite.",
        );
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

async function readLimitedJson(response: Response) {
  const bytes = await readLimitedBytes(response, MAX_RESPONSE_BYTES);
  if (!bytes.length) return null;
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new BadGatewayException("Resposta inválida do Financeiro.");
  }
}

function safeDownloadDisposition(
  received: string | null,
  contentType: FinanceiroBinaryContentType,
  inline = false,
) {
  if (received && /[\r\n\u0000-\u001f\u007f]/.test(received)) {
    throw new BadGatewayException(
      "Cabeçalho de download inválido no Financeiro.",
    );
  }
  const quoted = received?.match(/filename="([^"]{1,200})"/i)?.[1];
  const encoded = received?.match(
    /filename\*=UTF-8''([A-Za-z0-9!#$&+.^_`|~%-]{1,600})/i,
  )?.[1];
  let candidate = quoted || "";
  if (!candidate && encoded) {
    try {
      candidate = decodeURIComponent(encoded);
    } catch {
      candidate = "";
    }
  }
  const extension = contentType === "application/pdf" ? ".pdf" : contentType === "application/xml" ? ".xml" : contentType === "application/json" ? ".json" : contentType === "text/csv" ? ".csv" : contentType === "text/plain" ? ".txt" : contentType === "image/gif" ? ".gif" : contentType === "image/png" ? ".png" : contentType === "image/webp" ? ".webp" : contentType === "image/bmp" ? ".bmp" : contentType === "image/tiff" ? ".tiff" : ".jpg";
  const safeName = (candidate || `documento${extension}`)
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, "_")
    .trim()
    .slice(0, 180);
  const finalName = safeName.toLowerCase().endsWith(extension)
    ? safeName
    : `${safeName}${extension}`;
  return `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeRfc3986(finalName)}`;
}

function safeCacheControl(received: string | null) {
  if (
    !received ||
    received.length > 256 ||
    /[\r\n\u0000-\u001f\u007f]/.test(received)
  ) {
    return "private, no-store, max-age=0";
  }
  return received;
}

async function readBinaryResponse(
  response: Response,
  expectedContentType: ExpectedBinaryContentType,
): Promise<FinanceiroBinaryResponse> {
  const receivedContentType = String(
    response.headers.get("content-type") || "",
  )
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  const isImage = expectedContentType === "image/*";
  const isS3Object = expectedContentType === "s3-object";
  const permittedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/bmp"]);
  const permittedS3ObjectTypes = new Set(["application/pdf", "application/xml", "application/json", "application/octet-stream", "text/plain", "text/csv", "image/gif", "image/jpeg", "image/png", "image/webp", "image/bmp", "image/tiff"]);
  if (isS3Object ? !permittedS3ObjectTypes.has(receivedContentType) : isImage ? !permittedImageTypes.has(receivedContentType) : receivedContentType !== expectedContentType) {
    throw new BadGatewayException(
      "Tipo de arquivo inesperado recebido do Financeiro.",
    );
  }
  const body = await readLimitedBytes(response, MAX_RESPONSE_BYTES);
  const prefix = body
    .toString("utf8", 0, Math.min(body.length, 256))
    .trimStart();
  if (
    !body.length ||
    (!isS3Object && expectedContentType === "application/pdf" &&
      !body.subarray(0, 5).equals(Buffer.from("%PDF-"))) ||
    (!isS3Object && expectedContentType === "application/xml" &&
      !prefix.startsWith("<"))
  ) {
    throw new BadGatewayException(
      "Conteúdo de arquivo inválido recebido do Financeiro.",
    );
  }
  return {
    kind: "binary",
    body,
    contentType: receivedContentType as FinanceiroBinaryContentType,
    contentDisposition: safeDownloadDisposition(
      response.headers.get("content-disposition"),
      receivedContentType as FinanceiroBinaryContentType,
      isS3Object,
    ),
    cacheControl: safeCacheControl(
      response.headers.get("cache-control"),
    ),
  };
}

@Injectable()
export class FinanceiroInternalClient {
  async request<T>(request: InternalRequest): Promise<T> {
    const configuration = getConfiguration();
    if (Buffer.byteLength(configuration.secret, "utf8") < 32) {
      throw new ServiceUnavailableException(
        "Integração interna com o Financeiro não configurada.",
      );
    }

    const method = String(request.method || "GET").trim().toUpperCase();
    if (!["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      throw new Error("Método interno não permitido.");
    }
    const target = buildTargetUrl(configuration.apiUrl, request.path);
    if (isProductionEnvironment() && target.protocol !== "https:") {
      throw new ServiceUnavailableException(
        "Transporte interno do Financeiro não atende à política de segurança.",
      );
    }

    const tenantId = String(request.currentUser.tenantId || "")
      .trim()
      .toUpperCase();
    const branchCode = Number(request.currentUser.branchCode);
    const userId = String(request.currentUser.userId || "").trim();
    if (
      !tenantId ||
      !Number.isSafeInteger(branchCode) ||
      branchCode < 1 ||
      !userId
    ) {
      throw new Error("Contexto autenticado inválido.");
    }

    const scopes = resolveFinanceiroScopes(
      request.currentUser,
      request.technicalScopes,
    );
    if (!scopes.length) {
      throw new ServiceUnavailableException(
        "Sessão sem escopo financeiro autorizado.",
      );
    }
    const { bytes, contentType } = serializeBody(request);
    const timestamp = String(Date.now());
    const nonce = randomBytes(24).toString("base64url");
    const bodySha256 = createHash("sha256").update(bytes).digest("hex");
    const canonicalTarget = canonicalizeFinanceiroTarget(
      `${target.pathname}${target.search}`,
    );
    const canonicalPayload = [
      SIGNATURE_VERSION,
      SOURCE_SYSTEM,
      method,
      canonicalTarget,
      timestamp,
      nonce,
      bodySha256,
      tenantId,
      String(branchCode),
      userId,
      scopes.join(","),
    ].join("\n");
    const signature = createHmac("sha256", configuration.secret)
      .update(canonicalPayload)
      .digest("hex");

    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(request.headers || {})) {
      if (!PROTECTED_HEADERS.has(name.toLowerCase())) {
        headers[name] = value;
      }
    }
    Object.assign(headers, {
      ...(contentType ? { "content-type": contentType } : {}),
      "x-msinfor-signature-version": SIGNATURE_VERSION,
      "x-msinfor-system-id": SOURCE_SYSTEM,
      "x-msinfor-tenant-id": tenantId,
      "x-msinfor-branch-code": String(branchCode),
      "x-msinfor-user-id": userId,
      "x-msinfor-scopes": scopes.join(","),
      "x-msinfor-timestamp": timestamp,
      "x-msinfor-nonce": nonce,
      "x-msinfor-content-sha256": bodySha256,
      "x-msinfor-signature": signature,
    });

    let response: Response;
    try {
      response = await fetch(target, {
        method,
        headers,
        body: bytes.length ? bytes : undefined,
        redirect: "error",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new BadGatewayException("Financeiro interno indisponível.");
    }

    const payload: any =
      response.ok && request.expectedBinaryContentType
        ? await readBinaryResponse(
            response,
            request.expectedBinaryContentType,
          )
        : await readLimitedJson(response);
    if (!response.ok) {
      const receivedMessage = payload?.message || payload?.error;
      const message = Array.isArray(receivedMessage)
        ? receivedMessage.join("; ")
        : String(receivedMessage || "Requisição financeira recusada.");
      throw new BadGatewayException(message);
    }
    return payload as T;
  }
}
