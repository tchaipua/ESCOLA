import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";

export class LoginDto {
  @ApiProperty({ description: "E-mail ou identificador do usuário" })
  @IsString()
  @IsNotEmpty({ message: "O usuário é obrigatório" })
  email!: string;

  @ApiProperty({ description: "Senha do usuário" })
  @IsString()
  @IsNotEmpty({ message: "A senha é obrigatória" })
  password!: string;

  @ApiProperty({
    description:
      "ID do inquilino, usado quando o usuário possui vínculo com mais de uma empresa",
    required: false,
  })
  @IsUUID()
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

  @ApiProperty({
    description: "Mantém o cookie de sessão após fechar o navegador",
    required: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  rememberMe?: boolean;
}
