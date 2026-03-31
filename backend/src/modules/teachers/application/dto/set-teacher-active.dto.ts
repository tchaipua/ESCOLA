import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean } from "class-validator";

export class SetTeacherActiveDto {
  @ApiProperty({
    description: "Define se o professor deve ficar ativo ou inativo",
  })
  @IsBoolean()
  active!: boolean;
}
