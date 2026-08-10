-- CNPJ é informativo. A identidade compartilhada continua sendo determinada
-- pelo CPF e pelo personId já existente, nunca pelo CNPJ.
DROP INDEX IF EXISTS "people_tenantId_cnpjNormalized_key";
