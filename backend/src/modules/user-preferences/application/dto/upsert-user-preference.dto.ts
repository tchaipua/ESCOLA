import { IsString } from "class-validator";

export class UpsertUserPreferenceDto {
  @IsString()
  value!: string;
}
