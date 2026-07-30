import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";

const SENSITIVE_KEYS = new Set([
  "password",
  "passwordHash",
  "smtpPassword",
  "emailSmtpPassword",
  "telegramBotToken",
  "storageProviderSecretAccessKey",
  "s3SecretKey",
  "clientSecret",
  "integrationApiKey",
  "systemKey",
  "resetPasswordToken",
  "resetPasswordTokenHash",
  "emailVerificationToken",
  "emailVerificationTokenHash",
  "access_token",
  "accessToken",
  "sessionToken",
]);

@Injectable()
export class ExcludePasswordInterceptor implements NestInterceptor {
  private sanitize(value: any): any {
    if (!value) return value;

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitize(item));
    }

    if (value instanceof Date) return value;

    if (typeof value === "object") {
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) return value;

      const sanitized: Record<string, unknown> = {};
      for (const key of Object.keys(value)) {
        if (SENSITIVE_KEYS.has(key)) {
          continue;
        }
        sanitized[key] = this.sanitize(value[key]);
      }
      return sanitized;
    }

    return value;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(map((data) => this.sanitize(data)));
  }
}
