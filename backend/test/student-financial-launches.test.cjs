const assert = require("node:assert/strict");

const {
  StudentFinancialLaunchesService,
} = require("../dist/src/modules/student-financial-launches/application/services/student-financial-launches.service.js");
const {
  tenantContext,
} = require("../dist/src/common/tenant/tenant.context.js");

function createService() {
  const calls = {
    getReceivableBatch: [],
    listInstallments: [],
    listBanks: [],
    assignBankToInstallments: [],
  };

  const prisma = {};
  const financeiroService = {
    getReceivableBatch: async (batchId, filters) => {
      calls.getReceivableBatch.push({ batchId, filters });
      return {
        id: batchId,
        companyId: "company-1",
        sourceSystem: "ESCOLA",
        sourceTenantId: "tenant-1",
        sourceBatchType: "MENSALIDADE",
        sourceBatchId: "batch-origin-1",
        referenceDate: "2026-04-01T12:00:00.000Z",
        status: "PROCESSED",
        itemCount: 2,
        processedCount: 2,
        duplicateCount: 0,
        errorCount: 0,
        payloadSnapshot: null,
        createdAt: "2026-04-14T12:00:00.000Z",
        createdBy: "user-1",
        updatedAt: "2026-04-14T12:00:00.000Z",
        updatedBy: "user-1",
        metadata: {
          scope: "ALL",
          targetLabel: "TODOS OS ALUNOS",
          installmentCount: 2,
          firstDueDate: "2026-04-10",
          schoolYear: {
            id: "sy-1",
            year: 2026,
          },
        },
        skippedItems: [],
        receivableTitles: [
          { totalAmount: 1700 },
        ],
      };
    },
    listInstallments: async (filters) => {
      calls.listInstallments.push(filters);
      return [
        {
          id: "inst-1",
          titleId: "title-1",
          batchId: "batch-1",
          sourceEntityType: "ALUNO",
          sourceEntityId: "student-1",
          sourceEntityName: "ALUNO TESTE",
          classLabel: "6 ANO A",
          businessKey: "key-1",
          sourceInstallmentKey: "inst-key-1",
          description: "MENSALIDADE 04/2026",
          payerNameSnapshot: "RESPONSAVEL TESTE",
          installmentNumber: 1,
          installmentCount: 2,
          dueDate: "2026-04-10T12:00:00.000Z",
          amount: 850,
          openAmount: 850,
          paidAmount: 0,
          status: "OPEN",
          settlementMethod: null,
          settledAt: null,
          bankAccountId: null,
          bankAccountLabel: null,
          bankAssignedAt: null,
          bankAssignedBy: null,
          isOverdue: false,
        },
      ];
    },
    listBanks: async (filters) => {
      calls.listBanks.push(filters);
      return [
        {
          id: "bank-1",
          bankCode: "341",
          bankName: "ITAU",
          branchNumber: "1234",
          branchDigit: "5",
          accountNumber: "45678",
          accountDigit: "9",
        },
      ];
    },
    assignBankToInstallments: async (batchId, payload) => {
      calls.assignBankToInstallments.push({ batchId, payload });
      return {
        batchId,
        bankAccountId: payload.bankAccountId,
        bankAccountLabel: "ITAU - AG 1234-5 - CC 45678-9",
        updatedCount: payload.installmentIds.length,
        message: "1 parcela vinculada ao banco de envio de boletos.",
      };
    },
  };

  return {
    service: new StudentFinancialLaunchesService(prisma, financeiroService),
    calls,
  };
}

async function runInTenant(task) {
  return tenantContext.run(
    {
      tenantId: "tenant-1",
      userId: "user-1",
      role: "ADMIN",
    },
    task,
  );
}

async function testBankDispatchLoadsScopedBatchBanksAndInstallments() {
  const { service, calls } = createService();

  const result = await runInTenant(() => service.bankDispatch("batch-1"));

  assert.equal(result.batch.id, "batch-1");
  assert.equal(result.banks.length, 1);
  assert.equal(result.installments.length, 1);
  assert.deepEqual(calls.getReceivableBatch[0], {
    batchId: "batch-1",
    filters: {
      sourceSystem: "ESCOLA",
      sourceTenantId: "tenant-1",
    },
  });
  assert.deepEqual(calls.listInstallments[0], {
    sourceSystem: "ESCOLA",
    sourceTenantId: "tenant-1",
    batchId: "batch-1",
    status: "ALL",
  });
  assert.deepEqual(calls.listBanks[0], {
    sourceSystem: "ESCOLA",
    sourceTenantId: "tenant-1",
    status: "ACTIVE",
  });
}

async function testAssignBankUsesLoggedUserAndTenantScope() {
  const { service, calls } = createService();

  const result = await runInTenant(() =>
    service.assignBank("batch-1", {
      bankAccountId: "bank-1",
      installmentIds: ["inst-1"],
    }),
  );

  assert.equal(result.updatedCount, 1);
  assert.deepEqual(calls.assignBankToInstallments[0], {
    batchId: "batch-1",
    payload: {
      requestedBy: "user-1",
      sourceSystem: "ESCOLA",
      sourceTenantId: "tenant-1",
      bankAccountId: "bank-1",
      installmentIds: ["inst-1"],
    },
  });
}

async function main() {
  const tests = [
    {
      name: "student financial launches bank dispatch loads scoped batch data",
      fn: testBankDispatchLoadsScopedBatchBanksAndInstallments,
    },
    {
      name: "student financial launches assign bank forwards user and tenant scope",
      fn: testAssignBankUsesLoggedUserAndTenantScope,
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
