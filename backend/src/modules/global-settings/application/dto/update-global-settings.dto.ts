import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsBoolean, IsOptional, IsString } from "class-validator";

export class UpdateGlobalSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  s3Enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  s3EndpointType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  s3Endpoint?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  s3Region?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  s3Bucket?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  s3AccessKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  s3SecretKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  s3BaseFolder?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  s3PublicBaseUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  s3UseSsl?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  s3ForcePathStyle?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  s3DefaultAcl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  s3DefaultExpirationMinutes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  emailEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emailSenderName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emailSenderEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emailReplyTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emailSmtpHost?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emailSmtpPort?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emailSmtpUser?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emailSmtpPassword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  emailUseSsl?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  emailUseAuth?: boolean;
}
