import { Module } from "@nestjs/common";
import { GuardiansService } from "./application/services/guardians.service";
import { GuardiansController } from "./infrastructure/controllers/guardians.controller";
import { SharedProfilesModule } from "../shared-profiles/shared-profiles.module";
import { StudentsModule } from "../students/students.module";

@Module({
  imports: [SharedProfilesModule, StudentsModule],
  controllers: [GuardiansController],
  providers: [GuardiansService],
  exports: [GuardiansService],
})
export class GuardiansModule {}
