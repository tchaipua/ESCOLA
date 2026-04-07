import { Module } from "@nestjs/common";
import { StudentFinancialLaunchesService } from "./application/services/student-financial-launches.service";
import { StudentFinancialLaunchesController } from "./infrastructure/controllers/student-financial-launches.controller";
import { FinanceiroModule } from "../../integrations/financeiro/financeiro.module";

@Module({
  imports: [FinanceiroModule],
  controllers: [StudentFinancialLaunchesController],
  providers: [StudentFinancialLaunchesService],
})
export class StudentFinancialLaunchesModule {}
