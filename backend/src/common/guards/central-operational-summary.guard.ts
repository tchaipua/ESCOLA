import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const WINDOW_MS = 60_000;
const usedNonces = new Map<string, number>();

function header(request: any, name: string) {
  const value = request.headers?.[name];
  return Array.isArray(value) ? "" : String(value || "").trim();
}

function canonicalTarget(request: any) {
  const url = new URL(String(request.originalUrl || request.url || "/"), "http://internal");
  const query = Array.from(url.searchParams.entries())
    .map(([key, value]) => [encodeURIComponent(key), encodeURIComponent(value)] as const)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return `${url.pathname}${query ? `?${query}` : ""}`;
}

@Injectable()
export class CentralOperationalSummaryGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const version = header(request, "x-msinfor-signature-version");
    const systemId = header(request, "x-msinfor-system-id");
    const timestamp = header(request, "x-msinfor-timestamp");
    const nonce = header(request, "x-msinfor-nonce");
    const bodyHash = header(request, "x-msinfor-content-sha256");
    const signature = header(request, "x-msinfor-signature");
    const secret = String(process.env.MSINFOR_CENTRAL_SYSTEM_KEY || "").trim();
    const now = Date.now();
    for (const [knownNonce, expiresAt] of usedNonces) if (expiresAt <= now) usedNonces.delete(knownNonce);
    const timestampValue = Number(timestamp);
    const expectedHash = createHash("sha256").update(Buffer.alloc(0)).digest("hex");
    const validFormat = version === "v1" && systemId === "ESCOLA" && secret.length >= 32 && Number.isSafeInteger(timestampValue) && Math.abs(now - timestampValue) <= WINDOW_MS && /^[A-Za-z0-9_-]{32}$/.test(nonce) && bodyHash === expectedHash && /^[a-f0-9]{64}$/.test(signature);
    if (!validFormat || usedNonces.has(nonce)) throw new ForbiddenException("Consulta técnica central não autorizada.");
    const payload = [version, systemId, request.method.toUpperCase(), canonicalTarget(request), timestamp, nonce, bodyHash].join("\n");
    const expected = createHmac("sha256", secret).update(payload).digest("hex");
    if (!timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"))) throw new ForbiddenException("Consulta técnica central não autorizada.");
    usedNonces.set(nonce, now + WINDOW_MS);
    return true;
  }
}
