import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import {
  json,
  raw,
  type Request,
  type Response,
  urlencoded,
} from "express";
import { createValidationException } from "./common/validation/validation-exception.factory";
import helmet from "helmet";
import {
  assertSecureRuntimeConfiguration,
  getCorsAllowedOrigins,
  getTrustProxyHops,
  isProductionEnvironment,
  loadRuntimeSecretsFromFiles,
} from "./common/security/security-config";

async function bootstrap() {
  loadRuntimeSecretsFromFiles();
  assertSecureRuntimeConfiguration();
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.getHttpAdapter().getInstance().set(
    "trust proxy",
    getTrustProxyHops(),
  );
  const captureRawBody = (
    request: Request & { rawBody?: Buffer },
    _response: Response,
    body: Buffer,
  ) => {
    request.rawBody = Buffer.from(body);
  };
  app.use(
    "/api/v1/financeiro",
    raw({
      type(request) {
        const contentType = String(request.headers["content-type"] || "")
          .trim()
          .toLowerCase();
        return (
          contentType.startsWith("multipart/form-data") ||
          contentType.startsWith("application/octet-stream") ||
          contentType.startsWith("application/pkcs12") ||
          contentType.startsWith("application/x-pkcs12") ||
          contentType.startsWith("application/xml") ||
          contentType.startsWith("text/xml")
        );
      },
      limit: "10mb",
    }),
  );
  app.use(
    "/api/v1/financeiro",
    json({ limit: "10mb", verify: captureRawBody }),
  );
  app.use(json({ limit: "1mb", verify: captureRawBody }));
  app.use(
    urlencoded({
      extended: false,
      limit: "1mb",
      verify: captureRawBody,
    }),
  );

  app.use(
    helmet(
      isProductionEnvironment()
        ? {}
        : {
            contentSecurityPolicy: false,
          },
    ),
  );

  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: createValidationException,
    }),
  );

  if (
    !isProductionEnvironment() ||
    String(process.env.ENABLE_API_DOCS || "")
      .trim()
      .toLowerCase() === "true"
  ) {
    const config = new DocumentBuilder()
      .setTitle("School SaaS API")
      .setDescription("Multi-tenant Backend for School Management")
      .setVersion("1.0")
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("api/docs", app, document);
  }

  app.enableCors({
    origin: getCorsAllowedOrigins(),
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "X-Requested-With",
      "X-Idempotency-Key",
      "X-MSinfor-CSRF",
    ],
    maxAge: 600,
  });

  await app.listen(process.env.PORT || 3001);
}
void bootstrap();
