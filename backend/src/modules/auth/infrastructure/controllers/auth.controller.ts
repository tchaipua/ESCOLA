import { Controller, Post, Body, Get, Query } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { AuthService } from "../../application/services/auth.service";
import { LoginDto } from "../../application/dto/login.dto";
import { RegisterDto } from "../../application/dto/register.dto";
import { ForgotPasswordDto } from "../../application/dto/forgot-password.dto";
import { ResetPasswordDto } from "../../application/dto/reset-password.dto";
import { ConfirmPasswordDto } from "../../application/dto/confirm-password.dto";
import { Public } from "../../../../common/decorators/public.decorator";
import { Roles } from "../../../../common/decorators/roles.decorator";
import { Permissions } from "../../../../common/decorators/permissions.decorator";
import {
  CurrentUser,
  ICurrentUser,
} from "../../../../common/decorators/current-user.decorator";

@ApiTags("Autenticação de Inquilinos")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post("login")
  @ApiOperation({ summary: "Login no ambiente do respectivo Inquilino" })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @ApiBearerAuth()
  @Roles("ADMIN", "SECRETARIA", "COORDENACAO")
  @Permissions("MANAGE_USERS")
  @Post("register")
  @ApiOperation({
    summary:
      "Registra novo usuário do respectivo Tenant (ADMIN ou usuário com permissão de gestão de acessos)",
  })
  async register(
    @Body() registerDto: RegisterDto,
    @CurrentUser() user: ICurrentUser,
  ) {
    return this.authService.register(registerDto, user);
  }

  @ApiBearerAuth()
  @Get("me")
  @ApiOperation({ summary: "Re-valida dados do Usuário Atual em Sessão" })
  getProfile(@CurrentUser() user: ICurrentUser) {
    return user;
  }

  @ApiBearerAuth()
  @Post("confirm-password")
  @ApiOperation({ summary: "Confirma a senha do usuário logado" })
  async confirmPassword(
    @CurrentUser() user: ICurrentUser,
    @Body() payload: ConfirmPasswordDto,
  ) {
    return this.authService.confirmPassword(
      user.userId,
      user.tenantId,
      user.modelType,
      payload.password,
    );
  }

  @ApiBearerAuth()
  @Post("confirm-shared-password")
  @ApiOperation({ summary: "Confirma a senha compartilhada do e-mail em todos os perfis vinculados" })
  async confirmSharedPassword(
    @CurrentUser() user: ICurrentUser,
    @Body() payload: ConfirmPasswordDto,
  ) {
    return this.authService.confirmSharedPassword(
      user.userId,
      user.tenantId,
      user.modelType,
      payload.password,
    );
  }

  @ApiBearerAuth()
  @Post("change-shared-password")
  @ApiOperation({ summary: "Altera a senha compartilhada e sincroniza em todos os perfis vinculados" })
  async changeSharedPassword(
    @CurrentUser() user: ICurrentUser,
    @Body()
    payload: {
      currentPassword: string;
      newPassword: string;
    },
  ) {
    return this.authService.changeSharedPassword(
      user.userId,
      user.tenantId,
      user.modelType,
      payload.currentPassword,
      payload.newPassword,
    );
  }

  @Public()
  @Post("forgot-password")
  @ApiOperation({ summary: "Solicitar recuperação de senha" })
  async forgotPassword(@Body() resetDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(resetDto);
  }

  @Public()
  @Post("reset-password")
  @ApiOperation({ summary: "Redefinir senha com token recebido no email" })
  async resetPassword(@Body() payload: ResetPasswordDto) {
    return this.authService.resetPassword(payload);
  }

  @Public()
  @Get("verify-email")
  @ApiOperation({ summary: "Confirma o e-mail pelo token recebido no link" })
  async verifyEmail(@Query("token") token: string) {
    return this.authService.verifyEmail(token);
  }
}
