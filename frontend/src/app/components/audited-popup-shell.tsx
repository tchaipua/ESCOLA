'use client';

import type { ReactNode } from 'react';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';

type AuditedPopupShellProps = {
  isOpen: boolean;
  screenId: string;
  title: string;
  eyebrow?: string;
  description?: string;
  tenantId?: string | null;
  brandingName?: string | null;
  logoUrl?: string | null;
  originText?: string;
  auditText?: string;
  sqlText?: string;
  onClose: () => void;
  children: ReactNode;
  headerActions?: ReactNode;
  footerActions?: ReactNode;
  panelClassName?: string;
  bodyClassName?: string;
  screenCopyWrapperClassName?: string;
};

function getInitials(value?: string | null) {
  return String(value || 'ESCOLA')
    .trim()
    .slice(0, 3)
    .toUpperCase();
}

export default function AuditedPopupShell({
  isOpen,
  screenId,
  title,
  eyebrow = 'Popup auditável',
  description,
  tenantId,
  brandingName,
  logoUrl,
  originText,
  auditText,
  sqlText,
  onClose,
  children,
  headerActions,
  footerActions,
  panelClassName = 'max-w-4xl',
  bodyClassName = '',
  screenCopyWrapperClassName = 'mt-4 flex justify-end rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3',
}: AuditedPopupShellProps) {
  if (!isOpen) {
    return null;
  }

  const cachedBranding = readCachedTenantBranding(tenantId || null);
  const resolvedLogoUrl = logoUrl || cachedBranding?.logoUrl || null;
  const resolvedBrandingName = brandingName || cachedBranding?.schoolName || 'ESCOLA';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className={`relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.35)] ${panelClassName}`}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50 px-6 py-5">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {resolvedLogoUrl ? (
                <img
                  src={resolvedLogoUrl}
                  alt={resolvedBrandingName}
                  className="h-12 w-12 rounded-xl object-contain"
                />
              ) : (
                <span className="text-lg font-black uppercase text-slate-500">
                  {getInitials(resolvedBrandingName)}
                </span>
              )}
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
                {eyebrow}
              </p>
              <h3 className="text-lg font-bold text-slate-900">{title}</h3>
              {description ? (
                <p className="mt-2 text-sm text-slate-600">{description}</p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {headerActions}
            <button
              onClick={onClose}
              className="ml-auto rounded-full border border-transparent bg-white p-2 text-slate-400 transition hover:text-slate-600"
              aria-label="Fechar popup"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className={`flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-6 ${bodyClassName}`}>
          {children}

          {footerActions ? (
            <div className="mt-4 flex items-center gap-3">{footerActions}</div>
          ) : null}

          <div className={screenCopyWrapperClassName}>
            <ScreenNameCopy
              screenId={screenId}
              className="mt-0"
              disableMargin
              originText={originText}
              auditText={auditText}
              sqlText={sqlText}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
