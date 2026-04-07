import {
  Controller,
  Post,
  Body,
  Get,
  Put,
  Param,
  Req,
  UnauthorizedException,
  Query,
  Delete,
} from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { Request } from "express";
import { TenantsService } from "../../application/services/tenants.service";
import { CreateTenantDto } from "../../application/dto/create-tenant.dto";
import { PurgeTenantDto } from "../../application/dto/purge-tenant.dto";
import { UpdateTenantDto } from "../../application/dto/update-tenant.dto";
import { Public } from "../../../../common/decorators/public.decorator";
import { buildMasterPass } from "../../../../common/auth/master-auth";
import {
  CurrentUser,
  ICurrentUser,
} from "../../../../common/decorators/current-user.decorator";

@ApiTags("Inquilinos (Onboarding)")
@Controller("tenants")
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  private assertMasterPass(req: Request) {
    const incoming = String(req.headers["x-msinfor-master-pass"] || "").trim();
    if (!incoming) {
      throw new UnauthorizedException(
        "Acesso negado: cabeçalho master ausente.",
      );
    }

    const now = new Date();
    const prevMinute = new Date(now.getTime() - 60_000);
    const nextMinute = new Date(now.getTime() + 60_000);
    const validNow = buildMasterPass(now);
    const validPrev = buildMasterPass(prevMinute);
    const validNext = buildMasterPass(nextMinute);

    if (
      incoming !== validNow &&
      incoming !== validPrev &&
      incoming !== validNext
    ) {
      throw new UnauthorizedException(
        "Acesso negado: chave master inválida ou expirada.",
      );
    }
  }

  @Public()
  @Post()
  @ApiOperation({
    summary: "Cadastra uma nova Escola e seu primeiro Administrador",
  })
  async create(@Req() req: Request, @Body() createTenantDto: CreateTenantDto) {
    this.assertMasterPass(req);
    return this.tenantsService.create(createTenantDto);
  }

  @Public()
  @Get("email-usage")
  @ApiOperation({
    summary: "Consulta onde um email está sendo usado no ecossistema MSINFOR",
  })
  async findEmailUsage(@Req() req: Request, @Query("email") email: string) {
    this.assertMasterPass(req);
    return this.tenantsService.findEmailUsage(email);
  }

  @Public()
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
  @Get(":id/access-users")
  @ApiOperation({
    summary: "Lista os usuários de acesso administrativo da escola",
  })
  async findAccessUsers(@Req() req: Request, @Param("id") id: string) {
    this.assertMasterPass(req);
    return this.tenantsService.findAccessUsersByTenant(id);
  }

  @Public()
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
    },
  ) {
    this.assertMasterPass(req);
    return this.tenantsService.createAccessUser(id, payload);
  }

  @Public()
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
    },
  ) {
    this.assertMasterPass(req);
    return this.tenantsService.updateAccessUser(id, userId, payload);
  }

  @Public()
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
    return this.tenantsService.findCurrent(currentUser.tenantId);
  }

  @Public()
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
  @Delete(":id")
  @ApiOperation({
    summary: "Cancela uma escola (soft delete) e dependências",
  })
  async remove(@Req() req: Request, @Param("id") id: string) {
    this.assertMasterPass(req);
    return this.tenantsService.removeTenant(id);
  }

  @Public()
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
