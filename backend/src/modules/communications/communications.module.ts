import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { CommunicationsController } from "./infrastructure/controllers/communications.controller";
import { CommunicationsService } from "./application/services/communications.service";

@Module({
  imports: [PrismaModule],
  controllers: [CommunicationsController],
  providers: [CommunicationsService],
})
export class CommunicationsModule {}
