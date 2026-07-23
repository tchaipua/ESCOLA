require("dotenv").config();

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const SETTING_KEY = "MSINFOR_GENERAL_SETTINGS";

function buildMasterPass(date) {
  return `S${date.getDate() + date.getHours()}${date.getMonth() + 1 + date.getMinutes()}`;
}

async function main() {
  const record = await prisma.globalSetting.findUnique({
    where: { settingKey: SETTING_KEY },
  });

  if (!record || record.canceledAt) {
    console.log("MIGRATION_SKIPPED|NO_ACTIVE_LOCAL_SETTINGS");
    return;
  }

  const payload = JSON.parse(record.settingValue);
  const baseUrl = String(
    process.env.MSINFOR_CENTRAL_API_URL || "http://localhost:3201/api/v1",
  ).replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/global-settings`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "x-msinfor-master-pass": buildMasterPass(new Date()),
      "x-msinfor-source-system": "ESCOLA_MIGRATION",
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      result?.message || `Falha HTTP ${response.status} na migração central.`,
    );
  }

  console.log(`MIGRATION_OK|VERSION=${result?.version || 1}`);
}

main()
  .catch((error) => {
    console.error(`MIGRATION_FAILED|${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
