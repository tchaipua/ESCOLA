import { IsNotEmpty, IsUUID } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CreateSeriesClassDto {
  @ApiProperty({ description: "ID da série" })
  @IsUUID()
  @IsNotEmpty()
  seriesId!: string;

  @ApiProperty({ description: "ID da turma" })
  @IsUUID()
  @IsNotEmpty()
  classId!: string;
}
