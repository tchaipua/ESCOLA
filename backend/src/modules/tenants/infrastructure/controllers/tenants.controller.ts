import {
  Controller,
  Post,
  Body,
  Get,
  Put,
  Param,
  Req,
  GoneException,
  Query,
  Delete,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { Request } from "express";
import { TenantsService } from "../../application/services/tenants.service";
import { CreateTenantDto } from "../../application/dto/create-tenant.dto";
import { PurgeTenantDto } from "../../application/dto/purge-tenant.dto";
import { UpdateTenantDto } from "../../application/dto/update-tenant.dto";
import { Public } from "../../../../common/decorators/public.decorator";
import {
  CurrentUser,
  ICurrentUser,
} from "../../../../common/decorators/current-user.decorator";
import { Throttle } from "@nestjs/throttler";
import { CentralOperationalSummaryGuard } from "../../../../common/guards/central-operational-summary.guard";

@ApiTags("Inquilinos (Onboarding)")
@Controller("tenants")
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  private assertMasterPass(_req: Request): never {
    throw new GoneException(
      "Rota administrativa legada desativada. Use o MSINFOR Central.",
    );
  }

  @Public()
  @Get("technical/central/operational-summary")
  @UseGuards(CentralOperationalSummaryGuard)
  async centralOperationalSummary(
    @Query("tenantId") tenantId: string,
    @Query("branchCode") branchCode?: string,
  ) {
    return this.tenantsService.findCentralOperationalSummary(tenantId, branchCode);
  }

  @Public()
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Post()
  @ApiOperation({
    summary: "Cadastra uma nova Escola e seu primeiro Administrador",
  })
  async create(@Req() req: Request, @Body() createTenantDto: CreateTenantDto) {
    this.assertMasterPass(req);
    return this.tenantsService.create(createTenantDto);
  }

  @Public()
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Get("email-usage")
  @ApiOperation({
    summary: "Consulta onde um email está sendo usado no ecossistema MSINFOR",
  })
  async findEmailUsage(@Req() req: Request, @Query("email") email: string) {
    this.assertMasterPass(req);
    return this.tenantsService.findEmailUsage(email);
  }

  @Public()
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Put("email-usage")
  @ApiOperation({
    summary:
      "Atualiza o email de um registro global localizado pela consulta master",
  })
  async updateEmailUsage(
    @Req() req: Request,
    @Body()
    payload: { entityType?: string; recordId?: string; newEmail?: string },
  ) {
    this.assertMasterPass(req);
    return this.tenantsService.updateEmailUsage(payload);
  }

  @Public()
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Get(":id/access-users")
  @ApiOperation({
    summary: "Lista os usuários de acesso administrativo da escola",
  })
  async findAccessUsers(@Req() req: Request, @Param("id") id: string) {
    this.assertMasterPass(req);
    return this.tenantsService.findAccessUsersByTenant(id);
  }

  @Public()
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Get(":id/shared-profiles/cpf/:cpf")
  @ApiOperation({
    summary: "Consulta dados compartilhados de CPF para uma escola específica",
  })
  async findSharedProfileByCpf(
    @Req() req: Request,
    @Param("id") id: string,
    @Param("cpf") cpf: string,
  ) {
    this.assertMasterPass(req);
    return this.tenantsService.findSharedProfileByCpf(id, cpf);
  }

  @Public()
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Post(":id/access-users")
  @ApiOperation({
    summary: "Cria um novo usuário de acesso administrativo na escola",
  })
  async createAccessUser(
    @Req() req: Request,
    @Param("id") id: string,
    @Body()
    payload: {
      name?: string;
      email?: string;
      password?: string;
      birthDate?: string;
      rg?: string;
      cpf?: string;
      cnpj?: string;
      nickname?: string;
      corporateName?: string;
      phone?: string;
      whatsapp?: string;
      cellphone1?: string;
      cellphone2?: string;
      zipCode?: string;
      street?: string;
      number?: string;
      city?: string;
      state?: string;
      neighborhood?: string;
      complement?: string;
      photoUrl?: string | null;
      complementaryProfiles?: string[];
      role?: string;
      accessProfile?: string;
      permissions?: string[];
      branchAccessCodes?: number[];
      cashierOnly?: boolean;
    },
  ) {
    this.assertMasterPass(req);
    return this.tenantsService.createAccessUser(id, payload);
  }

  @Public()
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Put(":id/access-users/:userId")
  @ApiOperation({
    summary: "Atualiza um usuário de acesso administrativo da escola",
  })
  async updateAccessUser(
    @Req() req: Request,
    @Param("id") id: string,
    @Param("userId") userId: string,
    @Body()
    payload: {
      name?: string;
      email?: string;
      password?: string;
      birthDate?: string;
      rg?: string;
      cpf?: string;
      cnpj?: string;
      nickname?: string;
      corporateName?: string;
      phone?: string;
      whatsapp?: string;
      cellphone1?: string;
      cellphone2?: string;
      zipCode?: string;
      street?: string;
      number?: string;
      city?: string;
      state?: string;
      neighborhood?: string;
      complement?: string;
      photoUrl?: string | null;
      complementaryProfiles?: string[];
      role?: string;
      accessProfile?: string;
      permissions?: string[];
      branchAccessCodes?: number[];
      cashierOnly?: boolean;
    },
  ) {
    this.assertMasterPass(req);
    return this.tenantsService.updateAccessUser(id, userId, payload);
  }

  @Public()
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Delete(":id/access-users/:userId")
  @ApiOperation({
    summary: "Desativa um usuário de acesso administrativo da escola",
  })
  async removeAccessUser(
    @Req() req: Request,
    @Param("id") id: string,
    @Param("userId") userId: string,
  ) {
    this.assertMasterPass(req);
    return this.tenantsService.removeAccessUser(id, userId);
  }

  @Public()
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Get()
  @ApiOperation({
    summary: "Lista todas as Escolas (Tenants) cadastradas no motor MSINFOR",
  })
  async findAll(@Req() req: Request) {
    this.assertMasterPass(req);
    return this.tenantsService.findAll();
  }

  @Get("current")
  @ApiOperation({
    summary: "Retorna os dados da escola vinculada ao usuário autenticado",
  })
  async findCurrent(@CurrentUser() currentUser: ICurrentUser) {
    return this.tenantsService.findCurrent(
      currentUser.tenantId,
      currentUser.branchCode,
    );
  }


  @Get("current/branches")
  @ApiOperation({
    summary: "Lista as filiais ativas da escola atual",
  })
  async listCurrentBranches(@CurrentUser() currentUser: ICurrentUser) {
    return this.tenantsService.listCurrentBranches(currentUser.tenantId);
  }

  @Post("current/sync-financeiro-integration-settings")
  @ApiOperation({
    summary:
      "Sincroniza com segurança as configurações efetivas da empresa e filial com o Financeiro",
  })
  async syncCurrentFinanceiroIntegrationSettings(
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    return this.tenantsService.syncCurrentFinanceiroIntegrationSettings(
      currentUser,
    );
  }

  @Post("current/branches")
  @ApiOperation({
    summary: "Cria uma nova filial para a escola atual",
  })
  async createCurrentBranch(
    @CurrentUser() currentUser: ICurrentUser,
    @Body()
    payload: {
      branchCode?: number;
      name?: string;
      logoUrl?: string;
      document?: string;
      rg?: string;
      cpf?: string;
      cnpj?: string;
      nickname?: string;
      corporateName?: string;
      phone?: string;
      whatsapp?: string;
      cellphone1?: string;
      cellphone2?: string;
      email?: string;
      zipCode?: string;
      street?: string;
      number?: string;
      city?: string;
      state?: string;
      neighborhood?: string;
      complement?: string;
      smtpHost?: string;
      smtpPort?: number | string;
      smtpTimeout?: number | string;
      smtpAuthenticate?: boolean | string | number;
      smtpSecure?: boolean | string | number;
      smtpAuthType?: string;
      smtpEmail?: string;
      smtpPassword?: string;
      telegramEnabled?: boolean | string | number;
      telegramBotToken?: string;
      telegramBotUsername?: string;
      storageProviderAccessKeyId?: string;
      storageProviderSecretAccessKey?: string;
      storageBucketName?: string;
      storageFolderName?: string;
      storageDefaultAcl?: string;
      storageDefaultExpiration?: number | string;
      storageRegion?: string;
      storageEndpoint?: string;
      storageCustomEndpoint?: string;
      storageCapacityGb?: number | string;
      storageImagesFolderName?: string;
      storageDescription?: string;
    },
  ) {
    throw new GoneException(
      "Cadastro de filiais centralizado no MSINFOR Central.",
    );
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get("branches/verify-email")
  @ApiOperation({ summary: "Rota legada de confirmação de filial desativada" })
  async verifyBranchEmail(@Query("token") token: string) {
    throw new GoneException(
      "A validação cadastral da filial é realizada no MSINFOR Central.",
    );
  }

  @Public()
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Get(":id/branches")
  @ApiOperation({
    summary: "Lista as filiais de uma escola pelo painel MSINFOR ADMIN",
  })
  async listBranchesByTenant(@Req() req: Request, @Param("id") id: string) {
    this.assertMasterPass(req);
    return this.tenantsService.listBranchesByTenant(id);
  }

  @Public()
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Post(":id/branches")
  @ApiOperation({
    summary: "Cria uma filial de uma escola pelo painel MSINFOR ADMIN",
  })
  async createBranchByTenant(
    @Req() req: Request,
    @Param("id") id: string,
    @Body()
    payload: {
      branchCode?: number;
      name?: string;
      logoUrl?: string;
      document?: string;
      rg?: string;
      cpf?: string;
      cnpj?: string;
      nickname?: string;
      corporateName?: string;
      phone?: string;
      whatsapp?: string;
      cellphone1?: string;
      cellphone2?: string;
      email?: string;
      zipCode?: string;
      street?: string;
      number?: string;
      city?: string;
      state?: string;
      neighborhood?: string;
      complement?: string;
      smtpHost?: string;
      smtpPort?: number | string;
      smtpTimeout?: number | string;
      smtpAuthenticate?: boolean | string | number;
      smtpSecure?: boolean | string | number;
      smtpAuthType?: string;
      smtpEmail?: string;
      smtpPassword?: string;
      telegramEnabled?: boolean | string | number;
      telegramBotToken?: string;
      telegramBotUsername?: string;
      storageProviderAccessKeyId?: string;
      storageProviderSecretAccessKey?: string;
      storageBucketName?: string;
      storageFolderName?: string;
      storageDefaultAcl?: string;
      storageDefaultExpiration?: number | string;
      storageRegion?: string;
      storageEndpoint?: string;
      storageCustomEndpoint?: string;
      storageCapacityGb?: number | string;
      storageImagesFolderName?: string;
      storageDescription?: string;
    },
  ) {
    this.assertMasterPass(req);
    return this.tenantsService.createBranchByTenant(id, payload);
  }

  @Public()
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Put(":id/branches/:branchId")
  @ApiOperation({
    summary: "Atualiza uma filial de uma escola pelo painel MSINFOR ADMIN",
  })
  async updateBranchByTenant(
    @Req() req: Request,
    @Param("id") id: string,
    @Param("branchId") branchId: string,
    @Body()
    payload: {
      branchCode?: number;
      name?: string;
      logoUrl?: string;
      document?: string;
      rg?: string;
      cpf?: string;
      cnpj?: string;
      nickname?: string;
      corporateName?: string;
      phone?: string;
      whatsapp?: string;
      cellphone1?: string;
      cellphone2?: string;
      email?: string;
      zipCode?: string;
      street?: string;
      number?: string;
      city?: string;
      state?: string;
      neighborhood?: string;
      complement?: string;
      telegramEnabled?: boolean | string | number;
      telegramBotToken?: string;
      telegramBotUsername?: string;
    },
  ) {
    this.assertMasterPass(req);
    return this.tenantsService.updateBranchByTenant(id, branchId, payload);
  }

  @Public()
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Post(":id/branches/:branchId/send-email-confirmation")
  @ApiOperation({ summary: "Envia a confirmação de e-mail para uma filial" })
  async sendBranchEmailConfirmationByTenant(
    @Req() req: Request,
    @Param("id") id: string,
    @Param("branchId") branchId: string,
  ) {
    this.assertMasterPass(req);
    return this.tenantsService.sendBranchEmailConfirmationByTenant(id, branchId);
  }

  @Public()
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Put(":id")
  @ApiOperation({
    summary: "Atualiza os dados de uma Escola e de seu Administrador principal",
  })
  async update(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() updateTenantDto: UpdateTenantDto,
  ) {
    this.assertMasterPass(req);
    return this.tenantsService.update(id, updateTenantDto);
  }

  @Public()
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Delete(":id")
  @ApiOperation({
    summary: "Cancela uma escola (soft delete) e dependências",
  })
  async remove(@Req() req: Request, @Param("id") id: string) {
    this.assertMasterPass(req);
    return this.tenantsService.removeTenant(id);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post(":id/purge")
  @ApiOperation({
    summary:
      "Exclui fisicamente uma escola e todos os registros associados de forma irreversível",
  })
  async purge(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() purgeTenantDto: PurgeTenantDto,
  ) {
    this.assertMasterPass(req);
    return this.tenantsService.purgeTenantPermanently(id, purgeTenantDto);
  }
}
