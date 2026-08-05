import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
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
    @Body() createUserDto: CreateUserDto,
    @CurrentUser() user: ICurrentUser,
  ) {
    return this.usersService.create(createUserDto, user);
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
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() user: ICurrentUser,
  ) {
    return this.usersService.update(id, updateUserDto, user);
  }

  @Patch(":id/status")
  @Permissions("MANAGE_USERS")
  async updateStatus(
    @Param("id") id: string,
    @Body() statusDto: UpdateUserStatusDto,
    @CurrentUser() user: ICurrentUser,
  ) {
    return this.usersService.updateStatus(id, statusDto.active, user);
  }
}
