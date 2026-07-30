const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
  MsInforCentralSettingsClient,
  canonicalizeCentralTarget,
} = require("../dist/src/integrations/msinfor-central/msinfor-central-settings.client.js");
const {
  AuthService,
  AUTH_SESSION_TOKEN,
} = require("../dist/src/modules/auth/application/services/auth.service.js");
const {
  JwtStrategy,
  extractSessionCookieJwt,
} = require("../dist/src/modules/auth/application/strategies/jwt.strategy.js");
const {
  AuthController,
} = require("../dist/src/modules/auth/infrastructure/controllers/auth.controller.js");
const {
  CookieCsrfGuard,
} = require("../dist/src/common/guards/cookie-csrf.guard.js");
const {
  TenantMiddleware,
} = require("../dist/src/common/tenant/tenant.middleware.js");
const {
  getTenantContext,
} = require("../dist/src/common/tenant/tenant.context.js");
const {
  createEscolaCsrfToken,
  getEscolaCsrfCookieName,
  getSessionCookieName,
} = require("../dist/src/common/security/financeiro-session.js");
const {
  assertRuntimeRoleAudit,
} = require("../scripts/assert-postgres-runtime-role.cjs");
const {
  linkCentralTenant,
  parseArguments,
  validateLinkInput,
} = require("../scripts/link-central-tenant.cjs");

const CENTRAL_ACCOUNT_ID = "10000000-0000-4000-8000-000000000001";
const CENTRAL_TENANT_ID = "20000000-0000-4000-8000-000000000002";
const LOCAL_TENANT_ID = "30000000-0000-4000-8000-000000000003";
const LOCAL_USER_ID = "40000000-0000-4000-8000-000000000004";
const originalFetch = global.fetch;
const originalEnvironment = { ...process.env };

function restoreEnvironment() {
  global.fetch = originalFetch;
  for (const name of Object.keys(process.env)) {
    if (!(name in originalEnvironment)) delete process.env[name];
  }
  Object.assign(process.env, originalEnvironment);
}

function hmac(secret, payload) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

async function testCentralIdentityUsesExactHmacBody() {
  process.env.NODE_ENV = "development";
  process.env.MSINFOR_CENTRAL_API_URL =
    "http://central.internal:3201/api/v1";
  process.env.MSINFOR_CENTRAL_SYSTEM_ID = "ESCOLA";
  process.env.MSINFOR_CENTRAL_SYSTEM_KEY = "c".repeat(48);
  let call;
  global.fetch = async (url, init) => {
    call = { url: String(url), init };
    return new Response(
      JSON.stringify({
        authenticated: true,
        account: {
          id: CENTRAL_ACCOUNT_ID,
          displayName: "Usuário Central",
        },
        tenantId: CENTRAL_TENANT_ID,
        systemCode: "ESCOLA",
        databaseAlias: "ESCOLA_TEST",
        routeVersion: 3,
        effectiveAt: "2026-07-24T18:00:00.000Z",
        roleCode: "SECRETARIA",
        branchCodes: [1],
        mfaRequired: false,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  };

  const client = new MsInforCentralSettingsClient();
  const result = await client.authenticateAndResolve(
    " Usuario@Example.Test ",
    "credencial humana",
    CENTRAL_TENANT_ID,
  );
  assert.equal(result.tenantId, CENTRAL_TENANT_ID);
  const expectedBody = Buffer.from(
    JSON.stringify({
      login: "usuario@example.test",
      credential: "credencial humana",
      tenantId: CENTRAL_TENANT_ID,
    }),
  );
  assert.equal(Buffer.from(call.init.body).equals(expectedBody), true);
  assert.equal(call.init.redirect, "error");
  assert.equal(call.init.headers["x-msinfor-system-key"], undefined);
  assert.equal(call.init.headers.Authorization, undefined);
  const target = new URL(call.url);
  const canonical = canonicalizeCentralTarget(
    `${target.pathname}${target.search}`,
  );
  const bodyHash = crypto
    .createHash("sha256")
    .update(expectedBody)
    .digest("hex");
  const signedPayload = [
    "v1",
    "ESCOLA",
    "POST",
    canonical,
    call.init.headers["x-msinfor-timestamp"],
    call.init.headers["x-msinfor-nonce"],
    bodyHash,
  ].join("\n");
  assert.equal(
    call.init.headers["x-msinfor-signature"],
    hmac(process.env.MSINFOR_CENTRAL_SYSTEM_KEY, signedPayload),
  );
}

function createAuthHarness({
  centralRole = "SECRETARIA",
  overflowSessions = [],
} = {}) {
  const sessions = [];
  const revoked = [];
  const prisma = {
    getUnscopedClient() {
      return this;
    },
    tenant: {
      findFirst: async ({ where }) => {
        if (
          where.centralTenantId === CENTRAL_TENANT_ID ||
          where.id === LOCAL_TENANT_ID
        ) {
          return {
            id: LOCAL_TENANT_ID,
            centralTenantId: CENTRAL_TENANT_ID,
          };
        }
        return null;
      },
    },
    authSession: {
      create: async ({ data }) => {
        sessions.push({ id: `session-${sessions.length + 1}`, ...data });
      },
      findMany: async ({ skip }) => {
        assert.equal(
          skip,
          Number(process.env.AUTH_SESSION_MAX_PER_ACCOUNT || 10),
        );
        return overflowSessions;
      },
      updateMany: async ({ where, data }) => {
        revoked.push({ where, data });
        return { count: 1 };
      },
    },
    async $transaction(operation) {
      return operation(this);
    },
  };
  const signedPayloads = [];
  const centralIdentity = {
    authenticateAndResolve: async (_login, _credential, tenantId) => {
      assert.equal(tenantId, CENTRAL_TENANT_ID);
      return {
        authenticated: true,
        account: {
          id: CENTRAL_ACCOUNT_ID,
          displayName: "Usuário Central",
        },
        tenantId: CENTRAL_TENANT_ID,
        systemCode: "ESCOLA",
        databaseAlias: "ESCOLA_TEST",
        routeVersion: 1,
        effectiveAt: "2026-07-24T18:00:00.000Z",
        roleCode: centralRole,
        branchCodes: [1],
        mfaRequired: false,
      };
    },
  };
  const sharedProfiles = {
    findEmailCredential: async () => null,
    bindCentralIdentity: async (email, accountId) => {
      assert.equal(email, "USER@EXAMPLE.TEST");
      assert.equal(accountId, CENTRAL_ACCOUNT_ID);
    },
  };
  const centralConfiguration = {
    findConfiguration: async (localTenantId) => {
      assert.equal(localTenantId, LOCAL_TENANT_ID);
      return {
        tenant: {
          id: CENTRAL_TENANT_ID,
          displayName: "ESCOLA CENTRAL",
          company: {
            legalName: "ESCOLA CENTRAL LTDA",
            tradeName: "ESCOLA CENTRAL",
            logoReference: "https://cdn.example.test/logo.png",
          },
        },
      };
    },
  };
  const service = new AuthService(
    prisma,
    {
      sign(payload) {
        signedPayloads.push(payload);
        return "signed-token";
      },
    },
    sharedProfiles,
    {},
    centralIdentity,
    centralConfiguration,
  );
  service.findAccountByEmail = async () => [
    {
      id: LOCAL_USER_ID,
      tenantId: LOCAL_TENANT_ID,
      branchCode: 1,
      name: "USUÁRIO LOCAL",
      email: "USER@EXAMPLE.TEST",
      password: null,
      role: "SECRETARIA",
      permissions: ["VIEW_FINANCIAL"],
      branchAccessCodes: [1],
      modelType: "user",
      tenant: {
        id: LOCAL_TENANT_ID,
        name: "ESCOLA LOCAL",
        branches: [],
      },
    },
  ];
  service.resolveSessionBranchForAccount = async () => ({
    status: "READY",
    branchCode: 1,
    allowedBranches: [{ branchCode: 1 }],
  });
  return { service, sessions, revoked, signedPayloads };
}

async function testCentralIdentityMapsServerSideAndIssuesRevocableSession() {
  process.env.NODE_ENV = "development";
  process.env.MSINFOR_CENTRAL_IDENTITY_ENABLED = "true";
  process.env.MSINFOR_DATABASE_ALIAS = "ESCOLA_TEST";
  process.env.AUTH_SESSION_MAX_PER_ACCOUNT = "10";
  const harness = createAuthHarness();
  const result = await harness.service.login({
    email: "USER@EXAMPLE.TEST",
    password: "credencial humana",
    tenantId: CENTRAL_TENANT_ID,
  });
  assert.equal(result.status, "SUCCESS");
  assert.equal(result.user.tenantId, LOCAL_TENANT_ID);
  assert.equal(result.user.identityProvider, "MSINFOR_CENTRAL");
  assert.equal(harness.sessions.length, 1);
  assert.match(harness.sessions[0].jti, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(harness.sessions[0].tenantId, LOCAL_TENANT_ID);
  assert.equal(harness.signedPayloads[0].tenantId, LOCAL_TENANT_ID);
  assert.equal(
    harness.signedPayloads[0].jti,
    harness.sessions[0].jti,
  );

  await harness.service.logout({
    userId: LOCAL_USER_ID,
    tenantId: LOCAL_TENANT_ID,
    branchCode: 1,
    role: "SECRETARIA",
    permissions: [],
    sessionJti: harness.sessions[0].jti,
  });
  assert.equal(harness.revoked.length, 1);
  assert.equal(
    harness.revoked[0].where.jti,
    harness.sessions[0].jti,
  );

  const mismatch = createAuthHarness({ centralRole: "ADMIN" });
  await assert.rejects(
    mismatch.service.login({
      email: "USER@EXAMPLE.TEST",
      password: "credencial humana",
      tenantId: CENTRAL_TENANT_ID,
    }),
    /não corresponde a um acesso local/,
  );
  assert.equal(mismatch.sessions.length, 0);

  process.env.AUTH_SESSION_MAX_PER_ACCOUNT = "1";
  const limited = createAuthHarness({
    overflowSessions: [{ id: "older-session" }],
  });
  await limited.service.login({
    email: "USER@EXAMPLE.TEST",
    password: "credencial humana",
    tenantId: CENTRAL_TENANT_ID,
  });
  assert.deepEqual(limited.revoked[0].where.id.in, ["older-session"]);
  assert.equal(limited.revoked[0].data.canceledBy, "SESSION_LIMIT");

  const recovery = await limited.service.forgotPassword({
    email: "USER@EXAMPLE.TEST",
  });
  assert.equal(recovery.status, "CENTRAL_IDENTITY_REQUIRED");
  await assert.rejects(
    limited.service.changeSharedPassword(
      LOCAL_USER_ID,
      LOCAL_TENANT_ID,
      "user",
      "senha atual",
      "nova senha",
    ),
    /administrada pelo MSINFOR Central/,
  );
}

async function testRevokedSessionIsRejectedByJwtStrategy() {
  const jti = crypto.randomBytes(32).toString("base64url");
  let active = true;
  const prisma = {
    getUnscopedClient() {
      return this;
    },
    authSession: {
      findFirst: async () =>
        active
          ? { jti, identityProvider: "MSINFOR_CENTRAL" }
          : null,
    },
    user: {
      findFirst: async () => ({
        id: LOCAL_USER_ID,
        tenantId: LOCAL_TENANT_ID,
        branchCode: 1,
        name: "USUÁRIO",
        role: "SECRETARIA",
        accessProfile: null,
        complementaryProfiles: null,
        permissions: null,
        cashierOnly: false,
        email: "USER@EXAMPLE.TEST",
        branchAccesses: [{ branchCode: 1, isDefault: true }],
      }),
    },
    teacher: { findFirst: async () => null },
    student: { findFirst: async () => null },
    guardian: { findFirst: async () => null },
  };
  const strategy = new JwtStrategy(prisma);
  const payload = {
    userId: LOCAL_USER_ID,
    tenantId: LOCAL_TENANT_ID,
    branchCode: 1,
    role: "SECRETARIA",
    modelType: "user",
    jti,
  };
  const currentUser = await strategy.validate(payload);
  assert.equal(currentUser.sessionJti, jti);
  active = false;
  await assert.rejects(
    strategy.validate(payload),
    /revogada ou inexistente/,
  );
}

async function testCookieIsTheOnlyAcceptedSessionTransport() {
  const bearerOnlyRequest = {
    headers: {
      authorization: "Bearer header.payload.signature",
    },
  };
  assert.equal(extractSessionCookieJwt(bearerOnlyRequest), null);
  assert.equal(bearerOnlyRequest.msinforAuthTransport, undefined);

  const sessionToken = "cookie.header.payload";
  const cookieRequest = {
    headers: {
      authorization: "Bearer must-never-win",
      cookie: `${getSessionCookieName()}=${sessionToken}`,
    },
  };
  assert.equal(extractSessionCookieJwt(cookieRequest), sessionToken);
  assert.equal(cookieRequest.msinforAuthTransport, "cookie");

  const responseCookies = [];
  const response = {
    cookie(name, value, options) {
      responseCookies.push({ name, value, options });
      return this;
    },
  };
  const controller = new AuthController({
    login: async () => ({
      status: "SUCCESS",
      [AUTH_SESSION_TOKEN]: sessionToken,
      user: {
        id: LOCAL_USER_ID,
        tenantId: LOCAL_TENANT_ID,
        role: "SECRETARIA",
      },
    }),
  });
  const responseBody = await controller.login(
    { email: "USER@EXAMPLE.TEST", password: "secret" },
    response,
  );

  assert.equal("access_token" in responseBody, false);
  assert.equal(JSON.stringify(responseBody).includes(sessionToken), false);
  const sessionCookie = responseCookies.find(
    (cookie) => cookie.name === getSessionCookieName(),
  );
  assert.equal(sessionCookie?.value, sessionToken);
  assert.equal(sessionCookie?.options?.httpOnly, true);
  assert.equal(sessionCookie?.options?.sameSite, "strict");

  const unsignedPayload = Buffer.from(
    JSON.stringify({
      userId: LOCAL_USER_ID,
      tenantId: LOCAL_TENANT_ID,
      branchCode: 1,
      role: "SECRETARIA",
    }),
  ).toString("base64url");
  const forgedBearer = `header.${unsignedPayload}.signature`;
  let tenantContextFromBearer = "not-called";
  new TenantMiddleware().use(
    {
      headers: {
        authorization: `Bearer ${forgedBearer}`,
      },
    },
    {},
    () => {
      tenantContextFromBearer = getTenantContext();
    },
  );
  assert.equal(tenantContextFromBearer, undefined);
}

function csrfExecutionContext(request, isPublic = false) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
    isPublic,
  };
}

function testGlobalCookieCsrfGuard() {
  process.env.NODE_ENV = "development";
  process.env.JWT_SECRET = "j".repeat(48);
  process.env.CORS_ALLOWED_ORIGINS = "http://localhost:3000";
  const sessionToken = "header.payload.signature";
  const csrf = createEscolaCsrfToken(sessionToken);
  const baseRequest = {
    method: "POST",
    msinforAuthTransport: "cookie",
    headers: {
      origin: "http://localhost:3000",
      "sec-fetch-site": "same-origin",
      "x-msinfor-csrf": csrf,
      cookie: `${getSessionCookieName()}=${sessionToken}; ${getEscolaCsrfCookieName()}=${csrf}`,
    },
  };
  const guard = new CookieCsrfGuard({
    getAllAndOverride: () => false,
  });
  assert.equal(
    guard.canActivate(csrfExecutionContext(baseRequest)),
    true,
  );
  assert.throws(
    () =>
      guard.canActivate(
        csrfExecutionContext({
          ...baseRequest,
          headers: {
            ...baseRequest.headers,
            "x-msinfor-csrf": "",
          },
        }),
      ),
    /CSRF/,
  );
  assert.throws(
    () =>
      guard.canActivate(
      csrfExecutionContext({
        ...baseRequest,
        msinforAuthTransport: "bearer",
        headers: {},
      }),
    ),
    /CSRF/,
  );
}

async function testTenantLinkScriptIsIdempotentAndFailClosed() {
  const validated = validateLinkInput(
    {
      localTenantId: LOCAL_TENANT_ID,
      centralTenantId: CENTRAL_TENANT_ID,
      centralTenantCode: "empresa_alpha",
      databaseAlias: "escola_test",
    },
    "ESCOLA_TEST",
  );
  assert.equal(validated.centralTenantCode, "EMPRESA_ALPHA");
  assert.throws(
    () => validateLinkInput(validated, "OUTRO_BANCO"),
    /não corresponde/,
  );
  assert.deepEqual(
    parseArguments([
      "--local-tenant-id",
      LOCAL_TENANT_ID,
      "--central-tenant-id",
      CENTRAL_TENANT_ID,
      "--central-tenant-code",
      "EMPRESA_ALPHA",
      "--database-alias",
      "ESCOLA_TEST",
    ]),
    {
      localTenantId: LOCAL_TENANT_ID,
      centralTenantId: CENTRAL_TENANT_ID,
      centralTenantCode: "EMPRESA_ALPHA",
      databaseAlias: "ESCOLA_TEST",
    },
  );

  const tenant = {
    id: LOCAL_TENANT_ID,
    canceledAt: null,
    centralTenantId: null,
    centralTenantCode: null,
  };
  const prisma = {
    tenant: {
      findUnique: async () => ({ ...tenant }),
      findFirst: async () => null,
      updateMany: async ({ data }) => {
        Object.assign(tenant, data);
        return { count: 1 };
      },
    },
  };
  assert.equal(
    (await linkCentralTenant(prisma, validated)).status,
    "LINKED",
  );
  assert.equal(
    (await linkCentralTenant(prisma, validated)).status,
    "ALREADY_LINKED",
  );
  await assert.rejects(
    linkCentralTenant(prisma, {
      ...validated,
      centralTenantCode: "OUTRA_EMPRESA",
    }),
    /outro código global/,
  );
}

function testRuntimeRoleAuditAndStaticContainment() {
  const safe = {
    currentUser: "escola_app",
    rolsuper: false,
    rolcreatedb: false,
    rolcreaterole: false,
    rolbypassrls: false,
    rolreplication: false,
    ownsDatabase: false,
    ownsSchema: false,
    ownsRelations: false,
    memberOfDatabaseOwnerRole: false,
    memberOfSchemaOwnerRole: false,
    memberOfRelationOwnerRole: false,
    canCreateInDatabase: false,
    canCreateInSchemas: false,
  };
  assert.doesNotThrow(() => assertRuntimeRoleAudit(safe, "escola_app"));
  for (const capability of [
    "rolsuper",
    "rolcreatedb",
    "rolcreaterole",
    "rolbypassrls",
    "rolreplication",
    "ownsDatabase",
    "ownsSchema",
    "ownsRelations",
    "memberOfDatabaseOwnerRole",
    "memberOfSchemaOwnerRole",
    "memberOfRelationOwnerRole",
    "canCreateInDatabase",
    "canCreateInSchemas",
  ]) {
    assert.throws(
      () =>
        assertRuntimeRoleAudit(
          { ...safe, [capability]: true },
          "escola_app",
        ),
      /privilégios/,
    );
  }

  const root = path.resolve(__dirname, "..");
  const entrypoint = fs.readFileSync(
    path.join(root, "scripts/docker-entrypoint.cjs"),
    "utf8",
  );
  assert.match(entrypoint, /MIGRATION_DATABASE_URL_FILE/);
  assert.match(entrypoint, /auditPostgresRuntimeRole/);
  const authSource = fs.readFileSync(
    path.join(
      root,
      "src/modules/auth/application/services/auth.service.ts",
    ),
    "utf8",
  );
  assert.doesNotMatch(
    authSource,
    /normalizedPassword\s*===\s*["']123["']/,
  );
}

async function main() {
  try {
    await testCentralIdentityUsesExactHmacBody();
    await testCentralIdentityMapsServerSideAndIssuesRevocableSession();
    await testRevokedSessionIsRejectedByJwtStrategy();
    await testCookieIsTheOnlyAcceptedSessionTransport();
    testGlobalCookieCsrfGuard();
    await testTenantLinkScriptIsIdempotentAndFailClosed();
    testRuntimeRoleAuditAndStaticContainment();
    console.log(
      "central-identity-session-security: 6 testes aprovados",
    );
  } finally {
    restoreEnvironment();
  }
}

main().catch((error) => {
  restoreEnvironment();
  console.error(error);
  process.exitCode = 1;
});
