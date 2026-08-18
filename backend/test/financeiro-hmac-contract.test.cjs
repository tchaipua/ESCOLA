const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
  FinanceiroInternalClient,
  canonicalizeFinanceiroTarget,
  resolveFinanceiroScopes,
} = require("../dist/src/integrations/financeiro/financeiro-internal.client.js");
const {
  authorizeFinanceiroGatewayRequest,
  expectedFinanceiroBinaryContentType,
  normalizeFinanceiroGatewayPath,
  shouldInjectCentralTenantIdQuery,
} = require("../dist/src/integrations/financeiro/financeiro-gateway.policy.js");
const {
  assertSafeMultipartBody,
} = require("../dist/src/integrations/financeiro/financeiro.controller.js");
const {
  FinanceiroCallbackReplayService,
} = require("../dist/src/integrations/financeiro/financeiro-callback-replay.service.js");
const {
  FinanceiroCallbackAuthGuard,
} = require("../dist/src/integrations/financeiro/financeiro-callback-auth.guard.js");
const {
  FinanceiroIntegrationController,
} = require("../dist/src/modules/tenants/infrastructure/controllers/financeiro-integration.controller.js");
const {
  getTenantContext,
} = require("../dist/src/common/tenant/tenant.context.js");
const {
  createFinanceiroCsrfToken,
  getFinanceiroCsrfCookieName,
  getSessionCookieName,
  isValidFinanceiroCsrf,
} = require("../dist/src/common/security/financeiro-session.js");
const {
  MsInforCentralSettingsClient,
  canonicalizeCentralTarget,
} = require("../dist/src/integrations/msinfor-central/msinfor-central-settings.client.js");

const originalFetch = global.fetch;
const originalEnvironment = {
  NODE_ENV: process.env.NODE_ENV,
  JWT_SECRET: process.env.JWT_SECRET,
  FINANCEIRO_API_URL: process.env.FINANCEIRO_API_URL,
  FINANCEIRO_HMAC_ESCOLA_SECRET:
    process.env.FINANCEIRO_HMAC_ESCOLA_SECRET,
  SOURCE_SYSTEM_ESCOLA_HMAC_SECRET:
    process.env.SOURCE_SYSTEM_ESCOLA_HMAC_SECRET,
  MSINFOR_CENTRAL_API_URL: process.env.MSINFOR_CENTRAL_API_URL,
  MSINFOR_CENTRAL_SYSTEM_ID: process.env.MSINFOR_CENTRAL_SYSTEM_ID,
  MSINFOR_CENTRAL_SYSTEM_KEY: process.env.MSINFOR_CENTRAL_SYSTEM_KEY,
};

function restore() {
  global.fetch = originalFetch;
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

function hmac(secret, payload) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

async function testFinanceiroOutboundSignature() {
  process.env.NODE_ENV = "test";
  process.env.FINANCEIRO_API_URL =
    "http://financeiro.internal:3002/api/v1";
  process.env.FINANCEIRO_HMAC_ESCOLA_SECRET = "f".repeat(48);
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const client = new FinanceiroInternalClient();
  const currentUser = {
    userId: "user-1",
    tenantId: "tenant-a",
    branchCode: 2,
    role: "SECRETARIA",
    permissions: ["VIEW_FINANCIAL", "MANAGE_MONTHLY_FEES"],
  };
  const body = { description: "MENSALIDADE", amount: 123.45 };
  await client.request({
    method: "POST",
    path: "receivables/import?tag=b&a=z&tag=a&a=one%20two",
    currentUser,
    json: body,
    headers: {
      "x-api-key": "must-not-leave",
      Authorization: "must-not-leave",
      "x-idempotency-key": "abcdefghijklmnop",
    },
  });

  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  const headers = init.headers;
  assert.equal(headers["x-api-key"], undefined);
  assert.equal(headers.Authorization, undefined);
  assert.equal(headers["x-msinfor-system-id"], "ESCOLA");
  assert.equal(headers["x-msinfor-tenant-id"], "TENANT-A");
  assert.equal(headers["x-msinfor-branch-code"], "2");
  assert.equal(headers["x-msinfor-user-id"], "user-1");
  assert.equal(
    headers["x-msinfor-scopes"],
    "FINANCE_ACCESS,MANAGE_FINANCIAL",
  );
  assert.match(headers["x-msinfor-timestamp"], /^\d{13}$/);
  assert.match(headers["x-msinfor-nonce"], /^[A-Za-z0-9_-]{32}$/);
  assert.equal(init.redirect, "error");
  const bodyBytes = Buffer.from(JSON.stringify(body));
  assert.equal(Buffer.from(init.body).equals(bodyBytes), true);
  const bodyHash = crypto.createHash("sha256").update(bodyBytes).digest("hex");
  assert.equal(headers["x-msinfor-content-sha256"], bodyHash);
  const target = new URL(url);
  const canonical = canonicalizeFinanceiroTarget(
    `${target.pathname}${target.search}`,
  );
  assert.equal(
    canonical,
    "/api/v1/receivables/import?a=one%20two&a=z&tag=a&tag=b",
  );
  const payload = [
    "v1",
    "ESCOLA",
    "POST",
    canonical,
    headers["x-msinfor-timestamp"],
    headers["x-msinfor-nonce"],
    bodyHash,
    "TENANT-A",
    "2",
    "user-1",
    "FINANCE_ACCESS,MANAGE_FINANCIAL",
  ].join("\n");
  assert.equal(
    headers["x-msinfor-signature"],
    hmac(process.env.FINANCEIRO_HMAC_ESCOLA_SECRET, payload),
  );

  calls.length = 0;
  await client.request({
    method: "POST",
    path: "companies/sync-source-integration-settings",
    currentUser,
    json: { sourceSystem: "ESCOLA" },
    technicalScopes: ["SOURCE_SETTINGS_SYNC"],
  });
  assert.equal(
    calls[0].init.headers["x-msinfor-scopes"],
    "SOURCE_SETTINGS_SYNC",
  );
}

function testGatewayDenyByDefaultAndDownloads() {
  const viewer = {
    userId: "u",
    tenantId: "t",
    branchCode: 1,
    role: "SECRETARIA",
    permissions: ["VIEW_FINANCIAL"],
  };
  assert.doesNotThrow(() =>
    authorizeFinanceiroGatewayRequest(viewer, "GET", "products"),
  );
  assert.throws(
    () =>
      authorizeFinanceiroGatewayRequest(
        viewer,
        "POST",
        "unknown-operation",
      ),
    /não autorizada/,
  );
  assert.throws(
    () =>
      authorizeFinanceiroGatewayRequest(
        viewer,
        "GET",
        "s3-control/configuration",
      ),
    /administrador/,
  );
  assert.throws(
    () =>
      authorizeFinanceiroGatewayRequest(
        { ...viewer, role: "ADMIN" },
        "POST",
        "unknown-operation",
      ),
    /não autorizada/,
  );
  assert.deepEqual(
    resolveFinanceiroScopes({
      ...viewer,
      permissions: ["VIEW_CASHIER"],
    }),
    ["FINANCE_ACCESS"],
  );
  assert.throws(
    () => normalizeFinanceiroGatewayPath("../companies"),
    /não autorizada/,
  );
  assert.equal(
    expectedFinanceiroBinaryContentType(
      "GET",
      "fiscal-documents/nfe/documents/abc_123/danfe",
    ),
    "application/pdf",
  );
  assert.equal(
    expectedFinanceiroBinaryContentType(
      "GET",
      "fiscal-documents/nfe/documents/abc_123/xml",
    ),
    "application/xml",
  );
  assert.equal(
    expectedFinanceiroBinaryContentType(
      "GET",
      "fiscal-documents/nfse/documents/abc_123/danfse",
    ),
    "application/pdf",
  );
  assert.equal(
    expectedFinanceiroBinaryContentType(
      "GET",
      "fiscal-documents/nfse/documents/abc_123/xml",
    ),
    "application/xml",
  );
  assert.equal(
    expectedFinanceiroBinaryContentType(
      "GET",
      "fiscal-documents/nfe/documents/abc_123/danfse",
    ),
    null,
  );
  assert.equal(
    shouldInjectCentralTenantIdQuery("companies/company-1/branches"),
    true,
  );
  assert.equal(
    shouldInjectCentralTenantIdQuery(
      "companies/company-1/branches/branch-1/central-configuration-refresh",
    ),
    true,
  );
  assert.equal(shouldInjectCentralTenantIdQuery("products"), false);
  assert.equal(
    shouldInjectCentralTenantIdQuery(
      "companies/company-1/branches/branch-1/central-editor-launch",
    ),
    false,
  );
}

function testMultipartGatewayIsFailClosed() {
  const boundary = "----msinfor-test-boundary";
  const valid = Buffer.from(
    [
      `--${boundary}`,
      'Content-Disposition: form-data; name="prefix"',
      "",
      "documentos/2026",
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="nota.xml"',
      "Content-Type: application/xml",
      "",
      "<xml />",
      `--${boundary}--`,
      "",
    ].join("\r\n"),
    "utf8",
  );
  assert.doesNotThrow(() => assertSafeMultipartBody(valid));

  const productImage = Buffer.from(
    [
      `--${boundary}`,
      'Content-Disposition: form-data; name="productId"',
      "",
      "PRODUTO-1",
      `--${boundary}`,
      'Content-Disposition: form-data; name="originScreenId"',
      "",
      "PRINCIPAL_FINANCEIRO_VENDAS_2",
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="produto.webp"',
      "Content-Type: image/webp",
      "",
      "imagem",
      `--${boundary}--`,
      "",
    ].join("\r\n"),
    "utf8",
  );
  assert.doesNotThrow(() =>
    assertSafeMultipartBody(productImage, {
      allowedTextFields: ["productId", "originScreenId"],
      requiredTextFields: ["productId"],
    }),
  );

  for (const disposition of [
    'Content-Disposition: form-data; name="contextPayload"',
    "Content-Disposition: form-data; name=companyId",
    'Content-Disposition: form-data; name="file"',
    'Content-Disposition: form-data; name="prefix"; filename="authority.json"',
  ]) {
    const invalid = Buffer.from(
      [
        `--${boundary}`,
        disposition,
        "",
        "valor",
        `--${boundary}--`,
        "",
      ].join("\r\n"),
      "utf8",
    );
    assert.throws(
      () => assertSafeMultipartBody(invalid),
      /prefix e file/,
    );
  }
}

function callbackRequest({ nonce, rawBody, declaredBody, bodyHash }) {
  const timestamp = String(Date.now());
  const tenantId = "TENANT-A";
  const userId = "finance-user";
  const originalUrl =
    "/api/v1/integrations/financeiro/company-branch-parameters?z=2&a=1";
  const hash =
    bodyHash ||
    crypto.createHash("sha256").update(rawBody).digest("hex");
  const canonical = canonicalizeFinanceiroTarget(originalUrl);
  const payload = [
    "v1",
    "FINANCEIRO",
    "PATCH",
    canonical,
    timestamp,
    nonce,
    hash,
    tenantId,
    "1",
    userId,
    "SOURCE_PARAMETERS_WRITE",
  ].join("\n");
  return {
    method: "PATCH",
    originalUrl,
    rawBody,
    body: declaredBody,
    headers: {
      "x-msinfor-signature-version": "v1",
      "x-msinfor-system-id": "FINANCEIRO",
      "x-msinfor-tenant-id": tenantId,
      "x-msinfor-branch-code": "1",
      "x-msinfor-user-id": userId,
      "x-msinfor-scopes": "SOURCE_PARAMETERS_WRITE",
      "x-msinfor-timestamp": timestamp,
      "x-msinfor-nonce": nonce,
      "x-msinfor-content-sha256": hash,
      "x-msinfor-signature": hmac(
        process.env.SOURCE_SYSTEM_ESCOLA_HMAC_SECRET,
        payload,
      ),
    },
  };
}

function executionContext(request) {
  return {
    switchToHttp() {
      return { getRequest: () => request };
    },
  };
}

function systemUserCallbackRequest(scope = "SYSTEM_USERS_WRITE") {
  const timestamp = String(Date.now());
  const tenantId = "TENANT-A";
  const userId = "finance-user";
  const originalUrl =
    "/api/v1/integrations/financeiro/system-users/resolve";
  const body = {
    document: "52998224725",
    sourceSystem: "ESCOLA",
    sourceTenantId: tenantId,
    sourceBranchCode: 1,
    requestedBy: userId,
  };
  const rawBody = Buffer.from(JSON.stringify(body));
  const bodyHash = crypto.createHash("sha256").update(rawBody).digest("hex");
  const nonce = crypto.randomBytes(24).toString("base64url");
  const payload = [
    "v1",
    "FINANCEIRO",
    "POST",
    canonicalizeFinanceiroTarget(originalUrl),
    timestamp,
    nonce,
    bodyHash,
    tenantId,
    "1",
    userId,
    scope,
  ].join("\n");
  return {
    method: "POST",
    originalUrl,
    rawBody,
    body,
    headers: {
      "x-msinfor-signature-version": "v1",
      "x-msinfor-system-id": "FINANCEIRO",
      "x-msinfor-tenant-id": tenantId,
      "x-msinfor-branch-code": "1",
      "x-msinfor-user-id": userId,
      "x-msinfor-scopes": scope,
      "x-msinfor-timestamp": timestamp,
      "x-msinfor-nonce": nonce,
      "x-msinfor-content-sha256": bodyHash,
      "x-msinfor-signature": hmac(
        process.env.SOURCE_SYSTEM_ESCOLA_HMAC_SECRET,
        payload,
      ),
    },
  };
}

function testCallbackReplayAndTamperProtection() {
  process.env.SOURCE_SYSTEM_ESCOLA_HMAC_SECRET = "g".repeat(48);
  const replay = new FinanceiroCallbackReplayService();
  const guard = new FinanceiroCallbackAuthGuard(replay);
  const body = {
    sourceSystem: "ESCOLA",
    sourceTenantId: "TENANT-A",
    sourceBranchCode: 1,
    requestedBy: "finance-user",
    entityType: "BRANCH",
    parameters: { interestRate: 1 },
  };
  const rawBody = Buffer.from(JSON.stringify(body));
  const first = callbackRequest({
    nonce: crypto.randomBytes(24).toString("base64url"),
    rawBody,
    declaredBody: body,
  });
  assert.equal(guard.canActivate(executionContext(first)), true);
  assert.throws(
    () => guard.canActivate(executionContext(first)),
    /não autorizada/,
  );

  const retryNonce = crypto.randomBytes(24).toString("base64url");
  const tampered = callbackRequest({
    nonce: retryNonce,
    rawBody,
    declaredBody: body,
    bodyHash: "0".repeat(64),
  });
  assert.throws(
    () => guard.canActivate(executionContext(tampered)),
    /não autorizada/,
  );
  const corrected = callbackRequest({
    nonce: retryNonce,
    rawBody,
    declaredBody: body,
  });
  assert.equal(guard.canActivate(executionContext(corrected)), true);
}

function testSystemUserCallbackHasDedicatedScope() {
  process.env.SOURCE_SYSTEM_ESCOLA_HMAC_SECRET = "g".repeat(48);
  const guard = new FinanceiroCallbackAuthGuard(
    new FinanceiroCallbackReplayService(),
  );
  assert.equal(
    guard.canActivate(executionContext(systemUserCallbackRequest())),
    true,
  );
  assert.throws(
    () =>
      guard.canActivate(
        executionContext(
          systemUserCallbackRequest("SOURCE_PARAMETERS_WRITE"),
        ),
      ),
    /não autorizada/,
  );
}

async function testSystemUserCallbackActivatesTenantContext() {
  let observedContext;
  const usersService = {
    resolvePersonByCpfFromFinanceiro: async () => {
      observedContext = getTenantContext();
      return { found: false };
    },
  };
  const controller = new FinanceiroIntegrationController({}, usersService, {
    tenant: {
      findMany: async () => [{ id: "tenant-a" }],
    },
  });
  const callback = {
    tenantId: "TENANT-A",
    branchCode: 4,
    userId: "finance-user",
    timestamp: Date.now(),
    nonce: crypto.randomBytes(24).toString("base64url"),
  };
  await controller.resolveSystemUserPerson(
    { financeiroCallback: callback },
    { document: "52998224725" },
  );
  assert.deepEqual(observedContext, {
    userId: "finance-user",
    tenantId: "tenant-a",
    branchCode: 4,
    role: "SOFTHOUSE_ADMIN",
    isMaster: false,
  });
  assert.equal(getTenantContext(), undefined);
}

function testCsrfIsBoundToSession() {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "j".repeat(48);
  const session = "header.payload.signature";
  const csrf = createFinanceiroCsrfToken(session);
  const cookie = `${getSessionCookieName()}=${session}; ${getFinanceiroCsrfCookieName()}=${csrf}`;
  const request = {
    headers: {
      cookie,
      "x-msinfor-csrf": csrf,
    },
  };
  assert.equal(isValidFinanceiroCsrf(request), true);
  request.headers.cookie = `${getSessionCookieName()}=other.session.token; ${getFinanceiroCsrfCookieName()}=${csrf}`;
  assert.equal(isValidFinanceiroCsrf(request), false);
}

async function testCentralHmacAndNoLegacyKeyHeader() {
  process.env.NODE_ENV = "test";
  process.env.MSINFOR_CENTRAL_API_URL =
    "http://central.internal:3201/api/v1";
  process.env.MSINFOR_CENTRAL_SYSTEM_ID = "ESCOLA";
  process.env.MSINFOR_CENTRAL_SYSTEM_KEY = "c".repeat(48);
  let call;
  global.fetch = async (url, init) => {
    call = { url: String(url), init };
    return new Response(JSON.stringify({ emailEnabled: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const client = new MsInforCentralSettingsClient();
  await client.findEffective();
  const headers = call.init.headers;
  assert.equal(headers["x-msinfor-system-key"], undefined);
  assert.equal(headers["x-msinfor-signature-version"], "v1");
  assert.match(headers["x-msinfor-timestamp"], /^\d{13}$/);
  assert.match(headers["x-msinfor-nonce"], /^[A-Za-z0-9_-]{32}$/);
  const target = new URL(call.url);
  const canonical = canonicalizeCentralTarget(
    `${target.pathname}${target.search}`,
  );
  const canonicalPayload = [
    "v1",
    "ESCOLA",
    "GET",
    canonical,
    headers["x-msinfor-timestamp"],
    headers["x-msinfor-nonce"],
    headers["x-msinfor-content-sha256"],
  ].join("\n");
  assert.equal(
    headers["x-msinfor-signature"],
    hmac(process.env.MSINFOR_CENTRAL_SYSTEM_KEY, canonicalPayload),
  );
  assert.equal(call.init.redirect, "error");
}

function testIframeUrlContainsPresentationOnly() {
  const root = path.resolve(__dirname, "../..");
  const files = [
    "frontend/src/app/principal/financeiro/page.tsx",
    "frontend/src/app/principal/financeiro/[section]/page.tsx",
  ];
  for (const relative of files) {
    const source = fs.readFileSync(path.join(root, relative), "utf8");
    assert.match(source, /FINANCEIRO_FRONTEND_URL = '\/financeiro-app'/);
    assert.doesNotMatch(
      source,
      /params\.set\(['"](sourceTenantId|sourceBranchCode|cashierUserId|userRole|permissions)['"]/,
    );
  }
}

async function main() {
  try {
    assert.equal(
      canonicalizeCentralTarget(
        "/api/v1/global-settings/effective?tag=b&a=z&tag=a&a=one%20two",
      ),
      "/api/v1/global-settings/effective?a=one%20two&a=z&tag=a&tag=b",
    );
    await testFinanceiroOutboundSignature();
    testGatewayDenyByDefaultAndDownloads();
    testMultipartGatewayIsFailClosed();
    testCallbackReplayAndTamperProtection();
    testSystemUserCallbackHasDedicatedScope();
    await testSystemUserCallbackActivatesTenantContext();
    testCsrfIsBoundToSession();
    await testCentralHmacAndNoLegacyKeyHeader();
    testIframeUrlContainsPresentationOnly();
    console.log("financeiro-hmac-contract: 10 testes aprovados");
  } finally {
    restore();
  }
}

main().catch((error) => {
  restore();
  console.error(error);
  process.exitCode = 1;
});
