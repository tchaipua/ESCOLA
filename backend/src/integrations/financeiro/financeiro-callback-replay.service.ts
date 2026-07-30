import { Injectable } from "@nestjs/common";

@Injectable()
export class FinanceiroCallbackReplayService {
  private readonly entries = new Map<string, number>();

  consume(key: string, now: number, expiresAt: number) {
    for (const [existingKey, expiration] of this.entries) {
      if (expiration <= now) this.entries.delete(existingKey);
    }
    if (this.entries.has(key)) return "REPLAY" as const;

    const maximumEntries = Number(
      process.env.FINANCEIRO_CALLBACK_REPLAY_CACHE_MAX_ENTRIES || 50_000,
    );
    if (
      !Number.isSafeInteger(maximumEntries) ||
      maximumEntries < 1 ||
      maximumEntries > 1_000_000 ||
      this.entries.size >= maximumEntries
    ) {
      return "FULL" as const;
    }
    this.entries.set(key, expiresAt);
    return "OK" as const;
  }
}
