import { Module } from "@nestjs/common";
import { SharedProfilesService } from "./application/services/shared-profiles.service";
import { SharedProfilesController } from "./infrastructure/controllers/shared-profiles.controller";

@Module({
  controllers: [SharedProfilesController],
  providers: [SharedProfilesService],
  exports: [SharedProfilesService],
})
export class SharedProfilesModule {}
