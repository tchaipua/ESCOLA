import { ApiProperty } from "@nestjs/swagger";
import { ArrayMinSize, IsArray, IsString } from "class-validator";

export class AssignStudentFinancialLaunchBankDto {
  @ApiProperty({
    description: "Banco financeiro que receberá os boletos selecionados",
  })
  @IsString()
  bankAccountId!: string;

  @ApiProperty({
    description: "Parcelas selecionadas para vincular ao banco",
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  installmentIds!: string[];
}
