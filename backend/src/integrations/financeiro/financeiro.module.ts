import { Global, Module } from "@nestjs/common";
import { FinanceiroService } from "./financeiro.service";

@Global()
@Module({
  providers: [FinanceiroService],
  exports: [FinanceiroService],
})
export class FinanceiroModule {}
