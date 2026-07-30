import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import {
  CentralCompanyMasterData,
  CentralTenantConfiguration,
  MsInforCentralSettingsClient,
} from "./msinfor-central-settings.client";
import type { PrismaClient } from "@prisma/client";

const CENTRAL_SYNC_ACTOR = "MSINFOR_CENTRAL_SYNC";

@Injectable()
export class CentralTenantConfigurationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly client: MsInforCentralSettingsClient,
  ) {}

  private unscopedPrisma(): PrismaClient {
    return this.prisma.getUnscopedClient();
  }

  private async findCentralTenantId(localTenantId: string) {
    const tenant = await this.unscopedPrisma().tenant.findFirst({
      where: { id: localTenantId, canceledAt: null },
      select: { centralTenantId: true },
    });
    if (!tenant) {
      throw new NotFoundException("Empresa local não encontrada.");
    }
    const centralTenantId = String(tenant.centralTenantId || "").trim();
    if (!centralTenantId) {
      throw new ServiceUnavailableException(
        "Empresa sem vínculo ativo com o MSINFOR Central.",
      );
    }
    return centralTenantId;
  }

  async findConfiguration(
    localTenantId: string,
    branchCode?: number,
  ): Promise<CentralTenantConfiguration> {
    const centralTenantId = await this.findCentralTenantId(localTenantId);
    const configuration = await this.client.findTenantConfiguration(
      centralTenantId,
      branchCode,
    );
    if (
      configuration.tenant.status !== "ACTIVE" ||
      (branchCode !== undefined && configuration.branch?.status !== "ACTIVE")
    ) {
      throw new ServiceUnavailableException(
        "Empresa ou filial sem configuração ativa no MSINFOR Central.",
      );
    }
    return configuration;
  }

  async listBranches(localTenantId: string) {
    const centralTenantId = await this.findCentralTenantId(localTenantId);
    const result = await this.client.listTenantBranches(centralTenantId);
    const activeItems = result.items.filter((item) => item.status === "ACTIVE");

    // A tabela local conserva somente a projeção mínima usada pelo isolamento
    // operacional. Dados cadastrais/configurações continuam vindo da Central.
    const prisma = this.unscopedPrisma();
    for (const item of result.items) {
      const existing = await prisma.tenantBranch.findUnique({
        where: {
          tenantId_branchCode: {
            tenantId: localTenantId,
            branchCode: item.branchCode,
          },
        },
        select: { id: true, isActive: true, canceledAt: true },
      });
      const isActive = item.status === "ACTIVE";
      if (!existing) {
        try {
          await prisma.$transaction(async (tx) => {
            const created = await tx.tenantBranch.create({
              data: {
                tenantId: localTenantId,
                branchCode: item.branchCode,
                name: `FILIAL ${item.branchCode}`,
                isActive,
                canceledAt: isActive ? null : new Date(),
                canceledBy: isActive ? null : CENTRAL_SYNC_ACTOR,
                createdBy: CENTRAL_SYNC_ACTOR,
                updatedBy: CENTRAL_SYNC_ACTOR,
              },
            });
            await tx.financeSourceParameterAuditEvent.create({
              data: {
                tenantId: localTenantId,
                branchCode: item.branchCode,
                sourceSystem: "MSINFOR_CENTRAL",
                entityType: "CENTRAL_BRANCH_PROJECTION",
                action: "CREATED",
                parametersJson: JSON.stringify({
                  branchCode: item.branchCode,
                  status: item.status,
                }),
                performedBy: CENTRAL_SYNC_ACTOR,
                createdBy: CENTRAL_SYNC_ACTOR,
              },
            });
            return created;
          });
        } catch (error) {
          // Dois logins simultaneos podem projetar a mesma filial. O primeiro
          // cria e audita; o segundo aceita apenas a colisao da chave unica.
          if ((error as { code?: string })?.code !== "P2002") throw error;
        }
      } else if (
        existing.isActive !== isActive ||
        Boolean(existing.canceledAt) === isActive
      ) {
        await prisma.$transaction(async (tx) => {
          const updated = await tx.tenantBranch.update({
            where: { id: existing.id },
            data: {
              isActive,
              canceledAt: isActive ? null : new Date(),
              canceledBy: isActive ? null : CENTRAL_SYNC_ACTOR,
              updatedBy: CENTRAL_SYNC_ACTOR,
            },
          });
          await tx.financeSourceParameterAuditEvent.create({
            data: {
              tenantId: localTenantId,
              branchCode: item.branchCode,
              sourceSystem: "MSINFOR_CENTRAL",
              entityType: "CENTRAL_BRANCH_PROJECTION",
              action: "STATUS_SYNCHRONIZED",
              parametersJson: JSON.stringify({
                branchCode: item.branchCode,
                status: item.status,
              }),
              performedBy: CENTRAL_SYNC_ACTOR,
              createdBy: CENTRAL_SYNC_ACTOR,
            },
          });
          return updated;
        });
      }
    }

    return activeItems;
  }

  mergeCompany(
    tenantCompany: CentralCompanyMasterData,
    branchCompany?: CentralCompanyMasterData | null,
  ): CentralCompanyMasterData {
    const choose = (branchValue: string, tenantValue: string) =>
      String(branchValue || "").trim() || String(tenantValue || "").trim();
    if (!branchCompany) return tenantCompany;
    return {
      legalName: choose(branchCompany.legalName, tenantCompany.legalName),
      tradeName: choose(branchCompany.tradeName, tenantCompany.tradeName),
      documentNumber: choose(
        branchCompany.documentNumber,
        tenantCompany.documentNumber,
      ),
      stateRegistration: choose(
        branchCompany.stateRegistration,
        tenantCompany.stateRegistration,
      ),
      municipalRegistration: choose(
        branchCompany.municipalRegistration,
        tenantCompany.municipalRegistration,
      ),
      address: {
        postalCode: choose(
          branchCompany.address.postalCode,
          tenantCompany.address.postalCode,
        ),
        street: choose(branchCompany.address.street, tenantCompany.address.street),
        number: choose(branchCompany.address.number, tenantCompany.address.number),
        complement: choose(
          branchCompany.address.complement,
          tenantCompany.address.complement,
        ),
        district: choose(
          branchCompany.address.district,
          tenantCompany.address.district,
        ),
        city: choose(branchCompany.address.city, tenantCompany.address.city),
        state: choose(branchCompany.address.state, tenantCompany.address.state),
        country: choose(
          branchCompany.address.country,
          tenantCompany.address.country,
        ),
      },
      contacts: {
        phone: choose(branchCompany.contacts.phone, tenantCompany.contacts.phone),
        mobile: choose(
          branchCompany.contacts.mobile,
          tenantCompany.contacts.mobile,
        ),
        secondaryMobile: choose(
          branchCompany.contacts.secondaryMobile,
          tenantCompany.contacts.secondaryMobile,
        ),
        whatsapp: choose(
          branchCompany.contacts.whatsapp,
          tenantCompany.contacts.whatsapp,
        ),
        email: choose(branchCompany.contacts.email, tenantCompany.contacts.email),
        website: choose(
          branchCompany.contacts.website,
          tenantCompany.contacts.website,
        ),
      },
      logoReference: choose(
        branchCompany.logoReference,
        tenantCompany.logoReference,
      ),
    };
  }
}
