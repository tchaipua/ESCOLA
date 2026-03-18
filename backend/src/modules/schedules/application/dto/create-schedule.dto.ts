import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Min,
  Matches,
  ValidateIf,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CreateScheduleDto {
  @ApiProperty({ description: "Período do horário", enum: ["MANHA", "TARDE", "NOITE"] })
  @IsString()
  @IsIn(["MANHA", "TARDE", "NOITE"], {
    message: "Selecione um período válido: manhã, tarde ou noite.",
  })
  @IsNotEmpty({ message: "Selecione o período do horário." })
  period!: string;

  @ApiProperty({ description: "Número da aula dentro do período" })
  @IsInt()
  @Min(0, { message: "O número da aula deve ser 0 ou maior." })
  @IsNotEmpty({ message: "Informe o número da aula ou 0 para intervalo." })
  lessonNumber!: number;

  @ApiProperty({
    description: "Horário de Início da Aula (Ex: 07:00)",
    example: "07:00",
  })
  @ValidateIf((object) => Number(object.lessonNumber) !== 0)
  @IsString()
  @IsNotEmpty({ message: "Informe o horário inicial." })
  @ValidateIf((_, value) => value !== undefined && value !== null && String(value).trim() !== "")
  @Matches(/^([01]\d|2[0-3]):?([0-5]\d)$/, {
    message: "Informe o horário inicial no formato HH:mm.",
  })
  startTime!: string;

  @ApiProperty({
    description: "Horário de Término da Aula (Ex: 07:50)",
    example: "07:50",
  })
  @ValidateIf((object) => Number(object.lessonNumber) !== 0)
  @IsString()
  @IsNotEmpty({ message: "Informe o horário final." })
  @ValidateIf((_, value) => value !== undefined && value !== null && String(value).trim() !== "")
  @Matches(/^([01]\d|2[0-3]):?([0-5]\d)$/, {
    message: "Informe o horário final no formato HH:mm.",
  })
  endTime!: string;
}
