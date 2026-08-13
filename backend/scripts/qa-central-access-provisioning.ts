import "reflect-metadata";
import "dotenv/config";
import { randomBytes } from "node:crypto";
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
    login: "QA.PROF.CENTRAL.20260804",
    email: "QA.PROF.CENTRAL.20260804@MSINFOR.TEST",
    name: "QA INTEGRACAO CENTRAL - PROFESSOR",
    profile: "PROFESSOR_PADRAO",
  },
  student: {
    login: "QA.ALUNO.CENTRAL.20260804",
    email: "QA.ALUNO.CENTRAL.20260804@MSINFOR.TEST",
    name: "QA INTEGRACAO CENTRAL - ALUNO",
    profile: "ALUNO_CONSULTA",
  },
  guardian: {
    login: "QA.RESP.CENTRAL.20260804",
    email: "QA.RESP.CENTRAL.20260804@MSINFOR.TEST",
    name: "QA INTEGRACAO CENTRAL - RESPONSAVEL",
    profile: "RESPONSAVEL_CONSULTA",
  },
} as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function makeEphemeralPassword() {
  return `Qa!${randomBytes(24).toString("base64url")}`;
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });

  try {
    const prisma = app.get(PrismaService);
    const teachers = app.get(TeachersService);
    const students = app.get(StudentsService);
    const guardians = app.get(GuardiansService);

    const tenant = await prisma.tenant.findFirst({
      where: {
        name: "TCHA",
        canceledAt: null,
        centralTenantId: { not: null },
      },
      include: {
        branches: {
          where: { branchCode: 1, canceledAt: null, isActive: true },
          take: 1,
        },
      },
    });
    assert(tenant, "A escola TCHA vinculada à Central não foi encontrada.");
    assert(tenant.centralTenantId, "A escola TCHA não possui vínculo com a Central.");
    assert(tenant.branches.length === 1, "A filial 1 ativa da escola TCHA não foi encontrada.");

    const admin = await prisma.user.findFirst({
      where: {
        tenantId: tenant.id,
        role: "ADMIN",
        canceledAt: null,
      },
      orderBy: { createdAt: "asc" },
      include: { person: { select: { email: true } } },
    });
    assert(admin, "Nenhum administrador ativo foi encontrado na escola TCHA.");

    const currentUser: ICurrentUser = {
      userId: admin.id,
      tenantId: tenant.id,
      branchCode: 1,
      role: "ADMIN",
      permissions: [],
      name: admin.name,
      email: admin.person?.email,
      branchAccessCodes: [1],
      canAccessAllBranches: false,
      isMaster: false,
      modelType: "user",
      identityProvider: "LOCAL",
    };

    const result = await tenantContext.run(
      {
        userId: admin.id,
        tenantId: tenant.id,
        branchCode: 1,
        role: "ADMIN",
        isMaster: false,
      },
      async () => {
        const teacherPassword = makeEphemeralPassword();
        const studentPassword = makeEphemeralPassword();
        const guardianPassword = makeEphemeralPassword();

        const existingTeacher = await prisma.teacher.findFirst({
          where: { tenantId: tenant.id, accessUsername: QA_ACCOUNTS.teacher.login },
        });
        const teacherPayload = {
          name: QA_ACCOUNTS.teacher.name,
          email: QA_ACCOUNTS.teacher.email,
          accessUsername: QA_ACCOUNTS.teacher.login,
          password: teacherPassword,
          accessProfile: QA_ACCOUNTS.teacher.profile,
          branchCode: 1,
          branchAccessCodes: [1],
        };
        const teacher = existingTeacher
          ? await teachers.update(existingTeacher.id, teacherPayload, currentUser)
          : await teachers.create(teacherPayload, currentUser);

        const existingStudent = await prisma.student.findFirst({
          where: { tenantId: tenant.id, accessUsername: QA_ACCOUNTS.student.login },
        });
        const studentPayload = {
          name: QA_ACCOUNTS.student.name,
          email: QA_ACCOUNTS.student.email,
          accessUsername: QA_ACCOUNTS.student.login,
          password: studentPassword,
          accessProfile: QA_ACCOUNTS.student.profile,
          branchCode: 1,
          branchAccessCodes: [1],
        };
        const student = existingStudent
          ? await students.update(existingStudent.id, studentPayload, currentUser)
          : await students.create(studentPayload, currentUser);

        const existingGuardian = await prisma.guardian.findFirst({
          where: { tenantId: tenant.id, accessUsername: QA_ACCOUNTS.guardian.login },
        });
        const guardianPayload = {
          name: QA_ACCOUNTS.guardian.name,
          email: QA_ACCOUNTS.guardian.email,
          accessUsername: QA_ACCOUNTS.guardian.login,
          password: guardianPassword,
          accessProfile: QA_ACCOUNTS.guardian.profile,
          branchCode: 1,
          branchAccessCodes: [1],
        };
        const guardian = existingGuardian
          ? await guardians.update(existingGuardian.id, guardianPayload, currentUser)
          : await guardians.create(guardianPayload, currentUser);

        const existingLink = await prisma.guardianStudent.findFirst({
          where: {
            tenantId: tenant.id,
            guardianId: guardian.id,
            studentId: student.id,
            canceledAt: null,
          },
        });
        const link = existingLink || (await guardians.linkStudent(guardian.id, {
          studentId: student.id,
          kinship: "MAE",
        }));

        await teachers.setActiveStatus(teacher.id, false);
        await teachers.setActiveStatus(teacher.id, true);
        await students.setActiveStatus(student.id, false);
        await students.setActiveStatus(student.id, true);
        await guardians.setActiveStatus(guardian.id, false);
        await guardians.setActiveStatus(guardian.id, true);

        const localCredentials = await prisma.emailCredential.findMany({
          where: {
            email: {
              in: [
                QA_ACCOUNTS.teacher.email,
                QA_ACCOUNTS.student.email,
                QA_ACCOUNTS.guardian.email,
              ],
            },
          },
          select: { email: true, passwordHash: true },
        });
        assert(
          localCredentials.length === 3,
          "Os vínculos locais de e-mail dos perfis de teste não foram criados.",
        );
        assert(
          localCredentials.every((credential) => credential.passwordHash === null),
          "Uma senha gerenciada pela Central foi persistida indevidamente na Escola.",
        );

        return {
          teacher: {
            id: teacher.id,
            login: QA_ACCOUNTS.teacher.login,
            profile: QA_ACCOUNTS.teacher.profile,
            operation: existingTeacher ? "UPDATED_AND_RESYNCHRONIZED" : "CREATED",
          },
          student: {
            id: student.id,
            login: QA_ACCOUNTS.student.login,
            profile: QA_ACCOUNTS.student.profile,
            operation: existingStudent ? "UPDATED_AND_RESYNCHRONIZED" : "CREATED",
          },
          guardian: {
            id: guardian.id,
            login: QA_ACCOUNTS.guardian.login,
            profile: QA_ACCOUNTS.guardian.profile,
            operation: existingGuardian ? "UPDATED_AND_RESYNCHRONIZED" : "CREATED",
          },
          guardianStudentLink: {
            id: link.id,
            operation: existingLink ? "ALREADY_ACTIVE" : "CREATED",
          },
          lifecycle: "DEACTIVATED_AND_REACTIVATED_WITH_FINAL_ACTIVE_STATUS",
          localCredentialPolicy: "EMAIL_LINK_ONLY_WITHOUT_PASSWORD_HASH",
        };
      },
    );

    console.log(JSON.stringify({
      status: "SUCCESS",
      sourceSystem: "ESCOLA",
      tenant: {
        localId: tenant.id,
        centralId: tenant.centralTenantId,
        name: tenant.name,
        branchCode: 1,
        branchName: tenant.branches[0].name,
      },
      credentials: "GENERATED_IN_MEMORY_AND_NOT_PRINTED",
      records: result,
    }, null, 2));
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error("[QA CENTRAL ESCOLA] Falha:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
