import { Module } from "@nestjs/common";
import { UsersController } from "./infrastructure/controllers/users.controller";
import { UsersService } from "./application/services/users.service";

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
