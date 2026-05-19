PRAGMA foreign_keys=OFF;

CREATE TABLE "new_tenants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "interestRate" REAL,
    "penaltyRate" REAL,
    "penaltyValue" REAL,
    "penaltyGracePeriod" INTEGER,
    "interestGracePeriod" INTEGER,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpTimeout" INTEGER,
    "smtpAuthenticate" BOOLEAN,
    "smtpSecure" BOOLEAN,
    "smtpAuthType" TEXT,
    "smtpEmail" TEXT,
    "smtpPassword" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT
);

INSERT INTO "new_tenants" (
    "id",
    "name",
    "interestRate",
    "penaltyRate",
    "penaltyValue",
    "penaltyGracePeriod",
    "interestGracePeriod",
    "smtpHost",
    "smtpPort",
    "smtpTimeout",
    "smtpAuthenticate",
    "smtpSecure",
    "smtpAuthType",
    "smtpEmail",
    "smtpPassword",
    "createdAt",
    "createdBy",
    "updatedAt",
    "updatedBy",
    "canceledAt",
    "canceledBy"
)
SELECT
    "id",
    "name",
    "interestRate",
    "penaltyRate",
    "penaltyValue",
    "penaltyGracePeriod",
    "interestGracePeriod",
    "smtpHost",
    "smtpPort",
    "smtpTimeout",
    "smtpAuthenticate",
    "smtpSecure",
    "smtpAuthType",
    "smtpEmail",
    "smtpPassword",
    "createdAt",
    "createdBy",
    "updatedAt",
    "updatedBy",
    "canceledAt",
    "canceledBy"
FROM "tenants";

DROP TABLE "tenants";
ALTER TABLE "new_tenants" RENAME TO "tenants";

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
