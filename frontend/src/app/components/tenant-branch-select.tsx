'use client';

import type { TenantBranchSummary } from '@/app/lib/dashboard-crud-utils';

type TenantBranchSelectProps = {
  branches: TenantBranchSummary[];
  value: number;
  onChange: (branchCode: number) => void;
  labelClassName?: string;
  selectClassName?: string;
};

export function TenantBranchSelect({
  branches,
  value,
  onChange,
  labelClassName,
  selectClassName,
}: TenantBranchSelectProps) {
  if (!Array.isArray(branches) || branches.length <= 1) {
    return null;
  }

  return (
    <div>
      <label className={labelClassName}>Filial do cadastro</label>
      <select
        value={String(value)}
        onChange={(event) => onChange(Number.parseInt(event.target.value, 10) || 0)}
        className={selectClassName}
      >
        <option value="0">ACESSO A TODAS FILIAIS</option>
        {branches.map((branch) => (
          <option key={branch.id} value={branch.branchCode}>
            {branch.branchCode} - {branch.name}
          </option>
        ))}
      </select>
    </div>
  );
}
