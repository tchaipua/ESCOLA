const assert = require("node:assert/strict");
const {
  isValidCnpj,
  normalizeCnpj,
} = require("../dist/src/common/validation/cnpj.js");

assert.equal(isValidCnpj("04.252.011/0001-10"), true, "deve preservar CNPJ numérico válido");
assert.equal(isValidCnpj("12.ABC.345/01DE-35"), true, "deve aceitar o exemplo alfanumérico oficial");
assert.equal(normalizeCnpj("12.abc.345/01de-35"), "12ABC34501DE35", "deve normalizar letras para maiúsculas");
assert.equal(isValidCnpj("12.ABC.345/01DE-34"), false, "deve rejeitar dígito verificador inválido");
assert.equal(isValidCnpj("00.000.000/0000-00"), false, "deve rejeitar CNPJ numérico repetido");
assert.equal(isValidCnpj("12.ABC.345/01D!-35"), false, "deve rejeitar CNPJ incompleto");

console.log("Validação de CNPJ alfanumérico aprovada.");
