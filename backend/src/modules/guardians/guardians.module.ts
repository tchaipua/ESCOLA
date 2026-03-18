import { Module } from "@nestjs/common";
import { GuardiansService } from "./application/services/guardians.service";
import { GuardiansController } from "./infrastructure/controllers/guardians.controller";
import { SharedProfilesModule } from "../shared-profiles/shared-profiles.module";

@Module({
  imports: [SharedProfilesModule],
  controllers: [GuardiansController],
  providers: [GuardiansService],
  exports: [GuardiansService],
})
export class GuardiansModule {}
