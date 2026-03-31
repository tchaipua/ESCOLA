import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaService } from "../../../../prisma/prisma.service";
import { UpdateGlobalSettingsDto } from "../dto/update-global-settings.dto";

type GlobalSettingsValue = {
  s3Enabled: boolean;
  s3EndpointType: string;
  s3Endpoint: string;
  s3Region: string;
  s3Bucket: string;
  s3AccessKey: string;
  s3SecretKey: string;
  s3BaseFolder: string;
  s3PublicBaseUrl: string;
  s3UseSsl: boolean;
  s3ForcePathStyle: boolean;
  s3DefaultAcl: string;
  s3DefaultExpirationMinutes: string;
  emailEnabled: boolean;
  emailSenderName: string;
  emailSenderEmail: string;
  emailReplyTo: string;
  emailSmtpHost: string;
  emailSmtpPort: string;
  emailSmtpUser: string;
  emailSmtpPassword: string;
  emailUseSsl: boolean;
  emailUseAuth: boolean;
};

const GLOBAL_SETTINGS_KEY = "MSINFOR_GENERAL_SETTINGS";
const MASTER_AUDIT_USER = "MSINFOR_MASTER";

const DEFAULT_GENERAL_SETTINGS: GlobalSettingsValue = {
  s3Enabled: true,
  s3EndpointType: "CUSTOM",
  s3Endpoint: "",
  s3Region: "",
  s3Bucket: "",
  s3AccessKey: "",
  s3SecretKey: "",
  s3BaseFolder: "content",
  s3PublicBaseUrl: "",
  s3UseSsl: true,
  s3ForcePathStyle: true,
  s3DefaultAcl: "Default",
  s3DefaultExpirationMinutes: "1440",
  emailEnabled: true,
  emailSenderName: "MSINFOR SISTEMAS",
  emailSenderEmail: "",
  emailReplyTo: "",
  emailSmtpHost: "smtp.gmail.com",
  emailSmtpPort: "465",
  emailSmtpUser: "",
  emailSmtpPassword: "",
  emailUseSsl: true,
  emailUseAuth: true,
};

@Injectable()
export class GlobalSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private mergeSettings(
    input?: Partial<UpdateGlobalSettingsDto> | Partial<GlobalSettingsValue>,
  ): GlobalSettingsValue {
    return {
      ...DEFAULT_GENERAL_SETTINGS,
      ...input,
      s3Enabled:
        input?.s3Enabled !== undefined
          ? Boolean(input.s3Enabled)
          : DEFAULT_GENERAL_SETTINGS.s3Enabled,
      s3EndpointType: String(
        input?.s3EndpointType ?? DEFAULT_GENERAL_SETTINGS.s3EndpointType,
      ).trim(),
      s3Endpoint: String(
        input?.s3Endpoint ?? DEFAULT_GENERAL_SETTINGS.s3Endpoint,
      ).trim(),
      s3Region: String(
        input?.s3Region ?? DEFAULT_GENERAL_SETTINGS.s3Region,
      ).trim(),
      s3Bucket: String(
        input?.s3Bucket ?? DEFAULT_GENERAL_SETTINGS.s3Bucket,
      ).trim(),
      s3AccessKey: String(
        input?.s3AccessKey ?? DEFAULT_GENERAL_SETTINGS.s3AccessKey,
      ).trim(),
      s3SecretKey: String(
        input?.s3SecretKey ?? DEFAULT_GENERAL_SETTINGS.s3SecretKey,
      ).trim(),
      s3BaseFolder: String(
        input?.s3BaseFolder ?? DEFAULT_GENERAL_SETTINGS.s3BaseFolder,
      )
        .trim()
        .replace(/^[\\/]+|[\\/]+$/g, ""),
      s3PublicBaseUrl: String(
        input?.s3PublicBaseUrl ?? DEFAULT_GENERAL_SETTINGS.s3PublicBaseUrl,
      ).trim(),
      s3UseSsl:
        input?.s3UseSsl !== undefined
          ? Boolean(input.s3UseSsl)
          : DEFAULT_GENERAL_SETTINGS.s3UseSsl,
      s3ForcePathStyle:
        input?.s3ForcePathStyle !== undefined
          ? Boolean(input.s3ForcePathStyle)
          : DEFAULT_GENERAL_SETTINGS.s3ForcePathStyle,
      s3DefaultAcl: String(
        input?.s3DefaultAcl ?? DEFAULT_GENERAL_SETTINGS.s3DefaultAcl,
      ).trim(),
      s3DefaultExpirationMinutes: String(
        input?.s3DefaultExpirationMinutes ??
          DEFAULT_GENERAL_SETTINGS.s3DefaultExpirationMinutes,
      ).trim(),
      emailEnabled:
        input?.emailEnabled !== undefined
          ? Boolean(input.emailEnabled)
          : DEFAULT_GENERAL_SETTINGS.emailEnabled,
      emailSenderName: String(
        input?.emailSenderName ?? DEFAULT_GENERAL_SETTINGS.emailSenderName,
      ).trim(),
      emailSenderEmail: String(
        input?.emailSenderEmail ?? DEFAULT_GENERAL_SETTINGS.emailSenderEmail,
      ).trim(),
      emailReplyTo: String(
        input?.emailReplyTo ?? DEFAULT_GENERAL_SETTINGS.emailReplyTo,
      ).trim(),
      emailSmtpHost: String(
        input?.emailSmtpHost ?? DEFAULT_GENERAL_SETTINGS.emailSmtpHost,
      ).trim(),
      emailSmtpPort: String(
        input?.emailSmtpPort ?? DEFAULT_GENERAL_SETTINGS.emailSmtpPort,
      ).trim(),
      emailSmtpUser: String(
        input?.emailSmtpUser ?? DEFAULT_GENERAL_SETTINGS.emailSmtpUser,
      ).trim(),
      emailSmtpPassword: String(
        input?.emailSmtpPassword ?? DEFAULT_GENERAL_SETTINGS.emailSmtpPassword,
      ).trim(),
      emailUseSsl:
        input?.emailUseSsl !== undefined
          ? Boolean(input.emailUseSsl)
          : DEFAULT_GENERAL_SETTINGS.emailUseSsl,
      emailUseAuth:
        input?.emailUseAuth !== undefined
          ? Boolean(input.emailUseAuth)
          : DEFAULT_GENERAL_SETTINGS.emailUseAuth,
    };
  }

  private normalizeEndpoint(settings: GlobalSettingsValue) {
    const rawEndpoint = settings.s3Endpoint.trim();
    if (!rawEndpoint) return "";
    if (/^https?:\/\//i.test(rawEndpoint)) return rawEndpoint;
    return `${settings.s3UseSsl ? "https" : "http"}://${rawEndpoint}`;
  }

  private buildSchoolPathExample(settings: GlobalSettingsValue) {
    const baseFolder = settings.s3BaseFolder ? `${settings.s3BaseFolder}/` : "";
    return `${baseFolder}escola/<ID_ESCOLA>`;
  }

  async findSettings() {
    const record = await this.prisma.globalSetting.findUnique({
      where: { settingKey: GLOBAL_SETTINGS_KEY },
    });

    if (!record || record.canceledAt) {
      return DEFAULT_GENERAL_SETTINGS;
    }

    try {
      const parsed = JSON.parse(
        record.settingValue,
      ) as Partial<GlobalSettingsValue>;
      return this.mergeSettings(parsed);
    } catch {
      return DEFAULT_GENERAL_SETTINGS;
    }
  }

  async saveSettings(payload: UpdateGlobalSettingsDto) {
    const settings = this.mergeSettings(payload);
    const serialized = JSON.stringify(settings);

    const existing = await this.prisma.globalSetting.findUnique({
      where: { settingKey: GLOBAL_SETTINGS_KEY },
      select: { id: true },
    });

    if (existing) {
      await this.prisma.globalSetting.update({
        where: { id: existing.id },
        data: {
          settingValue: serialized,
          updatedBy: MASTER_AUDIT_USER,
          canceledAt: null,
          canceledBy: null,
        },
      });
    } else {
      await this.prisma.globalSetting.create({
        data: {
          settingKey: GLOBAL_SETTINGS_KEY,
          settingValue: serialized,
          createdBy: MASTER_AUDIT_USER,
          updatedBy: MASTER_AUDIT_USER,
        },
      });
    }

    return {
      message: "Configurações gerais salvas com sucesso.",
      settings,
    };
  }

  async testS3Connection(payload: UpdateGlobalSettingsDto) {
    const savedSettings = await this.findSettings();
    const settings = this.mergeSettings({
      ...savedSettings,
      ...payload,
    });

    if (!settings.s3Enabled) {
      throw new BadRequestException("Ative o módulo S3 antes de testar.");
    }

    if (!settings.s3Bucket) {
      throw new BadRequestException("Informe o bucket do S3 para o teste.");
    }

    if (!settings.s3AccessKey || !settings.s3SecretKey) {
      throw new BadRequestException(
        "Informe access key e secret key para testar o S3.",
      );
    }

    if (!settings.s3Region) {
      throw new BadRequestException("Informe a region do S3 para o teste.");
    }

    const endpoint = this.normalizeEndpoint(settings);
    if (
      settings.s3EndpointType.trim().toUpperCase() === "CUSTOM" &&
      !endpoint
    ) {
      throw new BadRequestException(
        "Informe o endpoint customizado para testar este S3.",
      );
    }

    try {
      const client = new S3Client({
        region: settings.s3Region,
        endpoint: endpoint || undefined,
        forcePathStyle: settings.s3ForcePathStyle,
        credentials: {
          accessKeyId: settings.s3AccessKey,
          secretAccessKey: settings.s3SecretKey,
        },
      });

      await client.send(
        new HeadBucketCommand({
          Bucket: settings.s3Bucket,
        }),
      );

      return {
        success: true,
        message: "Comunicação com o S3 realizada com sucesso.",
        details: [
          `BUCKET: ${settings.s3Bucket}`,
          `REGION: ${settings.s3Region}`,
          endpoint ? `ENDPOINT: ${endpoint}` : null,
          `PASTA PADRÃO POR ESCOLA: ${this.buildSchoolPathExample(settings)}`,
        ].filter(Boolean),
      };
    } catch (error: any) {
      const rawMessage =
        error?.name === "TimeoutError"
          ? "Tempo limite excedido ao tentar conectar no S3."
          : error?.message || "Falha desconhecida ao comunicar com o S3.";

      throw new InternalServerErrorException(
        `Não foi possível comunicar com o S3. ${rawMessage}`,
      );
    }
  }
}
