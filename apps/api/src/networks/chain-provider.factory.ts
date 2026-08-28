import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ChainType } from "@prisma/client";
import { EvmProvider, TronProvider, type IChainProvider } from "@vault/chain-providers";

/** Bir `IChainProvider` seçmek için gereken ağ kimliği (Faz 3 §3.2). */
export interface ChainNetworkRef {
  chainType: ChainType;
  /** `networks.chain_id` — `CHAIN_ID_ALLOWLIST` ile birebir aynı biçim. */
  chainId: string;
}

/**
 * `networks.chain_id` → testnet RPC endpoint eşlemesi. Bu tablo genişletilmez;
 * yeni bir satır eklemek yeni bir ağ desteği demektir ve ADR gerektirir
 * (`docs/mimari-kararlar.md` SEC-005, I-001). Anahtarlar seed'deki `chain_id`
 * string'leriyle aynıdır (`apps/api/prisma/seed.ts`).
 */
const RPC_ENV_KEY_BY_CHAIN_ID: Readonly<Record<string, string>> = {
  "11155111": "SEPOLIA_RPC_URL",
  "97": "BSC_TESTNET_RPC_URL",
  shasta: "TRON_SHASTA_RPC_URL",
};

/**
 * `EvmProvider`/`TronProvider` örneklerini `ConfigService` (env) + ağ `chain_id`
 * üzerinden kuran ve chain_id başına önbelleğe alan fabrika (Faz 3 §3.2 — Faz 2
 * §2.5'te tanımlanan sınıflar burada ilk kez `apps/api`'ye wire edilir).
 * `IChainProvider` erişimi yalnızca service/worker katmanındandır
 * (`docs/04_BACKEND_SPEC.md` §1); controller bu fabrikayı görmez.
 *
 * Her provider constructor'ı ilk satırında `assertChainIdAllowed` çağırır —
 * allowlist dışı bir `chain_id` (mainnet dahil) burada reddedilir
 * (`.claude/rules/03-security-baseline.md`).
 */
@Injectable()
export class ChainProviderFactory {
  private readonly logger = new Logger(ChainProviderFactory.name);
  private readonly allowlist: readonly string[];
  private readonly cache = new Map<string, IChainProvider>();

  constructor(private readonly config: ConfigService) {
    this.allowlist = this.config
      .getOrThrow<string>("CHAIN_ID_ALLOWLIST")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }

  /**
   * Verilen ağ için `IChainProvider` döner; aynı `chain_id` için ikinci çağrı
   * önbellekten yanıtlanır. `chain_id` bilinmiyorsa (RPC eşlemesi yok) hata
   * fırlatır — worker bunu job hatası olarak ele alır.
   */
  getProvider(network: ChainNetworkRef): IChainProvider {
    const cached = this.cache.get(network.chainId);
    if (cached) {
      return cached;
    }

    const rpcEnvKey = RPC_ENV_KEY_BY_CHAIN_ID[network.chainId];
    if (!rpcEnvKey) {
      throw new Error(
        `chain_id "${network.chainId}" için RPC endpoint eşlemesi yok — desteklenmeyen ağ.`,
      );
    }
    const rpcUrl = this.config.getOrThrow<string>(rpcEnvKey);

    const provider: IChainProvider =
      network.chainType === "tron"
        ? new TronProvider({ chainId: network.chainId, rpcUrl }, this.allowlist)
        : new EvmProvider({ chainId: network.chainId, rpcUrl }, this.allowlist);

    this.cache.set(network.chainId, provider);
    this.logger.debug(`${network.chainType} provider kuruldu (chain_id=${network.chainId})`);
    return provider;
  }
}
