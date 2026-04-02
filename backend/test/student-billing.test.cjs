const assert = require("node:assert/strict");

const {
  StudentsService,
} = require("../dist/src/modules/students/application/services/students.service.js");
const {
  GuardiansService,
} = require("../dist/src/modules/guardians/application/services/guardians.service.js");
const {
  tenantContext,
} = require("../dist/src/common/tenant/tenant.context.js");

const ADMIN_VIEWER = {
  id: "admin-1",
  tenantId: "tenant-1",
  role: "ADMIN",
  permissions: [],
};

function createSharedProfilesMock() {
  return {
    hydrateMissingFieldsFromCpf: async () => undefined,
    resolveWritableName: (nextName, fallbackName) => nextName || fallbackName || "ALUNO TESTE",
    normalizeEmail: (value) => {
      const normalized = String(value || "")
        .trim()
        .toUpperCase();
      return normalized || null;
    },
    syncSharedProfile: async () => undefined,
    updateEmailCredentialPassword: async () => undefined,
    ensureEmailCredential: async () => undefined,
  };
}

function createStudentEntity(overrides = {}) {
  return {
    id: "student-1",
    tenantId: "tenant-1",
    name: "ALUNO TESTE",
    email: "ALUNO@ESCOLA.COM",
    cpf: null,
    accessProfile: "ALUNO_PADRAO",
    permissions: null,
    personId: null,
    person: null,
    guardians: [],
    enrollments: [],
    billingPayerType: "ALUNO",
    billingGuardianId: null,
    billingGuardian: null,
    ...overrides,
  };
}

function createStudentsService({
  studentEntity = createStudentEntity(),
  refreshedStudentEntity = studentEntity,
  guardianLink = { id: "link-1" },
  guardianRecord = { id: "guardian-1" },
  onStudentUpdate,
} = {}) {
  let studentFindFirstCalls = 0;

  const prisma = {
    student: {
      findFirst: async () => {
        studentFindFirstCalls += 1;
        return studentFindFirstCalls > 1 ? refreshedStudentEntity : studentEntity;
      },
      update: async (args) => {
        if (onStudentUpdate) {
          onStudentUpdate(args);
        }

        return {
          ...studentEntity,
          ...args.data,
        };
      },
    },
    guardianStudent: {
      findFirst: async () => guardianLink,
    },
    guardian: {
      findFirst: async () => guardianRecord,
    },
  };

  return new StudentsService(prisma, createSharedProfilesMock());
}

function createGuardiansService({
  existingGuardian = {
    id: "guardian-1",
    tenantId: "tenant-1",
    name: "RESPONSAVEL TESTE",
    students: [],
  },
  guardianLink = {
    id: "link-1",
    guardianId: "guardian-1",
    studentId: "student-1",
    tenantId: "tenant-1",
  },
  billingStudent = null,
  onGuardianUpdate,
  onGuardianUpdateMany,
  onGuardianStudentUpdateMany,
} = {}) {
  const prisma = {
    guardian: {
      findFirst: async () => existingGuardian,
      update: async (args) => {
        if (onGuardianUpdate) {
          onGuardianUpdate(args);
        }

        return {
          ...existingGuardian,
          ...args.data,
        };
      },
      updateMany: async (args) => {
        if (onGuardianUpdateMany) {
          onGuardianUpdateMany(args);
        }

        return { count: 1 };
      },
    },
    student: {
      findFirst: async () => billingStudent,
    },
    guardianStudent: {
      findFirst: async () => guardianLink,
      updateMany: async (args) => {
        if (onGuardianStudentUpdateMany) {
          onGuardianStudentUpdateMany(args);
        }

        return { count: 1 };
      },
    },
  };

  return new GuardiansService(prisma, {}, {});
}

async function runInTenant(task) {
  return tenantContext.run(
    {
      tenantId: "tenant-1",
      userId: "admin-1",
      role: "ADMIN",
    },
    task,
  );
}

async function testUpdateRejectsResponsiblePayerWithoutGuardian() {
  const service = createStudentsService();

  await assert.rejects(
    () =>
      runInTenant(() =>
        service.update(
          "student-1",
          { billingPayerType: "RESPONSAVEL" },
          ADMIN_VIEWER,
        ),
      ),
    (error) => {
      assert.equal(
        error.message,
        "Selecione o responsável que pagará a mensalidade do aluno.",
      );
      return true;
    },
  );
}

async function testUpdateRejectsGuardianThatIsNotLinkedToStudent() {
  const service = createStudentsService({
    guardianLink: null,
  });

  await assert.rejects(
    () =>
      runInTenant(() =>
        service.update(
          "student-1",
          {
            billingPayerType: "RESPONSAVEL",
            billingGuardianId: "guardian-1",
          },
          ADMIN_VIEWER,
        ),
      ),
    (error) => {
      assert.equal(
        error.message,
        "O responsável pagador precisa estar vinculado ativamente a este aluno.",
      );
      return true;
    },
  );
}

async function testUpdateAcceptsActiveLinkedGuardianAsBillingPayer() {
  const updatedPayloads = [];
  const refreshedStudent = createStudentEntity({
    billingPayerType: "RESPONSAVEL",
    billingGuardianId: "guardian-1",
    guardians: [
      {
        id: "link-1",
        guardian: {
          id: "guardian-1",
          name: "RESPONSAVEL TESTE",
        },
      },
    ],
    billingGuardian: {
      id: "guardian-1",
      name: "RESPONSAVEL TESTE",
    },
  });

  const service = createStudentsService({
    refreshedStudentEntity: refreshedStudent,
    onStudentUpdate: (args) => updatedPayloads.push(args.data),
  });

  const result = await runInTenant(() =>
    service.update(
      "student-1",
      {
        billingPayerType: "RESPONSAVEL",
        billingGuardianId: "guardian-1",
      },
      ADMIN_VIEWER,
    ),
  );

  assert.equal(updatedPayloads.length, 1);
  assert.equal(updatedPayloads[0].billingPayerType, "RESPONSAVEL");
  assert.equal(updatedPayloads[0].billingGuardianId, "guardian-1");
  assert.equal(result.billingPayerType, "RESPONSAVEL");
  assert.equal(result.billingGuardian?.id, "guardian-1");
}

async function testUnlinkRejectsGuardianUsedAsBillingPayer() {
  const service = createGuardiansService({
    billingStudent: {
      id: "student-1",
      name: "ALUNO TESTE",
    },
  });

  await assert.rejects(
    () => runInTenant(() => service.unlinkStudent("guardian-1", "student-1")),
    (error) => {
      assert.equal(
        error.message,
        "O responsável informado está definido como pagador da mensalidade do aluno ALUNO TESTE. Altere o pagador antes de remover o vínculo.",
      );
      return true;
    },
  );
}

async function testRemoveRejectsGuardianUsedAsBillingPayer() {
  let updateManyCalled = false;
  const service = createGuardiansService({
    billingStudent: {
      id: "student-1",
      name: "ALUNO TESTE",
    },
    onGuardianUpdateMany: () => {
      updateManyCalled = true;
    },
  });

  await assert.rejects(
    () => runInTenant(() => service.remove("guardian-1")),
    (error) => {
      assert.equal(
        error.message,
        "O responsável informado está definido como pagador da mensalidade do aluno ALUNO TESTE. Altere o pagador antes de inativar ou excluir este responsável.",
      );
      return true;
    },
  );

  assert.equal(updateManyCalled, false);
}

async function testDeactivateRejectsGuardianUsedAsBillingPayer() {
  let updateCalled = false;
  const service = createGuardiansService({
    billingStudent: {
      id: "student-1",
      name: "ALUNO TESTE",
    },
    onGuardianUpdate: () => {
      updateCalled = true;
    },
  });

  await assert.rejects(
    () => runInTenant(() => service.setActiveStatus("guardian-1", false)),
    (error) => {
      assert.equal(
        error.message,
        "O responsável informado está definido como pagador da mensalidade do aluno ALUNO TESTE. Altere o pagador antes de inativar este responsável.",
      );
      return true;
    },
  );

  assert.equal(updateCalled, false);
}

async function main() {
  const tests = [
    {
      name: "students update rejects responsible payer without guardian",
      fn: testUpdateRejectsResponsiblePayerWithoutGuardian,
    },
    {
      name: "students update rejects guardian not linked to the student",
      fn: testUpdateRejectsGuardianThatIsNotLinkedToStudent,
    },
    {
      name: "students update accepts active linked guardian as billing payer",
      fn: testUpdateAcceptsActiveLinkedGuardianAsBillingPayer,
    },
    {
      name: "guardians unlink rejects payer guardian",
      fn: testUnlinkRejectsGuardianUsedAsBillingPayer,
    },
    {
      name: "guardians remove rejects payer guardian",
      fn: testRemoveRejectsGuardianUsedAsBillingPayer,
    },
    {
      name: "guardians deactivate rejects payer guardian",
      fn: testDeactivateRejectsGuardianUsedAsBillingPayer,
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
