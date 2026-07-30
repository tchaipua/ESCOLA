import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { SecretMigrationService } from "./secret-migration.service";

@Global()
@Module({
  providers: [PrismaService, SecretMigrationService],
  exports: [PrismaService],
})
export class PrismaModule {}
