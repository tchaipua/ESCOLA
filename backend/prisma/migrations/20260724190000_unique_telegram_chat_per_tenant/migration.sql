-- Um Chat ID do Telegram só pode representar uma pessoa em cada empresa.
-- Valores NULL continuam permitidos para pessoas ainda não vinculadas.
CREATE UNIQUE INDEX "people_tenantId_telegramChatId_key"
  ON "people" ("tenantId", "telegramChatId");

-- A deduplicação persistente impede que retries do Telegram sejam processados
-- novamente depois de reinício ou em outra réplica.
CREATE TABLE "telegram_processed_updates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "updateId" TEXT NOT NULL,
    "processedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "telegram_processed_updates_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "telegram_processed_updates_tenantId_updateId_key"
  ON "telegram_processed_updates" ("tenantId", "updateId");
CREATE INDEX "telegram_processed_updates_processedAt_idx"
  ON "telegram_processed_updates" ("processedAt");

-- O estado curto de conversas precisa sobreviver a reinícios e funcionar com
-- mais de uma réplica do backend.
CREATE TABLE "telegram_pending_actions" (
    "tenantId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "date" TEXT,
    "endDate" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    PRIMARY KEY ("tenantId", "chatId"),
    CONSTRAINT "telegram_pending_actions_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "telegram_pending_actions_expiresAt_idx"
  ON "telegram_pending_actions" ("expiresAt");
