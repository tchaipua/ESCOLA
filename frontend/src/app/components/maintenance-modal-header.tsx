'use client';

import type { ReactNode } from 'react';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';

type MaintenanceModalHeaderProps = {
  title: string;
  onClose: () => void;
  tenantId?: string | null;
  schoolName?: string | null;
  logoUrl?: string | null;
  eyebrow?: string;
  description?: string;
  recordVisual?: ReactNode;
  closeLabel?: string;
  compact?: boolean;
  className?: string;
};

function getInitials(value?: string | null) {
  return String(value || 'ESCOLA').trim().slice(0, 3).toUpperCase();
}

export default function MaintenanceModalHeader({
  title,
  onClose,
  tenantId,
  schoolName,
  logoUrl,
  eyebrow = 'Cadastro e manutenção',
  description,
  recordVisual,
  closeLabel = 'Sair sem gravar',
  compact = false,
  className = '',
}: MaintenanceModalHeaderProps) {
  const cachedBranding = readCachedTenantBranding(tenantId || null);
  const resolvedLogoUrl = logoUrl || cachedBranding?.logoUrl || null;
  const resolvedSchoolName = schoolName || cachedBranding?.schoolName || 'ESCOLA';
  const logoSize = compact ? 'h-10 w-10 rounded-xl' : 'h-14 w-14 rounded-2xl';

  return (
    <header className={`flex shrink-0 items-center gap-4 border-b border-blue-800 bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-6 py-4 text-white ${className}`.trim()}>
      <div className={`flex shrink-0 items-center justify-center overflow-hidden border border-white/25 bg-white shadow-lg ${logoSize}`}>
        {resolvedLogoUrl ? (
          <img src={resolvedLogoUrl} alt={resolvedSchoolName} className="h-full w-full object-contain p-1" />
        ) : (
          <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-600">{getInitials(resolvedSchoolName)}</span>
        )}
      </div>

      {recordVisual ? <div className="shrink-0">{recordVisual}</div> : null}

      <div className="min-w-0 flex-1">
        <div className="truncate text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200">{eyebrow}</div>
        <h2 className={`${compact ? 'text-lg' : 'text-xl'} truncate font-black text-white`}>{title}</h2>
        {description ? <p className="mt-1 line-clamp-2 text-xs font-semibold text-blue-100">{description}</p> : null}
      </div>

      <button
        type="button"
        onClick={onClose}
        title={closeLabel}
        aria-label={closeLabel}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-red-200 bg-red-600 text-white shadow-lg shadow-red-950/20 transition hover:bg-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </header>
  );
}
