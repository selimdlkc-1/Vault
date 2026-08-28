import { ConfigService } from "@nestjs/config";
import { CoingeckoClient } from "./coingecko-client";

/** `ConfigService` sahtesi — yalnızca `get(key)` kullanılır. */
function configWith(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }): Response {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    statusText: "",
    json: async () => body,
  } as unknown as Response;
}

describe("CoingeckoClient", () => {
  const fetchMock = jest.fn<Promise<Response>, [URL, RequestInit?]>();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("tüm id'leri tek bir toplu istekte çeker ve fiyatları string olarak parse eder", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ethereum: { usd: 3456.78 }, tether: { usd: 0.9998 } }),
    );
    const client = new CoingeckoClient(configWith({}));

    const prices = await client.fetchUsdPrices(["ethereum", "tether"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(calledUrl.searchParams.get("ids")).toBe("ethereum,tether");
    expect(calledUrl.searchParams.get("vs_currencies")).toBe("usd");
    expect(prices).toEqual({ ethereum: "3456.78", tether: "0.9998" });
  });

  it("boş id listesinde istek yapmaz", async () => {
    const client = new CoingeckoClient(configWith({}));
    await expect(client.fetchUsdPrices([])).resolves.toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("COINGECKO_API_KEY verilmişse demo-tier header'ı ekler", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ tether: { usd: 1 } }));
    const client = new CoingeckoClient(configWith({ COINGECKO_API_KEY: "demo-123" }));

    await client.fetchUsdPrices(["tether"]);

    const init = fetchMock.mock.calls[0][1];
    expect((init?.headers as Record<string, string>)["x-cg-demo-api-key"]).toBe("demo-123");
  });

  it("anahtar yoksa header eklemez (public tier)", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ tether: { usd: 1 } }));
    const client = new CoingeckoClient(configWith({}));

    await client.fetchUsdPrices(["tether"]);

    const init = fetchMock.mock.calls[0][1];
    expect((init?.headers as Record<string, string>)["x-cg-demo-api-key"]).toBeUndefined();
  });

  it("yanıtta fiyatı olmayan id'yi atlar", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ethereum: { usd: 3456 }, tron: {} }));
    const client = new CoingeckoClient(configWith({}));

    const prices = await client.fetchUsdPrices(["ethereum", "tron"]);

    expect(prices).toEqual({ ethereum: "3456" });
  });

  it("2xx dışı yanıtta hata fırlatır (job retry'a bırakılır)", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, { ok: false, status: 429 }));
    const client = new CoingeckoClient(configWith({}));

    await expect(client.fetchUsdPrices(["tether"])).rejects.toThrow("429");
  });
});
