import { IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class LinkStudentGuardianDto {
  @ApiProperty({ description: "ID do Aluno" })
  @IsString()
  @IsNotEmpty()
  studentId!: string;

  @ApiProperty({
    description: "Grau de Parentesco",
    enum: ["PAI", "MAE", "PADRASTO", "MADRASTA", "TIO", "AVOS", "OUTROS"],
  })
  @IsEnum(["PAI", "MAE", "PADRASTO", "MADRASTA", "TIO", "AVOS", "OUTROS"])
  @IsNotEmpty()
  kinship!: "PAI" | "MAE" | "PADRASTO" | "MADRASTA" | "TIO" | "AVOS" | "OUTROS";

  @ApiPropertyOptional({
    description: "Necessário preencher caso kinship seja OUTROS",
  })
  @IsString()
  @IsOptional()
  kinshipDescription?: string;
}
