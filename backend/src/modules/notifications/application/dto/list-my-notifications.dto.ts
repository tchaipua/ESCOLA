import { IsIn, IsOptional, IsString } from "class-validator";

export class ListMyNotificationsDto {
  @IsOptional()
  @IsString()
  @IsIn(["ALL", "UNREAD", "READ"])
  status?: string;
}
