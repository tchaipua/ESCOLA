import { Module } from "@nestjs/common";
import { UserPreferencesController } from "./infrastructure/controllers/user-preferences.controller";
import { UserPreferencesService } from "./application/services/user-preferences.service";

@Module({
  controllers: [UserPreferencesController],
  providers: [UserPreferencesService],
})
export class UserPreferencesModule {}
