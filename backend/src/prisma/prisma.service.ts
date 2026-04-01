import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { tenantMiddleware } from "./prisma.middleware";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly unscopedClient = new PrismaClient();

  async onModuleInit() {
    this.$use(tenantMiddleware()); // Ativação da filtragem do Client local
    await Promise.all([this.$connect(), this.unscopedClient.$connect()]);
  }

  async onModuleDestroy() {
    await Promise.all([this.unscopedClient.$disconnect(), this.$disconnect()]);
  }

  getUnscopedClient() {
    return this.unscopedClient;
  }
}
