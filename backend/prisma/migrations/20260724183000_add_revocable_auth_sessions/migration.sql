CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jti" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "modelType" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "identityProvider" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canceledAt" DATETIME,
    "canceledBy" TEXT
);

CREATE UNIQUE INDEX "auth_sessions_jti_key"
ON "auth_sessions"("jti");

CREATE INDEX "auth_sessions_tenantId_userId_modelType_canceledAt_expiresAt_idx"
ON "auth_sessions"("tenantId", "userId", "modelType", "canceledAt", "expiresAt");

CREATE INDEX "auth_sessions_expiresAt_canceledAt_idx"
ON "auth_sessions"("expiresAt", "canceledAt");
