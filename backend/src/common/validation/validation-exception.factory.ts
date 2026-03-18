import { BadRequestException, ValidationError } from "@nestjs/common";

function translateConstraint(
  property: string,
  constraint: string,
  value?: string,
) {
  switch (constraint) {
    case "isNotEmpty":
      return `O campo ${property} é obrigatório.`;
    case "isString":
      return `O campo ${property} deve ser um texto.`;
    case "isEmail":
      return `O campo ${property} deve ser um e-mail válido.`;
    case "minLength":
      return `O campo ${property} deve ter no mínimo ${value || "o tamanho mínimo exigido"} caracteres.`;
    case "maxLength":
      return `O campo ${property} deve ter no máximo ${value || "o tamanho máximo permitido"} caracteres.`;
    case "isDateString":
      return `O campo ${property} deve ser uma data válida.`;
    case "isNumber":
      return `O campo ${property} deve ser numérico.`;
    case "isBoolean":
      return `O campo ${property} deve ser verdadeiro ou falso.`;
    case "isUUID":
      return `O campo ${property} deve ser um identificador válido.`;
    case "whitelistValidation":
      return `O campo ${property} não deveria ser enviado.`;
    default:
      return `O campo ${property} está inválido.`;
  }
}

function extractConstraintValue(message?: string) {
  if (!message) return undefined;
  const match = message.match(/\b(\d+)\b/);
  return match?.[1];
}

function collectMessages(errors: ValidationError[], parentPath = ""): string[] {
  return errors.flatMap((error) => {
    const propertyPath = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;

    const ownMessages = Object.entries(error.constraints || {}).map(
      ([constraint, message]) =>
        translateConstraint(
          propertyPath,
          constraint,
          extractConstraintValue(message),
        ),
    );

    const nestedMessages = collectMessages(error.children || [], propertyPath);
    return [...ownMessages, ...nestedMessages];
  });
}

export function createValidationException(errors: ValidationError[]) {
  const messages = collectMessages(errors);
  const uniqueMessages = Array.from(new Set(messages));

  return new BadRequestException({
    message:
      uniqueMessages[0] ||
      "Os dados informados são inválidos. Revise os campos e tente novamente.",
    details: uniqueMessages,
    error: "Bad Request",
    statusCode: 400,
  });
}
