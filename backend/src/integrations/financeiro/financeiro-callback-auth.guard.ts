import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import type { Request } from "express";
import { canonicalizeFinanceiroTarget } from "./financeiro-internal.client";
import { FinanceiroCallbackReplayService } from "./financeiro-callback-replay.service";

const VERSION = "v1";
const SYSTEM_ID = "FINANCEIRO";
const SOURCE_PARAMETERS_SCOPE = "SOURCE_PARAMETERS_WRITE";
const SYSTEM_USERS_SCOPE = "SYSTEM_USERS_WRITE";
const DUMMY_SECRET =
  "escola-callback-dummy-secret-for-timing-normalization-only";

export type FinanceiroCallbackContext = Readonly<{
  tenantId: string;
  branchCode: number;
  userId: string;
  timestamp: number;
  nonce: string;
}>;

type RequestWithRawBody = Request & {
  rawBody?: Buffer;
  financeiroCallback?: FinanceiroCallbackContext;
};

function readHeader(request: Request, name: string) {
  const value = request.headers[name];
  return Array.isArray(value) ? "" : String(value || "").trim();
}

function safeHexEqual(left: string, right: string) {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function normalizeIdentifier(value: unknown, maximumLength = 128) {
  const normalized = String(value || "").trim();
  if (
    !normalized ||
    normalized.length > maximumLength ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

function normalizeScopes(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((scope) => scope.trim().toUpperCase())
        .filter((scope) => /^[A-Z][A-Z0-9_:-]{0,63}$/.test(scope)),
    ),
  ).sort();
}

function requiredScopeForRequest(request: Request) {
  const target = canonicalizeFinanceiroTarget(request.originalUrl);
  if (
    request.method.toUpperCase() === "POST" &&
    target.includes("/integrations/financeiro/system-users/")
  ) {
    return SYSTEM_USERS_SCOPE;
  }
  return SOURCE_PARAMETERS_SCOPE;
}

@Injectable()
export class FinanceiroCallbackAuthGuard implements CanActivate {
  constructor(
    private readonly replayCache: FinanceiroCallbackReplayService,
  ) {}

  canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<RequestWithRawBody>();
    const version = readHeader(request, "x-msinfor-signature-version");
    const systemId = readHeader(request, "x-msinfor-system-id").toUpperCase();
    const tenantHeader = readHeader(request, "x-msinfor-tenant-id");
    const tenantId = normalizeIdentifier(tenantHeader);
    const branchCodeText = readHeader(
      request,
      "x-msinfor-branch-code",
    );
    const branchCode = Number(branchCodeText);
    const userId = normalizeIdentifier(
      readHeader(request, "x-msinfor-user-id"),
    );
    const scopes = normalizeScopes(readHeader(request, "x-msinfor-scopes"));
    const requiredScope = requiredScopeForRequest(request);
    const timestampText = readHeader(request, "x-msinfor-timestamp");
    const timestamp = Number(timestampText);
    const nonce = readHeader(request, "x-msinfor-nonce");
    const declaredBodyHash = readHeader(
      request,
      "x-msinfor-content-sha256",
    ).toLowerCase();
    const providedSignature = readHeader(
      request,
      "x-msinfor-signature",
    ).toLowerCase();

    if (
      version !== VERSION ||
      systemId !== SYSTEM_ID ||
      !tenantId ||
      tenantHeader !== tenantHeader.toUpperCase() ||
      !Number.isSafeInteger(branchCode) ||
      branchCode < 1 ||
      !userId ||
      !Number.isSafeInteger(timestamp) ||
      !/^[A-Za-z0-9_-]{32}$/.test(nonce) ||
      scopes.length !== 1 ||
      scopes[0] !== requiredScope
    ) {
      throw new UnauthorizedException("Integração financeira não autorizada.");
    }

    const now = Date.now();
    const timestampWindow = Number(
      process.env.FINANCEIRO_CALLBACK_TIMESTAMP_WINDOW_MS || 60_000,
    );
    if (
      !Number.isSafeInteger(timestampWindow) ||
      timestampWindow < 1_000 ||
      timestampWindow > 300_000 ||
      Math.abs(now - timestamp) > timestampWindow
    ) {
      throw new UnauthorizedException("Integração financeira não autorizada.");
    }
    if (!Buffer.isBuffer(request.rawBody)) {
      throw new UnauthorizedException("Integração financeira não autorizada.");
    }
    const actualBodyHash = createHash("sha256")
      .update(request.rawBody)
      .digest("hex");
    if (!safeHexEqual(actualBodyHash, declaredBodyHash)) {
      throw new UnauthorizedException("Integração financeira não autorizada.");
    }

    const canonicalTarget = canonicalizeFinanceiroTarget(
      request.originalUrl,
    );
    const canonicalPayload = [
      VERSION,
      SYSTEM_ID,
      request.method.toUpperCase(),
      canonicalTarget,
      timestampText,
      nonce,
      declaredBodyHash,
      tenantId.toUpperCase(),
      String(branchCode),
      userId,
      scopes.join(","),
    ].join("\n");
    const secret = String(
      process.env.SOURCE_SYSTEM_ESCOLA_HMAC_SECRET || "",
    ).trim();
    const expectedSignature = createHmac(
      "sha256",
      secret || DUMMY_SECRET,
    )
      .update(canonicalPayload)
      .digest("hex");
    if (
      Buffer.byteLength(secret, "utf8") < 32 ||
      !safeHexEqual(expectedSignature, providedSignature)
    ) {
      throw new UnauthorizedException("Integração financeira não autorizada.");
    }

    const body = request.body as Record<string, unknown> | undefined;
    if (
      !body ||
      String(body.sourceSystem || "").trim().toUpperCase() !== "ESCOLA" ||
      String(body.sourceTenantId || "").trim().toUpperCase() !==
        tenantId.toUpperCase() ||
      (body.sourceBranchCode !== undefined &&
        Number(body.sourceBranchCode) !== branchCode) ||
      (body.requestedBy !== undefined &&
        String(body.requestedBy).trim() !== userId)
    ) {
      throw new UnauthorizedException("Integração financeira não autorizada.");
    }

    const replayResult = this.replayCache.consume(
      `${SYSTEM_ID}:${nonce}`,
      now,
      now + timestampWindow,
    );
    if (replayResult === "REPLAY") {
      throw new UnauthorizedException("Integração financeira não autorizada.");
    }
    if (replayResult === "FULL") {
      throw new ServiceUnavailableException(
        "Proteção contra repetição indisponível.",
      );
    }

    Object.defineProperty(request, "financeiroCallback", {
      configurable: false,
      enumerable: false,
      writable: false,
      value: Object.freeze({
        tenantId,
        branchCode,
        userId,
        timestamp,
        nonce,
      }),
    });
    return true;
  }
}
