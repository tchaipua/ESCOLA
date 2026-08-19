const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { authorizeFinanceiroGatewayRequest } = require("../dist/src/integrations/financeiro/financeiro-gateway.policy.js");

const admin = { userId: "ADMIN", tenantId: "TENANT", branchCode: 1, role: "ADMIN", permissions: [] };
const viewer = { ...admin, role: "SECRETARIA", permissions: ["VIEW_FINANCIAL"] };
assert.doesNotThrow(() => authorizeFinanceiroGatewayRequest(admin, "GET", "financial-notifications/events"));
assert.doesNotThrow(() => authorizeFinanceiroGatewayRequest(admin, "PATCH", "financial-notifications/subjects/USER/preferences"));
assert.throws(() => authorizeFinanceiroGatewayRequest(viewer, "GET", "financial-notifications/events"), /administrador/);

const guardSource = fs.readFileSync(path.resolve(__dirname, "../src/integrations/financeiro/financeiro-callback-auth.guard.ts"), "utf8");
const notificationSource = fs.readFileSync(path.resolve(__dirname, "../src/modules/notifications/application/services/notifications.service.ts"), "utf8");
const schemaSource = fs.readFileSync(path.resolve(__dirname, "../prisma/schema.prisma"), "utf8");
assert.match(guardSource, /FINANCIAL_NOTIFICATIONS_WRITE/);
assert.match(notificationSource, /tenantId_deliveryId/);
assert.match(notificationSource, /recipientUserId.*tenantId: callback\.tenantId/s);
assert.match(schemaSource, /@@unique\(\[tenantId, deliveryId\]\)/);
assert.match(notificationSource, /category: "FINANCEIRO"/);
console.log("financial notification callback tests: ok");
