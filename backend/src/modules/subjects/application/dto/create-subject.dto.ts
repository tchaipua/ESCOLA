import { IsNotEmpty, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CreateSubjectDto {
  @ApiProperty({ description: "Nome da Matéria (Matemática, Inglês, Dança)" })
  @IsString()
  @IsNotEmpty()
  name!: string;
}
