export type FinanceiroScreenAuditMetadata = {
  systemName: string;
  originText: string;
  auditText: string;
  sqlText: string;
};

type FinanceiroScreenAuditTemplate = {
  screenId: string;
  match: 'exact' | 'prefix';
  originPath: string;
  description: string;
  tables: string[];
  relationships: string[];
  metrics: string[];
  filters: string[];
  order: string;
  endpoints: string[];
  sqlText: string;
};

const FINANCEIRO_APP_ROOT = 'C:\\Sistemas\\IA\\Financeiro\\frontend\\src\\app';

function financeiroAppPath(path: string) {
  return `${FINANCEIRO_APP_ROOT}\\${path.replace(/\//g, '\\')}`;
}

function buildOriginText(originPath: string) {
  return `Origem: Sistema Financeiro - caminho físico: ${financeiroAppPath(originPath)}`;
}

function normalizeScreenId(screenId: string) {
  return String(screenId || '')
    .trim()
    .replace(/[^A-Z0-9_]/gi, '_')
    .replace(/_+/g, '_')
    .toUpperCase();
}

function listItems(items: string[]) {
  return items.map((item) => `- ${item}`).join('\n');
}

function buildAuditText(template: FinanceiroScreenAuditTemplate) {
  return `--- LOGICA DA TELA ---
${template.description}

TABELAS PRINCIPAIS:
${listItems(template.tables)}

RELACIONAMENTOS:
${listItems(template.relationships)}

METRICAS / CAMPOS EXIBIDOS:
${listItems(template.metrics)}

FILTROS APLICADOS AGORA:
${listItems(template.filters)}

ORDENACAO:
- ${template.order}

ENDPOINTS / BASE LOGICA:
${listItems(template.endpoints)}

OBSERVACAO SOBRE O FILTRO DA EMPRESA:
- CO.sourceSystem e CO.sourceTenantId isolam a empresa/escola de origem no Financeiro
- :sourceSystem, :sourceTenantId, :sourceBranchCode, :companyId e demais parametros refletem o contexto autenticado ou filtros visiveis da tela
- O SQL abaixo e a base de auditoria da tela; quando a tela envia filtros dinamicos, eles sobrescrevem este fallback.`;
}

const FINANCEIRO_AUDIT_TEMPLATES: FinanceiroScreenAuditTemplate[] = [
  {
    screenId: 'PRINCIPAL_FINANCEIRO_VENDAS',
    match: 'exact',
    originPath: 'vendas/page.tsx',
    description:
      'Tela operacional de vendas do Financeiro, usada para montar o carrinho, ajustar preco unitario, desconto e quantidade, selecionar pagamentos e confirmar a venda.',
    tables: [
      'sales (S) - cabecalho das vendas confirmadas',
      'sale_items (SI) - itens, quantidade, preco, desconto e total por produto',
      'sale_payments (SP) - formas de pagamento e valores recebidos',
      'products (PR) - catalogo e parametros de estoque dos produtos',
      'stock_movements (SM) - movimentacoes historicas de estoque geradas pela venda',
      'receivable_titles (RT) e receivable_installments (RI) - contas a receber quando houver venda a prazo',
      'cash_sessions (CS) e cash_movements (CM) - caixa usado nos pagamentos a vista',
    ],
    relationships: [
      'sales.companyId = companies.id',
      'sale_items.saleId = sales.id',
      'sale_items.productId = products.id',
      'sale_payments.saleId = sales.id',
      'sales.receivableTitleId = receivable_titles.id',
      'stock_movements.sourceType = \'SALE\' e stock_movements.sourceId = sales.id',
    ],
    metrics: [
      'produto, codigo, estoque disponivel e unidade de venda',
      'valor unitario, desconto, quantidade e valor total por item',
      'subtotal, descontos, total final e formas de pagamento',
      'cliente/pagador, venda a vista, prazo, boleto ou parcelamento',
    ],
    filters: [
      'empresa por sourceSystem/sourceTenantId',
      'filial por sourceBranchCode',
      'canal de venda selecionado na tela',
      'busca de produto por nome, SKU, codigo interno ou codigo de barras',
      'regras de estoque, quantidade, lote, validade, cor/tamanho e estoque negativo resolvidas pela filial e pelo produto',
    ],
    order: 'sales.confirmedAt DESC; itens por sale_items.lineNumber ASC',
    endpoints: [
      'GET /products',
      'GET /sales',
      'GET /sales/{saleId}',
      'POST /sales',
      'POST /sales/{saleId}/cancel',
      'POST /sales/{saleId}/returns',
    ],
    sqlText: `-- PARAMETROS ATUAIS
-- :sourceSystem = sistema de origem da empresa
-- :sourceTenantId = tenant da empresa de origem
-- :sourceBranchCode = filial operacional
-- :saleChannel = canal de venda ou ALL
-- :productSearch = busca digitada para localizar produtos

SELECT
  S.id,
  S.branchCode,
  S.saleNumber,
  S.saleChannel,
  S.status,
  S.customerPartyId,
  S.customerNameSnapshot,
  S.customerDocumentSnapshot,
  S.subtotalAmount,
  S.discountAmount,
  S.totalAmount,
  S.paidAmount,
  S.receivableAmount,
  S.paymentSummary,
  S.confirmedAt,
  SI.lineNumber,
  SI.productId,
  SI.productNameSnapshot,
  SI.productCodeSnapshot,
  SI.quantity,
  SI.unitPrice,
  SI.discountAmount AS itemDiscountAmount,
  SI.totalAmount AS itemTotalAmount,
  PR.name AS currentProductName,
  SP.paymentMethod,
  SP.amount AS paymentAmount
FROM sales S
INNER JOIN companies CO
  ON CO.id = S.companyId
 AND CO.canceledAt IS NULL
LEFT JOIN sale_items SI
  ON SI.saleId = S.id
 AND SI.companyId = S.companyId
 AND SI.canceledAt IS NULL
LEFT JOIN products PR
  ON PR.id = SI.productId
 AND PR.companyId = SI.companyId
 AND PR.canceledAt IS NULL
LEFT JOIN sale_payments SP
  ON SP.saleId = S.id
 AND SP.companyId = S.companyId
 AND SP.canceledAt IS NULL
WHERE S.canceledAt IS NULL
  AND CO.sourceSystem = :sourceSystem
  AND CO.sourceTenantId = :sourceTenantId
  AND (:sourceBranchCode IS NULL OR S.branchCode = :sourceBranchCode)
  AND (:saleChannel = 'ALL' OR S.saleChannel = :saleChannel)
  AND (:productSearch IS NULL OR :productSearch = '' OR UPPER(SI.productNameSnapshot) LIKE '%' || UPPER(:productSearch) || '%')
ORDER BY S.confirmedAt DESC, SI.lineNumber ASC;`,
  },
  {
    screenId: 'PRINCIPAL_FINANCEIRO_BANCOS',
    match: 'prefix',
    originPath: 'bancos/page.tsx',
    description:
      'Tela de cadastro e manutencao de contas bancarias usadas por cobranca, boleto, PIX e retorno bancario.',
    tables: [
      'companies (CO) - empresa financeira vinculada ao sistema de origem',
      'bank_accounts (BA) - contas bancarias, credenciais e parametros de cobranca',
    ],
    relationships: [
      'bank_accounts.companyId = companies.id',
      'bank_accounts.branchCode identifica a filial operacional da conta',
    ],
    metrics: [
      'banco, agencia, conta, carteira e convenio',
      'beneficiario, documento, PIX e provedor de cobranca',
      'status ativo/inativo e datas de criacao/atualizacao',
    ],
    filters: [
      'empresa atual por sourceSystem/sourceTenantId',
      'filial atual por sourceBranchCode quando informada',
      'busca por banco, codigo, agencia, conta, beneficiario ou PIX',
      'status selecionado na tela',
      'registros sem cancelamento logico: bank_accounts.canceledAt IS NULL',
    ],
    order: 'bank_accounts.bankName ASC, bank_accounts.branchNumber ASC, bank_accounts.accountNumber ASC',
    endpoints: ['GET /banks', 'POST /banks', 'PATCH /banks/{id}', 'PATCH /banks/{id}/activate', 'PATCH /banks/{id}/inactivate'],
    sqlText: `SELECT
  BA.id,
  BA.companyId,
  BA.branchCode,
  BA.status,
  BA.bankCode,
  BA.bankName,
  BA.branchNumber,
  BA.branchDigit,
  BA.accountNumber,
  BA.accountDigit,
  BA.walletCode,
  BA.agreementCode,
  BA.pixKey,
  BA.beneficiaryName,
  BA.beneficiaryDocument,
  BA.billingProvider,
  BA.billingEnvironment,
  BA.updatedAt
FROM bank_accounts BA
INNER JOIN companies CO
  ON CO.id = BA.companyId
 AND CO.canceledAt IS NULL
WHERE BA.canceledAt IS NULL
  AND CO.sourceSystem = :sourceSystem
  AND CO.sourceTenantId = :sourceTenantId
  AND (:sourceBranchCode IS NULL OR BA.branchCode = :sourceBranchCode)
  AND (:status = 'ALL' OR BA.status = :status)
  AND (
    :search = ''
    OR UPPER(COALESCE(BA.bankName, '')) LIKE '%' || UPPER(:search) || '%'
    OR UPPER(COALESCE(BA.bankCode, '')) LIKE '%' || UPPER(:search) || '%'
    OR UPPER(COALESCE(BA.branchNumber, '')) LIKE '%' || UPPER(:search) || '%'
    OR UPPER(COALESCE(BA.accountNumber, '')) LIKE '%' || UPPER(:search) || '%'
    OR UPPER(COALESCE(BA.beneficiaryName, '')) LIKE '%' || UPPER(:search) || '%'
    OR UPPER(COALESCE(BA.pixKey, '')) LIKE '%' || UPPER(:search) || '%'
  )
ORDER BY BA.bankName ASC, BA.branchNumber ASC, BA.accountNumber ASC;`,
  },
  {
    screenId: 'PRINCIPAL_FINANCEIRO_BANCOS_EXTRATO',
    match: 'prefix',
    originPath: 'bancos/extrato/page.tsx',
    description:
      'Tela de extrato bancario aberta a partir do grid de bancos, com filtros de conta e periodo para consulta dos lancamentos reais da conta.',
    tables: [
      'companies (CO) - empresa financeira vinculada ao sistema de origem',
      'bank_accounts (BA) - conta bancaria selecionada para consulta do extrato',
    ],
    relationships: [
      'bank_accounts.companyId = companies.id',
    ],
    metrics: [
      'banco selecionado, provedor e credenciais cadastradas',
      'periodo de consulta informado na tela',
      'creditos, debitos, saldo informado e lancamentos do extrato',
    ],
    filters: [
      'empresa atual por sourceSystem/sourceTenantId',
      'banco selecionado por bankAccountId',
      'periodo informado na tela para consultar extrato bancario',
      'registros sem cancelamento logico',
    ],
    order: 'ordem bancaria retornada pela API Sicoob para o periodo consultado',
    endpoints: ['GET /banks', 'GET /banks/{bankId}/statement'],
    sqlText: `SELECT
  BA.id,
  BA.bankCode,
  BA.bankName,
  BA.branchNumber,
  BA.branchDigit,
  BA.accountNumber,
  BA.accountDigit,
  BA.billingProvider,
  BA.status,
  BA.updatedAt
FROM bank_accounts BA
INNER JOIN companies CO
  ON CO.id = BA.companyId
 AND CO.canceledAt IS NULL
WHERE BA.canceledAt IS NULL
  AND BA.status = 'ACTIVE'
  AND CO.sourceSystem = :sourceSystem
  AND CO.sourceTenantId = :sourceTenantId
  AND (:bankAccountId IS NULL OR BA.id = :bankAccountId)
ORDER BY BA.bankName ASC, BA.branchNumber ASC, BA.accountNumber ASC;`,
  },
  {
    screenId: 'PRINCIPAL_FINANCEIRO_BANCOS_MOVIMENTOS_ABERTOS',
    match: 'prefix',
    originPath: 'bancos/movimentos-abertos/page.tsx',
    description:
      'Tela de movimentos financeiros em aberto para conferencia e conciliacao bancaria.',
    tables: [
      'companies (CO) - empresa financeira vinculada ao sistema de origem',
      'bank_accounts (BA) - conta bancaria selecionada',
      'receivable_installments (RI) - parcelas recebidas vinculadas a banco',
      'receivable_titles (RT) - titulos financeiros das parcelas',
    ],
    relationships: [
      'receivable_installments.companyId = companies.id',
      'receivable_installments.bankAccountId = bank_accounts.id',
      'receivable_installments.titleId = receivable_titles.id',
    ],
    metrics: [
      'data, tipo, historico, pessoa e banco',
      'forma de recebimento e valor',
      'situacao aberta para conferencia bancaria',
    ],
    filters: [
      'empresa atual por sourceSystem/sourceTenantId',
      'parcelas pagas com banco vinculado',
      'banco selecionado por bankAccountId quando informado',
      'busca por pagador, historico ou parcela',
      'registros sem cancelamento logico',
    ],
    order: 'receivable_installments.dueDate ASC, receivable_installments.createdAt ASC',
    endpoints: ['GET /banks', 'GET /receivables/installments?status=PAID'],
    sqlText: `SELECT
  RI.id,
  RI.settledAt,
  RI.descriptionSnapshot,
  RI.payerNameSnapshot,
  RI.paidAmount,
  RI.settlementMethod,
  RI.bankAccountId,
  RI.bankAccountLabel,
  RT.businessKey,
  BA.bankName
FROM receivable_installments RI
INNER JOIN companies CO
  ON CO.id = RI.companyId
 AND CO.canceledAt IS NULL
LEFT JOIN receivable_titles RT
  ON RT.id = RI.titleId
 AND RT.companyId = RI.companyId
 AND RT.canceledAt IS NULL
LEFT JOIN bank_accounts BA
  ON BA.id = RI.bankAccountId
 AND BA.companyId = RI.companyId
 AND BA.canceledAt IS NULL
WHERE RI.canceledAt IS NULL
  AND RI.status = 'PAID'
  AND RI.bankAccountId IS NOT NULL
  AND CO.sourceSystem = :sourceSystem
  AND CO.sourceTenantId = :sourceTenantId
  AND (:bankAccountId IS NULL OR RI.bankAccountId = :bankAccountId)
ORDER BY RI.dueDate ASC, RI.createdAt ASC;`,
  },
  {
    screenId: 'PRINCIPAL_FINANCEIRO_EMPRESA',
    match: 'prefix',
    originPath: 'empresas/page.tsx',
    description:
      'Tela de configuracao da empresa financeira e parametros padrao de juros, multa, filial e estoque.',
    tables: [
      'companies (CO) - empresa financeira vinculada ao tenant de origem',
      'company_branches (CB) - filiais e configuracoes operacionais por filial',
    ],
    relationships: ['company_branches.companyId = companies.id'],
    metrics: [
      'nome, documento, origem e status da empresa',
      'juros, multa, carencia e parametros financeiros',
      'filiais e regras operacionais de estoque',
    ],
    filters: [
      'empresa atual por sourceSystem/sourceTenantId',
      'busca por nome, documento, sistema origem ou tenant',
      'registros sem cancelamento logico',
    ],
    order: 'companies.name ASC',
    endpoints: ['GET /companies', 'PATCH /companies/{id}', 'GET /companies/{id}/branches', 'PATCH /companies/{id}/branches/{branchId}'],
    sqlText: `SELECT
  CO.id,
  CO.sourceSystem,
  CO.sourceTenantId,
  CO.name,
  CO.document,
  CO.status,
  CO.interestRate,
  CO.interestGracePeriod,
  CO.penaltyRate,
  CO.penaltyValue,
  CO.penaltyGracePeriod,
  CB.branchCode,
  CB.name AS branchName,
  CB.inventoryControlType,
  CB.quantityPrecision
FROM companies CO
LEFT JOIN company_branches CB
  ON CB.companyId = CO.id
 AND CB.canceledAt IS NULL
WHERE CO.canceledAt IS NULL
  AND CO.sourceSystem = :sourceSystem
  AND CO.sourceTenantId = :sourceTenantId
ORDER BY CO.name ASC, CB.branchCode ASC;`,
  },
  {
    screenId: 'PRINCIPAL_FINANCEIRO_RESUMO',
    match: 'prefix',
    originPath: 'resumo/page.tsx',
    description:
      'Dashboard de resumo do Financeiro com indicadores de empresas, lotes, parcelas, caixas e recebimentos.',
    tables: [
      'companies (CO) - empresas financeiras',
      'receivable_batches (RB) - lotes recebidos dos sistemas de origem',
      'receivable_installments (RI) - parcelas financeiras',
      'cash_sessions (CS) - sessoes de caixa',
      'installment_settlements (IS) - baixas/liquidacoes',
    ],
    relationships: [
      'receivable_batches.companyId = companies.id',
      'receivable_installments.companyId = companies.id',
      'cash_sessions.companyId = companies.id',
      'installment_settlements.companyId = companies.id',
      'installment_settlements.installmentId = receivable_installments.id',
    ],
    metrics: [
      'empresas ativas, lotes recebidos e parcelas em aberto',
      'parcelas vencidas, caixas abertos e recebimentos do mes',
      'lotes e caixas recentes',
    ],
    filters: [
      'empresa atual por sourceSystem/sourceTenantId quando a tela esta embarcada',
      'registros sem cancelamento logico',
      'parcelas abertas e vencidas calculadas por status/data',
      'recebimentos do mes corrente',
    ],
    order: 'indicadores agregados por empresa; recentes por createdAt/openedAt DESC',
    endpoints: ['GET /dashboard/overview'],
    sqlText: `SELECT
  CO.id AS companyId,
  CO.name AS companyName,
  COUNT(DISTINCT RB.id) AS batchCount,
  COUNT(DISTINCT CASE WHEN RI.status = 'OPEN' THEN RI.id END) AS openInstallmentCount,
  COUNT(DISTINCT CASE WHEN RI.status = 'OPEN' AND RI.dueDate < CURRENT_DATE THEN RI.id END) AS overdueInstallmentCount,
  SUM(CASE WHEN RI.status = 'OPEN' THEN RI.amount ELSE 0 END) AS openInstallmentAmount,
  COUNT(DISTINCT CASE WHEN CS.status = 'OPEN' THEN CS.id END) AS openCashSessionCount,
  SUM(CASE WHEN IS.settledAt >= :monthStart THEN IS.receivedAmount ELSE 0 END) AS settledAmountThisMonth
FROM companies CO
LEFT JOIN receivable_batches RB
  ON RB.companyId = CO.id
 AND RB.canceledAt IS NULL
LEFT JOIN receivable_installments RI
  ON RI.companyId = CO.id
 AND RI.canceledAt IS NULL
LEFT JOIN cash_sessions CS
  ON CS.companyId = CO.id
 AND CS.canceledAt IS NULL
LEFT JOIN installment_settlements IS
  ON IS.companyId = CO.id
 AND IS.canceledAt IS NULL
WHERE CO.canceledAt IS NULL
  AND (:sourceSystem IS NULL OR CO.sourceSystem = :sourceSystem)
  AND (:sourceTenantId IS NULL OR CO.sourceTenantId = :sourceTenantId)
GROUP BY CO.id, CO.name
ORDER BY CO.name ASC;`,
  },
  {
    screenId: 'FINANCEIRO_DASHBOARD_RESUMO_GERAL',
    match: 'exact',
    originPath: 'components/financeiro-resumo-page.tsx',
    description:
      'Dashboard de resumo geral do Financeiro usado fora ou dentro do sistema Escola.',
    tables: [
      'companies (CO) - empresas financeiras',
      'receivable_batches (RB) - lotes recebidos dos sistemas de origem',
      'receivable_installments (RI) - parcelas financeiras',
      'cash_sessions (CS) - sessoes de caixa',
      'installment_settlements (IS) - baixas/liquidacoes',
    ],
    relationships: [
      'receivable_batches.companyId = companies.id',
      'receivable_installments.companyId = companies.id',
      'cash_sessions.companyId = companies.id',
      'installment_settlements.companyId = companies.id',
    ],
    metrics: [
      'empresas, lotes, parcelas em aberto e parcelas vencidas',
      'caixas abertos e recebimentos do mes',
      'lotes e caixas recentes',
    ],
    filters: [
      'contexto sourceSystem/sourceTenantId/sourceBranchCode quando informado',
      'registros sem cancelamento logico',
      'periodo mensal para recebimentos liquidados',
    ],
    order: 'cards agregados; listas recentes por data DESC',
    endpoints: ['GET /dashboard/overview'],
    sqlText: `SELECT
  CO.id AS companyId,
  CO.name AS companyName,
  COUNT(DISTINCT RB.id) AS batchCount,
  COUNT(DISTINCT CASE WHEN RI.status = 'OPEN' THEN RI.id END) AS openInstallmentCount,
  COUNT(DISTINCT CASE WHEN CS.status = 'OPEN' THEN CS.id END) AS openCashSessionCount,
  SUM(CASE WHEN IS.settledAt >= :monthStart THEN IS.receivedAmount ELSE 0 END) AS settledAmountThisMonth
FROM companies CO
LEFT JOIN receivable_batches RB ON RB.companyId = CO.id AND RB.canceledAt IS NULL
LEFT JOIN receivable_installments RI ON RI.companyId = CO.id AND RI.canceledAt IS NULL
LEFT JOIN cash_sessions CS ON CS.companyId = CO.id AND CS.canceledAt IS NULL
LEFT JOIN installment_settlements IS ON IS.companyId = CO.id AND IS.canceledAt IS NULL
WHERE CO.canceledAt IS NULL
GROUP BY CO.id, CO.name
ORDER BY CO.name ASC;`,
  },
  {
    screenId: 'PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_CERTIFICADOS_DIGITAIS',
    match: 'prefix',
    originPath: 'contas-a-pagar/certificados-digitais/page.tsx',
    description:
      'Tela de certificados A1 usados para consulta fiscal, manifestacao e importacao de documentos.',
    tables: [
      'companies (CO) - empresa financeira',
      'fiscal_certificates (FC) - certificados digitais A1',
      'payable_invoice_imports (PII) - importacoes fiscais vinculadas ao certificado',
    ],
    relationships: [
      'fiscal_certificates.companyId = companies.id',
      'payable_invoice_imports.fiscalCertificateId = fiscal_certificates.id',
    ],
    metrics: [
      'alias, titular, documento, serial e validade',
      'ambiente, finalidade, status e ultimo NSU',
      'quantidade de importacoes vinculadas',
    ],
    filters: [
      'empresa atual por sourceSystem/sourceTenantId',
      'status e busca digitados na tela',
      'certificados sem cancelamento logico',
    ],
    order: 'fiscal_certificates.aliasName ASC',
    endpoints: ['GET /fiscal-certificates', 'POST /fiscal-certificates', 'PATCH /fiscal-certificates/{id}'],
    sqlText: `SELECT
  FC.id,
  FC.status,
  FC.certificateType,
  FC.environment,
  FC.purpose,
  FC.isDefault,
  FC.aliasName,
  FC.holderName,
  FC.holderDocument,
  FC.serialNumber,
  FC.validFrom,
  FC.validTo,
  FC.lastNsu,
  FC.lastSyncStatus,
  COUNT(DISTINCT PII.id) AS importCount
FROM fiscal_certificates FC
INNER JOIN companies CO
  ON CO.id = FC.companyId
 AND CO.canceledAt IS NULL
LEFT JOIN payable_invoice_imports PII
  ON PII.fiscalCertificateId = FC.id
 AND PII.companyId = FC.companyId
 AND PII.canceledAt IS NULL
WHERE FC.canceledAt IS NULL
  AND CO.sourceSystem = :sourceSystem
  AND CO.sourceTenantId = :sourceTenantId
  AND (:status = 'ALL' OR FC.status = :status)
GROUP BY FC.id
ORDER BY FC.aliasName ASC;`,
  },
  {
    screenId: 'PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_APROVACAO_NOTA',
    match: 'prefix',
    originPath: 'contas-a-pagar/notas-importadas/[importId]/page.tsx',
    description:
      'Tela de aprovacao de nota importada, conferindo fornecedor, itens, parcelas e geracao do contas a pagar.',
    tables: [
      'payable_invoice_imports (PII) - cabecalho da nota importada',
      'payable_invoice_import_items (PIIT) - itens da nota',
      'payable_invoice_import_installments (PIIN) - parcelas importadas',
      'suppliers (SU) - fornecedor',
      'payable_titles (PT) - titulo gerado apos aprovacao',
      'payable_installments (PI) - parcelas financeiras geradas',
    ],
    relationships: [
      'payable_invoice_import_items.invoiceImportId = payable_invoice_imports.id',
      'payable_invoice_import_installments.invoiceImportId = payable_invoice_imports.id',
      'payable_invoice_imports.supplierId = suppliers.id',
      'payable_titles.invoiceImportId = payable_invoice_imports.id',
      'payable_installments.payableTitleId = payable_titles.id',
    ],
    metrics: [
      'dados fiscais, fornecedor e totais da nota',
      'itens importados e parcelas de pagamento',
      'status de aprovacao e titulo gerado',
    ],
    filters: [
      'nota aberta na rota :importId',
      'empresa atual por sourceSystem/sourceTenantId',
      'registros sem cancelamento logico',
    ],
    order: 'itens por sequenceNumber ASC; parcelas por dueDate ASC',
    endpoints: ['GET /payable-invoice-imports/{id}', 'POST /payable-invoice-imports/{id}/approve'],
    sqlText: `SELECT
  PII.id,
  PII.status,
  PII.invoiceNumber,
  PII.series,
  PII.issueDate,
  PII.totalInvoiceAmount,
  SU.legalName AS supplierName,
  PIIT.sequenceNumber,
  PIIT.productDescription,
  PIIT.quantity,
  PIIT.totalAmount,
  PIIN.dueDate,
  PIIN.amount AS installmentAmount,
  PT.id AS payableTitleId,
  PI.id AS payableInstallmentId
FROM payable_invoice_imports PII
LEFT JOIN suppliers SU
  ON SU.id = PII.supplierId
 AND SU.companyId = PII.companyId
LEFT JOIN payable_invoice_import_items PIIT
  ON PIIT.invoiceImportId = PII.id
 AND PIIT.canceledAt IS NULL
LEFT JOIN payable_invoice_import_installments PIIN
  ON PIIN.invoiceImportId = PII.id
 AND PIIN.canceledAt IS NULL
LEFT JOIN payable_titles PT
  ON PT.invoiceImportId = PII.id
 AND PT.canceledAt IS NULL
LEFT JOIN payable_installments PI
  ON PI.payableTitleId = PT.id
 AND PI.canceledAt IS NULL
WHERE PII.id = :importId
  AND PII.canceledAt IS NULL
ORDER BY PIIT.sequenceNumber ASC, PIIN.dueDate ASC;`,
  },
  {
    screenId: 'PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_NOTAS_IMPORTADAS',
    match: 'prefix',
    originPath: 'contas-a-pagar/notas-importadas/page.tsx',
    description:
      'Grid de notas fiscais ja importadas para conferencia, aprovacao e acompanhamento do contas a pagar.',
    tables: [
      'payable_invoice_imports (PII) - notas importadas',
      'suppliers (SU) - fornecedor identificado na nota',
      'payable_titles (PT) - titulo gerado quando aprovado',
    ],
    relationships: [
      'payable_invoice_imports.supplierId = suppliers.id',
      'payable_titles.invoiceImportId = payable_invoice_imports.id',
    ],
    metrics: [
      'numero, serie, data de emissao e valor total',
      'fornecedor, status e tipo de importacao',
      'titulo financeiro gerado quando existir',
    ],
    filters: [
      'empresa atual por sourceSystem/sourceTenantId',
      'status, busca e data de emissao quando informados',
      'notas sem cancelamento logico',
    ],
    order: 'payable_invoice_imports.createdAt DESC',
    endpoints: ['GET /payable-invoice-imports'],
    sqlText: `SELECT
  PII.id,
  PII.status,
  PII.importType,
  PII.documentModel,
  PII.accessKey,
  PII.invoiceNumber,
  PII.series,
  PII.issueDate,
  PII.totalInvoiceAmount,
  SU.legalName AS supplierName,
  PT.id AS payableTitleId,
  PT.status AS payableTitleStatus,
  PII.createdAt
FROM payable_invoice_imports PII
INNER JOIN companies CO
  ON CO.id = PII.companyId
 AND CO.canceledAt IS NULL
LEFT JOIN suppliers SU
  ON SU.id = PII.supplierId
 AND SU.companyId = PII.companyId
LEFT JOIN payable_titles PT
  ON PT.invoiceImportId = PII.id
 AND PT.canceledAt IS NULL
WHERE PII.canceledAt IS NULL
  AND CO.sourceSystem = :sourceSystem
  AND CO.sourceTenantId = :sourceTenantId
  AND (:status = 'ALL' OR PII.status = :status)
ORDER BY PII.createdAt DESC;`,
  },
  {
    screenId: 'PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_IMPORTACAO_NOTAS_MANUAL',
    match: 'prefix',
    originPath: 'contas-a-pagar/importacao-notas/manual/page.tsx',
    description:
      'Tela de importacao manual de XML de nota fiscal para alimentar o contas a pagar.',
    tables: [
      'payable_invoice_imports (PII) - cabecalho da nota importada',
      'payable_invoice_import_items (PIIT) - itens do XML',
      'payable_invoice_import_installments (PIIN) - parcelas do XML',
      'suppliers (SU) - fornecedor localizado ou criado',
    ],
    relationships: [
      'payable_invoice_import_items.invoiceImportId = payable_invoice_imports.id',
      'payable_invoice_import_installments.invoiceImportId = payable_invoice_imports.id',
      'payable_invoice_imports.supplierId = suppliers.id',
    ],
    metrics: [
      'chave de acesso, numero, serie e totais da nota',
      'fornecedor, itens e parcelas importadas',
      'hash do XML para evitar duplicidade',
    ],
    filters: [
      'empresa atual por sourceSystem/sourceTenantId',
      'nota recem-importada ou ultimas importacoes',
      'registros sem cancelamento logico',
    ],
    order: 'payable_invoice_imports.createdAt DESC',
    endpoints: ['POST /payable-invoice-imports/xml', 'GET /payable-invoice-imports'],
    sqlText: `SELECT
  PII.id,
  PII.status,
  PII.accessKey,
  PII.invoiceNumber,
  PII.series,
  PII.issueDate,
  PII.totalInvoiceAmount,
  SU.legalName AS supplierName,
  COUNT(DISTINCT PIIT.id) AS itemCount,
  COUNT(DISTINCT PIIN.id) AS installmentCount
FROM payable_invoice_imports PII
LEFT JOIN suppliers SU
  ON SU.id = PII.supplierId
 AND SU.companyId = PII.companyId
LEFT JOIN payable_invoice_import_items PIIT
  ON PIIT.invoiceImportId = PII.id
 AND PIIT.canceledAt IS NULL
LEFT JOIN payable_invoice_import_installments PIIN
  ON PIIN.invoiceImportId = PII.id
 AND PIIN.canceledAt IS NULL
WHERE PII.companyId = :companyId
  AND PII.canceledAt IS NULL
GROUP BY PII.id, SU.legalName
ORDER BY PII.createdAt DESC;`,
  },
  {
    screenId: 'PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_IMPORTACAO_NOTAS',
    match: 'prefix',
    originPath: 'contas-a-pagar/importacao-notas/page.tsx',
    description:
      'Tela de importacao de notas fiscais por XML ou integracao fiscal com certificado A1.',
    tables: [
      'fiscal_certificates (FC) - certificados disponiveis para consulta fiscal',
      'payable_invoice_imports (PII) - notas importadas',
      'suppliers (SU) - fornecedores localizados nas notas',
    ],
    relationships: [
      'payable_invoice_imports.fiscalCertificateId = fiscal_certificates.id',
      'payable_invoice_imports.supplierId = suppliers.id',
    ],
    metrics: [
      'certificado selecionado, periodo/NSU de consulta e notas encontradas',
      'status da importacao e dados principais da nota',
    ],
    filters: [
      'empresa atual por sourceSystem/sourceTenantId',
      'certificado ativo e finalidade fiscal',
      'periodo ou NSU informado na tela',
    ],
    order: 'notas importadas por createdAt DESC',
    endpoints: ['GET /fiscal-certificates', 'POST /payable-invoice-imports/xml', 'POST /payable-invoice-imports/distribution'],
    sqlText: `SELECT
  FC.id AS certificateId,
  FC.aliasName,
  FC.status AS certificateStatus,
  FC.lastNsu,
  PII.id AS invoiceImportId,
  PII.status AS invoiceStatus,
  PII.invoiceNumber,
  PII.issueDate,
  PII.totalInvoiceAmount,
  SU.legalName AS supplierName
FROM fiscal_certificates FC
INNER JOIN companies CO
  ON CO.id = FC.companyId
 AND CO.canceledAt IS NULL
LEFT JOIN payable_invoice_imports PII
  ON PII.fiscalCertificateId = FC.id
 AND PII.companyId = FC.companyId
 AND PII.canceledAt IS NULL
LEFT JOIN suppliers SU
  ON SU.id = PII.supplierId
 AND SU.companyId = PII.companyId
WHERE FC.canceledAt IS NULL
  AND CO.sourceSystem = :sourceSystem
  AND CO.sourceTenantId = :sourceTenantId
ORDER BY PII.createdAt DESC;`,
  },
  {
    screenId: 'PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR',
    match: 'prefix',
    originPath: 'contas-a-pagar/page.tsx',
    description:
      'Tela inicial do contas a pagar com atalhos de importacao, notas, certificados e titulos a pagar.',
    tables: [
      'payable_invoice_imports (PII) - notas importadas',
      'payable_titles (PT) - titulos a pagar',
      'payable_installments (PI) - parcelas a pagar',
      'suppliers (SU) - fornecedores',
    ],
    relationships: [
      'payable_titles.supplierId = suppliers.id',
      'payable_titles.invoiceImportId = payable_invoice_imports.id',
      'payable_installments.payableTitleId = payable_titles.id',
    ],
    metrics: [
      'notas pendentes de aprovacao',
      'titulos e parcelas a pagar',
      'fornecedores vinculados',
    ],
    filters: [
      'empresa atual por sourceSystem/sourceTenantId',
      'registros sem cancelamento logico',
      'status de nota/titulo/parcela conforme o atalho aberto',
    ],
    order: 'atalhos fixos; consultas por data/status nas telas filhas',
    endpoints: ['GET /payable-invoice-imports', 'GET /payable-titles', 'GET /payable-installments'],
    sqlText: `SELECT
  CO.id AS companyId,
  CO.name AS companyName,
  COUNT(DISTINCT PII.id) AS importedInvoices,
  COUNT(DISTINCT CASE WHEN PII.status = 'PENDING_APPROVAL' THEN PII.id END) AS pendingApproval,
  COUNT(DISTINCT PT.id) AS payableTitles,
  COUNT(DISTINCT PI.id) AS payableInstallments
FROM companies CO
LEFT JOIN payable_invoice_imports PII
  ON PII.companyId = CO.id
 AND PII.canceledAt IS NULL
LEFT JOIN payable_titles PT
  ON PT.companyId = CO.id
 AND PT.canceledAt IS NULL
LEFT JOIN payable_installments PI
  ON PI.companyId = CO.id
 AND PI.canceledAt IS NULL
WHERE CO.canceledAt IS NULL
  AND CO.sourceSystem = :sourceSystem
  AND CO.sourceTenantId = :sourceTenantId
GROUP BY CO.id, CO.name;`,
  },
  {
    screenId: 'PRINCIPAL_FINANCEIRO_CAIXA_DETALHE',
    match: 'prefix',
    originPath: 'caixa/[sessionId]/page.tsx',
    description:
      'Detalhe da sessao de caixa com movimentos, recebimentos, sangrias, suprimentos e fechamento.',
    tables: [
      'cash_sessions (CS) - sessao de caixa',
      'cash_movements (CM) - movimentos manuais e vinculados',
      'installment_settlements (IS) - baixas recebidas',
      'receivable_installments (RI) - parcelas liquidadas',
    ],
    relationships: [
      'cash_movements.cashSessionId = cash_sessions.id',
      'installment_settlements.cashSessionId = cash_sessions.id',
      'installment_settlements.installmentId = receivable_installments.id',
    ],
    metrics: [
      'abertura, fechamento e operador do caixa',
      'movimentos de entrada/saida',
      'valores recebidos, esperado e diferenca de fechamento',
    ],
    filters: [
      'sessao aberta na rota :sessionId',
      'empresa atual e usuario do caixa',
      'movimentos sem cancelamento logico',
    ],
    order: 'cash_movements.occurredAt DESC',
    endpoints: ['GET /cash-sessions/{id}', 'GET /cash-sessions/{id}/movements', 'POST /cash-sessions/{id}/close'],
    sqlText: `SELECT
  CS.id,
  CS.status,
  CS.cashierUserId,
  CS.cashierDisplayName,
  CS.openingAmount,
  CS.totalReceivedAmount,
  CS.expectedClosingAmount,
  CS.openedAt,
  CS.closedAt,
  CM.id AS movementId,
  CM.movementType,
  CM.amount AS movementAmount,
  CM.occurredAt,
  IS.id AS settlementId,
  IS.receivedAmount,
  RI.id AS installmentId
FROM cash_sessions CS
LEFT JOIN cash_movements CM
  ON CM.cashSessionId = CS.id
 AND CM.canceledAt IS NULL
LEFT JOIN installment_settlements IS
  ON IS.cashSessionId = CS.id
 AND IS.canceledAt IS NULL
LEFT JOIN receivable_installments RI
  ON RI.id = IS.installmentId
 AND RI.canceledAt IS NULL
WHERE CS.id = :sessionId
  AND CS.canceledAt IS NULL
ORDER BY CM.occurredAt DESC;`,
  },
  {
    screenId: 'PRINCIPAL_FINANCEIRO_CAIXA',
    match: 'prefix',
    originPath: 'caixa/page.tsx',
    description:
      'Tela de listagem e abertura de caixas por usuario/filial para recebimentos financeiros.',
    tables: [
      'cash_sessions (CS) - sessoes de caixa',
      'cash_movements (CM) - movimentos do caixa',
      'installment_settlements (IS) - recebimentos liquidados no caixa',
      'companies (CO) - empresa financeira',
    ],
    relationships: [
      'cash_sessions.companyId = companies.id',
      'cash_movements.cashSessionId = cash_sessions.id',
      'installment_settlements.cashSessionId = cash_sessions.id',
    ],
    metrics: [
      'status, operador, abertura e fechamento',
      'valor inicial, total recebido e valor esperado',
      'quantidade de movimentos/baixas',
    ],
    filters: [
      'empresa atual por sourceSystem/sourceTenantId',
      'filial atual por sourceBranchCode',
      'usuario logado quando a permissao limita o caixa',
      'status selecionado e registros sem cancelamento logico',
    ],
    order: 'cash_sessions.openedAt DESC',
    endpoints: ['GET /cash-sessions', 'POST /cash-sessions/open'],
    sqlText: `SELECT
  CS.id,
  CS.branchCode,
  CS.status,
  CS.cashierUserId,
  CS.cashierDisplayName,
  CS.openingAmount,
  CS.totalReceivedAmount,
  CS.expectedClosingAmount,
  CS.openedAt,
  CS.closedAt,
  COUNT(DISTINCT CM.id) AS movementCount,
  COUNT(DISTINCT IS.id) AS settlementCount
FROM cash_sessions CS
INNER JOIN companies CO
  ON CO.id = CS.companyId
 AND CO.canceledAt IS NULL
LEFT JOIN cash_movements CM
  ON CM.cashSessionId = CS.id
 AND CM.canceledAt IS NULL
LEFT JOIN installment_settlements IS
  ON IS.cashSessionId = CS.id
 AND IS.canceledAt IS NULL
WHERE CS.canceledAt IS NULL
  AND CO.sourceSystem = :sourceSystem
  AND CO.sourceTenantId = :sourceTenantId
  AND (:sourceBranchCode IS NULL OR CS.branchCode = :sourceBranchCode)
  AND (:status = 'ALL' OR CS.status = :status)
GROUP BY CS.id
ORDER BY CS.openedAt DESC;`,
  },
  {
    screenId: 'PRINCIPAL_FINANCEIRO_ESTOQUE_IMAGENS_PRODUTOS',
    match: 'exact',
    originPath: 'estoque/imagens-produtos/page.tsx',
    description:
      'Grid de conferência das imagens locais dos produtos, usando o código de barras EAN-8 ou EAN-13 como nome do arquivo e permitindo a pesquisa de imagens na web.',
    tables: [
      'companies (CO) - empresa financeira vinculada ao sistema de origem',
      'products (PR) - produtos, código interno e código de barras',
    ],
    relationships: ['products.companyId = companies.id'],
    metrics: [
      'produto, código interno, código de barras e tipo EAN',
      'presença da imagem no agente local do computador',
      'atalho para pesquisa de imagens pelo código de barras',
    ],
    filters: [
      'empresa atual por sourceSystem/sourceTenantId',
      'filial atual por sourceBranchCode',
      'busca local por produto, código interno, SKU ou código de barras',
      'somente produtos ativos',
    ],
    order: 'products.name ASC',
    endpoints: ['GET /products', 'GET http://127.0.0.1:47821/imagens/{EAN}.{EXTENSAO}'],
    sqlText: `SELECT
  PR.id,
  PR.name,
  PR.internalCode,
  PR.sku,
  PR.barcode,
  PR.status
FROM products PR
INNER JOIN companies CO
  ON CO.id = PR.companyId
 AND CO.canceledAt IS NULL
WHERE PR.canceledAt IS NULL
  AND PR.status = 'ACTIVE'
  AND CO.sourceSystem = :sourceSystem
  AND CO.sourceTenantId = :sourceTenantId
  AND (:search = '' OR UPPER(PR.name) LIKE '%' || UPPER(:search) || '%' OR PR.internalCode LIKE '%' || :search || '%' OR PR.barcode LIKE '%' || :search || '%')
ORDER BY PR.name ASC;`,
  },
  {
    screenId: 'PRINCIPAL_FINANCEIRO_ESTOQUE_HISTORICO_MOVIMENTACAO',
    match: 'prefix',
    originPath: 'estoque/historico-movimentacao/page.tsx',
    description:
      'Historico de movimentacoes de estoque originadas por entradas fiscais, ajustes e operacoes internas.',
    tables: [
      'stock_movements (SM) - movimentos de estoque',
      'products (PR) - produto movimentado',
      'payable_invoice_imports (PII) - nota de origem quando houver',
      'payable_invoice_import_items (PIIT) - item da nota de origem',
    ],
    relationships: [
      'stock_movements.productId = products.id',
      'stock_movements.sourceImportId = payable_invoice_imports.id',
      'stock_movements.sourceImportItemId = payable_invoice_import_items.id',
    ],
    metrics: [
      'produto, tipo de movimento, quantidade e custo unitario',
      'origem fiscal/importacao e data da movimentacao',
      'filial e usuario de criacao',
    ],
    filters: [
      'empresa atual por sourceSystem/sourceTenantId',
      'filial atual por sourceBranchCode',
      'tipo de movimento e busca digitada',
      'movimentos sem cancelamento logico',
    ],
    order: 'stock_movements.occurredAt DESC',
    endpoints: ['GET /stock-movements'],
    sqlText: `SELECT
  SM.id,
  SM.branchCode,
  SM.movementType,
  SM.quantity,
  SM.unitCost,
  SM.totalCost,
  SM.occurredAt,
  PR.name AS productName,
  PR.internalCode,
  PII.invoiceNumber,
  PII.accessKey
FROM stock_movements SM
INNER JOIN companies CO
  ON CO.id = SM.companyId
 AND CO.canceledAt IS NULL
INNER JOIN products PR
  ON PR.id = SM.productId
 AND PR.companyId = SM.companyId
 AND PR.canceledAt IS NULL
LEFT JOIN payable_invoice_imports PII
  ON PII.id = SM.sourceImportId
 AND PII.companyId = SM.companyId
 AND PII.canceledAt IS NULL
WHERE SM.canceledAt IS NULL
  AND CO.sourceSystem = :sourceSystem
  AND CO.sourceTenantId = :sourceTenantId
  AND (:sourceBranchCode IS NULL OR SM.branchCode = :sourceBranchCode)
  AND (:movementType = 'ALL' OR SM.movementType = :movementType)
ORDER BY SM.occurredAt DESC;`,
  },
  {
    screenId: 'PRINCIPAL_FINANCEIRO_ESTOQUE',
    match: 'prefix',
    originPath: 'estoque/page.tsx',
    description:
      'Tela inicial de estoque com indicadores de produtos, configuracoes de filial e saldos disponiveis.',
    tables: [
      'companies (CO) - empresa financeira',
      'company_branches (CB) - configuracao operacional da filial',
      'products (PR) - produtos cadastrados',
      'product_stock_balances (PSB) - saldos por produto/filial/variante',
    ],
    relationships: [
      'company_branches.companyId = companies.id',
      'products.companyId = companies.id',
      'product_stock_balances.productId = products.id',
      'product_stock_balances.companyId = companies.id',
    ],
    metrics: [
      'produtos cadastrados e produtos que controlam estoque',
      'saldos por filial, variante, lote/cor/tamanho',
      'tipo de controle e precisao de quantidade',
    ],
    filters: [
      'empresa atual por sourceSystem/sourceTenantId',
      'filial atual por sourceBranchCode',
      'registros sem cancelamento logico',
    ],
    order: 'products.name ASC; saldos por branchCode ASC',
    endpoints: ['GET /products', 'GET /stock-balances', 'GET /companies/{id}/branches'],
    sqlText: `SELECT
  CO.id AS companyId,
  CO.name AS companyName,
  CB.branchCode,
  CB.name AS branchName,
  CB.inventoryControlType,
  CB.quantityPrecision,
  COUNT(DISTINCT PR.id) AS productCount,
  COUNT(DISTINCT PSB.id) AS stockBalanceCount,
  SUM(COALESCE(PSB.quantity, 0)) AS totalQuantity
FROM companies CO
LEFT JOIN company_branches CB
  ON CB.companyId = CO.id
 AND CB.canceledAt IS NULL
LEFT JOIN products PR
  ON PR.companyId = CO.id
 AND PR.canceledAt IS NULL
LEFT JOIN product_stock_balances PSB
  ON PSB.companyId = CO.id
 AND PSB.productId = PR.id
 AND PSB.canceledAt IS NULL
WHERE CO.canceledAt IS NULL
  AND CO.sourceSystem = :sourceSystem
  AND CO.sourceTenantId = :sourceTenantId
  AND (:sourceBranchCode IS NULL OR CB.branchCode = :sourceBranchCode)
GROUP BY CO.id, CO.name, CB.branchCode, CB.name, CB.inventoryControlType, CB.quantityPrecision
ORDER BY CB.branchCode ASC;`,
  },
  {
    screenId: 'PRINCIPAL_FINANCEIRO_LOTES_PARCELAS',
    match: 'exact',
    originPath: 'recebiveis/lotes/[batchId]/page.tsx',
    description:
      'Tela de parcelas de um lote de recebiveis, aberta pela acao Ver parcelas na listagem de lotes.',
    tables: [
      'receivable_batches (RB) - lote importado',
      'receivable_titles (RT) - titulos gerados pelo lote',
      'receivable_installments (RI) - parcelas do lote',
      'bank_accounts (BA) - conta bancaria usada para preparacao de boletos',
      'companies (CO) - empresa financeira',
    ],
    relationships: [
      'receivable_titles.batchId = receivable_batches.id',
      'receivable_installments.batchId = receivable_batches.id',
      'receivable_installments.titleId = receivable_titles.id',
      'receivable_installments.bankAccountId = bank_accounts.id',
      'receivable_batches.companyId = companies.id',
    ],
    metrics: [
      'pagador, descricao, vencimento e numero da parcela',
      'valor original, valor em aberto e status da parcela',
      'status de boleto, banco selecionado e parcelas marcadas',
    ],
    filters: [
      'empresa atual por sourceSystem/sourceTenantId',
      'lote atual por batchId',
      'status e busca digitados na tela',
      'parcelas sem cancelamento logico',
    ],
    order: 'receivable_installments.dueDate ASC, receivable_installments.installmentNumber ASC',
    endpoints: [
      'GET /receivables/batches/{batchId}',
      'GET /receivables/installments',
      'GET /banks',
    ],
    sqlText: `SELECT
  RI.id,
  RI.batchId,
  RI.payerNameSnapshot,
  RI.description,
  RI.installmentNumber,
  RI.installmentCount,
  RI.dueDate,
  RI.amount,
  RI.openAmount,
  RI.status,
  RI.bankSlipStatus,
  BA.bankName
FROM receivable_installments RI
INNER JOIN receivable_batches RB
  ON RB.id = RI.batchId
 AND RB.canceledAt IS NULL
INNER JOIN companies CO
  ON CO.id = RB.companyId
 AND CO.canceledAt IS NULL
LEFT JOIN bank_accounts BA
  ON BA.id = RI.bankAccountId
 AND BA.canceledAt IS NULL
WHERE RI.canceledAt IS NULL
  AND RI.batchId = :batchId
  AND CO.sourceSystem = :sourceSystem
  AND CO.sourceTenantId = :sourceTenantId
ORDER BY RI.dueDate ASC, RI.installmentNumber ASC;`,
  },
  {
    screenId: 'PRINCIPAL_FINANCEIRO_LOTES',
    match: 'prefix',
    originPath: 'recebiveis/lotes/page.tsx',
    description:
      'Tela de lotes de recebiveis enviados pela Escola ou outros sistemas de origem.',
    tables: [
      'receivable_batches (RB) - lotes importados',
      'receivable_titles (RT) - titulos gerados pelo lote',
      'receivable_installments (RI) - parcelas geradas',
      'companies (CO) - empresa financeira',
    ],
    relationships: [
      'receivable_batches.companyId = companies.id',
      'receivable_titles.batchId = receivable_batches.id',
      'receivable_installments.batchId = receivable_batches.id',
      'receivable_installments.titleId = receivable_titles.id',
    ],
    metrics: [
      'tipo de lote, quantidade de itens e erros',
      'titulos e parcelas processadas',
      'status e data de criacao',
    ],
    filters: [
      'empresa atual por sourceSystem/sourceTenantId',
      'tipo/status/busca quando informados',
      'lotes sem cancelamento logico',
    ],
    order: 'receivable_batches.createdAt DESC',
    endpoints: ['GET /receivable-batches', 'GET /receivable-batches/{id}'],
    sqlText: `SELECT
  RB.id,
  RB.sourceBatchType,
  RB.status,
  RB.itemCount,
  RB.processedCount,
  RB.duplicateCount,
  RB.errorCount,
  RB.createdAt,
  COUNT(DISTINCT RT.id) AS titleCount,
  COUNT(DISTINCT RI.id) AS installmentCount
FROM receivable_batches RB
INNER JOIN companies CO
  ON CO.id = RB.companyId
 AND CO.canceledAt IS NULL
LEFT JOIN receivable_titles RT
  ON RT.batchId = RB.id
 AND RT.canceledAt IS NULL
LEFT JOIN receivable_installments RI
  ON RI.batchId = RB.id
 AND RI.canceledAt IS NULL
WHERE RB.canceledAt IS NULL
  AND CO.sourceSystem = :sourceSystem
  AND CO.sourceTenantId = :sourceTenantId
GROUP BY RB.id
ORDER BY RB.createdAt DESC;`,
  },
  {
    screenId: 'PRINCIPAL_FINANCEIRO_RETORNOS',
    match: 'prefix',
    originPath: 'recebiveis/retornos/page.tsx',
    description:
      'Tela de importacao e acompanhamento de retornos bancarios para liquidacao automatica de parcelas.',
    tables: [
      'bank_return_imports (BRI) - importacoes de retorno',
      'bank_return_import_items (BRII) - linhas/movimentos do retorno',
      'bank_accounts (BA) - conta bancaria vinculada',
      'receivable_installments (RI) - parcela localizada para baixa',
    ],
    relationships: [
      'bank_return_import_items.importId = bank_return_imports.id',
      'bank_return_imports.bankAccountId = bank_accounts.id',
      'bank_return_import_items.matchedInstallmentId = receivable_installments.id',
    ],
    metrics: [
      'periodo, status e conta bancaria do retorno',
      'itens importados, conciliados e liquidados',
      'parcelas localizadas e divergencias',
    ],
    filters: [
      'empresa atual por sourceSystem/sourceTenantId',
      'conta bancaria e periodo informados na tela',
      'retornos sem cancelamento logico',
    ],
    order: 'bank_return_imports.createdAt DESC',
    endpoints: ['GET /bank-return-imports', 'POST /bank-return-imports', 'GET /bank-return-imports/{id}'],
    sqlText: `SELECT
  BRI.id,
  BRI.provider,
  BRI.status,
  BRI.periodStart,
  BRI.periodEnd,
  BRI.importedItemCount,
  BRI.matchedItemCount,
  BRI.liquidatedItemCount,
  BA.bankName,
  BA.branchNumber,
  BA.accountNumber,
  BRI.createdAt
FROM bank_return_imports BRI
INNER JOIN companies CO
  ON CO.id = BRI.companyId
 AND CO.canceledAt IS NULL
LEFT JOIN bank_accounts BA
  ON BA.id = BRI.bankAccountId
 AND BA.companyId = BRI.companyId
 AND BA.canceledAt IS NULL
WHERE BRI.canceledAt IS NULL
  AND CO.sourceSystem = :sourceSystem
  AND CO.sourceTenantId = :sourceTenantId
ORDER BY BRI.createdAt DESC;`,
  },
  {
    screenId: 'PRINCIPAL_FINANCEIRO_RETORNOS_CONFERENCIA',
    match: 'exact',
    originPath: 'recebiveis/retornos/[importId]/page.tsx',
    description:
      'Detalhe do retorno bancario para revisar movimentos, conciliacoes e liquidacoes aplicadas.',
    tables: [
      'bank_return_imports (BRI) - cabecalho do retorno',
      'bank_return_import_items (BRII) - itens do arquivo retorno',
      'receivable_installments (RI) - parcelas localizadas',
      'bank_accounts (BA) - conta bancaria vinculada',
    ],
    relationships: [
      'bank_return_import_items.importId = bank_return_imports.id',
      'bank_return_import_items.matchedInstallmentId = receivable_installments.id',
      'bank_return_imports.bankAccountId = bank_accounts.id',
    ],
    metrics: [
      'movimento, vencimento, pagamento e valor liquidado',
      'nosso numero/seu numero e parcela encontrada',
      'status de conciliacao e liquidacao',
    ],
    filters: [
      'importacao aberta na rota :importId',
      'itens sem cancelamento logico',
      'empresa do contexto financeiro',
    ],
    order: 'bank_return_import_items.dueDate ASC, paymentDate ASC',
    endpoints: ['GET /bank-return-imports/{id}', 'POST /bank-return-imports/{id}/settle'],
    sqlText: `SELECT
  BRI.id AS importId,
  BRI.status AS importStatus,
  BRII.id AS itemId,
  BRII.movementStatus,
  BRII.dueDate,
  BRII.paymentDate,
  BRII.settledAmount,
  BRII.yourNumber,
  RI.id AS receivableInstallmentId,
  RI.status AS installmentStatus,
  BA.bankName
FROM bank_return_imports BRI
INNER JOIN bank_return_import_items BRII
  ON BRII.importId = BRI.id
 AND BRII.canceledAt IS NULL
LEFT JOIN receivable_installments RI
  ON RI.id = BRII.matchedInstallmentId
 AND RI.companyId = BRII.companyId
 AND RI.canceledAt IS NULL
LEFT JOIN bank_accounts BA
  ON BA.id = BRI.bankAccountId
 AND BA.companyId = BRI.companyId
 AND BA.canceledAt IS NULL
WHERE BRI.id = :importId
  AND BRI.canceledAt IS NULL
ORDER BY BRII.dueDate ASC, BRII.paymentDate ASC;`,
  },
  {
    screenId: 'FINANCEIRO_RETORNOS_BANCARIOS_LISTAGEM',
    match: 'prefix',
    originPath: 'recebiveis/retornos/page.tsx',
    description:
      'Listagem direta de retornos bancarios no Financeiro.',
    tables: [
      'bank_return_imports (BRI) - importacoes de retorno',
      'bank_accounts (BA) - conta bancaria vinculada',
      'companies (CO) - empresa financeira',
    ],
    relationships: [
      'bank_return_imports.companyId = companies.id',
      'bank_return_imports.bankAccountId = bank_accounts.id',
    ],
    metrics: [
      'periodo, status e conta bancaria',
      'quantidades importadas, conciliadas e liquidadas',
    ],
    filters: [
      'empresa atual por sourceSystem/sourceTenantId',
      'periodo/conta selecionados na tela',
      'retornos sem cancelamento logico',
    ],
    order: 'bank_return_imports.createdAt DESC',
    endpoints: ['GET /bank-return-imports', 'POST /bank-return-imports'],
    sqlText: `SELECT
  BRI.id,
  BRI.provider,
  BRI.status,
  BRI.periodStart,
  BRI.periodEnd,
  BRI.importedItemCount,
  BRI.matchedItemCount,
  BRI.liquidatedItemCount,
  BA.bankName,
  BRI.createdAt
FROM bank_return_imports BRI
INNER JOIN companies CO ON CO.id = BRI.companyId AND CO.canceledAt IS NULL
LEFT JOIN bank_accounts BA ON BA.id = BRI.bankAccountId AND BA.canceledAt IS NULL
WHERE BRI.canceledAt IS NULL
ORDER BY BRI.createdAt DESC;`,
  },
  {
    screenId: 'PRINCIPAL_FINANCEIRO_PARCELAS',
    match: 'prefix',
    originPath: 'recebiveis/parcelas/page.tsx',
    description:
      'Grid de parcelas a receber para consulta de vencimentos, status, pagadores e valores.',
    tables: [
      'receivable_installments (RI) - parcelas a receber',
      'receivable_titles (RT) - titulo financeiro',
      'parties (PA) - pagador/aluno/responsavel',
      'installment_settlements (IS) - baixa quando liquidada',
    ],
    relationships: [
      'receivable_installments.titleId = receivable_titles.id',
      'receivable_titles.payerPartyId = parties.id',
      'installment_settlements.installmentId = receivable_installments.id',
    ],
    metrics: [
      'vencimento, valor, status e numero da parcela',
      'pagador e origem do titulo',
      'valor liquidado e data de baixa quando existir',
    ],
    filters: [
      'empresa atual por sourceSystem/sourceTenantId',
      'filial atual por sourceBranchCode',
      'status, periodo e busca digitados na tela',
      'parcelas sem cancelamento logico',
    ],
    order: 'receivable_installments.dueDate ASC, parties.name ASC',
    endpoints: ['GET /receivable-installments'],
    sqlText: `SELECT
  RI.id,
  RI.branchCode,
  RI.installmentNumber,
  RI.dueDate,
  RI.amount,
  RI.status,
  RT.businessKey,
  RT.description,
  PA.name AS payerName,
  PA.document AS payerDocument,
  IS.settledAt,
  IS.receivedAmount
FROM receivable_installments RI
INNER JOIN companies CO
  ON CO.id = RI.companyId
 AND CO.canceledAt IS NULL
INNER JOIN receivable_titles RT
  ON RT.id = RI.titleId
 AND RT.companyId = RI.companyId
 AND RT.canceledAt IS NULL
LEFT JOIN parties PA
  ON PA.id = RT.payerPartyId
 AND PA.companyId = RT.companyId
 AND PA.canceledAt IS NULL
LEFT JOIN installment_settlements IS
  ON IS.installmentId = RI.id
 AND IS.companyId = RI.companyId
 AND IS.canceledAt IS NULL
WHERE RI.canceledAt IS NULL
  AND CO.sourceSystem = :sourceSystem
  AND CO.sourceTenantId = :sourceTenantId
  AND (:sourceBranchCode IS NULL OR RI.branchCode = :sourceBranchCode)
  AND (:status = 'ALL' OR RI.status = :status)
ORDER BY RI.dueDate ASC, PA.name ASC;`,
  },
  {
    screenId: 'FINANCEIRO_RECEBIVEIS_BAIXA_MANUAL',
    match: 'prefix',
    originPath: 'recebiveis/baixa-manual/page.tsx',
    description:
      'Tela de baixa manual de parcelas em aberto com registro em caixa.',
    tables: [
      'receivable_installments (RI) - parcelas em aberto',
      'receivable_titles (RT) - titulos das parcelas',
      'parties (PA) - pagadores',
      'cash_sessions (CS) - caixa aberto',
      'installment_settlements (IS) - baixa gerada',
    ],
    relationships: [
      'receivable_installments.titleId = receivable_titles.id',
      'receivable_titles.payerPartyId = parties.id',
      'installment_settlements.installmentId = receivable_installments.id',
      'installment_settlements.cashSessionId = cash_sessions.id',
    ],
    metrics: [
      'parcelas abertas, vencimento e valor atualizado',
      'pagador e metodo de pagamento',
      'caixa usado para liquidacao',
    ],
    filters: [
      'empresa atual por sourceSystem/sourceTenantId',
      'parcelas com status OPEN',
      'caixa aberto do usuario/filial',
    ],
    order: 'receivable_installments.dueDate ASC',
    endpoints: ['GET /receivable-installments', 'POST /settlements/manual'],
    sqlText: `SELECT
  RI.id,
  RI.dueDate,
  RI.amount,
  RI.status,
  RT.businessKey,
  PA.name AS payerName,
  CS.id AS openCashSessionId,
  CS.status AS cashStatus
FROM receivable_installments RI
INNER JOIN receivable_titles RT ON RT.id = RI.titleId AND RT.canceledAt IS NULL
LEFT JOIN parties PA ON PA.id = RT.payerPartyId AND PA.canceledAt IS NULL
LEFT JOIN cash_sessions CS ON CS.companyId = RI.companyId AND CS.status = 'OPEN' AND CS.canceledAt IS NULL
WHERE RI.canceledAt IS NULL
  AND RI.status = 'OPEN'
  AND (:companyId IS NULL OR RI.companyId = :companyId)
ORDER BY RI.dueDate ASC, PA.name ASC;`,
  },
  {
    screenId: 'FINANCEIRO_RECEBIVEIS_BAIXA_MANUAL_SUCESSO',
    match: 'prefix',
    originPath: 'recebiveis/baixa-manual/page.tsx',
    description:
      'Popup de sucesso da baixa manual com os dados da liquidacao realizada.',
    tables: [
      'installment_settlements (IS) - baixa registrada',
      'receivable_installments (RI) - parcela liquidada',
      'cash_sessions (CS) - caixa que recebeu o valor',
    ],
    relationships: [
      'installment_settlements.installmentId = receivable_installments.id',
      'installment_settlements.cashSessionId = cash_sessions.id',
    ],
    metrics: [
      'valor recebido, metodo de pagamento e data de liquidacao',
      'status da parcela e do caixa',
    ],
    filters: ['baixa recem-confirmada na operacao atual', 'empresa do contexto financeiro'],
    order: 'nao aplicavel ao popup',
    endpoints: ['POST /settlements/manual'],
    sqlText: `SELECT
  IS.id,
  IS.installmentId,
  IS.cashSessionId,
  IS.receivedAmount,
  IS.paymentMethod,
  IS.settledAt,
  RI.status AS installmentStatus,
  CS.status AS cashStatus
FROM installment_settlements IS
INNER JOIN receivable_installments RI ON RI.id = IS.installmentId AND RI.companyId = IS.companyId
INNER JOIN cash_sessions CS ON CS.id = IS.cashSessionId AND CS.companyId = IS.companyId
WHERE IS.id = :settlementId
  AND IS.canceledAt IS NULL
LIMIT 1;`,
  },
];

export function buildFinanceiroScreenAuditMetadata(
  screenId: string,
): FinanceiroScreenAuditMetadata | null {
  const normalizedScreenId = normalizeScreenId(screenId);
  if (!normalizedScreenId) return null;

  const exactTemplate = FINANCEIRO_AUDIT_TEMPLATES.find(
    (template) => template.match === 'exact' && template.screenId === normalizedScreenId,
  );
  const prefixTemplate = FINANCEIRO_AUDIT_TEMPLATES
    .filter(
      (template) =>
        template.match === 'prefix' && normalizedScreenId.startsWith(template.screenId),
    )
    .sort((first, second) => second.screenId.length - first.screenId.length)[0];
  const template = exactTemplate || prefixTemplate;
  if (!template) return null;

  return {
    systemName: 'Sistema Financeiro',
    originText: buildOriginText(template.originPath),
    auditText: buildAuditText(template),
    sqlText: template.sqlText,
  };
}
