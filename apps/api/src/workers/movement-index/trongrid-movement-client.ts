import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/** TronGrid API key header'ı (`docs/04_BACKEND_SPEC.md` §10 — `TRONGRID_API_KEY`). */
const API_KEY_HEADER = "TRON-PRO-API-KEY";

/** Tek çağrı için üst zaman sınırı — worker'ı asılı kalmaya karşı korur. */
const REQUEST_TIMEOUT_MS = 10_000;

/** Tarama derinliği — bir cüzdanın en yeni N TRC-20 hareketine bakılır. */
const PAGE_LIMIT = 50;

/** Tek bir TRC-20 transfer kaydının normalize edilmiş hali. */
export interface Trc20Transfer {
  txHash: string;
  fromAddress: string;
  toAddress: string;
  /** En küçük birimde (sun) tutar — `BigInt` string, asla JS `number`. */
  value: string;
  occurredAt: Date;
}

/** TronGrid `.../transactions/trc20` yanıtının kullanılan alt kümesi (harici şema). */
interface TrongridTrc20Row {
  transaction_id?: string;
  from?: string;
  to?: string;
  value?: string;
  block_timestamp?: number;
  token_info?: { address?: string };
}

/**
 * TronGrid'in TRC-20 transfer endpoint'ini saran ince HTTP istemcisi (Faz 3
 * §3.6a, `docs/mimari-kararlar.md` I-002 — Tron: TronGrid polling, webhook yok).
 * `CoingeckoClient` kalıbını izler:
 * - Retry/backoff **yoktur**; hata olduğu gibi fırlatılır, çağıran BullMQ job'u
 *   `attempts` + `backoff` ile yeniden dener (`docs/04_BACKEND_SPEC.md` §8).
 * - Sayısal disiplin: `value` hiçbir noktada JS `number`'a çevrilmez, string
 *   olarak taşınır (`docs/mimari-kararlar.md` P-015).
 * - Eşzamanlılık sınırı worker `concurrency`'sindedir (I-009); istemci kendi
 *   rate-limiter'ını tutmaz.
 */
@Injectable()
export class TrongridMovementClient {
  private readonly logger = new Logger(TrongridMovementClient.name);
  private readonly baseUrl: string;
  private readonly apiKey?: string;

  constructor(config: ConfigService) {
    // `TRON_SHASTA_RPC_URL` zaten TronGrid Shasta full-host'udur (env tablosu).
    this.baseUrl = config.getOrThrow<string>("TRON_SHASTA_RPC_URL").replace(/\/+$/, "");
    this.apiKey = config.get<string>("TRONGRID_API_KEY") || undefined;
  }

  /**
   * `address`'in `contractAddress` token'ındaki en yeni TRC-20 transferlerini
   * çeker (gelen + giden karışık). Yalnızca onaylanmış (`only_confirmed`)
   * kayıtlar döner.
   *
   * @throws Ağ hatası, zaman aşımı veya `2xx` dışı yanıtta.
   */
  async fetchTrc20Transfers(
    address: string,
    contractAddress: string,
  ): Promise<Trc20Transfer[]> {
    const url = new URL(`${this.baseUrl}/v1/accounts/${address}/transactions/trc20`);
    url.searchParams.set("limit", String(PAGE_LIMIT));
    url.searchParams.set("only_confirmed", "true");
    url.searchParams.set("contract_address", contractAddress);

    const headers: Record<string, string> = { accept: "application/json" };
    if (this.apiKey) {
      headers[API_KEY_HEADER] = this.apiKey;
    }

    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(
        `TronGrid trc20 ${response.status} ${response.statusText} (${address})`,
      );
    }

    const body = (await response.json()) as { data?: TrongridTrc20Row[] };
    const rows = body.data ?? [];
    const transfers: Trc20Transfer[] = [];

    for (const row of rows) {
      if (
        !row.transaction_id ||
        !row.from ||
        !row.to ||
        typeof row.value !== "string" ||
        typeof row.block_timestamp !== "number"
      ) {
        this.logger.warn(`TronGrid satırı eksik alanlı — atlandı (${address})`);
        continue;
      }
      transfers.push({
        txHash: row.transaction_id,
        fromAddress: row.from,
        toAddress: row.to,
        value: row.value,
        occurredAt: new Date(row.block_timestamp),
      });
    }

    return transfers;
  }
}
