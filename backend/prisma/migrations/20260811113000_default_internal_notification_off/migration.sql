PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_notification_preferences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "sendInternal" BOOLEAN NOT NULL DEFAULT false,
    "sendEmail" BOOLEAN NOT NULL DEFAULT false,
    "sendTelegram" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "notification_preferences_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "notification_preferences_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_notification_preferences" ("id", "tenantId", "personId", "eventType", "enabled", "sendInternal", "sendEmail", "sendTelegram", "createdAt", "createdBy", "updatedAt", "updatedBy", "canceledAt", "canceledBy")
SELECT "id", "tenantId", "personId", "eventType", "enabled", "sendInternal", "sendEmail", "sendTelegram", "createdAt", "createdBy", "updatedAt", "updatedBy", "canceledAt", "canceledBy"
FROM "notification_preferences";

DROP TABLE "notification_preferences";
ALTER TABLE "new_notification_preferences" RENAME TO "notification_preferences";

CREATE UNIQUE INDEX "notification_preferences_tenantId_personId_eventType_key" ON "notification_preferences"("tenantId", "personId", "eventType");
CREATE INDEX "notification_preferences_tenantId_personId_idx" ON "notification_preferences"("tenantId", "personId");
CREATE INDEX "notification_preferences_tenantId_eventType_enabled_idx" ON "notification_preferences"("tenantId", "eventType", "enabled");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
