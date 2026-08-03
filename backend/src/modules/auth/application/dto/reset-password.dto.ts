import { IsNotEmpty, IsString, Matches, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class ResetPasswordDto {
  @ApiProperty({
    description: "Token enviado no corpo do e-mail de recuperação",
  })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({ description: "A nova senha que o usuário escolheu" })
  @IsString()
  @IsNotEmpty()
  @MinLength(6, { message: "A senha deve ter no mínimo 6 caracteres" })
  @Matches(/^(?=.*[A-Z])(?=.*[a-z])(?=.*[^A-Za-z0-9\s]).{6,}$/, { message: "A senha deve conter maiúscula, minúscula e caractere especial" })
  newPassword!: string;
}
