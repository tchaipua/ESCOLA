import { createHash, createHmac, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Injectable, Logger } from "@nestjs/common";
import type { ICurrentUser } from "../../common/decorators/current-user.decorator";

const SOURCE_SYSTEM = "ESCOLA";
const RECOVERY_PATH = "/v1/services/financeiro/recover";

export type FinanceiroRecoveryResponse = {
  accepted: boolean;
  managedByRuntime?: boolean;
  requestId?: string;
  components?: Record<string, string>;
};

@Injectable()
export class ServiceSupervisorClient {
  private readonly logger = new Logger(ServiceSupervisorClient.name);

  async recoverFinanceiro(
    currentUser: ICurrentUser,
  ): Promise<FinanceiroRecoveryResponse> {
    if (String(process.env.NODE_ENV || "development").toLowerCase() === "production") {
      return { accepted: true, managedByRuntime: true };
    }

    const baseUrl = String(
      process.env.MSINFOR_SERVICE_SUPERVISOR_URL || "http://127.0.0.1:3199",
    ).replace(/\/+$/, "");
    const parsedUrl = new URL(baseUrl);
    if (
      parsedUrl.protocol !== "http:" ||
      !["127.0.0.1", "::1"].includes(parsedUrl.hostname) ||
      parsedUrl.username ||
      parsedUrl.password ||
      parsedUrl.pathname !== "/"
    ) {
      this.logger.warn("URL local do supervisor recusada por segurança.");
      return { accepted: false };
    }

    const secret = this.readSecret();
    if (!secret) {
      this.logger.warn("Supervisor do Financeiro não configurado no ambiente local.");
      return { accepted: false };
    }

    const payload = JSON.stringify({
      actorId: currentUser.userId,
      tenantId: currentUser.tenantId,
      branchCode: currentUser.branchCode,
      reason: "DEPENDENCY_UNAVAILABLE",
    });
    const timestamp = String(Date.now());
    const nonce = randomBytes(24).toString("hex");
    const bodyHash = createHash("sha256").update(payload).digest("hex");
    const canonical = `POST\n${RECOVERY_PATH}\n${timestamp}\n${nonce}\n${bodyHash}`;
    const signature = createHmac("sha256", secret)
      .update(canonical)
      .digest("hex");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3_000);

    try {
      const response = await fetch(`${baseUrl}${RECOVERY_PATH}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-msinfor-source": SOURCE_SYSTEM,
          "x-msinfor-timestamp": timestamp,
          "x-msinfor-nonce": nonce,
          "x-msinfor-signature": `sha256=${signature}`,
        },
        body: payload,
        signal: controller.signal,
      });
      if (!response.ok) {
        this.logger.warn(`Supervisor recusou a recuperação (${response.status}).`);
        return { accepted: false };
      }
      return (await response.json()) as FinanceiroRecoveryResponse;
    } catch (error) {
      this.logger.warn(
        `Supervisor local indisponível: ${error instanceof Error ? error.message : "falha desconhecida"}`,
      );
      return { accepted: false };
    } finally {
      clearTimeout(timeout);
    }
  }

  async isFinanceiroBackendReady() {
    const apiUrl = String(
      process.env.FINANCEIRO_API_URL || "http://127.0.0.1:3002/api/v1",
    ).replace(/\/+$/, "");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1_800);
    try {
      const response = await fetch(`${apiUrl}/health/ready`, {
        cache: "no-store",
        signal: controller.signal,
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  private readSecret() {
    const explicitValue = String(
      process.env.MSINFOR_SERVICE_SUPERVISOR_SECRET || "",
    ).trim();
    if (explicitValue.length >= 43) return explicitValue;

    const configuredPath = String(
      process.env.MSINFOR_SERVICE_SUPERVISOR_SECRET_FILE || "",
    ).trim();
    const secretPath = resolve(
      configuredPath ||
        resolve(process.cwd(), "../../MSINFOR_INFRA/.secrets/service_supervisor_secret.txt"),
    );
    if (!existsSync(secretPath)) return "";
    const value = readFileSync(secretPath, "utf8").trim();
    return value.length >= 43 ? value : "";
  }
}
