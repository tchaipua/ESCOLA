import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class PurgeTenantDto {
  @ApiProperty({
    description:
      "Confirmação explícita do tenant alvo. Deve ser exatamente o ID da escola informado na tela.",
  })
  @IsString()
  @IsNotEmpty({
    message: "Informe o ID da escola para confirmar a exclusão definitiva.",
  })
  confirmationTenantId!: string;

  @ApiProperty({
    description:
      "Frase de segurança obrigatória para operações irreversíveis. Deve ser exatamente EXCLUIR DEFINITIVAMENTE.",
  })
  @IsString()
  @IsNotEmpty({
    message:
      "Informe a frase EXCLUIR DEFINITIVAMENTE para autorizar a exclusão definitiva.",
  })
  confirmationPhrase!: string;
}
