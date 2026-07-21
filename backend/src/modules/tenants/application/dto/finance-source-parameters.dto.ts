import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

export class FinanceSourceParametersDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  interestRate?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  interestGracePeriod?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  penaltyRate?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  penaltyValue?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  penaltyGracePeriod?: number | null;

  @IsOptional()
  @IsString()
  @IsIn(["NO", "YES", "BY_PRODUCT"])
  stockControlMode?: string;

  @IsOptional()
  @IsString()
  @IsIn(["NO", "YES", "BY_PRODUCT"])
  stockIntegerQuantityMode?: string;

  @IsOptional()
  @IsString()
  @IsIn(["NO", "YES", "BY_PRODUCT"])
  stockLotControlMode?: string;

  @IsOptional()
  @IsString()
  @IsIn(["NO", "YES", "BY_PRODUCT"])
  stockExpirationControlMode?: string;

  @IsOptional()
  @IsString()
  @IsIn(["NO", "YES", "BY_PRODUCT"])
  stockGridControlMode?: string;

  @IsOptional()
  @IsString()
  @IsIn(["NO", "YES", "BY_PRODUCT"])
  stockNegativeControlMode?: string;

  @IsOptional()
  @IsBoolean()
  allowSaleUnitPriceEdit?: boolean;

  @IsOptional()
  @IsBoolean()
  allowSaleItemDiscount?: boolean;

  @IsOptional()
  @IsBoolean()
  groupSameProduct?: boolean;
}

export class ApplyFinanceSourceParametersDto {
  @IsString()
  sourceSystem!: string;

  @IsString()
  sourceTenantId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  sourceBranchCode?: number;

  @IsString()
  @IsIn(["COMPANY", "BRANCH"])
  entityType!: "COMPANY" | "BRANCH";

  @IsOptional()
  @IsString()
  requestedBy?: string;

  @ValidateNested()
  @Type(() => FinanceSourceParametersDto)
  parameters!: FinanceSourceParametersDto;
}
