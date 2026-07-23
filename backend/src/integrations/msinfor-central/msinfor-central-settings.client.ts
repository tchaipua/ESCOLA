import { BadGatewayException, Injectable } from "@nestjs/common";

type CachedSettings = { value: Record<string, unknown>; expiresAt: number; staleUntil: number };

@Injectable()
export class MsInforCentralSettingsClient {
  private cache?: CachedSettings;

  private get baseUrl() {
    return String(process.env.MSINFOR_CENTRAL_API_URL || "http://localhost:3201/api/v1").replace(/\/$/, "");
  }

  private get systemId() {
    return String(process.env.MSINFOR_CENTRAL_SYSTEM_ID || "ESCOLA").trim().toUpperCase();
  }

  private async request(path: string, init: RequestInit = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      signal: AbortSignal.timeout(8_000),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new BadGatewayException(payload?.message || "A central MSINFOR não respondeu corretamente.");
    }
    return payload;
  }

  async findEffective() {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) return this.cache.value;
    const systemKey = String(process.env.MSINFOR_CENTRAL_SYSTEM_KEY || "").trim();
    if (!systemKey) return null;
    try {
      const value = await this.request("/global-settings/effective", {
        headers: {
          "x-msinfor-system-id": this.systemId,
          "x-msinfor-system-key": systemKey,
        },
      }) as Record<string, unknown>;
      this.cache = { value, expiresAt: now + 60_000, staleUntil: now + 15 * 60_000 };
      return value;
    } catch (error) {
      if (this.cache && this.cache.staleUntil > now) return this.cache.value;
      throw error;
    }
  }

  async findAdmin(masterPass: string) {
    return this.request("/global-settings", { headers: { "x-msinfor-master-pass": masterPass } });
  }

  async save(payload: unknown, masterPass: string) {
    const result = await this.request("/global-settings", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-msinfor-master-pass": masterPass,
        "x-msinfor-source-system": this.systemId,
      },
      body: JSON.stringify(payload),
    });
    this.cache = undefined;
    return result;
  }

  test(kind: "s3" | "email", payload: unknown, masterPass: string) {
    return this.request(`/global-settings/test-${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-msinfor-master-pass": masterPass },
      body: JSON.stringify(payload),
    });
  }
}
