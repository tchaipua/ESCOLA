import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsString,
  ValidateNested,
} from "class-validator";
import { NOTIFICATION_EVENT_TYPES } from "../notification-event-definitions";

export class NotificationPreferenceItemDto {
  @IsString()
  @IsIn(NOTIFICATION_EVENT_TYPES)
  eventType!: string;

  @IsBoolean()
  enabled!: boolean;

  @IsBoolean()
  sendInternal!: boolean;

  @IsBoolean()
  sendEmail!: boolean;

  @IsBoolean()
  sendTelegram!: boolean;
}

export class UpdateNotificationPreferencesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => NotificationPreferenceItemDto)
  preferences!: NotificationPreferenceItemDto[];
}

