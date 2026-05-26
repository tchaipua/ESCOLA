import type { TenantBranchSummary } from './dashboard-crud-utils';

type BranchScopedRecord = {
  branchCode?: number | null;
  branchAccessCodes?: number[] | null;
};

export function resolveBranchAccessSelection(
  record: BranchScopedRecord,
  currentBranchCode: number,
) {
  if (Array.isArray(record.branchAccessCodes) && record.branchAccessCodes.length > 0) {
    return Array.from(new Set(record.branchAccessCodes.filter((branchCode) => branchCode > 0))).sort(
      (left, right) => left - right,
    );
  }

  if (record.branchCode === 0) {
    return [];
  }

  return [typeof record.branchCode === 'number' && record.branchCode > 0 ? record.branchCode : currentBranchCode];
}

export function buildBranchAccessPayload(
  selectedBranchCodes: number[],
  branches: TenantBranchSummary[],
  currentBranchCode: number,
) {
  if (!Array.isArray(branches) || branches.length <= 1) {
    return {
      branchCode: currentBranchCode,
      branchAccessCodes: undefined,
    };
  }

  const normalizedSelection = Array.from(
    new Set(selectedBranchCodes.filter((branchCode) => Number.isInteger(branchCode) && branchCode > 0)),
  ).sort((left, right) => left - right);

  if (normalizedSelection.length === 0) {
    return {
      branchCode: 0,
      branchAccessCodes: [],
    };
  }

  return {
    branchCode: normalizedSelection.length === 1 ? normalizedSelection[0] : 0,
    branchAccessCodes: normalizedSelection,
  };
}
