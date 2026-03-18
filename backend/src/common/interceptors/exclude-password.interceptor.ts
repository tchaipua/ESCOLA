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
  "smtpPassword",
  "resetPasswordToken",
]);

@Injectable()
export class ExcludePasswordInterceptor implements NestInterceptor {
  private sanitize(value: any): any {
    if (!value) return value;

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitize(item));
    }

    if (typeof value === "object") {
      for (const key of Object.keys(value)) {
        if (SENSITIVE_KEYS.has(key)) {
          delete value[key];
          continue;
        }
        value[key] = this.sanitize(value[key]);
      }
    }

    return value;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(map((data) => this.sanitize(data)));
  }
}
