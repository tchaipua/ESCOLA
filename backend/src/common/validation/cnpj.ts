/**
 * Regras do CNPJ alfanumérico da Receita Federal.
 *
 * As primeiras 12 posições aceitam A-Z e 0-9; as duas últimas são os
 * dígitos verificadores numéricos calculados pelo módulo 11. Para letras,
 * o valor usado no cálculo é o código ASCII menos 48 (A = 17, B = 18...).
 */
export function normalizeCnpj(value?: string | null): string {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 14);
}

function valueForCnpjDigit(character: string): number {
  return character.charCodeAt(0) - 48;
}

function calculateVerifier(base: string): number {
  let sum = 0;

  for (let index = 0; index < base.length; index += 1) {
    const weight = 2 + ((base.length - 1 - index) % 8);
    sum += valueForCnpjDigit(base[index]) * weight;
  }

  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function isValidCnpj(value?: string | null): boolean {
  const cnpj = normalizeCnpj(value);

  if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj)) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const base = cnpj.slice(0, 12);
  const firstVerifier = calculateVerifier(base);
  const secondVerifier = calculateVerifier(`${base}${firstVerifier}`);

  return (
    firstVerifier === Number(cnpj[12]) &&
    secondVerifier === Number(cnpj[13])
  );
}
