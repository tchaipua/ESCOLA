import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export const PERSON_ROLE_OPTIONS = [
  "PROFESSOR",
  "ALUNO",
  "RESPONSAVEL",
] as const;

export type PersonRoleValue = (typeof PERSON_ROLE_OPTIONS)[number];

export class PersonRoleDto {
  @ApiProperty({ enum: PERSON_ROLE_OPTIONS })
  @IsString()
  @IsIn(PERSON_ROLE_OPTIONS)
  role!: PersonRoleValue;

  @ApiPropertyOptional({
    description: "Perfil pré-definido para o papel informado",
  })
  @IsString()
  @IsOptional()
  accessProfile?: string;

  @ApiPropertyOptional({
    description: "Permissões específicas para o papel informado",
    type: [String],
  })
  @IsArray()
  @ArrayUnique()
  @IsOptional()
  permissions?: string[];
}
