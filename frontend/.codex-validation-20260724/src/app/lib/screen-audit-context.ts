'use client';

type ScreenAuditContextPayload = {
  screenId: string;
  originText?: string;
  auditText?: string;
  sqlText?: string;
};

export function toSqlLiteral(value: unknown) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function formatAuditValue(value: unknown, emptyText = 'VAZIO') {
  const normalized = String(value ?? '').trim();
  return normalized || emptyText;
}

export function formatTenantAuditValue(tenantId: string | null | undefined, tenantName?: string | null) {
  const normalizedTenantId = String(tenantId || '').trim() || 'ESCOLA LOGADA';
  const normalizedTenantName = String(tenantName || '').trim();
  return normalizedTenantName ? `${normalizedTenantId} (${normalizedTenantName})` : normalizedTenantId;
}

export function dispatchScreenAuditContext(payload: ScreenAuditContextPayload) {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(new CustomEvent('MSINFOR_SCREEN_AUDIT_CONTEXT', { detail: payload }));
}
