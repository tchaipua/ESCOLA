import "reflect-metadata";
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { tenantContext } from "../src/common/tenant/tenant.context";
import { ICurrentUser } from "../src/common/decorators/current-user.decorator";
import { TeachersService } from "../src/modules/teachers/application/services/teachers.service";
import { StudentsService } from "../src/modules/students/application/services/students.service";
import { GuardiansService } from "../src/modules/guardians/application/services/guardians.service";

const QA_ACCOUNTS = {
  teacher: {
    login: "QA.UI.PROF.CENTRAL.20260804",
    email: "QA.UI.PROF.CENTRAL.20260804@MSINFOR.TEST",
    name: "QA UI PROFESSOR CENTRAL 20260804",
    profile: "PROFESSOR_PADRAO",
  },
  student: {
    login: "QA.UI.ALUNO.CENTRAL.20260804",
    email: "QA.UI.ALUNO.CENTRAL.20260804@MSINFOR.TEST",
    name: "QA UI ALUNO CENTRAL 20260804",
    profile: "ALUNO_CONSULTA",
  },
  guardian: {
    login: "QA.UI.RESP.CENTRAL.20260804",
    email: "QA.UI.RESP.CENTRAL.20260804@MSINFOR.TEST",
    name: "QA UI RESPONSAVEL CENTRAL 20260804",
    profile: "RESPONSAVEL_CONSULTA",
  },
} as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertRoleLinksUnchanged(
  label: string,
  before: Array<{ id: string; personId: string | null; branchCode: number }>,
  after: Array<{ id: string; personId: string | null; branchCode: number }>,
) {
  const afterById = new Map(after.map((record) => [record.id, record]));
  assert(before.length === after.length, `${label}: a quantidade de registros foi alterada.`);
  for (const previous of before) {
    const current = afterById.get(previous.id);
    assert(current, `${label}: um registro não relacionado desapareceu.`);
    assert(
      current.personId === previous.personId && current.branchCode === previous.branchCode,
      `${label}: um vínculo não relacionado foi alterado.`,
    );
  }
}

async function main() {
  assert(
    process.env.NODE_ENV !== "production",
    "Este verificador não pode ser executado em produção.",
  );
  const password = String(process.env.QA_UI_SCHOOL_PASSWORD || "");
  assert(password.length >= 6, "A credencial temporária da Escola não foi fornecida.");

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });

  try {
    const prisma = app.get(PrismaService);
    const teachers = app.get(TeachersService);
    const students = app.get(StudentsService);
    const guardians = app.get(GuardiansService);
    const tenant = await prisma.tenant.findFirst({
      where: { name: "TCHA", canceledAt: null, centralTenantId: { not: null } },
      include: {
        branches: {
          where: { branchCode: 1, canceledAt: null, isActive: true },
          take: 1,
        },
      },
    });
    assert(tenant, "A escola TCHA vinculada à Central não foi encontrada.");
    assert(tenant.branches.length === 1, "A filial 1 ativa da escola não foi encontrada.");

    const operator = await prisma.user.findFirst({
      where: { tenantId: tenant.id, role: "ADMIN", canceledAt: null },
      orderBy: { createdAt: "asc" },
      include: { person: { select: { email: true } } },
    });
    assert(operator, "Administrador local da escola não encontrado.");

    const currentUser: ICurrentUser = {
      userId: operator.id,
      tenantId: tenant.id,
      branchCode: 1,
      role: "ADMIN",
      permissions: [],
      name: operator.name,
      email: operator.person?.email,
      branchAccessCodes: [1],
      canAccessAllBranches: true,
      isMaster: false,
      modelType: "user",
      identityProvider: "LOCAL",
    };

    const result = await tenantContext.run(
      {
        userId: operator.id,
        tenantId: tenant.id,
        branchCode: 1,
        role: "ADMIN",
        isMaster: false,
      },
      async () => {
        const teacherRecord = await prisma.teacher.findFirst({
          where: { tenantId: tenant.id, accessUsername: QA_ACCOUNTS.teacher.login },
        });
        const studentRecord = await prisma.student.findFirst({
          where: { tenantId: tenant.id, accessUsername: QA_ACCOUNTS.student.login },
        });
        const guardianRecord = await prisma.guardian.findFirst({
          where: { tenantId: tenant.id, accessUsername: QA_ACCOUNTS.guardian.login },
        });
        assert(teacherRecord, "O professor cadastrado pela interface não foi encontrado.");
        assert(studentRecord, "O aluno cadastrado pela interface não foi encontrado.");
        assert(guardianRecord, "O responsável cadastrado pela interface não foi encontrado.");

        const unrelatedBefore = await Promise.all([
          prisma.teacher.findMany({
            where: { tenantId: tenant.id, id: { not: teacherRecord.id } },
            select: { id: true, personId: true, branchCode: true },
          }),
          prisma.student.findMany({
            where: { tenantId: tenant.id, id: { not: studentRecord.id } },
            select: { id: true, personId: true, branchCode: true },
          }),
          prisma.guardian.findMany({
            where: { tenantId: tenant.id, id: { not: guardianRecord.id } },
            select: { id: true, personId: true, branchCode: true },
          }),
        ]);

        const sharedPayload = (account: (typeof QA_ACCOUNTS)[keyof typeof QA_ACCOUNTS]) => ({
          name: account.name,
          email: account.email,
          accessUsername: account.login,
          password,
          accessProfile: account.profile,
          branchCode: 1,
          branchAccessCodes: [1],
        });

        await teachers.update(
          teacherRecord.id,
          sharedPayload(QA_ACCOUNTS.teacher),
          currentUser,
        );
        await students.update(
          studentRecord.id,
          sharedPayload(QA_ACCOUNTS.student),
          currentUser,
        );
        await guardians.update(
          guardianRecord.id,
          sharedPayload(QA_ACCOUNTS.guardian),
          currentUser,
        );

        const [teacher, student, guardian, credentials, unrelatedAfter] = await Promise.all([
          prisma.teacher.findUnique({
            where: { id: teacherRecord.id },
            include: { person: true, branchAccesses: { where: { canceledAt: null } } },
          }),
          prisma.student.findUnique({
            where: { id: studentRecord.id },
            include: { person: true, branchAccesses: { where: { canceledAt: null } } },
          }),
          prisma.guardian.findUnique({
            where: { id: guardianRecord.id },
            include: { person: true, branchAccesses: { where: { canceledAt: null } } },
          }),
          prisma.emailCredential.findMany({
            where: { email: { in: Object.values(QA_ACCOUNTS).map((item) => item.email) } },
            select: {
              email: true,
              passwordHash: true,
              centralIdentityAccountId: true,
            },
          }),
          Promise.all([
            prisma.teacher.findMany({
              where: { tenantId: tenant.id, id: { not: teacherRecord.id } },
              select: { id: true, personId: true, branchCode: true },
            }),
            prisma.student.findMany({
              where: { tenantId: tenant.id, id: { not: studentRecord.id } },
              select: { id: true, personId: true, branchCode: true },
            }),
            prisma.guardian.findMany({
              where: { tenantId: tenant.id, id: { not: guardianRecord.id } },
              select: { id: true, personId: true, branchCode: true },
            }),
          ]),
        ]);

        assertRoleLinksUnchanged("PROFESSORES", unrelatedBefore[0], unrelatedAfter[0]);
        assertRoleLinksUnchanged("ALUNOS", unrelatedBefore[1], unrelatedAfter[1]);
        assertRoleLinksUnchanged("RESPONSÁVEIS", unrelatedBefore[2], unrelatedAfter[2]);

        const records = [
          { kind: "PROFESSOR", expected: QA_ACCOUNTS.teacher, record: teacher },
          { kind: "ALUNO", expected: QA_ACCOUNTS.student, record: student },
          { kind: "RESPONSAVEL", expected: QA_ACCOUNTS.guardian, record: guardian },
        ];
        for (const item of records) {
          assert(item.record?.person, `${item.kind} permaneceu sem cadastro-base de pessoa.`);
          assert(item.record.person.name === item.expected.name, `${item.kind} ficou com nome incorreto.`);
          assert(item.record.person.email === item.expected.email, `${item.kind} ficou com e-mail incorreto.`);
          assert(item.record.accessProfile === item.expected.profile, `${item.kind} ficou com perfil incorreto.`);
          assert(
            item.record.branchCode === 1 ||
              item.record.branchAccesses.some((access) => access.branchCode === 1),
            `${item.kind} ficou sem acesso à filial 1.`,
          );
        }
        assert(credentials.length === 3, "Os três vínculos locais de e-mail não foram encontrados.");
        assert(
          credentials.every((credential) => credential.passwordHash === null),
          "Uma senha gerenciada pela Central foi persistida localmente.",
        );

        return {
          roles: records.map((item) => ({
            kind: item.kind,
            id: item.record!.id,
            personId: item.record!.personId,
            login: item.expected.login,
            name: item.record!.person!.name,
            profile: item.record!.accessProfile,
            branchCode: 1,
          })),
          localCredentialPolicy: "EMAIL_LINK_ONLY_WITHOUT_PASSWORD_HASH",
          centralLinksAlreadyBound: credentials.filter(
            (credential) => credential.centralIdentityAccountId,
          ).length,
          unrelatedRoleLinksVerified: unrelatedAfter.reduce(
            (total, records) => total + records.length,
            0,
          ),
        };
      },
    );

    console.log(JSON.stringify({
      status: "SUCCESS",
      sourceSystem: "ESCOLA",
      tenantId: tenant.id,
      centralTenantId: tenant.centralTenantId,
      credential: "READ_FROM_TEST_ENVIRONMENT_AND_NOT_PRINTED",
      ...result,
    }, null, 2));
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(
    "[QA UI ESCOLA] Falha:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
