const assert = require("node:assert/strict");

const {
  companyPayload,
  smtpPayload,
  storagePayload,
  validationFields,
} = require("../scripts/bootstrap-central-company-config.cjs");

const decryptTestSecret = () => "secret-value";

function testOversizedLogoIsOmittedWithoutChangingOtherCompanyFields() {
  const diagnostics = [];
  const payload = companyPayload(
    {
      corporateName: "ESCOLA TESTE",
      logoUrl: `data:image/png;base64,${"A".repeat(11_182)}`,
      email: "contato@example.test",
    },
    "ESCOLA TESTE",
    "TENANT",
    diagnostics,
  );

  assert.equal(payload.legalName, "ESCOLA TESTE");
  assert.equal(payload.logoReference, undefined);
  assert.equal(payload.contacts.email, "contato@example.test");
  assert.deepEqual(diagnostics, [
    {
      path: "TENANT.company.logoReference",
      reason: "MAX_LENGTH_2048",
    },
  ]);
}

function testPartialSmtpIsOmitted() {
  const diagnostics = [];
  const payload = smtpPayload(
    { smtpHost: "smtp.example.test" },
    decryptTestSecret,
    "TENANT",
    "ESCOLA TESTE",
    diagnostics,
  );

  assert.equal(payload, undefined);
  assert.deepEqual(diagnostics, [
    { path: "TENANT.smtp", reason: "INCOMPLETE_CONFIGURATION" },
  ]);
}

function testCompleteConfigurationsArePreserved() {
  const diagnostics = [];
  const smtp = smtpPayload(
    {
      smtpHost: "smtp.example.test",
      smtpPort: 587,
      smtpAuthenticate: true,
      smtpEmail: "mailer@example.test",
      smtpPassword: "enc:v1:test",
    },
    decryptTestSecret,
    "TENANT",
    "ESCOLA TESTE",
    diagnostics,
  );
  const s3 = storagePayload(
    {
      storageEndpoint: "https://s3.example.test",
      storageBucketName: "school",
      storageProviderAccessKeyId: "access-id",
      storageProviderSecretAccessKey: "enc:v1:test",
    },
    decryptTestSecret,
    "TENANT",
    diagnostics,
  );

  assert.equal(smtp.host, "smtp.example.test");
  assert.equal(smtp.username, "mailer@example.test");
  assert.equal(smtp.password, "secret-value");
  assert.equal(s3.bucket, "school");
  assert.equal(s3.accessKeyId, "access-id");
  assert.equal(s3.secretAccessKey, "secret-value");
  assert.deepEqual(diagnostics, []);
}

function testInvalidSecretOmitsWholeBlock() {
  const diagnostics = [];
  const payload = storagePayload(
    {
      storageBucketName: "school",
      storageProviderAccessKeyId: "access-id",
      storageProviderSecretAccessKey: "enc:v1:invalid",
    },
    () => {
      throw new Error("secret value must never be logged");
    },
    "Tenant",
    diagnostics,
  );

  assert.equal(payload, undefined);
  assert.deepEqual(diagnostics, [
    { path: "Tenant.s3.secretAccessKey", reason: "INVALID_ENCRYPTED_SECRET" },
    { path: "Tenant.s3", reason: "INVALID_SECRET_BLOCK_OMITTED" },
  ]);
  assert.equal(JSON.stringify(diagnostics).includes("secret value"), false);
}

function testValidationReportContainsOnlyFieldNames() {
  assert.deepEqual(
    validationFields({
      message: [
        "logoReference must be shorter than or equal to 2048 characters",
        "email must be an email",
        "arbitrary response containing confidential-value",
      ],
    }),
    ["logoReference", "email"],
  );
}

testOversizedLogoIsOmittedWithoutChangingOtherCompanyFields();
testPartialSmtpIsOmitted();
testCompleteConfigurationsArePreserved();
testInvalidSecretOmitsWholeBlock();
testValidationReportContainsOnlyFieldNames();

console.log("bootstrap-central-company-config: 5 testes aprovados");
