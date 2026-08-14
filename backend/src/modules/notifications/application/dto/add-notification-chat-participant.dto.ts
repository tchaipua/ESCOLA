import { IsIn, IsString, MinLength } from "class-validator";

export class AddNotificationChatParticipantDto {
  @IsString()
  @IsIn(["USER", "TEACHER", "STUDENT", "GUARDIAN"])
  participantType!: "USER" | "TEACHER" | "STUDENT" | "GUARDIAN";

  @IsString()
  @MinLength(1)
  participantId!: string;
}
