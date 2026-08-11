UPDATE "notification_preferences"
SET "sendInternal" = false,
    "sendEmail" = false,
    "sendTelegram" = false
WHERE "enabled" = false
  AND "canceledAt" IS NULL;
