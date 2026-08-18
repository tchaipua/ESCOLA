import { ForbiddenException } from "@nestjs/common";
import type { ICurrentUser } from "../../common/decorators/current-user.decorator";

const MUTATION_PERMISSION_RULES: ReadonlyArray<{
  prefix: string;
  anyOf: readonly string[];
}> = [
  {
    prefix: "cash-sessions",
    anyOf: [
      "RECEIVE_PAYMENTS",
      "CLOSE_CASHIER",
      "MANAGE_FINANCIAL",
    ],
  },
  {
    prefix: "customer-credits",
    anyOf: [
      "RECEIVE_PAYMENTS",
      "SETTLE_RECEIVABLES",
      "MANAGE_FINANCIAL",
    ],
  },
  {
    prefix: "sales",
    anyOf: ["MANAGE_FINANCIAL"],
  },
  {
    prefix: "products",
    anyOf: ["MANAGE_FINANCIAL"],
  },
  {
    prefix: "payables",
    anyOf: ["MANAGE_FINANCIAL"],
  },
  {
    prefix: "receivables",
    anyOf: [
      "MANAGE_FINANCIAL",
      "MANAGE_MONTHLY_FEES",
      "ISSUE_BOLETOS",
      "RECEIVE_PAYMENTS",
      "SETTLE_RECEIVABLES",
    ],
  },
  {
    prefix: "customers",
    anyOf: ["MANAGE_FINANCIAL", "MANAGE_MONTHLY_FEES"],
  },
  {
    prefix: "banks",
    anyOf: ["MANAGE_FINANCIAL", "ISSUE_BOLETOS"],
  },
  {
    prefix: "fiscal-documents",
    anyOf: ["MANAGE_FINANCIAL"],
  },
  {
    prefix: "fiscal-certificates",
    anyOf: ["MANAGE_FINANCIAL"],
  },
];

const ADMIN_ONLY_PREFIXES = [
  "companies",
  "fiscal-parameters",
  "printing",
  "s3-control",
  "supertef",
  "finance-access",
] as const;

export const FINANCEIRO_ACCESS_PERMISSIONS = [
  "VIEW_FINANCIAL",
  "MANAGE_FINANCIAL",
  "ISSUE_BOLETOS",
  "MANAGE_MONTHLY_FEES",
  "VIEW_CASHIER",
  "RECEIVE_PAYMENTS",
  "SETTLE_RECEIVABLES",
  "CLOSE_CASHIER",
] as const;

export function hasFinanceiroAccess(currentUser: ICurrentUser) {
  const role = String(currentUser.role || "").trim().toUpperCase();
  if (role === "ADMIN" || role === "SOFTHOUSE_ADMIN") return true;
  const permissions = new Set(
    (currentUser.permissions || []).map((permission) =>
      String(permission).trim().toUpperCase(),
    ),
  );
  return FINANCEIRO_ACCESS_PERMISSIONS.some((permission) =>
    permissions.has(permission),
  );
}

export function normalizeFinanceiroGatewayPath(
  value: string | string[] | undefined,
) {
  const rawPath = Array.isArray(value) ? value.join("/") : String(value || "");
  const normalized = rawPath.replace(/^\/+|\/+$/g, "");
  if (
    !normalized ||
    normalized.length > 512 ||
    normalized.includes("\\") ||
    normalized.includes("%")
  ) {
    throw new ForbiddenException("Rota financeira não autorizada.");
  }
  const segments = normalized.split("/");
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment.length > 128 ||
        /[\u0000-\u001f\u007f]/.test(segment),
    )
  ) {
    throw new ForbiddenException("Rota financeira não autorizada.");
  }
  return segments.join("/");
}

export function shouldInjectCentralTenantIdQuery(path: string) {
  const normalizedPath = String(path || "").replace(/^\/+/, "");
  return (
    /^companies\/[^/]+\/branches$/i.test(normalizedPath) ||
    /^companies\/[^/]+\/branches\/[^/]+\/central-configuration-refresh$/i.test(
      normalizedPath,
    )
  );
}

export function expectedFinanceiroBinaryContentType(
  method: string,
  path: string,
) {
  if (method.toUpperCase() !== "GET") return null;
  if (path === "s3-control/object/view") return "s3-object" as const;
  if (/^s3-control\/product-images\/[A-Za-z0-9_-]{1,128}\/download$/.test(path)) {
    return "image/*" as const;
  }
  const match = path.match(
    /^fiscal-documents\/(nfe|nfse)\/documents\/[A-Za-z0-9_-]{1,128}\/(danfe|danfse|xml)$/,
  );
  if (!match) return null;
  if (
    (match[1] === "nfe" && match[2] === "danfse") ||
    (match[1] === "nfse" && match[2] === "danfe")
  ) {
    return null;
  }
  return match[2] === "xml" ? "application/xml" : "application/pdf";
}

export function authorizeFinanceiroGatewayRequest(
  currentUser: ICurrentUser,
  method: string,
  path: string,
) {
  const normalizedMethod = method.toUpperCase();
  const role = String(currentUser.role || "").trim().toUpperCase();
  const firstSegment = path.split("/", 1)[0].toLowerCase();
  const isAdministrator =
    role === "ADMIN" || role === "SOFTHOUSE_ADMIN";
  if (
    ADMIN_ONLY_PREFIXES.includes(firstSegment as any) &&
    !isAdministrator
  ) {
    throw new ForbiddenException(
      "Esta operação financeira exige administrador.",
    );
  }
  if (normalizedMethod === "GET" || normalizedMethod === "HEAD") return;
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(normalizedMethod)) {
    throw new ForbiddenException("Método financeiro não autorizado.");
  }
  const rule = MUTATION_PERMISSION_RULES.find(
    (candidate) => candidate.prefix === firstSegment,
  );
  if (isAdministrator) {
    if (
      ADMIN_ONLY_PREFIXES.includes(firstSegment as any) ||
      rule
    ) {
      return;
    }
    throw new ForbiddenException("Operação financeira não autorizada.");
  }
  if (!rule) {
    throw new ForbiddenException("Operação financeira não autorizada.");
  }
  const permissions = new Set(
    (currentUser.permissions || []).map((permission) =>
      String(permission).trim().toUpperCase(),
    ),
  );
  if (!rule.anyOf.some((permission) => permissions.has(permission))) {
    throw new ForbiddenException(
      "Usuário sem permissão para esta operação financeira.",
    );
  }
}
