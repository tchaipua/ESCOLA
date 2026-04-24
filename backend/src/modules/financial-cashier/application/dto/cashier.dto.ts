import { Type } from "class-transformer";
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class OpenCashSessionDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  openingAmount?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CloseCashSessionDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  declaredClosingAmount?: number;

  @IsOptional()
  @IsDateString()
  closedAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export const CASHIER_INSTALLMENT_STATUSES = [
  "OPEN",
  "PAID",
  "OVERDUE",
  "ALL",
] as const;

export class ListCashierInstallmentsDto {
  @IsOptional()
  @IsIn(CASHIER_INSTALLMENT_STATUSES)
  status?: (typeof CASHIER_INSTALLMENT_STATUSES)[number];

  @IsOptional()
  @IsString()
  studentName?: string;

  @IsOptional()
  @IsString()
  payerName?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

export class ListOpenCashierInstallmentsDto extends ListCashierInstallmentsDto {}

export const CASHIER_PAYMENT_METHODS = [
  "CASH",
  "PIX",
  "CREDIT_CARD",
  "DEBIT_CARD",
  "CHECK",
] as const;

class BaseSettleInstallmentDto {
  @IsOptional()
  @IsDateString()
  receivedAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  interestAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  penaltyAmount?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class SettleCashInstallmentDto extends BaseSettleInstallmentDto {}

export class SettleManualInstallmentDto extends BaseSettleInstallmentDto {
  @IsIn(CASHIER_PAYMENT_METHODS)
  paymentMethod!: (typeof CASHIER_PAYMENT_METHODS)[number];
}
