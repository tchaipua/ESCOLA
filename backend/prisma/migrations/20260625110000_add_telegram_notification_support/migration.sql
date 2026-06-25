ALTER TABLE "tenants" ADD COLUMN "telegramEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tenants" ADD COLUMN "telegramBotToken" TEXT;
ALTER TABLE "tenants" ADD COLUMN "telegramBotUsername" TEXT;

ALTER TABLE "tenant_branches" ADD COLUMN "telegramEnabled" BOOLEAN;
ALTER TABLE "tenant_branches" ADD COLUMN "telegramBotToken" TEXT;
ALTER TABLE "tenant_branches" ADD COLUMN "telegramBotUsername" TEXT;

ALTER TABLE "people" ADD COLUMN "telegramChatId" TEXT;
ALTER TABLE "people" ADD COLUMN "telegramUsername" TEXT;
ALTER TABLE "people" ADD COLUMN "telegramOptInAt" DATETIME;
ALTER TABLE "people" ADD COLUMN "telegramOptOutAt" DATETIME;

ALTER TABLE "students" ADD COLUMN "telegramChatId" TEXT;
ALTER TABLE "students" ADD COLUMN "telegramUsername" TEXT;
ALTER TABLE "students" ADD COLUMN "telegramOptInAt" DATETIME;
ALTER TABLE "students" ADD COLUMN "telegramOptOutAt" DATETIME;

ALTER TABLE "guardians" ADD COLUMN "telegramChatId" TEXT;
ALTER TABLE "guardians" ADD COLUMN "telegramUsername" TEXT;
ALTER TABLE "guardians" ADD COLUMN "telegramOptInAt" DATETIME;
ALTER TABLE "guardians" ADD COLUMN "telegramOptOutAt" DATETIME;

ALTER TABLE "lesson_events" ADD COLUMN "notifyByTelegram" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "lesson_assessments" ADD COLUMN "notifyByTelegram" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "notifications" ADD COLUMN "telegramSentAt" DATETIME;
ALTER TABLE "notifications" ADD COLUMN "telegramStatus" TEXT;
ALTER TABLE "notifications" ADD COLUMN "telegramError" TEXT;

ALTER TABLE "communication_campaigns" ADD COLUMN "sendTelegram" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "communication_campaigns" ADD COLUMN "telegramCount" INTEGER NOT NULL DEFAULT 0;
