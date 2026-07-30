require("dotenv/config");

const { createHash, createHmac, randomBytes } = require("node:crypto");
const { existsSync, mkdirSync } = require("node:fs");
const { execFileSync } = require("node:child_process");
const { basename, dirname, resolve } = require("node:path");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE_PATTERN = /^[A-Z][A-Z0-9_:-]{0,63}$/;
const MAX_BRANCHES_PER_TENANT = 10_000;

function canonicalTarget(target) {
  const url = new URL(target, "https://central.msinfor.invalid");
  const encode = (value) => encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  const query = Array.from(url.searchParams.entries())
    .map(([key, value]) => [encode(key), encode(value)])
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return `${url.pathname}${query ? `?${query}` : ""}`;
}

function centralConfiguration() {
  const baseUrl = String(process.env.MSINFOR_CENTRAL_API_URL || "").trim().replace(/\/+$/, "");
  const systemId = String(process.env.MSINFOR_CENTRAL_SYSTEM_ID || "ESCOLA").trim().toUpperCase();
  const secret = String(process.env.MSINFOR_CENTRAL_SYSTEM_KEY || "").trim();
  if (!baseUrl || !/^https?:\/\//i.test(baseUrl) || !CODE_PATTERN.test(systemId) || systemId !== "ESCOLA" || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("A integração segura com o MSINFOR Central não está configurada para a Escola.");
  }
  return { baseUrl, systemId, secret };
}

function databaseUrl() {
  const value = String(process.env.DATABASE_URL || "").trim();
  if (!value) throw new Error("DATABASE_URL é obrigatória para inventariar filiais.");
  return value;
}

function createSqliteBackup(url) {
  if (!url.startsWith("file:")) {
    throw new Error("Para banco não SQLite, realize backup verificado pelo operador antes da sincronização.");
  }
  const relativePath = decodeURIComponent(url.slice("file:".length).split("?", 1)[0]);
  const directSource = resolve(process.cwd(), relativePath);
  const prismaRelativeSource = resolve(process.cwd(), "prisma", relativePath);
  const source = existsSync(directSource) ? directSource : prismaRelativeSource;
  if (!existsSync(source)) throw new Error("O banco SQLite local não foi localizado para backup.");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destinationDirectory = resolve(process.cwd(), ".local-backups", `central-branches-${stamp}`);
  mkdirSync(destinationDirectory, { recursive: true });
  const destination = resolve(destinationDirectory, basename(source));
  const python = [
    "import sqlite3, sys",
    "source = sqlite3.connect(sys.argv[1])",
    "target = sqlite3.connect(sys.argv[2])",
    "source.backup(target)",
    "target.close()",
    "source.close()",
  ].join("; ");
  execFileSync("python", ["-c", python, source, destination], { stdio: "pipe" });
  return destination;
}

async function loadInventory() {
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const tenants = await prisma.tenant.findMany({
      where: { canceledAt: null },
      select: {
        id: true,
        centralTenantId: true,
        centralTenantCode: true,
        branches: { select: { branchCode: true, name: true, isActive: true }, orderBy: { branchCode: "asc" } },
      },
      orderBy: { id: "asc" },
    });
    return tenants.map((tenant) => {
      if (!UUID_PATTERN.test(String(tenant.centralTenantId || "")) || !CODE_PATTERN.test(String(tenant.centralTenantCode || ""))) {
        throw new Error("Existe empresa local ativa sem vínculo global válido; nenhuma filial foi sincronizada.");
      }
      if (!tenant.branches.length || tenant.branches.length > MAX_BRANCHES_PER_TENANT) {
        throw new Error("Inventário de filiais inválido; nenhuma filial foi sincronizada.");
      }
      const seenCodes = new Set();
      const branches = tenant.branches.map((branch) => {
        const code = Number(branch.branchCode);
        const displayName = String(branch.name || "").trim();
        if (!Number.isSafeInteger(code) || code < 1 || seenCodes.has(code) || displayName.length < 2 || displayName.length > 160) {
          throw new Error("Inventário de filiais inválido; nenhuma filial foi sincronizada.");
        }
        seenCodes.add(code);
        return { branchCode: code, displayName, isActive: Boolean(branch.isActive) };
      });
      return { tenantId: tenant.centralTenantId.toLowerCase(), branches };
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function sendSynchronization(configuration, payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  const target = new URL("/api/v1/control-plane/technical/tenant-branches/synchronize", `${configuration.baseUrl}/`);
  if (target.origin !== new URL(configuration.baseUrl).origin) throw new Error("URL técnica da Central inválida.");
  const timestamp = Date.now().toString();
  const nonce = randomBytes(24).toString("base64url");
  const bodyHash = createHash("sha256").update(body).digest("hex");
  const signature = createHmac("sha256", configuration.secret)
    .update(["v1", configuration.systemId, "POST", canonicalTarget(`${target.pathname}${target.search}`), timestamp, nonce, bodyHash].join("\n"))
    .digest("hex");
  const response = await fetch(target, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-msinfor-signature-version": "v1",
      "x-msinfor-system-id": configuration.systemId,
      "x-msinfor-timestamp": timestamp,
      "x-msinfor-nonce": nonce,
      "x-msinfor-content-sha256": bodyHash,
      "x-msinfor-signature": signature,
    },
    body,
    signal: AbortSignal.timeout(8_000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result || result.tenantId !== payload.tenantId || !Array.isArray(result.synchronized)) {
    const detail = typeof result?.message === "string" ? result.message.slice(0, 180) : "";
    throw new Error(`A Central recusou a sincronização de filiais (HTTP ${response.status})${detail ? `: ${detail}` : ""}. Nenhuma operação local foi alterada.`);
  }
  return result.synchronized.length;
}

async function main() {
  const apply = process.argv.slice(2).length === 1 && process.argv[2] === "--apply";
  if (process.argv.slice(2).length && !apply) throw new Error("Use apenas --apply para executar a sincronização.");
  const inventory = await loadInventory();
  const totalBranches = inventory.reduce((total, item) => total + item.branches.length, 0);
  if (!apply) {
    console.log(`Simulação aprovada: ${inventory.length} empresa(s) e ${totalBranches} filial(is) seriam sincronizadas. Execute novamente com --apply.`);
    return;
  }
  const backup = createSqliteBackup(databaseUrl());
  const configuration = centralConfiguration();
  let synchronized = 0;
  for (const item of inventory) synchronized += await sendSynchronization(configuration, item);
  console.log(`Sincronização concluída: ${synchronized} filial(is) espelhada(s) na Central. Backup local: ${dirname(backup)}.`);
}

main().catch((error) => {
  console.error(String(error?.message || "Falha na sincronização de filiais."));
  process.exitCode = 1;
});
