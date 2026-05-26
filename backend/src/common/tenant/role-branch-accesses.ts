import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  DEFAULT_BRANCH_CODE,
  getVisibleBranchCodes,
  normalizeBranchCode,
  SHARED_BRANCH_CODE,
} from "./branch.constants";
import {
  listTenantBranches,
  resolveWritableTenantBranchCode,
} from "./tenant-branches";
import { getTenantContext } from "./tenant.context";

type TenantBranchClient = PrismaService | Prisma.TransactionClient;
type RoleBranchOwner = "teacher" | "student" | "guardian";

const delegateByOwner: Record<RoleBranchOwner, string> = {
  teacher: "teacherBranchAccess",
  student: "studentBranchAccess",
  guardian: "guardianBranchAccess",
};

const ownerIdFieldByOwner: Record<RoleBranchOwner, string> = {
  teacher: "teacherId",
  student: "studentId",
  guardian: "guardianId",
};

const uniqueKeyByOwner: Record<RoleBranchOwner, string> = {
  teacher: "tenantId_teacherId_branchCode",
  student: "tenantId_studentId_branchCode",
  guardian: "tenantId_guardianId_branchCode",
};

export type RoleBranchAccessRecord = {
  branchCode: number;
  branchAccesses?: Array<{
    branchCode: number;
    canceledAt?: Date | string | null;
  }> | null;
};

export function mapRoleBranchAccessCodes(record: RoleBranchAccessRecord) {
  const explicitCodes = Array.from(
    new Set(
      (record.branchAccesses || [])
        .filter((access) => !access.canceledAt)
        .map((access) => normalizeBranchCode(access.branchCode, -1))
        .filter((branchCode) => branchCode >= DEFAULT_BRANCH_CODE),
    ),
  ).sort((left, right) => left - right);

  if (explicitCodes.length > 0) {
    return explicitCodes;
  }

  const branchCode = normalizeBranchCode(record.branchCode, DEFAULT_BRANCH_CODE);
  return branchCode === SHARED_BRANCH_CODE ? [] : [branchCode];
}

export function withRoleBranchAccessCodes<T extends RoleBranchAccessRecord>(
  record: T,
) {
  return {
    ...record,
    branchAccessCodes: mapRoleBranchAccessCodes(record),
  };
}

export function isRoleBranchRecordVisibleInCurrentBranch(
  record: RoleBranchAccessRecord,
) {
  const currentBranchCode = getTenantContext()?.branchCode ?? DEFAULT_BRANCH_CODE;
  const explicitCodes = mapRoleBranchAccessCodes(record);

  if (explicitCodes.length > 0) {
    return explicitCodes.includes(
      normalizeBranchCode(currentBranchCode, DEFAULT_BRANCH_CODE),
    );
  }

  return getVisibleBranchCodes(currentBranchCode).includes(
    normalizeBranchCode(record.branchCode, DEFAULT_BRANCH_CODE),
  );
}

export function filterRoleBranchRecordsForCurrentBranch<
  T extends RoleBranchAccessRecord,
>(records: T[]) {
  return records.filter((record) =>
    isRoleBranchRecordVisibleInCurrentBranch(record),
  );
}

export async function resolveRoleBranchSelection(
  prisma: TenantBranchClient,
  tenantId: string,
  requestedBranchCode: unknown,
  requestedBranchAccessCodes: unknown,
  fallbackBranchCode = DEFAULT_BRANCH_CODE,
) {
  const branches = await listTenantBranches(prisma, tenantId);
  const activeBranchCodes = branches
    .filter((branch) => branch.isActive)
    .map((branch) => branch.branchCode)
    .filter((branchCode) => branchCode >= DEFAULT_BRANCH_CODE)
    .sort((left, right) => left - right);

  if (activeBranchCodes.length <= 1) {
    return {
      branchCode: activeBranchCodes[0] || DEFAULT_BRANCH_CODE,
      explicitBranchCodes: [] as number[],
    };
  }

  if (!Array.isArray(requestedBranchAccessCodes)) {
    const branchCode = await resolveWritableTenantBranchCode(
      prisma,
      tenantId,
      requestedBranchCode,
      fallbackBranchCode,
    );

    return {
      branchCode,
      explicitBranchCodes: [] as number[],
    };
  }

  const explicitBranchCodes = Array.from(
    new Set(
      requestedBranchAccessCodes
        .map((branchCode) => normalizeBranchCode(branchCode, -1))
        .filter((branchCode) => branchCode >= DEFAULT_BRANCH_CODE),
    ),
  ).sort((left, right) => left - right);

  if (explicitBranchCodes.length === 0) {
    return {
      branchCode: SHARED_BRANCH_CODE,
      explicitBranchCodes: [] as number[],
    };
  }

  const activeBranchCodeSet = new Set(activeBranchCodes);
  const invalidBranchCode = explicitBranchCodes.find(
    (branchCode) => !activeBranchCodeSet.has(branchCode),
  );

  if (invalidBranchCode) {
    throw new BadRequestException("A filial informada não existe.");
  }

  if (
    explicitBranchCodes.length === activeBranchCodes.length &&
    explicitBranchCodes.every((branchCode) => activeBranchCodeSet.has(branchCode))
  ) {
    return {
      branchCode: SHARED_BRANCH_CODE,
      explicitBranchCodes: [] as number[],
    };
  }

  if (explicitBranchCodes.length === 1) {
    return {
      branchCode: explicitBranchCodes[0],
      explicitBranchCodes: [] as number[],
    };
  }

  return {
    branchCode: SHARED_BRANCH_CODE,
    explicitBranchCodes,
  };
}

export async function syncRoleBranchAccesses(
  prisma: TenantBranchClient,
  owner: RoleBranchOwner,
  tenantId: string,
  ownerId: string,
  explicitBranchCodes: number[],
  userId?: string | null,
) {
  const delegate = (prisma as any)[delegateByOwner[owner]];
  const ownerIdField = ownerIdFieldByOwner[owner];
  const uniqueKey = uniqueKeyByOwner[owner];
  const now = new Date();

  if (!delegate) {
    throw new BadRequestException("Tipo de acesso por filial inválido.");
  }

  if (explicitBranchCodes.length === 0) {
    await delegate.updateMany({
      where: {
        tenantId,
        [ownerIdField]: ownerId,
        canceledAt: null,
      },
      data: {
        canceledAt: now,
        canceledBy: userId || undefined,
        updatedBy: userId || undefined,
      },
    });
    return;
  }

  await Promise.all(
    explicitBranchCodes.map((branchCode, index) =>
      delegate.upsert({
        where: {
          [uniqueKey]: {
            tenantId,
            [ownerIdField]: ownerId,
            branchCode,
          },
        },
        update: {
          isDefault: index === 0,
          canceledAt: null,
          canceledBy: null,
          updatedBy: userId || undefined,
        },
        create: {
          tenantId,
          [ownerIdField]: ownerId,
          branchCode,
          isDefault: index === 0,
          createdBy: userId || undefined,
          updatedBy: userId || undefined,
        },
      }),
    ),
  );

  await delegate.updateMany({
    where: {
      tenantId,
      [ownerIdField]: ownerId,
      canceledAt: null,
      branchCode: { notIn: explicitBranchCodes },
    },
    data: {
      canceledAt: now,
      canceledBy: userId || undefined,
      updatedBy: userId || undefined,
      isDefault: false,
    },
  });
}
