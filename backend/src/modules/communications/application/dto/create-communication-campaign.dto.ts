import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

const COMMUNICATION_TARGET_GROUPS = [
  "ESCOLA_GERAL",
  "FUNCIONARIOS",
  "PROFESSORES",
  "ALUNOS",
  "RESPONSAVEIS",
] as const;

export type CommunicationTargetGroup =
  (typeof COMMUNICATION_TARGET_GROUPS)[number];

export class CreateCommunicationCampaignDto {
  @IsString()
  @MinLength(3)
  @MaxLength(140)
  title!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(5000)
  message!: string;

  @IsBoolean()
  sendInternal!: boolean;

  @IsBoolean()
  sendEmail!: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @IsIn(COMMUNICATION_TARGET_GROUPS, { each: true })
  recipientGroups!: CommunicationTargetGroup[];

  @IsOptional()
  @IsString()
  @MaxLength(240)
  actionUrl?: string;
}
