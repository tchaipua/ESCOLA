const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { authorizeFinanceiroGatewayRequest } = require("../dist/src/integrations/financeiro/financeiro-gateway.policy.js");
const { buildFinancialNotificationMessage } = require("../dist/src/modules/notifications/application/services/notifications.service.js");

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

const amountMessage = buildFinancialNotificationMessage({
  eventType: "RECEIVABLE_INSTALLMENT_AMOUNT_CHANGED",
  fallback: "VALOR ALTERADO",
  metadata: {
    customerName: "Maria da Silva",
    saleNumber: "V-100",
    installmentNumber: 2,
    previousAmount: 100,
    nextAmount: 125.5,
  },
});
assert.match(amountMessage, /CLIENTE: MARIA DA SILVA/);
assert.match(amountMessage, /VENDA: V-100/);
assert.match(amountMessage, /VALOR ANTERIOR: R\$\s?100,00/);
assert.match(amountMessage, /NOVO VALOR: R\$\s?125,50/);

const dueDateMessage = buildFinancialNotificationMessage({
  eventType: "PAYABLE_INSTALLMENT_DUE_DATE_CHANGED",
  fallback: "VENCIMENTO ALTERADO",
  metadata: {
    supplierName: "Fornecedor Exemplo",
    invoiceNumber: "NF-20",
    previousDueDate: "2026-08-10T00:00:00.000Z",
    nextDueDate: "2026-08-25T00:00:00.000Z",
  },
});
assert.match(dueDateMessage, /FORNECEDOR: FORNECEDOR EXEMPLO/);
assert.match(dueDateMessage, /VENCIMENTO ANTERIOR: 10\/08\/2026/);
assert.match(dueDateMessage, /NOVO VENCIMENTO: 25\/08\/2026/);

const cancellationMessage = buildFinancialNotificationMessage({
  eventType: "RECEIVABLE_MOVEMENT_CANCELED",
  fallback: "A VENDA V-900 E SEU MOVIMENTO FINANCEIRO FORAM CANCELADOS. MOTIVO: AJUSTE.",
  metadata: { saleId: "SALE-900", cancellationNote: "AJUSTE" },
});
assert.match(cancellationMessage, /VENDA: V-900/);
assert.match(cancellationMessage, /MOTIVO: AJUSTE/);

const simulationMessage = buildFinancialNotificationMessage({
  eventType: "RECEIVABLE_INSTALLMENT_DUE_DATE_CHANGED",
  fallback: "EVENTO DE TESTE",
  metadata: { simulation: true },
});
assert.match(simulationMessage, /SIMULAÇÃO CONTROLADA/);
assert.match(simulationMessage, /CLIENTE: CLIENTE DE TESTE CEC/);
assert.match(simulationMessage, /VENCIMENTO ANTERIOR: 10\/08\/2026/);
console.log("financial notification callback tests: ok");
