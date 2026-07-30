import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const ENCRYPTION_PREFIX = "enc:v1";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function decodeKey(value: string): Buffer {
  const normalized = value.trim();
  const isHex = /^[a-f0-9]{64}$/i.test(normalized);
  if (
    !isHex &&
    !/^(?:[A-Za-z0-9+/]{4}){10}[A-Za-z0-9+/]{3}=$/.test(normalized)
  ) {
    throw new Error(
      "DATA_ENCRYPTION_KEY deve usar base64 canônico ou 64 caracteres hexadecimais.",
    );
  }
  const key = isHex
    ? Buffer.from(normalized, "hex")
    : Buffer.from(normalized, "base64");

  if (key.length !== 32) {
    throw new Error(
      "DATA_ENCRYPTION_KEY deve representar exatamente 32 bytes (base64 ou 64 caracteres hexadecimais).",
    );
  }

  return key;
}

export function getDataEncryptionKey(): Buffer | null {
  const configured = String(process.env.DATA_ENCRYPTION_KEY || "").trim();
  return configured ? decodeKey(configured) : null;
}

export function requireDataEncryptionKey(): Buffer {
  const key = getDataEncryptionKey();
  if (!key) {
    throw new Error(
      "DATA_ENCRYPTION_KEY é obrigatória para gravar ou migrar segredos.",
    );
  }
  return key;
}

export function isEncryptedSecret(value?: string | null) {
  return String(value || "").startsWith(`${ENCRYPTION_PREFIX}:`);
}

function associatedData(context: string) {
  const normalizedContext = String(context || "").trim();
  if (!normalizedContext) {
    throw new Error("O contexto do segredo criptografado é obrigatório.");
  }
  return Buffer.from(`escola:${ENCRYPTION_PREFIX}:${normalizedContext}`, "utf8");
}

export function encryptSecret(
  value: string,
  context: string,
  key = requireDataEncryptionKey(),
) {
  const plaintext = String(value || "");
  if (!plaintext) return plaintext;

  if (isEncryptedSecret(plaintext)) {
    decryptSecret(plaintext, context, key);
    return plaintext;
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  });
  cipher.setAAD(associatedData(context));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    ENCRYPTION_PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptSecret(
  value: string,
  context: string,
  key = requireDataEncryptionKey(),
) {
  const serialized = String(value || "");
  if (!serialized) return serialized;
  if (!isEncryptedSecret(serialized)) return serialized;

  const parts = serialized.split(":");
  if (parts.length !== 5 || `${parts[0]}:${parts[1]}` !== ENCRYPTION_PREFIX) {
    throw new Error("Segredo criptografado inválido ou adulterado.");
  }

  try {
    const iv = Buffer.from(parts[2], "base64url");
    const tag = Buffer.from(parts[3], "base64url");
    const ciphertext = Buffer.from(parts[4], "base64url");
    if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
      throw new Error("Formato inválido.");
    }

    const decipher = createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: TAG_LENGTH,
    });
    decipher.setAAD(associatedData(context));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Segredo criptografado inválido ou adulterado.");
  }
}

export function decryptOptionalSecret(
  value: string | null | undefined,
  context: string,
) {
  if (value === null || value === undefined || value === "") return value;
  return decryptSecret(value, context);
}
