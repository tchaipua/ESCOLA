import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import {
  AuthService,
  readAuthSessionToken,
} from "../../application/services/auth.service";
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
import { Throttle } from "@nestjs/throttler";
import {
  clearSessionCookies,
  setSessionCookies,
} from "../../../../common/security/financeiro-session";

@ApiTags("Autenticação de Inquilinos")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  // O login com a Central pode exigir as etapas empresa e filial na mesma
  // janela de tempo. O bloqueio por credencial inválida continua sendo feito
  // pela Central; este limite protege apenas contra rajadas de requisições.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post("login")
  @ApiOperation({ summary: "Login no ambiente do respectivo Inquilino" })
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<unknown> {
    const result = await this.authService.login(loginDto);
    const sessionToken = readAuthSessionToken(result);
    if (sessionToken) {
      setSessionCookies(response, sessionToken, loginDto.rememberMe === true);
    }
    return result;
  }

  @Post("logout")
  async logout(
    @CurrentUser() currentUser: ICurrentUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout(currentUser);
    clearSessionCookies(response);
    return { status: "SUCCESS" };
  }

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

  @Get("me")
  @ApiOperation({ summary: "Re-valida dados do Usuário Atual em Sessão" })
  getProfile(@CurrentUser() user: ICurrentUser) {
    return user;
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
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

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("confirm-shared-password")
  @ApiOperation({
    summary:
      "Confirma a senha compartilhada do e-mail em todos os perfis vinculados",
  })
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

  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Post("confirm-administrator-password")
  @ApiOperation({
    summary: "Confirma a senha de um administrador da mesma empresa",
  })
  async confirmAdministratorPassword(
    @CurrentUser() user: ICurrentUser,
    @Body() payload: ConfirmPasswordDto,
  ) {
    return this.authService.confirmAdministratorPassword(
      user,
      payload.password,
    );
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("confirm-cash-cancellation-password")
  @ApiOperation({
    summary:
      "Confirma senha do operador ou de supervisor para cancelamento no caixa",
  })
  async confirmCashCancellationPassword(
    @CurrentUser() user: ICurrentUser,
    @Body() payload: ConfirmPasswordDto,
  ) {
    return this.authService.confirmCashCancellationPassword(
      user.userId,
      user.tenantId,
      user.modelType,
      payload.password,
    );
  }

  @Post("change-shared-password")
  @ApiOperation({
    summary:
      "Altera a senha compartilhada e sincroniza em todos os perfis vinculados",
  })
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
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("forgot-password")
  @ApiOperation({ summary: "Solicitar recuperação de senha" })
  async forgotPassword(@Body() resetDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(resetDto);
  }

  @Roles("ADMIN", "SECRETARIA", "COORDENACAO")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("request-password-reset")
  @ApiOperation({
    summary: "Enviar redefinição para e-mail confirmado de um acesso da escola",
  })
  async requestPasswordReset(
    @CurrentUser() user: ICurrentUser,
    @Body() resetDto: ForgotPasswordDto,
  ) {
    return this.authService.requestPasswordResetForConfirmedEmail(
      resetDto.email,
      user,
    );
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("reset-password")
  @ApiOperation({ summary: "Redefinir senha com token recebido no email" })
  async resetPassword(@Body() payload: ResetPasswordDto) {
    return this.authService.resetPassword(payload);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get("verify-email")
  @ApiOperation({ summary: "Confirma o e-mail pelo token recebido no link" })
  async verifyEmail(@Query("token") token: string) {
    return this.authService.verifyEmail(token);
  }
}
