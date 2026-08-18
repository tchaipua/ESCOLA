const assert = require("node:assert/strict");

const {
  AuthService,
} = require("../dist/src/modules/auth/application/services/auth.service.js");

const LOGIN_CASHIER_BLOCK_MESSAGE =
  "NÃO É POSSÍVEL ACESSAR O SISTEMA NA DATA DE HOJE. O CAIXA DO DIA ANTERIOR PRECISA SER FECHADO ANTES DE CONTINUAR.";

function createAccount(overrides = {}) {
  return {
    id: "user-1",
    tenantId: "tenant-1",
    branchCode: 1,
    name: "CAIXA TESTE",
    email: "caixa@escola.com",
    password: null,
    role: "SECRETARIA",
    cashierOnly: false,
    permissions: ["VIEW_CASHIER", "RECEIVE_PAYMENTS", "CLOSE_CASHIER"],
    modelType: "user",
    tenant: { id: "tenant-1", name: "ESCOLA TESTE" },
    ...overrides,
  };
}

function createService(financeiroService) {
  return new AuthService(
    {},
    {},
    {},
    {},
    {},
    {},
    financeiroService,
  );
}

async function testOpensCashWhenThereIsNoCurrentSession() {
  const calls = { loginCheck: [] };
  const service = createService({
    ensureLoginCashSession: async (currentUser, payload) => {
      calls.loginCheck.push({ currentUser, payload });
      return { status: "OPEN", openingAmount: 0, openedAutomatically: true };
    },
  });

  const result = await service.ensureCashSessionBeforeLogin(
    createAccount(),
    1,
    {},
    [1],
    {
      branchLogoUrl: "https://central.example/filial.png",
      branchName: "FILIAL 1",
      companyName: "ESCOLA TESTE",
    },
  );

  assert.equal(calls.loginCheck.length, 1);
  assert.deepEqual(result, {
    opened: true,
    openingAmount: 0,
    cashierDisplayName: "CAIXA TESTE",
    branchLogoUrl: "https://central.example/filial.png",
    branchName: "FILIAL 1",
    companyName: "ESCOLA TESTE",
  });
  assert.deepEqual(calls.loginCheck[0].payload, {
    requestedBy: "user-1",
    sourceSystem: "ESCOLA",
    sourceTenantId: "tenant-1",
    cashierUserId: "user-1",
    cashierDisplayName: "CAIXA TESTE",
    openingAmount: 0,
  });
  assert.equal(calls.loginCheck[0].currentUser.tenantId, "tenant-1");
  assert.equal(calls.loginCheck[0].currentUser.branchCode, 1);
}

async function testKeepsExistingOpenCash() {
  let loginCheckCalls = 0;
  const service = createService({
    ensureLoginCashSession: async () => {
      loginCheckCalls += 1;
      return {
        id: "cash-1",
        status: "OPEN",
        openingAmount: 75,
        openedAutomatically: false,
      };
    },
  });

  const result = await service.ensureCashSessionBeforeLogin(
    createAccount(),
    1,
    {},
    [1],
  );
  assert.equal(loginCheckCalls, 1);
  assert.deepEqual(result, {
    opened: false,
    openingAmount: 75,
    cashierDisplayName: "CAIXA TESTE",
    branchLogoUrl: null,
    branchName: null,
    companyName: null,
  });
}

async function testReportsAutomaticDailyOpening() {
  let loginCheckCalls = 0;
  const service = createService({
    ensureLoginCashSession: async () => {
      loginCheckCalls += 1;
      return {
        id: "cash-new-day",
        status: "OPEN",
        openingAmount: 125,
        openedAutomatically: true,
      };
    },
  });

  const result = await service.ensureCashSessionBeforeLogin(
    createAccount(),
    1,
    {},
    [1],
  );

  assert.equal(loginCheckCalls, 1);
  assert.deepEqual(result, {
    opened: true,
    openingAmount: 125,
    cashierDisplayName: "CAIXA TESTE",
    branchLogoUrl: null,
    branchName: null,
    companyName: null,
  });
}

async function testBlocksDailyRequiredCash() {
  const service = createService({
    getCurrentCashSession: async () => null,
    ensureLoginCashSession: async () => {
      const error = new Error(
        "Não é possível acessar o sistema na data de hoje: o caixa deste operador já foi fechado.",
      );
      error.response = { code: "CASH_SESSION_ALREADY_CLOSED" };
      throw error;
    },
  });

  await assert.rejects(
    service.ensureCashSessionBeforeLogin(createAccount(), 1, {}, [1]),
    (error) =>
      error?.message === LOGIN_CASHIER_BLOCK_MESSAGE &&
      error?.status === 403,
  );
}

async function testSkipsNonCashierAndUnauthorizedCentralAccess() {
  let loginCheckCalls = 0;
  const service = createService({
    ensureLoginCashSession: async () => {
      loginCheckCalls += 1;
      return { id: "cash-1", status: "OPEN", openedAutomatically: false };
    },
  });

  await service.ensureCashSessionBeforeLogin(
    createAccount({ permissions: ["VIEW_STUDENTS"] }),
    1,
    {},
    [1],
  );
  await service.ensureCashSessionBeforeLogin(
    createAccount(),
    1,
    { centralIdentityAccountId: "central-1" },
    [1],
  );
  await service.ensureCashSessionBeforeLogin(
    createAccount(),
    1,
    { centralIdentityAccountId: "central-1", canOperateCashier: true },
    [1],
  );

  assert.equal(loginCheckCalls, 1);
}

async function main() {
  const tests = [
    ["opens the Escola cash session before local login", testOpensCashWhenThereIsNoCurrentSession],
    ["keeps the current open cash session", testKeepsExistingOpenCash],
    ["reports an automatic daily opening", testReportsAutomaticDailyOpening],
    ["blocks login when daily closing is required", testBlocksDailyRequiredCash],
    ["does not preflight non-cashier or unauthorized Central access", testSkipsNonCashierAndUnauthorizedCentralAccess],
  ];

  for (const [name, test] of tests) {
    await test();
    console.log(`PASS ${name}`);
  }
  console.log(`TOTAL ${tests.length} TESTS PASSING`);
}

main().catch((error) => {
  console.error("TEST_FAILURE", error);
  process.exitCode = 1;
});
