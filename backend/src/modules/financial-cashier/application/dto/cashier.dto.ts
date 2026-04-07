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

export class SettleCashInstallmentDto {
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
