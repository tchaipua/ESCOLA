import {
  All,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Req,
  Res,
  StreamableFile,
  UnsupportedMediaTypeException,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import {
  CurrentUser,
  type ICurrentUser,
} from "../../common/decorators/current-user.decorator";
import { FinanceiroBrowserGuard } from "./financeiro-browser.guard";
import { normalizeFinanceiroGatewayPath } from "./financeiro-gateway.policy";
import type { FinanceiroBinaryResponse } from "./financeiro-internal.client";
import { FinanceiroService } from "./financeiro.service";

function isBinaryResponse(
  value: unknown,
): value is FinanceiroBinaryResponse {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    (value as FinanceiroBinaryResponse).kind === "binary" &&
    Buffer.isBuffer((value as FinanceiroBinaryResponse).body)
  );
}

type MultipartValidationOptions = {
  allowedTextFields: readonly string[];
  requiredTextFields?: readonly string[];
};

export function assertSafeMultipartBody(
  body: Buffer,
  {
    allowedTextFields,
    requiredTextFields = [],
  }: MultipartValidationOptions = { allowedTextFields: ["prefix"] },
) {
  const text = body.toString("latin1");
  const dispositions =
    text.match(/^content-disposition:\s*form-data;[^\r\n]*$/gim) || [];
  const fieldNames: string[] = [];
  for (const disposition of dispositions) {
    const names = Array.from(
      disposition.matchAll(/(?:^|;)\s*name="([^"]+)"/gi),
      (match) => match[1],
    );
    if (
      names.length !== 1 ||
      /(?:^|;)\s*name\*/i.test(disposition) ||
      (names[0] !== "file" && !allowedTextFields.includes(names[0])) ||
      (names[0] === "file" &&
        !/(?:^|;)\s*filename="[^"\r\n]+"/i.test(disposition)) ||
      (names[0] === "prefix" &&
        /(?:^|;)\s*filename=/i.test(disposition))
    ) {
      throw new UnsupportedMediaTypeException(
        "Upload aceita somente os campos prefix e file.",
      );
    }
    fieldNames.push(names[0]);
  }
  const textFieldsAreUnique = allowedTextFields.every(
    (fieldName) =>
      fieldNames.filter((name) => name === fieldName).length <= 1,
  );
  const requiredFieldsArePresent = requiredTextFields.every(
    (fieldName) => fieldNames.includes(fieldName),
  );
  if (
    fieldNames.filter((name) => name === "file").length !== 1 ||
    !textFieldsAreUnique ||
    !requiredFieldsArePresent
  ) {
    throw new UnsupportedMediaTypeException(
      "Upload contém campos inválidos.",
    );
  }
}

@Controller("financeiro")
@UseGuards(FinanceiroBrowserGuard)
export class FinanceiroController {
  constructor(private readonly financeiroService: FinanceiroService) {}

  private async getBrowserContext(currentUser: ICurrentUser) {
    const context = await this.financeiroService.buildRuntimeContext(
      currentUser,
    );
    const { centralTenantId: _centralTenantId, ...browserContext } = context;
    return browserContext;
  }

  @Get("context")
  getContext(@CurrentUser() currentUser: ICurrentUser) {
    return this.getBrowserContext(currentUser);
  }

  // O rewrite same-origin usa este caminho para evitar expor a API interna.
  @Get("gateway/context")
  getGatewayContext(@CurrentUser() currentUser: ICurrentUser) {
    return this.getBrowserContext(currentUser);
  }

  @All("gateway/*path")
  async gateway(
    @CurrentUser() currentUser: ICurrentUser,
    @Param("path") rawPath: string | string[],
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const method = request.method.toUpperCase();
    const normalizedPath = normalizeFinanceiroGatewayPath(rawPath);
    if (method === "POST" && normalizedPath === "finance-access/source-sync") {
      if (!["ADMIN", "SOFTHOUSE_ADMIN"].includes(String(currentUser.role || "").toUpperCase())) {
        throw new ForbiddenException("ESTA OPERAÇÃO EXIGE ADMINISTRADOR.");
      }
      return this.financeiroService.syncFinanceAccessSubjects(currentUser);
    }
    const receivedContentType = String(
      request.headers["content-type"] || "",
    ).trim();
    const contentType = receivedContentType
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    const bodyBytes = Buffer.isBuffer(request.body)
      ? request.body
      : undefined;
    const hasParsedBody =
      request.body !== undefined &&
      request.body !== null &&
      !Buffer.isBuffer(request.body) &&
      !["GET", "HEAD"].includes(method);

    if (
      hasParsedBody &&
      contentType &&
      contentType !== "application/json"
    ) {
      throw new UnsupportedMediaTypeException(
        "O gateway aceita JSON ou upload binário autorizado.",
      );
    }
    const isGenericS3Upload =
      method === "POST" &&
      normalizedPath === "s3-control/upload" &&
      contentType === "multipart/form-data";
    const isProductImageUpload =
      method === "POST" &&
      normalizedPath === "s3-control/product-image" &&
      contentType === "multipart/form-data";
    if (bodyBytes && !isGenericS3Upload && !isProductImageUpload) {
      throw new UnsupportedMediaTypeException(
        "Tipo de upload financeiro não autorizado.",
      );
    }
    if (
      bodyBytes &&
      /name="(?:sourceSystem|sourceTenantId|sourceBranchCode|branchCode|sourceUserId|requestedBy|cashierUserId|companyId|branchId|userRole|permissions)"/i.test(
        bodyBytes.toString("latin1"),
      )
    ) {
      throw new UnsupportedMediaTypeException(
        "Upload contém campo de autoridade não autorizado.",
      );
    }
    if (bodyBytes) {
      assertSafeMultipartBody(
        bodyBytes,
        isProductImageUpload
          ? {
              allowedTextFields: ["productId", "originScreenId"],
              requiredTextFields: ["productId"],
            }
          : { allowedTextFields: ["prefix"] },
      );
    }

    const requestedUrl = new URL(
      request.originalUrl,
      "http://escola.internal",
    );
    const idempotencyKey = String(
      request.headers["x-idempotency-key"] || "",
    ).trim();
    if (
      idempotencyKey &&
      !/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)
    ) {
      throw new UnsupportedMediaTypeException(
        "Chave de idempotência inválida.",
      );
    }

    const result = await this.financeiroService.proxyGatewayRequest(
      currentUser,
      {
        method,
        path: normalizedPath,
        searchParams: requestedUrl.searchParams,
        ...(bodyBytes
          ? { bodyBytes, contentType: receivedContentType }
          : hasParsedBody
            ? { body: request.body }
            : {}),
        ...(idempotencyKey ? { idempotencyKey } : {}),
      },
    );
    if (!isBinaryResponse(result)) return result;

    response.setHeader("Content-Type", result.contentType);
    response.setHeader(
      "Content-Disposition",
      result.contentDisposition,
    );
    response.setHeader("Content-Length", result.body.length);
    response.setHeader("Cache-Control", result.cacheControl);
    return new StreamableFile(result.body);
  }
}
