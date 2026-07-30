const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const {
  MsInforCentralSettingsClient,
  canonicalizeCentralTarget,
} = require("../dist/src/integrations/msinfor-central/msinfor-central-settings.client.js");
const {
  CentralTenantConfigurationService,
} = require("../dist/src/integrations/msinfor-central/central-tenant-configuration.service.js");
const {
  TenantsService,
} = require("../dist/src/modules/tenants/application/services/tenants.service.js");
const {
  FinanceiroService,
} = require("../dist/src/integrations/financeiro/financeiro.service.js");
const {
  CommunicationsService,
} = require("../dist/src/modules/communications/application/services/communications.service.js");

const LOCAL_TENANT_ID = "11111111-1111-4111-8111-111111111111";
const CENTRAL_TENANT_ID = "22222222-2222-4222-8222-222222222222";
const BRANCH_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_TENANT_ID = "44444444-4444-4444-8444-444444444444";

function company(overrides = {}) {
  return {
    legalName: "ESCOLA CENTRAL LTDA",
    tradeName: "ESCOLA CENTRAL",
    documentNumber: "12345678000190",
    stateRegistration: "ISENTO",
    municipalRegistration: "",
    address: {
      postalCode: "14400000",
      street: "RUA CENTRAL",
      number: "100",
      complement: "",
      district: "CENTRO",
      city: "FRANCA",
      state: "SP",
      country: "BRASIL",
    },
    contacts: {
      phone: "1630256025",
      mobile: "",
      secondaryMobile: "",
      whatsapp: "",
      email: "CONTATO@EXAMPLE.TEST",
      website: "",
    },
    logoReference: "https://cdn.example.test/escola.png",
    ...overrides,
  };
}

function configuration({ tenantId = CENTRAL_TENANT_ID, branchCode = 1 } = {}) {
  return {
    tenant: {
      id: tenantId,
      code: "ESCOLA_CENTRAL",
      displayName: "ESCOLA CENTRAL",
      status: "ACTIVE",
      company: company(),
    },
    branch:
      branchCode === undefined
        ? null
        : {
            id: BRANCH_ID,
            tenantId,
            branchCode,
            displayName: "UNIDADE CENTRAL",
            status: "ACTIVE",
            company: company({ tradeName: "UNIDADE CENTRAL" }),
          },
    effective: {
      scope: "SYSTEM",
      s3: null,
      smtp: null,
      receipt: null,
      telegram: null,
      financial: null,
      commerce: null,
    },
    sources: {
      company: branchCode === undefined ? "TENANT" : "BRANCH",
      s3: "SYSTEM",
      smtp: "GLOBAL",
      receipt: null,
      telegram: null,
      financial: null,
      commerce: null,
    },
  };
}

function assertNoSecretKeys(value) {
  if (!value || typeof value !== "object") return;
  const forbidden = new Set([
    "accessKeyId",
    "secretAccessKey",
    "password",
    "botToken",
  ]);
  for (const [key, child] of Object.entries(value)) {
    assert.equal(forbidden.has(key), false, `Resposta expôs ${key}.`);
    assertNoSecretKeys(child);
  }
}

async function testSignedCentralContractAndInheritedScope() {
  process.env.NODE_ENV = "test";
  process.env.MSINFOR_CENTRAL_API_URL = "http://central.internal:3201/api/v1";
  process.env.MSINFOR_CENTRAL_SYSTEM_ID = "ESCOLA";
  process.env.MSINFOR_CENTRAL_SYSTEM_KEY = "c".repeat(48);
  let call;
  global.fetch = async (url, init) => {
    call = { url: String(url), init };
    return new Response(JSON.stringify(configuration()), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const result = await new MsInforCentralSettingsClient().findTenantConfiguration(
    CENTRAL_TENANT_ID,
    1,
  );
  assert.equal(result.effective.scope, "SYSTEM");
  assert.equal(result.sources.smtp, "GLOBAL");
  assert.equal(
    call.url,
    `http://central.internal:3201/api/v1/control-plane/technical/tenants/${CENTRAL_TENANT_ID}/configuration?branchCode=1`,
  );
  const target = new URL(call.url);
  const bodyHash = crypto.createHash("sha256").update("").digest("hex");
  const canonical = [
    "v1",
    "ESCOLA",
    "GET",
    canonicalizeCentralTarget(`${target.pathname}${target.search}`),
    call.init.headers["x-msinfor-timestamp"],
    call.init.headers["x-msinfor-nonce"],
    bodyHash,
  ].join("\n");
  assert.equal(
    call.init.headers["x-msinfor-signature"],
    crypto
      .createHmac("sha256", process.env.MSINFOR_CENTRAL_SYSTEM_KEY)
      .update(canonical)
      .digest("hex"),
  );

  global.fetch = async () =>
    new Response(
      JSON.stringify(configuration({ tenantId: OTHER_TENANT_ID })),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  await assert.rejects(
    () =>
      new MsInforCentralSettingsClient().findTenantConfiguration(
        CENTRAL_TENANT_ID,
        1,
      ),
    /tenant/,
  );
}

async function testMinimalBranchProjectionAndAudit() {
  const created = [];
  const audited = [];
  const unscoped = {
    tenant: {
      findFirst: async () => ({ centralTenantId: CENTRAL_TENANT_ID }),
    },
    tenantBranch: {
      findUnique: async () => null,
    },
    async $transaction(operation) {
      return operation({
        tenantBranch: {
          create: async ({ data }) => {
            created.push(data);
            return { id: BRANCH_ID, ...data };
          },
        },
        financeSourceParameterAuditEvent: {
          create: async ({ data }) => {
            audited.push(data);
            return data;
          },
        },
      });
    },
  };
  const prisma = {
    getUnscopedClient: () => unscoped,
    tenant: {
      findFirst: async () => {
        throw new Error("O serviço tentou usar o cliente Prisma com escopo no login.");
      },
    },
  };
  const client = {
    listTenantBranches: async (tenantId) => {
      assert.equal(tenantId, CENTRAL_TENANT_ID);
      return {
        tenantId,
        items: [configuration().branch],
      };
    },
    findTenantConfiguration: async () => configuration(),
  };
  const central = new CentralTenantConfigurationService(prisma, client);
  const branches = await central.listBranches(LOCAL_TENANT_ID);
  assert.equal(branches.length, 1);
  assert.deepEqual(
    Object.keys(created[0]).sort(),
    [
      "branchCode",
      "canceledAt",
      "canceledBy",
      "createdBy",
      "isActive",
      "name",
      "tenantId",
      "updatedBy",
    ].sort(),
  );
  assert.equal(created[0].name, "FILIAL 1");
  assert.equal(audited.length, 1);
  assert.deepEqual(JSON.parse(audited[0].parametersJson), {
    branchCode: 1,
    status: "ACTIVE",
  });
  assertNoSecretKeys(audited[0]);

  const tenants = new TenantsService({}, {}, {}, {}, central);
  const current = await tenants.findCurrent(LOCAL_TENANT_ID, 1);
  assert.equal(current.centralTenantId, CENTRAL_TENANT_ID);
  assert.equal(current.name, "UNIDADE CENTRAL");
  assert.equal(current.document, "12345678000190");
  assertNoSecretKeys(current);
}

async function testOperationalConsumersDoNotReadLocalCompanyConfiguration() {
  const centralResult = configuration();
  centralResult.effective.smtp = {
    description: "SMTP CENTRAL",
    host: "smtp.example.test",
    port: 465,
    secure: true,
    authenticate: true,
    timeout: 60,
    authType: "LOGIN",
    username: "sender@example.test",
    password: "segredo-somente-backend",
    fromName: "ESCOLA CENTRAL",
    fromEmail: "sender@example.test",
    replyTo: "reply@example.test",
  };
  centralResult.effective.telegram = {
    enabled: true,
    botUsername: "@ESCOLA_CENTRAL",
    headerImageUrl: "",
    botToken: "token-somente-backend",
  };
  centralResult.effective.commerce = {
    stockControlMode: "YES",
    stockIntegerQuantityMode: "BY_PRODUCT",
    stockLotControlMode: "NO",
    stockExpirationControlMode: "NO",
    stockGridControlMode: "NO",
    stockNegativeControlMode: "NO",
    allowSaleUnitPriceEdit: false,
    allowSaleItemDiscount: true,
    groupSameProduct: true,
    allowProductImageEdit: false,
    requirePasswordToRemoveSaleItems: true,
    businessType: "ESCOLA",
  };
  const localPrisma = new Proxy(
    {},
    {
      get() {
        throw new Error("Consumidor tentou ler configuracao cadastral local.");
      },
    },
  );
  const central = {
    findConfiguration: async (tenantId, branchCode) => {
      assert.equal(tenantId, LOCAL_TENANT_ID);
      assert.equal(branchCode, 1);
      return centralResult;
    },
    mergeCompany: (tenantCompany, branchCompany) => ({
      ...tenantCompany,
      ...branchCompany,
      address: { ...tenantCompany.address, ...branchCompany?.address },
      contacts: { ...tenantCompany.contacts, ...branchCompany?.contacts },
    }),
  };
  const currentUser = {
    userId: "user-1",
    tenantId: LOCAL_TENANT_ID,
    branchCode: 1,
    role: "ADMIN",
    name: "USUARIO TESTE",
    permissions: ["VIEW_FINANCIAL"],
  };

  const financeiro = new FinanceiroService(localPrisma, {}, central);
  const context = await financeiro.buildRuntimeContext(currentUser);
  assert.equal(context.companyName, "UNIDADE CENTRAL");
  assert.equal(context.companyDocument, "12345678000190");
  assert.equal(context.stockControlMode, "YES");
  assertNoSecretKeys(context);

  const communications = new CommunicationsService(localPrisma, central);
  const scope = await communications.getMyScope(currentUser);
  assert.equal(scope.tenant.name, "UNIDADE CENTRAL");
  assert.equal(scope.tenant.smtpHost, "smtp.example.test");
  assert.equal(scope.emailConfigured, true);
  assert.equal(scope.telegramConfigured, true);
  assertNoSecretKeys(scope);
}

async function main() {
  const originalFetch = global.fetch;
  const originalEnvironment = {
    NODE_ENV: process.env.NODE_ENV,
    MSINFOR_CENTRAL_API_URL: process.env.MSINFOR_CENTRAL_API_URL,
    MSINFOR_CENTRAL_SYSTEM_ID: process.env.MSINFOR_CENTRAL_SYSTEM_ID,
    MSINFOR_CENTRAL_SYSTEM_KEY: process.env.MSINFOR_CENTRAL_SYSTEM_KEY,
  };
  try {
    await testSignedCentralContractAndInheritedScope();
    await testMinimalBranchProjectionAndAudit();
    await testOperationalConsumersDoNotReadLocalCompanyConfiguration();
    console.log("central-company-configuration: 3 testes aprovados");
  } finally {
    global.fetch = originalFetch;
    for (const [name, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
