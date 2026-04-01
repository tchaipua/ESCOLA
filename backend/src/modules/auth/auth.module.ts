import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthService } from "./application/services/auth.service";
import { AuthController } from "./infrastructure/controllers/auth.controller";
import { JwtStrategy } from "./application/strategies/jwt.strategy";
import { PrismaModule } from "../../prisma/prisma.module";
import { SharedProfilesModule } from "../shared-profiles/shared-profiles.module";
import { GlobalSettingsModule } from "../global-settings/global-settings.module";

@Module({
  imports: [
    PrismaModule,
    SharedProfilesModule,
    GlobalSettingsModule,
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || "super-secret-escolar-key-2026",
      signOptions: { expiresIn: "1d" },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
