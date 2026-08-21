import { Injectable } from "@nestjs/common";
import { CentralTenantConfigurationService } from "./central-tenant-configuration.service";
import { MsInforCentralSettingsClient } from "./msinfor-central-settings.client";

@Injectable()
export class CentralIdentityProvisioningService {
  constructor(
    private readonly configurations: CentralTenantConfigurationService,
    private readonly client: MsInforCentralSettingsClient,
  ) {}

  async synchronize(input: {
    tenantId: string;
    login: string;
    email: string;
    displayName: string;
    credential?: string;
    externalSubjectId: string;
    branchCodes: number[];
    roleCode: string;
    enabled?: boolean;
  }) {
    const configuration = await this.configurations.findConfiguration(input.tenantId);
    return this.client.synchronizeTechnicalIdentity({
      login: input.login,
      email: input.email,
      displayName: input.displayName,
      ...(input.credential ? { credential: input.credential } : {}),
      externalSubjectId: input.externalSubjectId,
      tenantId: configuration.tenant.id,
      branchCodes: input.branchCodes,
      roleCode: input.roleCode,
      enabled: input.enabled !== false,
    });
  }

  async setConfirmationPin(input: {
    tenantId: string;
    accountId: string;
    confirmationPin: string;
  }) {
    const configuration = await this.configurations.findConfiguration(input.tenantId);
    return this.client.setTechnicalConfirmationPin({
      accountId: input.accountId,
      tenantId: configuration.tenant.id,
      confirmationPin: input.confirmationPin,
    });
  }
}
