import { Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { tenantMiddleware } from "./prisma.middleware";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    this.$use(tenantMiddleware()); // Ativação da filtragem do Client local
    await this.$connect();
  }
}
