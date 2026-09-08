import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, fallback, parseAbiParameters, decodeAbiParameters } from "viem";
import { base } from "viem/chains";
import { STOCKS, RPC_URLS, MAX_STALENESS_SECONDS, B20_DECIMALS } from "@/lib/tokens";
import { aggregatorAbi, b20Abi, erc20AbiFull } from "@/lib/abi";

export const dynamic = "force-dynamic";

const client = createPublicClient({
  chain: base,
  transport: fallback(RPC_URLS.map((url) => http(url))),
});

export async function GET(req: NextRequest) {
  const holder = req.nextUrl.searchParams.get("holder");

  try {
    const feedCalls = STOCKS.map((s) => ({
      address: s.feed as `0x${string}`,
      abi: aggregatorAbi,
      functionName: "latestRoundData" as const,
    }));
    const multCalls = STOCKS.map((s) => ({
      address: s.address as `0x${string}`,
      abi: b20Abi,
      functionName: "multiplier" as const,
    }));
    const balanceCalls = holder
      ? STOCKS.map((s) => ({
          address: s.address as `0x${string}`,
          abi: erc20AbiFull,
          functionName: "balanceOf" as const,
          args: [holder as `0x${string}`],
        }))
      : [];

    const results = await client.multicall({
      contracts: [...feedCalls, ...multCalls, ...balanceCalls],
      allowFailure: false,
    });

    const n = STOCKS.length;
    const feedResults = results.slice(0, n);
    const multResults = results.slice(n, 2 * n);
    const balResults = results.slice(2 * n);

    const now = Math.floor(Date.now() / 1000);
    let anyFresh = false;

    const prices = STOCKS.map((s, i) => {
      const [roundId, answer, , updatedAt] = feedResults[i] as [bigint, bigint, bigint, bigint, bigint];
      const multiplier = Number(multResults[i] as bigint) / 1e18;
      const age = now - Number(updatedAt);
      const stale = age > MAX_STALENESS_SECONDS;
      if (!stale) anyFresh = true;
      const rawBalance = holder ? (balResults[i] as bigint) : 0n;
      return {
        ticker: s.ticker,
        name: s.name,
        sector: s.sector,
        address: s.address,
        price: Number(answer) / 1e8,
        multiplier,
        updatedAt: Number(updatedAt),
        ageSeconds: age,
        stale,
        roundId: roundId.toString(),
        rawBalance: rawBalance.toString(),
        scaledBalance: (Number(rawBalance) / 10 ** B20_DECIMALS) * multiplier,
      };
    });

    return NextResponse.json({ prices, marketLikelyOpen: anyFresh, now });
  } catch (e) {
    console.error("prices error", e);
    return NextResponse.json(
      { error: "Falha ao ler preços onchain", detail: String(e) },
      { status: 502 },
    );
  }
}
