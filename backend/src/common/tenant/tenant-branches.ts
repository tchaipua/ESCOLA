import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  DEFAULT_BRANCH_CODE,
  SHARED_BRANCH_CODE,
  normalizeBranchCode,
} from "./branch.constants";

type TenantBranchClient = PrismaService | Prisma.TransactionClient;

export async function ensureDefaultTenantBranch(
  prisma: TenantBranchClient,
  tenantId: string,
  userId?: string | null,
) {
  const existing = await prisma.tenantBranch.findFirst({
    where: {
      tenantId,
      branchCode: DEFAULT_BRANCH_CODE,
    },
    select: { id: true },
  });

  if (existing) {
    return existing;
  }

  return prisma.tenantBranch.create({
    data: {
      tenantId,
      branchCode: DEFAULT_BRANCH_CODE,
      name: "FILIAL 1",
      isActive: true,
      createdBy: userId || undefined,
      updatedBy: userId || undefined,
    },
    select: { id: true },
  });
}

export async function listTenantBranches(
  prisma: TenantBranchClient,
  tenantId: string,
) {
  await ensureDefaultTenantBranch(prisma, tenantId);

  return prisma.tenantBranch.findMany({
    where: {
      tenantId,
      canceledAt: null,
    },
    orderBy: [{ branchCode: "asc" }, { name: "asc" }],
  });
}

export async function resolveWritableTenantBranchCode(
  prisma: TenantBranchClient,
  tenantId: string,
  requestedBranchCode?: unknown,
  fallbackBranchCode = DEFAULT_BRANCH_CODE,
) {
  const branches = await listTenantBranches(prisma, tenantId);

  if (branches.length <= 1) {
    return DEFAULT_BRANCH_CODE;
  }

  if (
    requestedBranchCode === undefined ||
    requestedBranchCode === null ||
    String(requestedBranchCode).trim() === ""
  ) {
    return normalizeBranchCode(fallbackBranchCode, DEFAULT_BRANCH_CODE);
  }

  const normalizedBranchCode = normalizeBranchCode(requestedBranchCode, -1);
  if (normalizedBranchCode < 0) {
    throw new BadRequestException("Filial inválida.");
  }

  if (normalizedBranchCode === SHARED_BRANCH_CODE) {
    return SHARED_BRANCH_CODE;
  }

  const branchExists = branches.some(
    (branch) => branch.branchCode === normalizedBranchCode,
  );

  if (!branchExists) {
    throw new BadRequestException("A filial informada não existe.");
  }

  return normalizedBranchCode;
}

export function mapTenantBranchSummary(branch: {
  id: string;
  branchCode: number;
  name: string;
  logoUrl?: string | null;
  document?: string | null;
  rg?: string | null;
  cpf?: string | null;
  cnpj?: string | null;
  nickname?: string | null;
  corporateName?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  cellphone1?: string | null;
  cellphone2?: string | null;
  email?: string | null;
  zipCode?: string | null;
  street?: string | null;
  number?: string | null;
  city?: string | null;
  state?: string | null;
  neighborhood?: string | null;
  complement?: string | null;
  stockControlMode?: string | null;
  stockIntegerQuantityMode?: string | null;
  stockLotControlMode?: string | null;
  stockExpirationControlMode?: string | null;
  stockGridControlMode?: string | null;
  stockNegativeControlMode?: string | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpTimeout?: number | null;
  smtpAuthenticate?: boolean | null;
  smtpSecure?: boolean | null;
  smtpAuthType?: string | null;
  smtpEmail?: string | null;
  smtpPassword?: string | null;
  telegramEnabled?: boolean | null;
  telegramBotToken?: string | null;
  telegramBotUsername?: string | null;
  telegramHeaderImageUrl?: string | null;
  storageProviderAccessKeyId?: string | null;
  storageProviderSecretAccessKey?: string | null;
  storageBucketName?: string | null;
  storageFolderName?: string | null;
  storageDefaultAcl?: string | null;
  storageDefaultExpiration?: number | null;
  storageRegion?: string | null;
  storageEndpoint?: string | null;
  storageCustomEndpoint?: string | null;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  updatedBy?: string | null;
}) {
  return {
    id: branch.id,
    branchCode: branch.branchCode,
    name: branch.name,
    logoUrl: branch.logoUrl,
    document: branch.document,
    rg: branch.rg,
    cpf: branch.cpf,
    cnpj: branch.cnpj,
    nickname: branch.nickname,
    corporateName: branch.corporateName,
    phone: branch.phone,
    whatsapp: branch.whatsapp,
    cellphone1: branch.cellphone1,
    cellphone2: branch.cellphone2,
    email: branch.email,
    zipCode: branch.zipCode,
    street: branch.street,
    number: branch.number,
    city: branch.city,
    state: branch.state,
    neighborhood: branch.neighborhood,
    complement: branch.complement,
    stockControlMode: branch.stockControlMode || "BY_PRODUCT",
    stockIntegerQuantityMode:
      branch.stockIntegerQuantityMode || "BY_PRODUCT",
    stockLotControlMode: branch.stockLotControlMode || "BY_PRODUCT",
    stockExpirationControlMode:
      branch.stockExpirationControlMode || "BY_PRODUCT",
    stockGridControlMode: branch.stockGridControlMode || "BY_PRODUCT",
    stockNegativeControlMode:
      branch.stockNegativeControlMode || "BY_PRODUCT",
    smtpHost: branch.smtpHost,
    smtpPort: branch.smtpPort,
    smtpTimeout: branch.smtpTimeout,
    smtpAuthenticate: branch.smtpAuthenticate,
    smtpSecure: branch.smtpSecure,
    smtpAuthType: branch.smtpAuthType,
    smtpEmail: branch.smtpEmail,
    smtpPassword: branch.smtpPassword,
    telegramEnabled: branch.telegramEnabled,
    telegramBotToken: branch.telegramBotToken,
    telegramBotUsername: branch.telegramBotUsername,
    telegramHeaderImageUrl: branch.telegramHeaderImageUrl,
    storageProviderAccessKeyId: branch.storageProviderAccessKeyId,
    storageProviderSecretAccessKey: branch.storageProviderSecretAccessKey,
    storageBucketName: branch.storageBucketName,
    storageFolderName: branch.storageFolderName,
    storageDefaultAcl: branch.storageDefaultAcl,
    storageDefaultExpiration: branch.storageDefaultExpiration,
    storageRegion: branch.storageRegion,
    storageEndpoint: branch.storageEndpoint,
    storageCustomEndpoint: branch.storageCustomEndpoint,
    isActive: branch.isActive,
    isShared: branch.branchCode === SHARED_BRANCH_CODE,
    createdAt: branch.createdAt,
    updatedAt: branch.updatedAt,
    updatedBy: branch.updatedBy,
  };
}
