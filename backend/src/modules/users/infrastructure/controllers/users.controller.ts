import { Controller, Get, Post, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { UsersService } from "../../application/services/users.service";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";
import { Permissions } from "../../../../common/decorators/permissions.decorator";
import { Roles } from "../../../../common/decorators/roles.decorator";
import {
  CurrentUser,
  ICurrentUser,
} from "../../../../common/decorators/current-user.decorator";

@ApiTags("Users")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Roles("ADMIN", "SECRETARIA", "COORDENACAO")
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Permissions("MANAGE_USERS")
  async create(@Body() createUserDto: any, @CurrentUser() user: ICurrentUser) {
    // Inject the mandatory tenantId
    return this.usersService.create(createUserDto, user.tenantId);
  }

  @Get()
  @Permissions("VIEW_USERS")
  async findAll(@CurrentUser() user: ICurrentUser) {
    // All queries must filter by tenantId!
    return this.usersService.findAllByTenantId(user.tenantId);
  }
}
