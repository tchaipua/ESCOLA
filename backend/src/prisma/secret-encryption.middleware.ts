import { Prisma } from "@prisma/client";
import { encryptSecret } from "../common/security/secret-encryption";

export const SECRET_FIELDS_BY_MODEL: Record<string, readonly string[]> = {
  Tenant: [
    "smtpPassword",
    "telegramBotToken",
    "storageProviderSecretAccessKey",
  ],
  TenantBranch: [
    "smtpPassword",
    "telegramBotToken",
    "storageProviderSecretAccessKey",
  ],
  SeriesClass: ["smtpPassword"],
};

const GLOBAL_SETTING_SECRET_FIELDS = [
  "emailSmtpPassword",
  "s3SecretKey",
] as const;

function protectField(
  data: Record<string, unknown>,
  model: string,
  field: string,
) {
  const value = data[field];
  if (typeof value === "string" && value) {
    data[field] = encryptSecret(value, `${model}.${field}`);
    return;
  }
  if (
    value &&
    typeof value === "object" &&
    typeof (value as { set?: unknown }).set === "string" &&
    (value as { set: string }).set
  ) {
    (value as { set: string }).set = encryptSecret(
      (value as { set: string }).set,
      `${model}.${field}`,
    );
  }
}

export function protectGlobalSettingValue(serialized: string) {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(serialized) as Record<string, unknown>;
  } catch {
    return serialized;
  }

  let changed = false;
  for (const field of GLOBAL_SETTING_SECRET_FIELDS) {
    const value = parsed[field];
    if (typeof value !== "string" || !value) {
      continue;
    }
    const protectedValue = encryptSecret(value, `GlobalSetting.${field}`);
    parsed[field] = protectedValue;
    changed = changed || protectedValue !== value;
  }

  return changed ? JSON.stringify(parsed) : serialized;
}

function protectData(model: string, data: unknown) {
  if (Array.isArray(data)) {
    data.forEach((entry) => protectData(model, entry));
    return;
  }
  if (!data || typeof data !== "object") return;

  const record = data as Record<string, unknown>;
  for (const field of SECRET_FIELDS_BY_MODEL[model] || []) {
    protectField(record, model, field);
  }

  if (model === "GlobalSetting" && typeof record.settingValue === "string") {
    record.settingValue = protectGlobalSettingValue(record.settingValue);
  } else if (
    model === "GlobalSetting" &&
    record.settingValue &&
    typeof record.settingValue === "object" &&
    typeof (record.settingValue as { set?: unknown }).set === "string"
  ) {
    const settingValue = record.settingValue as { set: string };
    settingValue.set = protectGlobalSettingValue(settingValue.set);
  }
}

export function secretEncryptionMiddleware(): Prisma.Middleware {
  return async (params, next) => {
    if (params.model && params.args) {
      for (const key of ["data", "create", "update"]) {
        if (params.args[key]) {
          protectData(params.model, params.args[key]);
        }
      }
    }
    return next(params);
  };
}
