import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from "@nestjs/common";
import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { Prisma } from "@prisma/client";
import {
  decryptSecret,
  encryptSecret,
  getDataEncryptionKey,
  isEncryptedSecret,
} from "../common/security/secret-encryption";
import { PrismaService } from "./prisma.service";
import { protectGlobalSettingValue } from "./secret-encryption.middleware";

type SecretSnapshot = {
  tenants: Array<{
    id: string;
    smtpPassword: string | null;
    telegramBotToken: string | null;
    storageProviderSecretAccessKey: string | null;
  }>;
  branches: Array<{
    id: string;
    smtpPassword: string | null;
    telegramBotToken: string | null;
    storageProviderSecretAccessKey: string | null;
  }>;
  seriesClasses: Array<{ id: string; smtpPassword: string | null }>;
  globalSettings: Array<{ id: string; settingValue: string }>;
};

function hasPlaintextSecret(value?: string | null) {
  return Boolean(value && !isEncryptedSecret(value));
}

function validateStoredSecret(value: string | null, context: string) {
  if (value && isEncryptedSecret(value)) {
    decryptSecret(value, context);
  }
}

export async function writeEncryptedSecretBackup(snapshot: SecretSnapshot) {
  const backupDirectory = resolve(
    process.cwd(),
    process.env.SECRET_MIGRATION_BACKUP_DIR || ".local-backups",
  );
  await mkdir(backupDirectory, { recursive: true, mode: 0o700 });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = randomBytes(6).toString("hex");
  const backupPath = resolve(
    backupDirectory,
    `secret-migration-${timestamp}-${suffix}.json.enc`,
  );
  const encryptedPayload = encryptSecret(
    JSON.stringify({
      version: 1,
      createdAt: new Date().toISOString(),
      snapshot,
    }),
    "SecretMigration.backup",
  );
  await writeFile(backupPath, encryptedPayload, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  return backupPath;
}

@Injectable()
export class SecretMigrationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SecretMigrationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    const client = this.prisma.getUnscopedClient();
    const [tenants, branches, seriesClasses, globalSettings] =
      await Promise.all([
        client.tenant.findMany({
          select: {
            id: true,
            smtpPassword: true,
            telegramBotToken: true,
            storageProviderSecretAccessKey: true,
          },
        }),
        client.tenantBranch.findMany({
          select: {
            id: true,
            smtpPassword: true,
            telegramBotToken: true,
            storageProviderSecretAccessKey: true,
          },
        }),
        client.seriesClass.findMany({
          select: { id: true, smtpPassword: true },
        }),
        client.globalSetting.findMany({
          select: { id: true, settingValue: true },
        }),
      ]);

    const snapshot: SecretSnapshot = {
      tenants,
      branches,
      seriesClasses,
      globalSettings,
    };
    const secretValues = [
      ...tenants.flatMap((row) => [
        [row.smtpPassword, "Tenant.smtpPassword"] as const,
        [row.telegramBotToken, "Tenant.telegramBotToken"] as const,
        [
          row.storageProviderSecretAccessKey,
          "Tenant.storageProviderSecretAccessKey",
        ] as const,
      ]),
      ...branches.flatMap((row) => [
        [row.smtpPassword, "TenantBranch.smtpPassword"] as const,
        [row.telegramBotToken, "TenantBranch.telegramBotToken"] as const,
        [
          row.storageProviderSecretAccessKey,
          "TenantBranch.storageProviderSecretAccessKey",
        ] as const,
      ]),
      ...seriesClasses.map(
        (row) => [row.smtpPassword, "SeriesClass.smtpPassword"] as const,
      ),
    ];

    for (const [value, context] of secretValues) {
      validateStoredSecret(value, context);
    }

    let hasPlaintextGlobalSetting = false;
    for (const row of globalSettings) {
      try {
        const value = JSON.parse(row.settingValue) as Record<string, unknown>;
        for (const field of ["emailSmtpPassword", "s3SecretKey"]) {
          const secret = typeof value[field] === "string" ? value[field] : "";
          validateStoredSecret(secret, `GlobalSetting.${field}`);
          if (hasPlaintextSecret(secret)) hasPlaintextGlobalSetting = true;
        }
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("adulterado")
        ) {
          throw error;
        }
      }
    }
    const hasPlaintext =
      secretValues.some(([value]) => hasPlaintextSecret(value)) ||
      hasPlaintextGlobalSetting;

    if (!hasPlaintext) return;
    if (!getDataEncryptionKey()) {
      throw new Error(
        "Foram encontrados segredos em texto puro. Configure DATA_ENCRYPTION_KEY para executar a migração automática.",
      );
    }

    const backupPath = await writeEncryptedSecretBackup(snapshot);
    await client.$transaction(async (transaction) => {
      for (const row of tenants) {
        const data: Prisma.TenantUpdateInput = {};
        if (hasPlaintextSecret(row.smtpPassword)) {
          data.smtpPassword = encryptSecret(
            row.smtpPassword!,
            "Tenant.smtpPassword",
          );
        }
        if (hasPlaintextSecret(row.telegramBotToken)) {
          data.telegramBotToken = encryptSecret(
            row.telegramBotToken!,
            "Tenant.telegramBotToken",
          );
        }
        if (hasPlaintextSecret(row.storageProviderSecretAccessKey)) {
          data.storageProviderSecretAccessKey = encryptSecret(
            row.storageProviderSecretAccessKey!,
            "Tenant.storageProviderSecretAccessKey",
          );
        }
        if (Object.keys(data).length) {
          await transaction.tenant.update({ where: { id: row.id }, data });
        }
      }

      for (const row of branches) {
        const data: Prisma.TenantBranchUpdateInput = {};
        if (hasPlaintextSecret(row.smtpPassword)) {
          data.smtpPassword = encryptSecret(
            row.smtpPassword!,
            "TenantBranch.smtpPassword",
          );
        }
        if (hasPlaintextSecret(row.telegramBotToken)) {
          data.telegramBotToken = encryptSecret(
            row.telegramBotToken!,
            "TenantBranch.telegramBotToken",
          );
        }
        if (hasPlaintextSecret(row.storageProviderSecretAccessKey)) {
          data.storageProviderSecretAccessKey = encryptSecret(
            row.storageProviderSecretAccessKey!,
            "TenantBranch.storageProviderSecretAccessKey",
          );
        }
        if (Object.keys(data).length) {
          await transaction.tenantBranch.update({
            where: { id: row.id },
            data,
          });
        }
      }

      for (const row of seriesClasses) {
        if (hasPlaintextSecret(row.smtpPassword)) {
          await transaction.seriesClass.update({
            where: { id: row.id },
            data: {
              smtpPassword: encryptSecret(
                row.smtpPassword!,
                "SeriesClass.smtpPassword",
              ),
            },
          });
        }
      }

      for (const row of globalSettings) {
        const settingValue = protectGlobalSettingValue(row.settingValue);
        if (settingValue !== row.settingValue) {
          await transaction.globalSetting.update({
            where: { id: row.id },
            data: { settingValue },
          });
        }
      }
    });

    this.logger.log(
      `Migração idempotente de segredos concluída; backup criptografado local: ${backupPath}`,
    );
  }
}
