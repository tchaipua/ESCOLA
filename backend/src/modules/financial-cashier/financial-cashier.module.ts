import { Module } from "@nestjs/common";
import { FinanceiroModule } from "../../integrations/financeiro/financeiro.module";
import { FinancialCashierService } from "./application/services/financial-cashier.service";
import { FinancialCashierController } from "./infrastructure/controllers/financial-cashier.controller";

@Module({
  imports: [FinanceiroModule],
  controllers: [FinancialCashierController],
  providers: [FinancialCashierService],
})
export class FinancialCashierModule {}
