import type { NextConfig } from "next";

function resolveInternalUrl(name: string, fallback: string) {
  const value = String(process.env[name] || fallback).trim().replace(/\/+$/, "");
  const parsed = new URL(value);
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`${name} deve ser uma URL interna HTTP(S) sem credenciais.`);
  }
  return value;
}

function resolveFinanceiroInternalBasePath() {
  const configured = process.env.FINANCEIRO_FRONTEND_INTERNAL_BASE_PATH;
  const value =
    configured === undefined
      ? process.env.NODE_ENV === "production"
        ? "/financeiro-app"
        : ""
      : configured.trim();
  if (!value) return "";
  if (
    !/^\/[A-Za-z0-9][A-Za-z0-9/_-]*$/.test(value) ||
    value.endsWith("/") ||
    value.includes("//") ||
    value.split("/").includes("..")
  ) {
    throw new Error(
      "FINANCEIRO_FRONTEND_INTERNAL_BASE_PATH deve ser vazio ou um caminho absoluto seguro.",
    );
  }
  return value;
}

const escolaBackendInternalUrl = resolveInternalUrl(
  "ESCOLA_BACKEND_INTERNAL_URL",
  "http://127.0.0.1:3001",
);
const financeiroFrontendInternalUrl = resolveInternalUrl(
  "FINANCEIRO_FRONTEND_INTERNAL_URL",
  "http://127.0.0.1:3003",
);
const financeiroInternalBasePath = resolveFinanceiroInternalBasePath();

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1"],
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${escolaBackendInternalUrl}/api/v1/:path*`,
      },
      {
        source: "/api/financeiro/:path*",
        destination: `${escolaBackendInternalUrl}/api/v1/financeiro/gateway/:path*`,
      },
      {
        source: "/financeiro-app/:path*",
        destination: `${financeiroFrontendInternalUrl}${financeiroInternalBasePath}/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/financeiro-app/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'",
          },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
