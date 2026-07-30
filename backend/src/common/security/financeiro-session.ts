import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { getJwtSecret, isProductionEnvironment } from "./security-config";

const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CSRF_VERSION = "v1";

function safeEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

export function getSessionCookieName() {
  return isProductionEnvironment()
    ? "__Host-msinfor_escola_session"
    : "msinfor_escola_session";
}

export function getEscolaCsrfCookieName() {
  return isProductionEnvironment()
    ? "__Host-msinfor_escola_csrf"
    : "msinfor_escola_csrf";
}

export function readCookieValue(
  cookieHeader: string | string[] | undefined,
  name: string,
) {
  const header = Array.isArray(cookieHeader)
    ? cookieHeader.join(";")
    : String(cookieHeader || "");
  for (const item of header.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 1) continue;
    const candidateName = item.slice(0, separator).trim();
    if (candidateName !== name) continue;
    const rawValue = item.slice(separator + 1).trim();
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return "";
    }
  }
  return "";
}

export function readSessionToken(request: Pick<Request, "headers">) {
  return readCookieValue(
    request.headers.cookie,
    getSessionCookieName(),
  );
}

function signCsrfToken(sessionToken: string, randomValue: string) {
  return createHmac("sha256", getJwtSecret())
    .update(`${CSRF_VERSION}\n${sessionToken}\n${randomValue}`)
    .digest("base64url");
}

export function createEscolaCsrfToken(sessionToken: string) {
  if (!sessionToken) {
    throw new Error("Sessão ausente para emissão do token CSRF.");
  }
  const randomValue = randomBytes(32).toString("base64url");
  return `${randomValue}.${signCsrfToken(sessionToken, randomValue)}`;
}

export function setSessionCookies(
  response: Response,
  sessionToken: string,
  persistent = false,
) {
  const secure = isProductionEnvironment();
  const commonOptions = {
    secure,
    sameSite: "strict" as const,
    path: "/",
    ...(persistent ? { maxAge: SESSION_MAX_AGE_MS } : {}),
  };
  response.cookie(getSessionCookieName(), sessionToken, {
    ...commonOptions,
    httpOnly: true,
  });
  response.cookie(
    getEscolaCsrfCookieName(),
    createEscolaCsrfToken(sessionToken),
    {
      ...commonOptions,
      httpOnly: false,
    },
  );
}

export function clearSessionCookies(response: Response) {
  const options = {
    secure: isProductionEnvironment(),
    sameSite: "strict" as const,
    path: "/",
  };
  response.clearCookie(getSessionCookieName(), {
    ...options,
    httpOnly: true,
  });
  response.clearCookie(getEscolaCsrfCookieName(), {
    ...options,
    httpOnly: false,
  });
}

export function isValidEscolaCsrf(request: Request) {
  const sessionToken = readSessionToken(request);
  const cookieToken = readCookieValue(
    request.headers.cookie,
    getEscolaCsrfCookieName(),
  );
  const headerValue = Array.isArray(request.headers["x-msinfor-csrf"])
    ? ""
    : String(request.headers["x-msinfor-csrf"] || "").trim();

  if (
    !sessionToken ||
    !cookieToken ||
    !headerValue ||
    !safeEqual(cookieToken, headerValue)
  ) {
    return false;
  }

  const match = cookieToken.match(
    /^([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/,
  );
  if (!match) return false;
  return safeEqual(match[2], signCsrfToken(sessionToken, match[1]));
}

// Compatibilidade interna durante a migração do BFF Financeiro para o token
// CSRF global da Escola. O cookie emitido é sempre o da Escola.
export const getFinanceiroCsrfCookieName = getEscolaCsrfCookieName;
export const createFinanceiroCsrfToken = createEscolaCsrfToken;
export const isValidFinanceiroCsrf = isValidEscolaCsrf;
