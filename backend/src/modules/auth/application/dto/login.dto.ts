import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";

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
    description: "Código da filial operacional do acesso",
    required: false,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  branchCode?: number;

  @ApiProperty({
    description:
      "ID do cadastro selecionado quando o e-mail possuir múltiplos acessos",
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
