const assert = require("node:assert/strict");

async function main() {
  const { ServiceSupervisorClient } = require("../dist/src/integrations/financeiro/service-supervisor.client.js");

  const originalFetch = global.fetch;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSupervisorUrl = process.env.MSINFOR_SERVICE_SUPERVISOR_URL;
  const originalSupervisorSecret = process.env.MSINFOR_SERVICE_SUPERVISOR_SECRET;

  try {
    process.env.NODE_ENV = "development";
    process.env.MSINFOR_SERVICE_SUPERVISOR_URL = "http://127.0.0.1:3199";
    process.env.MSINFOR_SERVICE_SUPERVISOR_SECRET = "x".repeat(43);

    let request;
    global.fetch = async (url, init) => {
      request = { url, init };
      return {
        ok: true,
        async json() {
          return { accepted: true, requestId: "central-test" };
        },
      };
    };

    const client = new ServiceSupervisorClient();
    const response = await client.recoverCentral();

    assert.deepEqual(response, { accepted: true, requestId: "central-test" });
    assert.equal(request.url, "http://127.0.0.1:3199/v1/services/msinfor-central/recover");
    assert.equal(request.init.method, "POST");
    assert.equal(request.init.headers["x-msinfor-source"], "ESCOLA");
    assert.deepEqual(JSON.parse(request.init.body), {
      reason: "CENTRAL_UNAVAILABLE",
    });
    assert.match(request.init.headers["x-msinfor-signature"], /^sha256=[a-f0-9]{64}$/);

    process.env.NODE_ENV = "production";
    const productionResponse = await client.recoverCentral();
    assert.deepEqual(productionResponse, {
      accepted: true,
      managedByRuntime: true,
    });
  } finally {
    global.fetch = originalFetch;
    process.env.NODE_ENV = originalNodeEnv;
    process.env.MSINFOR_SERVICE_SUPERVISOR_URL = originalSupervisorUrl;
    process.env.MSINFOR_SERVICE_SUPERVISOR_SECRET = originalSupervisorSecret;
  }
}

main().then(
  () => console.log("central-recovery-contract: ok"),
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
