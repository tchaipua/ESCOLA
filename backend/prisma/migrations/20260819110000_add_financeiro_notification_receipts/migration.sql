CREATE TABLE "financeiro_notification_receipts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "notificationId" TEXT,
    "internalStatus" TEXT NOT NULL DEFAULT 'SKIPPED',
    "emailStatus" TEXT NOT NULL DEFAULT 'SKIPPED',
    "telegramStatus" TEXT NOT NULL DEFAULT 'SKIPPED',
    "lastError" TEXT,
    "processedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    CONSTRAINT "financeiro_notification_receipts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "financeiro_notification_receipts_tenantId_deliveryId_key" ON "financeiro_notification_receipts"("tenantId", "deliveryId");
CREATE INDEX "financeiro_notification_receipts_tenantId_branchCode_eventType_createdAt_idx" ON "financeiro_notification_receipts"("tenantId", "branchCode", "eventType", "createdAt");
CREATE INDEX "financeiro_notification_receipts_tenantId_recipientUserId_createdAt_idx" ON "financeiro_notification_receipts"("tenantId", "recipientUserId", "createdAt");
