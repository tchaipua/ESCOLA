import { BadRequestException } from "@nestjs/common";

const PASSWORD_POLICY_MESSAGE =
  "A senha deve ter no mínimo 6 caracteres e conter ao menos uma letra maiúscula, uma letra minúscula e um caractere especial.";

export function assertStrongPassword(password: string) {
  const value = String(password || "");
  if (value.length < 6 || !/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/[^A-Za-z0-9\s]/.test(value)) {
    throw new BadRequestException(PASSWORD_POLICY_MESSAGE);
  }
}

export const PASSWORD_POLICY_PATTERN = /^(?=.*[A-Z])(?=.*[a-z])(?=.*[^A-Za-z0-9\s]).{6,}$/;
