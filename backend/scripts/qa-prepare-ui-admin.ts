import "reflect-metadata";
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { ICurrentUser } from "../src/common/decorators/current-user.decorator";
import { AuthService } from "../src/modules/auth/application/services/auth.service";
import { CentralIdentityProvisioningService } from "../src/integrations/msinfor-central/central-identity-provisioning.service";
import { SharedProfilesService } from "../src/modules/shared-profiles/application/services/shared-profiles.service";

const QA_ADMIN = {
  login: "QA.UI.ADMIN.ESCOLA.20260804@MSINFOR.TEST",
  name: "QA UI ADMIN ESCOLA",
  role: "ADMIN",
} as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function centralAccountId(value: unknown) {
  const id = String(
    (value as { account?: { id?: unknown } } | null)?.account?.id || "",
  ).trim().toLowerCase();
  assert(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id),
    "A Central não retornou a identidade criada para o administrador de QA.",
  );
  return id;
}

async function main() {
  assert(
    process.env.NODE_ENV !== "production",
    "Este preparador não pode ser executado em produção.",
  );
  const password = String(process.env.QA_UI_SCHOOL_PASSWORD || "");
  assert(password.length >= 6, "A credencial temporária da Escola não foi fornecida.");

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  try {
    const prisma = app.get(PrismaService);
    const auth = app.get(AuthService);
    const central = app.get(CentralIdentityProvisioningService);
    const sharedProfiles = app.get(SharedProfilesService);
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
    assert(tenant.branches.length === 1, "A filial 1 da escola TCHA não foi encontrada.");

    const operator = await prisma.user.findFirst({
      where: { tenantId: tenant.id, role: "ADMIN", canceledAt: null },
      orderBy: { createdAt: "asc" },
      include: { person: { select: { email: true } } },
    });
    assert(operator, "Administrador local da escola TCHA não encontrado.");
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

    let user = await prisma.user.findFirst({
      where: { tenantId: tenant.id, person: { email: QA_ADMIN.login } },
    });
    if (!user) {
      await auth.register(
        {
          name: QA_ADMIN.name,
          email: QA_ADMIN.login,
          role: QA_ADMIN.role,
          accessProfile: "ADMIN_TOTAL",
        },
        currentUser,
      );
      user = await prisma.user.findFirst({
        where: { tenantId: tenant.id, person: { email: QA_ADMIN.login } },
      });
    }
    assert(user, "O administrador local de QA não foi criado.");

    const synchronized = await central.synchronize({
      tenantId: tenant.id,
      login: QA_ADMIN.login,
      email: QA_ADMIN.login,
      displayName: QA_ADMIN.name,
      credential: password,
      externalSubjectId: `USER:${user.id}`,
      branchCodes: [1],
      roleCode: QA_ADMIN.role,
    });
    const accountId = centralAccountId(synchronized);
    await sharedProfiles.bindCentralIdentity(
      QA_ADMIN.login,
      accountId,
      operator.id,
    );

    console.log(JSON.stringify({
      status: "SUCCESS",
      login: QA_ADMIN.login,
      localUserId: user.id,
      centralAccountId: accountId,
      tenantId: tenant.id,
      centralTenantId: tenant.centralTenantId,
      branchCode: 1,
      credential: "READ_FROM_TEST_ENVIRONMENT_AND_NOT_PRINTED",
    }, null, 2));
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error("[QA UI ADMIN ESCOLA] Falha:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
