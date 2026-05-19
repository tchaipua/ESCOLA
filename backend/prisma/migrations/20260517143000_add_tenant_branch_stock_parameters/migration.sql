ALTER TABLE "tenant_branches" ADD COLUMN "stockControlMode" TEXT NOT NULL DEFAULT 'BY_PRODUCT';
ALTER TABLE "tenant_branches" ADD COLUMN "stockIntegerQuantityMode" TEXT NOT NULL DEFAULT 'BY_PRODUCT';
ALTER TABLE "tenant_branches" ADD COLUMN "stockLotControlMode" TEXT NOT NULL DEFAULT 'BY_PRODUCT';
ALTER TABLE "tenant_branches" ADD COLUMN "stockExpirationControlMode" TEXT NOT NULL DEFAULT 'BY_PRODUCT';
ALTER TABLE "tenant_branches" ADD COLUMN "stockGridControlMode" TEXT NOT NULL DEFAULT 'BY_PRODUCT';
ALTER TABLE "tenant_branches" ADD COLUMN "stockNegativeControlMode" TEXT NOT NULL DEFAULT 'BY_PRODUCT';
