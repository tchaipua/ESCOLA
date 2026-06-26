import { ApiProperty } from "@nestjs/swagger";
import { IsEmail } from "class-validator";

export class SendUserEmailConfirmationDto {
  @ApiProperty({ description: "E-mail que recebera o link de confirmacao" })
  @IsEmail()
  email!: string;
}
