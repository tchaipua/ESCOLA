import { IsEmail, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ForgotPasswordDto {
  @ApiProperty({
    description: "E-mail cadastrado no sistema",
    example: "usuario@escola.com.br",
  })
  @IsEmail({}, { message: "Forneça um endereço de e-mail válido" })
  @IsNotEmpty({ message: "E-mail é obrigatório" })
  email!: string;

  @ApiPropertyOptional({
    description:
      "Em caso de usuários com o mesmo email em múltiplas escolas, informe o ID dessa escola",
  })
  @IsString()
  @IsOptional()
  tenantId?: string;
}
