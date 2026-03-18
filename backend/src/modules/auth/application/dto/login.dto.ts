import { IsNotEmpty, IsString, IsOptional } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class LoginDto {
  @ApiProperty({ description: "Email do usuário ou login master" })
  @IsString()
  @IsNotEmpty({ message: "O usuário é obrigatório" })
  email!: string;

  @ApiProperty({ description: "Senha super secreta" })
  @IsString()
  @IsNotEmpty({ message: "A senha é obrigatória" })
  password!: string;

  @ApiProperty({
    description: "ID do Inquilino (SaaS) - Opcional para Admin Master",
  })
  @IsString()
  @IsOptional()
  tenantId?: string;

  @ApiProperty({
    description: "ID do cadastro selecionado quando o e-mail possuir múltiplos acessos",
    required: false,
  })
  @IsString()
  @IsOptional()
  accountId?: string;

  @ApiProperty({
    description: "Tipo do cadastro selecionado no login múltiplo",
    required: false,
  })
  @IsString()
  @IsOptional()
  accountType?: string;
}
