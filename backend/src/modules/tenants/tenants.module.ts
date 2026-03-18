import { Module } from "@nestjs/common";
import { TenantsController } from "./infrastructure/controllers/tenants.controller";
import { TenantsService } from "./application/services/tenants.service";
import { SharedProfilesModule } from "../shared-profiles/shared-profiles.module";

@Module({
  imports: [SharedProfilesModule],
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
