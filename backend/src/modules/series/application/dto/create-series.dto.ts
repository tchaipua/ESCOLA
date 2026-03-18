import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateSeriesDto {
  @ApiProperty({ description: "Nome da série. Ex: 1º ANO, 5º ANO, MATERNAL II" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ description: "Código curto da série. Ex: 1A, MAT2" })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  code?: string;

  @ApiPropertyOptional({ description: "Ordem de aprendizado da série" })
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;
}
