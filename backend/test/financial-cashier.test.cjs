const assert = require("node:assert/strict");

const {
  FinancialCashierService,
} = require("../dist/src/modules/financial-cashier/application/services/financial-cashier.service.js");

function createCurrentUser(overrides = {}) {
  return {
    userId: "user-1",
    tenantId: "tenant-1",
    role: "SECRETARIA",
    permissions: ["VIEW_CASHIER", "SETTLE_RECEIVABLES", "CLOSE_CASHIER"],
    email: "caixa@escola.com",
    modelType: "user",
    isMaster: false,
    ...overrides,
  };
}

function createService() {
  const calls = {
    getCurrentCashSession: [],
    openCashSession: [],
    closeCurrentCashSession: [],
    listInstallments: [],
    listOpenInstallments: [],
    settleCashInstallment: [],
  };

  const prisma = {
    user: {
      findFirst: async () => ({ name: "Caixa Teste" }),
    },
    teacher: {
      findFirst: async () => null,
    },
    student: {
      findFirst: async () => null,
    },
    guardian: {
      findFirst: async () => null,
    },
  };

  const financeiroService = {
    getCurrentCashSession: async (payload) => {
      calls.getCurrentCashSession.push(payload);
      return { id: "cash-1", status: "OPEN" };
    },
    openCashSession: async (payload) => {
      calls.openCashSession.push(payload);
      return { id: "cash-1", status: "OPEN", cashierDisplayName: payload.cashierDisplayName };
    },
    closeCurrentCashSession: async (payload) => {
      calls.closeCurrentCashSession.push(payload);
      return { id: "cash-1", status: "CLOSED" };
    },
    listInstallments: async (payload) => {
      calls.listInstallments.push(payload);
      return [{ id: "inst-1", sourceInstallmentKey: "KEY-1", status: payload.status || "OPEN" }];
    },
    listOpenInstallments: async (payload) => {
      calls.listOpenInstallments.push(payload);
      return [{ id: "inst-1", sourceInstallmentKey: "KEY-1" }];
    },
    settleCashInstallment: async (installmentId, payload) => {
      calls.settleCashInstallment.push({ installmentId, payload });
      return { installmentId, status: "PAID", paymentMethod: "CASH" };
    },
  };

  return {
    service: new FinancialCashierService(prisma, financeiroService),
    calls,
  };
}

async function testOpenSessionUsesCurrentTenantAndOperatorName() {
  const { service, calls } = createService();
  const currentUser = createCurrentUser();

  const result = await service.openSession(currentUser, {
    openingAmount: 25,
    notes: "ABERTURA TESTE",
  });

  assert.equal(result.status, "OPEN");
  assert.equal(calls.openCashSession.length, 1);
  assert.deepEqual(calls.openCashSession[0], {
    requestedBy: "user-1",
    sourceSystem: "ESCOLA",
    sourceTenantId: "tenant-1",
    cashierUserId: "user-1",
    cashierDisplayName: "CAIXA TESTE",
    openingAmount: 25,
    notes: "ABERTURA TESTE",
  });
}

async function testGetCurrentSessionUsesLoggedUserAsCashier() {
  const { service, calls } = createService();
  const currentUser = createCurrentUser();

  const result = await service.getCurrentSession(currentUser);

  assert.equal(result.status, "OPEN");
  assert.equal(calls.getCurrentCashSession.length, 1);
  assert.deepEqual(calls.getCurrentCashSession[0], {
    sourceSystem: "ESCOLA",
    sourceTenantId: "tenant-1",
    cashierUserId: "user-1",
  });
}

async function testListOpenInstallmentsRespectsTenantScope() {
  const { service, calls } = createService();
  const currentUser = createCurrentUser();

  const result = await service.listInstallments(currentUser, {
    status: "OVERDUE",
    studentName: "EDUARDO",
    payerName: "MARÇAL",
  });

  assert.equal(result.length, 1);
  assert.equal(calls.listInstallments.length, 1);
  assert.deepEqual(calls.listInstallments[0], {
    sourceSystem: "ESCOLA",
    sourceTenantId: "tenant-1",
    status: "OVERDUE",
    studentName: "EDUARDO",
    payerName: "MARÇAL",
    search: undefined,
  });
}

async function testSettleCashInstallmentSendsCashierIdentityToFinanceiro() {
  const { service, calls } = createService();
  const currentUser = createCurrentUser();

  const result = await service.settleCashInstallment(currentUser, "inst-1", {
    discountAmount: 5,
    interestAmount: 2,
    notes: "RECEBIMENTO NO BALCAO",
  });

  assert.equal(result.status, "PAID");
  assert.equal(calls.settleCashInstallment.length, 1);
  assert.deepEqual(calls.settleCashInstallment[0], {
    installmentId: "inst-1",
    payload: {
      requestedBy: "user-1",
      sourceSystem: "ESCOLA",
      sourceTenantId: "tenant-1",
      cashierUserId: "user-1",
      cashierDisplayName: "CAIXA TESTE",
      receivedAt: undefined,
      discountAmount: 5,
      interestAmount: 2,
      penaltyAmount: undefined,
      notes: "RECEBIMENTO NO BALCAO",
    },
  });
}

async function testCloseSessionUsesLoggedUserAndClosingData() {
  const { service, calls } = createService();
  const currentUser = createCurrentUser();

  const result = await service.closeSession(currentUser, {
    declaredClosingAmount: 170,
    notes: "FECHAMENTO TESTE",
  });

  assert.equal(result.status, "CLOSED");
  assert.equal(calls.closeCurrentCashSession.length, 1);
  assert.deepEqual(calls.closeCurrentCashSession[0], {
    requestedBy: "user-1",
    sourceSystem: "ESCOLA",
    sourceTenantId: "tenant-1",
    cashierUserId: "user-1",
    declaredClosingAmount: 170,
    closedAt: undefined,
    notes: "FECHAMENTO TESTE",
  });
}

async function main() {
  const tests = [
    {
      name: "financial cashier open session sends tenant and operator to Financeiro",
      fn: testOpenSessionUsesCurrentTenantAndOperatorName,
    },
    {
      name: "financial cashier current session uses logged user as cashier",
      fn: testGetCurrentSessionUsesLoggedUserAsCashier,
    },
    {
      name: "financial cashier installments keeps tenant scope and filters",
      fn: testListOpenInstallmentsRespectsTenantScope,
    },
    {
      name: "financial cashier settle sends cashier identity to Financeiro",
      fn: testSettleCashInstallmentSendsCashierIdentityToFinanceiro,
    },
    {
      name: "financial cashier close session sends closing payload",
      fn: testCloseSessionUsesLoggedUserAndClosingData,
    },
  ];

  for (const currentTest of tests) {
    await currentTest.fn();
    console.log(`PASS ${currentTest.name}`);
  }

  console.log(`TOTAL ${tests.length} TESTS PASSING`);
}

main().catch((error) => {
  console.error("TEST_FAILURE", error);
  process.exitCode = 1;
});
