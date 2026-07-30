'use client';

import type { TenantBranchSummary } from '@/app/lib/dashboard-crud-utils';

type TenantBranchSelectProps = {
  branches: TenantBranchSummary[];
  value: number;
  onChange: (branchCode: number) => void;
  mode?: 'single' | 'multiple';
  variant?: 'select' | 'pills';
  selectedBranchCodes?: number[];
  onSelectedBranchCodesChange?: (branchCodes: number[]) => void;
  label?: string;
  containerClassName?: string;
  labelClassName?: string;
  selectClassName?: string;
};

export function TenantBranchSelect({
  branches,
  value,
  onChange,
  mode = 'single',
  variant = 'select',
  selectedBranchCodes = [],
  onSelectedBranchCodesChange,
  label,
  containerClassName,
  labelClassName,
  selectClassName,
}: TenantBranchSelectProps) {
  if (!Array.isArray(branches) || branches.length <= 1) {
    return null;
  }

  if (mode === 'multiple') {
    const normalizedSelection = Array.from(
      new Set(
        selectedBranchCodes
          .map((branchCode) => Number.parseInt(String(branchCode), 10))
          .filter((branchCode) => Number.isInteger(branchCode) && branchCode > 0),
      ),
    );
    const allBranchesSelected = normalizedSelection.length === 0;
    const toggleBranch = (branchCode: number) => {
      const isSelected = normalizedSelection.includes(branchCode);
      const nextSelection = isSelected
        ? normalizedSelection.filter((selectedBranchCode) => selectedBranchCode !== branchCode)
        : [...normalizedSelection, branchCode];

      if (nextSelection.length === 0) {
        onSelectedBranchCodesChange?.(normalizedSelection);
        return;
      }

      onSelectedBranchCodesChange?.(nextSelection.sort((left, right) => left - right));
    };

    return (
      <div>
        <label className={labelClassName}>{label || 'Filial de uso'}</label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={allBranchesSelected}
            onClick={() => onSelectedBranchCodesChange?.([])}
            className={`rounded-lg border px-3 py-2 text-xs font-black uppercase transition-colors ${
              allBranchesSelected
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-slate-300 bg-slate-50 text-slate-700 hover:border-blue-400 hover:bg-white'
            }`}
          >
            TODAS AS FILIAIS
          </button>
          {branches.map((branch) => {
            const selected = !allBranchesSelected && normalizedSelection.includes(branch.branchCode);
            return (
              <button
                key={branch.id}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleBranch(branch.branchCode)}
                className={`rounded-lg border px-3 py-2 text-xs font-black uppercase transition-colors ${
                  selected
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-300 bg-slate-50 text-slate-700 hover:border-blue-400 hover:bg-white'
                }`}
              >
                {branch.branchCode} - {branch.name}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (variant === 'pills') {
    const normalizedValue = Number.parseInt(String(value), 10) || 0;
    const options = [{ branchCode: 0, name: 'TODAS AS FILIAIS', id: 'all-branches' }, ...branches];

    return (
      <div className={containerClassName || 'rounded-lg border border-slate-300 bg-slate-50 px-4 py-3'}>
        <p className={labelClassName || 'text-xs font-bold uppercase tracking-wide text-slate-500'}>{label || 'Filiais'}</p>
        <div className="mt-3 flex flex-wrap gap-3">
          {options.map((branch) => {
            const checked = normalizedValue === branch.branchCode;
            const optionLabel = branch.branchCode === 0 ? branch.name : `${branch.branchCode} - ${branch.name}`;

            return (
              <label
                key={branch.id}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition-colors ${
                  checked
                    ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm'
                    : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onChange(branch.branchCode)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                {optionLabel}
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className={labelClassName}>{label || 'Filial de uso'}</label>
      <select
        value={String(value)}
        onChange={(event) => onChange(Number.parseInt(event.target.value, 10) || 0)}
        className={selectClassName}
      >
        <option value="0">USAR EM TODAS AS FILIAIS</option>
        {branches.map((branch) => (
          <option key={branch.id} value={branch.branchCode}>
            {branch.branchCode} - {branch.name}
          </option>
        ))}
      </select>
    </div>
  );
}
