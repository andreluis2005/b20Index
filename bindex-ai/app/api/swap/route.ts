import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, fallback, encodeFunctionData, parseUnits } from "viem";
import { base } from "viem/chains";
import {
  STOCKS_BY_TICKER,
  USDC,
  UNISWAP_ROUTER,
  UNISWAP_FACTORY,
  UNIV3_FEE_CANDIDATES,
  PRICE_SANITY_MAX_DEV,
  RPC_URLS,
} from "@/lib/tokens";
import { uniswapRouterAbi, univ3FactoryAbi, univ3PoolAbi, aggregatorAbi } from "@/lib/abi";

export const dynamic = "force-dynamic";

const client = createPublicClient({
  chain: base,
  transport: fallback(RPC_URLS.map((url) => http(url))),
});

type Body = {
  ticker: string;
  usdAmount: string;
  taker: string;
  slippageBps?: number;
  direction?: "buy" | "sell";
  fromAmountRaw?: string;
};

type Quote = {
  provider: string;
  spender: string;
  transaction: { to: string; data: string; value: string; gas?: string };
  buyAmount: string;
  sellAmount: string;
  buyToken: string;
  extra?: Record<string, unknown>;
};

function sqrtPriceToPrice(sqrtPriceX96: bigint): number {
  const q = Number(sqrtPriceX96) / 2 ** 96;
  return q * q;
}

// LiFi: agregador oficial listado pela Base p/ tokenized stocks; keyless (200 req/2h)
async function quoteLiFi(b: Body): Promise<Quote> {
  const token = STOCKS_BY_TICKER[b.ticker];
  const sell = b.direction === "sell";
  const apiKey = process.env.LIFI_API_KEY;
  const headers: Record<string, string> = { "x-integrator": "bindex-ai" };
  if (apiKey && !apiKey.startsWith("COLE_")) headers["x-lifi-api-key"] = apiKey;

  const q = new URLSearchParams({
    fromChain: "8453",
    toChain: "8453",
    fromToken: sell ? token.address : USDC.address,
    toToken: sell ? USDC.address : token.address,
    fromAddress: b.taker,
    toAddress: b.taker,
    fromAmount: sell
      ? String(BigInt(b.fromAmountRaw ?? "0"))
      : parseUnits(b.usdAmount, USDC.decimals).toString(),
    slippage: String((b.slippageBps ?? 100) / 10000),
    order: "CHEAPEST",
  });

  const res = await fetch(`https://li.quest/v1/quote?${q}`, { headers });
  const data = await res.json();
  if (!res.ok || !data?.transactionRequest) {
    throw new Error(`LiFi ${res.status}: ${JSON.stringify(data?.message ?? data).slice(0, 200)}`);
  }
  const tx = data.transactionRequest;
  return {
    provider: "lifi",
    spender: tx.to,
    transaction: {
      to: tx.to,
      data: tx.data,
      value: tx.value ?? "0x0",
      gas: tx.gasLimit ? String(BigInt(tx.gasLimit)) : undefined,
    },
    buyAmount: data.estimate.toAmount,
    sellAmount: data.action.fromAmount,
    buyToken: sell ? USDC.address : token.address,
    extra: {
      tool: data.toolDetails?.name ?? data.tool,
      toAmountMin: data.estimate.toAmountMin,
    },
  };
}

// Fallback onchain puro: Uniswap V3 slot0 + sanity vs Chainlink (compra e venda)
async function quoteUniswap(b: Body): Promise<Quote> {
  const token = STOCKS_BY_TICKER[b.ticker];
  const sell = b.direction === "sell";
  const amountIn = sell
    ? BigInt(b.fromAmountRaw ?? "0")
    : parseUnits(b.usdAmount, USDC.decimals);
  if (amountIn <= 0n) throw new Error("Quantidade inválida");

  const [roundId, answer, , updatedAt] = (await client.readContract({
    address: token.feed,
    abi: aggregatorAbi,
    functionName: "latestRoundData",
  })) as [bigint, bigint, bigint, bigint, bigint];
  const chainlinkPrice = Number(answer) / 1e8;
  const feedAge = Math.floor(Date.now() / 1000) - Number(updatedAt);
  const feedFresh = feedAge < 60 * 60 * 12;

  const candidates: { fee: number; impliedOutWei: number; impliedPrice: number }[] = [];
  const errors: string[] = [];

  for (const fee of UNIV3_FEE_CANDIDATES) {
    try {
      const pool = (await client.readContract({
        address: UNISWAP_FACTORY,
        abi: univ3FactoryAbi,
        functionName: "getPool",
        args: [USDC.address, token.address, fee],
      })) as `0x${string}`;
      if (pool === "0x0000000000000000000000000000000000000000") continue;

      const slot0 = (await client.readContract({
        address: pool,
        abi: univ3PoolAbi,
        functionName: "slot0",
      })) as [bigint, number, number, number, number, number, boolean];
      const sqrtPriceX96 = slot0[0] as bigint;
      if (sqrtPriceX96 === 0n) continue;

      // USDC (0x8335...) < tokens B20 (0xb200...): token0 é sempre USDC nestes pares
      // price_raw = wei B20 por wei USDC
      const priceRaw = sqrtPriceToPrice(sqrtPriceX96);
      // preço humano do B20 em US$: 1 / (price_raw × 1e(6-8)) = 100/price_raw
      const impliedPrice = 100 / priceRaw;

      if (feedFresh) {
        const dev = Math.abs(impliedPrice - chainlinkPrice) / chainlinkPrice;
        if (dev > PRICE_SANITY_MAX_DEV) {
          errors.push(`fee ${fee}: desvio ${(dev * 100).toFixed(0)}% vs Chainlink`);
          continue;
        }
      }

      const impliedOutWei = sell
        ? Number(amountIn) / priceRaw // venda: wei USDC de saída
        : Number(amountIn) * priceRaw; // compra: wei B20 de saída
      candidates.push({ fee, impliedOutWei, impliedPrice });
    } catch (e) {
      errors.push(`fee ${fee}: ${String((e as Error).message ?? e).slice(0, 70)}`);
    }
  }

  if (candidates.length === 0) {
    throw new Error(`Sem pool Uniswap V3 utilizável para ${b.ticker} (${errors.join("; ") || "nenhum pool"})`);
  }

  candidates.sort((a, b2) => b2.impliedOutWei - a.impliedOutWei);
  const best = candidates[0];

  const slip = BigInt(b.slippageBps ?? 100);
  const impliedOutWei = BigInt(Math.floor(best.impliedOutWei));
  const amountOutMin = (impliedOutWei * (10000n - slip)) / 10000n;

  const data = encodeFunctionData({
    abi: uniswapRouterAbi,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn: (sell ? token.address : USDC.address) as `0x${string}`,
        tokenOut: (sell ? USDC.address : token.address) as `0x${string}`,
        fee: best.fee,
        recipient: b.taker as `0x${string}`,
        amountIn,
        amountOutMinimum: amountOutMin,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });

  return {
    provider: "uniswap",
    spender: UNISWAP_ROUTER,
    transaction: { to: UNISWAP_ROUTER, data, value: "0" },
    buyAmount: impliedOutWei.toString(),
    sellAmount: amountIn.toString(),
    buyToken: sell ? USDC.address : token.address,
    extra: { poolFee: best.fee, chainlinkPrice, impliedPrice: best.impliedPrice },
  };
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { ticker, usdAmount, taker, direction, fromAmountRaw } = body;
  const sell = direction === "sell";
  if (!STOCKS_BY_TICKER[ticker]) {
    return NextResponse.json({ error: `Ticker fora da whitelist: ${ticker}` }, { status: 400 });
  }
  if (sell) {
    if (!fromAmountRaw || !/^\d+$/.test(fromAmountRaw) || BigInt(fromAmountRaw) <= 0n) {
      return NextResponse.json({ error: "Quantidade de venda inválida" }, { status: 400 });
    }
  } else {
    const amount = Number(usdAmount);
    if (!Number.isFinite(amount) || amount < 0.5 || amount > 10000) {
      return NextResponse.json(
        { error: "Valor deve estar entre US$ 0,50 e US$ 10.000" },
        { status: 400 },
      );
    }
  }
  if (!taker || !/^0x[a-fA-F0-9]{40}$/.test(taker)) {
    return NextResponse.json({ error: "Carteira (taker) inválida" }, { status: 400 });
  }

  const providerErrors: Record<string, string> = {};

  try {
    return NextResponse.json(await quoteLiFi(body));
  } catch (e) {
    providerErrors.lifi = String((e as Error).message ?? e);
    console.warn("LiFi falhou:", providerErrors.lifi);
  }

  try {
    const q = await quoteUniswap(body);
    return NextResponse.json({ ...q, providerErrors: Object.keys(providerErrors).length ? providerErrors : undefined });
  } catch (e) {
    return NextResponse.json(
      { error: "Nenhuma rota de liquidez disponível", providerErrors, detail: String(e) },
      { status: 502 },
    );
  }
}
