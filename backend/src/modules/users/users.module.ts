import { Module } from "@nestjs/common";
import { UsersController } from "./infrastructure/controllers/users.controller";
import { UsersService } from "./application/services/users.service";
import { SharedProfilesModule } from "../shared-profiles/shared-profiles.module";

@Module({
  imports: [SharedProfilesModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
