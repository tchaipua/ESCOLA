import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean } from "class-validator";

export class SetRecordActiveDto {
  @ApiProperty({ description: "Define se o registro deve ficar ativo ou inativo" })
  @IsBoolean()
  active!: boolean;
}
