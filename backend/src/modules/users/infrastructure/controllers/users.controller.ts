import { Body, Controller, Get, GoneException, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { UsersService } from "../../application/services/users.service";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";
import { Permissions } from "../../../../common/decorators/permissions.decorator";
import { Roles } from "../../../../common/decorators/roles.decorator";
import {
  CurrentUser,
  ICurrentUser,
} from "../../../../common/decorators/current-user.decorator";
import {
  CreateUserDto,
  UpdateUserDto,
  UpdateUserStatusDto,
} from "../../application/dto/user-access.dto";

@ApiTags("Users")
@UseGuards(JwtAuthGuard)
@Roles("SOFTHOUSE_ADMIN", "ADMIN", "SECRETARIA", "COORDENACAO")
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Permissions("MANAGE_USERS")
  async create(
    @Body() _createUserDto: CreateUserDto,
    @CurrentUser() _user: ICurrentUser,
  ) {
    throw new GoneException(
      "O CADASTRO DE USUÁRIO DO SISTEMA FOI TRANSFERIDO PARA O FINANCEIRO.",
    );
  }

  @Get()
  @Permissions("VIEW_USERS")
  async findAll(@CurrentUser() user: ICurrentUser) {
    return this.usersService.findAllByTenantId(user.tenantId);
  }

  @Patch(":id")
  @Permissions("MANAGE_USERS")
  async update(
    @Param("id") id: string,
    @Body() _updateUserDto: UpdateUserDto,
    @CurrentUser() _user: ICurrentUser,
  ) {
    void id;
    throw new GoneException(
      "A MANUTENÇÃO DE USUÁRIO DO SISTEMA FOI TRANSFERIDA PARA O FINANCEIRO.",
    );
  }

  @Patch(":id/status")
  @Permissions("MANAGE_USERS")
  async updateStatus(
    @Param("id") id: string,
    @Body() _statusDto: UpdateUserStatusDto,
    @CurrentUser() _user: ICurrentUser,
  ) {
    void id;
    throw new GoneException(
      "A MANUTENÇÃO DE USUÁRIO DO SISTEMA FOI TRANSFERIDA PARA O FINANCEIRO.",
    );
  }
}
