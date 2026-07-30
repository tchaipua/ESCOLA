const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const {
  TelegramService,
} = require("../dist/src/modules/telegram/application/services/telegram.service.js");
const {
  TelegramController,
} = require("../dist/src/modules/telegram/infrastructure/controllers/telegram.controller.js");

const ORIGINAL_DATA_ENCRYPTION_KEY = process.env.DATA_ENCRYPTION_KEY;
const ORIGINAL_TELEGRAM_POLLING_ENABLED =
  process.env.TELEGRAM_POLLING_ENABLED;

function restoreEnvironment() {
  if (ORIGINAL_DATA_ENCRYPTION_KEY === undefined) {
    delete process.env.DATA_ENCRYPTION_KEY;
  } else {
    process.env.DATA_ENCRYPTION_KEY = ORIGINAL_DATA_ENCRYPTION_KEY;
  }
  if (ORIGINAL_TELEGRAM_POLLING_ENABLED === undefined) {
    delete process.env.TELEGRAM_POLLING_ENABLED;
  } else {
    process.env.TELEGRAM_POLLING_ENABLED =
      ORIGINAL_TELEGRAM_POLLING_ENABLED;
  }
}

async function main() {
  process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 23).toString("base64");

  const person = {
    findFirst: async () => null,
    update: async () => {
      throw new Error("Um chat não validado tentou alterar uma pessoa.");
    },
    findMany: async () => {
      throw new Error("Um chat não validado tentou pesquisar documentos.");
    },
  };
  let headerImageLookups = 0;
  const centralConfiguration = {
    findConfiguration: async () => {
      headerImageLookups += 1;
      return { effective: { telegram: { headerImageUrl: null } } };
    },
  };
  const processedUpdates = new Set();
  const telegramProcessedUpdate = {
    create: async ({ data }) => {
      const key = `${data.tenantId}:${data.updateId}`;
      if (processedUpdates.has(key)) {
        const error = new Error("Unique constraint");
        error.code = "P2002";
        throw error;
      }
      processedUpdates.add(key);
      return { id: key, ...data };
    },
    deleteMany: async () => ({ count: 0 }),
  };
  const service = new TelegramService(
    {
      person,
      telegramProcessedUpdate,
    },
    centralConfiguration,
  );
  const tenantId = "tenant-security-test";
  const token = "123456:telegram-bot-token";

  const secret = service.buildWebhookSecret(tenantId, token);
  assert.match(secret, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(secret, service.buildWebhookSecret("other-tenant", token));
  assert.notEqual(secret, service.buildWebhookSecret(tenantId, "other-token"));
  assert.equal(service.isValidWebhookSecret(tenantId, token, secret), true);
  assert.equal(service.isValidWebhookSecret(tenantId, token, "wrong"), false);
  assert.equal(service.isValidWebhookSecret(tenantId, token, undefined), false);

  const configuration = {
    tenantId,
    tenantName: "Escola de teste",
    token,
    username: "@BOT",
    headerImageUrl: null,
  };
  service.getTenantTelegramConfiguration = async () => configuration;
  service.runWithTelegramTenantContext = async (_tenantId, operation) =>
    operation();
  service.processUpdate = async () => ({ ok: true, processed: true });

  await assert.rejects(
    () => service.handleWebhook(tenantId, undefined, {}),
    (error) =>
      error?.getStatus?.() === 403 &&
      error?.message === "Webhook inválido.",
  );
  await assert.rejects(
    () => service.handleWebhook(tenantId, "wrong", {}),
    (error) => error?.getStatus?.() === 403,
  );
  assert.equal(headerImageLookups, 0);
  const acceptedUpdate = { update_id: 1001 };
  assert.deepEqual(
    await service.handleWebhook(tenantId, secret, acceptedUpdate),
    {
      ok: true,
      processed: true,
    },
  );
  assert.equal(headerImageLookups, 1);
  assert.deepEqual(
    await service.handleWebhook(tenantId, secret, acceptedUpdate),
    {
      ok: true,
      duplicate: true,
    },
  );

  let setWebhookRequest;
  service.tenantId = () => tenantId;
  service.telegramFetch = async (url, init) => {
    setWebhookRequest = {
      url,
      body: JSON.parse(String(init?.body || "{}")),
    };
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  process.env.BACKEND_PUBLIC_URL = "https://escola.example.test/api/v1";
  const configured = await service.configureWebhook();
  assert.equal(
    setWebhookRequest.body.url,
    `https://escola.example.test/api/v1/telegram/webhook/${tenantId}`,
  );
  assert.equal(setWebhookRequest.body.secret_token, secret);
  assert.equal(setWebhookRequest.body.url.includes(secret), false);
  assert.equal(configured.webhookUrl.includes(secret), false);

  let controllerWebhookArguments;
  const controller = new TelegramController({
    handleWebhook: (...args) => {
      controllerWebhookArguments = args;
      return { ok: true };
    },
    pollCurrentTenantUpdates: () => ({ ok: true, currentTenantOnly: true }),
    pollAllTenantUpdates: () => {
      throw new Error("O controller tentou processar todas as empresas.");
    },
  });
  assert.deepEqual(
    controller.handleWebhook(tenantId, secret, acceptedUpdate),
    { ok: true },
  );
  assert.deepEqual(controllerWebhookArguments, [
    tenantId,
    secret,
    acceptedUpdate,
  ]);
  assert.deepEqual(controller.pollUpdates(), {
    ok: true,
    currentTenantOnly: true,
  });

  process.env.TELEGRAM_POLLING_ENABLED = "true";
  service.tenantId = () => tenantId;
  service.pollTenantUpdates = async (selectedTenantId) => ({
    tenantId: selectedTenantId,
    processed: 0,
  });
  assert.deepEqual(await service.pollCurrentTenantUpdates(), {
    tenantId,
    processed: 0,
  });

  const messages = [];
  const unlinkedService = new TelegramService({ person }, centralConfiguration);
  unlinkedService.sendTelegramMessage = async (_configuration, _chatId, text) => {
    messages.push(text);
  };
  const result = await unlinkedService.processUpdate(
    tenantId,
    configuration,
    {
      message: {
        text: "12345678909",
        chat: { id: 987654321, type: "private" },
        from: { id: 987654321 },
      },
    },
  );
  assert.deepEqual(result, {
    ok: true,
    action: "ADMIN_VERIFICATION_REQUIRED",
  });
  assert.equal(messages.length, 1);
  assert.match(messages[0], /não envie CPF, CNPJ, senha/i);

  const groupResult = await unlinkedService.processUpdate(
    tenantId,
    configuration,
    {
      message: {
        text: "NOTAS",
        chat: { id: -100123456789, type: "supergroup" },
        from: { id: 987654321 },
      },
    },
  );
  assert.deepEqual(groupResult, { ok: true, ignored: true });
  assert.equal(messages.length, 1);

  for (const schemaPath of [
    resolve(process.cwd(), "prisma", "schema.prisma"),
    resolve(process.cwd(), "prisma", "postgresql", "schema.prisma"),
  ]) {
    const schema = readFileSync(schemaPath, "utf8");
    assert.match(schema, /@@unique\(\[tenantId, telegramChatId\]\)/);
    assert.match(schema, /model TelegramProcessedUpdate/);
    assert.match(schema, /@@unique\(\[tenantId, updateId\]\)/);
    assert.match(schema, /model TelegramPendingAction/);
    assert.match(schema, /@@id\(\[tenantId, chatId\]\)/);
  }
  const controllerSource = readFileSync(
    resolve(
      process.cwd(),
      "src",
      "modules",
      "telegram",
      "infrastructure",
      "controllers",
      "telegram.controller.ts",
    ),
    "utf8",
  );
  assert.match(controllerSource, /@Post\("webhook\/:tenantId"\)/);
  assert.match(
    controllerSource,
    /@Headers\("x-telegram-bot-api-secret-token"\)/,
  );
  assert.doesNotMatch(controllerSource, /webhook\/:tenantId\/:secret/);

  console.log(
    "Segurança do webhook Telegram e vínculo administrativo validados.",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(restoreEnvironment);
