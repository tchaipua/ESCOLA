'use client';

import type { ReactNode } from 'react';
import ScreenNameCopy from '@/app/components/screen-name-copy';

type MaintenanceModalFooterProps = {
  screenId: string;
  saveLabel?: string;
  savingLabel?: string;
  isSaving?: boolean;
  disabled?: boolean;
  formId?: string;
  onSave?: () => void;
  onSaveClick?: () => void;
  auditText?: string;
  sqlText?: string;
  originText?: string;
  secondaryActions?: ReactNode;
  screenNameCompact?: boolean;
  className?: string;
};

export default function MaintenanceModalFooter({
  screenId,
  saveLabel = 'Salvar',
  savingLabel = 'Salvando...',
  isSaving = false,
  disabled = false,
  formId,
  onSave,
  onSaveClick,
  auditText,
  sqlText,
  originText,
  secondaryActions,
  screenNameCompact = false,
  className = '',
}: MaintenanceModalFooterProps) {
  return (
    <footer className={`flex shrink-0 flex-wrap items-center gap-3 border-t border-slate-200 bg-white px-6 py-4 ${className}`.trim()}>
      <div className="flex shrink-0 items-center gap-3">
        <button
          type={onSave ? 'button' : 'submit'}
          form={formId}
          onClick={onSave || onSaveClick}
          disabled={disabled || isSaving}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[18px] border-2 border-emerald-500 bg-white px-8 py-2.5 text-sm font-black text-emerald-700 shadow-sm transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 3h12l2 2v16H5z" />
            <path d="M8 3v6h8V3M8 21v-7h8v7" />
          </svg>
          {isSaving ? savingLabel : saveLabel}
        </button>
        {secondaryActions}
      </div>

      <ScreenNameCopy
        screenId={screenId}
        label="Tela"
        disableMargin
        compact={screenNameCompact}
        className="ml-auto min-w-0 max-w-full flex-1 justify-end sm:max-w-[65%]"
        auditText={auditText}
        sqlText={sqlText}
        originText={originText}
      />
    </footer>
  );
}
