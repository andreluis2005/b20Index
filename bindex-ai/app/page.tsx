"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useAccount,
  useConfig,
  useConnect,
  useDisconnect,
  useWalletClient,
} from "wagmi";
import { getWalletClient, switchChain } from "wagmi/actions";
import { base } from "wagmi/chains";
import { createPublicClient, fallback, http, encodeFunctionData, formatUnits, maxUint256 } from "viem";
import { USDC, STOCKS_BY_TICKER, MAX_STALENESS_SECONDS, B20_DECIMALS } from "@/lib/tokens";
import { erc20AbiFull } from "@/lib/abi";

type PriceRow = {
  ticker: string;
  name: string;
  sector: string;
  address: string;
  price: number;
  multiplier: number;
  ageSeconds: number;
  stale: boolean;
  scaledBalance: number;
  rawBalance: string;
};

type Proposal = {
  positions: { ticker: string; weight: number; rationale: string }[];
  summary: string;
};

type Msg = { role: "user" | "assistant"; content: string; proposal?: Proposal | null };

type ExecStatus = "pending" | "approving" | "swapping" | "done" | "error";
type ExecRow = { ticker: string; usd: number; status: ExecStatus; detail?: string; txHash?: string };

const baseClient = createPublicClient({
  chain: base,
  transport: fallback(
    [
      http("https://base.llamarpc.com"),
      http("https://base.publicnode.com"),
      http("https://1rpc.io/base"),
      http("https://mainnet.base.org"),
    ],
    { rank: false, retryCount: 2 },
  ),
});

const PER_POSITION_MIN = 0.5;
const usd = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

const parseUsd = (raw: string): number => {
  const s = raw.trim();
  if (!s) return Number.NaN;
  // vírgula presente: é o separador decimal (padrão BR) e pontos são milhares
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
  return Number.isFinite(n) ? n : Number.NaN;
};

const SUGGESTIONS = [
  "Monte um índice de IA sem Tesla",
  "Índice das 4 Magnificent + Coinbase",
  "Exposição forte a semicondutores",
];

export default function Home() {
  const { address, isConnected } = useAccount();
  const config = useConfig();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const walletClient = useWalletClient().data;
  
  const [tab, setTab] = useState<"chat" | "index">("chat");
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Oi! Sou o agente do bIndex AI. Descreva a exposição que você quer e eu monto um índice de ações tokenizadas (B20) da Coinbase na Base — você aprova tudo na sua carteira.",
    },
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [investUsd, setInvestUsd] = useState("20");
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [marketOpen, setMarketOpen] = useState(true);
  const [execRows, setExecRows] = useState<ExecRow[]>([]);
  const [execError, setExecError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [portfolio, setPortfolio] = useState<PriceRow[] | null>(null);
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const priceByTicker = useMemo(() => {
    const m: Record<string, PriceRow> = {};
    for (const p of prices) m[p.ticker] = p;
    return m;
  }, [prices]);

  const loadPrices = useCallback(async () => {
    try {
      const res = await fetch("/api/prices");
      const data = await res.json();
      if (data.prices) {
        setPrices(data.prices);
        setMarketOpen(data.marketLikelyOpen ?? true);
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadPrices();
    const t = setInterval(loadPrices, 60_000);
    return () => clearInterval(t);
  }, [loadPrices]);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    chatEndRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
  }, [messages, thinking]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || thinking) return;
      const nextMsgs: Msg[] = [...messages, { role: "user", content: text.trim() }];
      setMessages(nextMsgs);
      setInput("");
      setThinking(true);
      setProposal(null);
      try {
        if (prices.length === 0) await loadPrices();
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: nextMsgs.map(({ role, content }) => ({ role, content })),
            prices: prices.map(({ ticker, name, sector, price, stale }) => ({ ticker, name, sector, price, stale })),
          }),
        });
        const data = await res.json();
        if (data.proposal) {
          setProposal(data.proposal);
          setExecRows([]);
          setExecError(null);
          setMessages([...nextMsgs, { role: "assistant", content: data.reply, proposal: data.proposal }]);
        } else {
          setMessages([
            ...nextMsgs,
            { role: "assistant", content: data.reply ?? data.error ?? "Algo deu errado." },
          ]);
        }
      } catch {
        setMessages([...nextMsgs, { role: "assistant", content: "Erro de rede. Tente de novo." }]);
      } finally {
        setThinking(false);
      }
    },
    [messages, thinking, prices, loadPrices],
  );

  const checkAllowance = useCallback(
    async (tokenAddress: string, spender: string, neededRaw: bigint) => {
      if (!address) return false;
      const current = (await baseClient.readContract({
        address: tokenAddress as `0x${string}`,
        abi: erc20AbiFull,
        functionName: "allowance",
        args: [address as `0x${string}`, spender as `0x${string}`],
      })) as bigint;
      return current >= neededRaw;
    },
    [address],
  );

  const sendTx = useCallback(
    async (to: string, data: string, value?: string) => {
      if (!address) throw new Error("Carteira não conectada");
      let wc = walletClient ?? (await getWalletClient(config).catch(() => null));
      if (!wc) {
        throw new Error("Não foi possível acessar a carteira — desconecte (clique no endereço) e conecte novamente");
      }
      // chain real do provider (useChainId do wagmi pode estar dessincronizado)
      const providerChain = await wc.getChainId().catch(() => null);
      if (providerChain !== base.id) {
        await switchChain(config, { chainId: base.id });
        wc = (await getWalletClient(config).catch(() => null)) ?? wc;
        const after = await wc.getChainId().catch(() => null);
        if (after !== base.id) {
          throw new Error("Troque a rede da carteira para Base e execute de novo");
        }
      }
      const hash = await wc.sendTransaction({
        account: address as `0x${string}`,
        to: to as `0x${string}`,
        data: data as `0x${string}`,
        value: value && value !== "0" ? BigInt(value) : 0n,
        chain: base,
      });
      const receipt = await baseClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Transação reverteu");
      return hash;
    },
    [walletClient, address, config],
  );

  const execute = useCallback(async () => {
    if (!proposal || !address || executing) return;
    const total = parseUsd(investUsd);
    const minWeight = Math.min(...proposal.positions.map((p) => p.weight));
    const minTotal = Math.ceil((PER_POSITION_MIN / minWeight) * 100 * 100) / 100;
    if (!Number.isFinite(total) || total < minTotal) {
      setExecRows([]);
      setExecError(
        `Valor total insuficiente: a menor posição (${minWeight}%) ficaria abaixo de ${usd(PER_POSITION_MIN)} — mínimo ${usd(minTotal)}`,
      );
      return;
    }
    setExecError(null);
    const rows: ExecRow[] = proposal.positions.map((p) => ({
      ticker: p.ticker,
      usd: (p.weight / 100) * total,
      status: "pending" as const,
    }));
    setExecRows(rows);
    setExecuting(true);
    setTab("chat");

    const basis = JSON.parse(localStorage.getItem("bindex_basis") ?? "{}");
    const updated = [...rows];

    for (let i = 0; i < rows.length; i++) {
      const pos = proposal.positions[i];
      const token = STOCKS_BY_TICKER[pos.ticker];
      const setRow = (patch: Partial<ExecRow>) => {
        updated[i] = { ...updated[i], ...patch };
        setExecRows([...updated]);
      };
      try {
        if (rows[i].usd < PER_POSITION_MIN) {
          setRow({ status: "error", detail: `abaixo de ${usd(PER_POSITION_MIN)}` });
          continue;
        }
        setRow({ status: "approving" });
        const qRes = await fetch("/api/swap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticker: pos.ticker, usdAmount: String(rows[i].usd), taker: address }),
        });
        const quote = await qRes.json();
        if (!qRes.ok) throw new Error(quote.error ?? "Falha na cotação");

        const needed = BigInt(quote.sellAmount);
        const ok = await checkAllowance(USDC.address, quote.spender, needed);
        if (!ok) {
          const approveData = encodeFunctionData({
            abi: erc20AbiFull,
            functionName: "approve",
            args: [quote.spender as `0x${string}`, maxUint256],
          });
          const approveHash = await sendTx(USDC.address, approveData);
          setRow({ status: "approving", txHash: approveHash });
        }

        setRow({ status: "swapping" });
        const swapHash = await sendTx(quote.transaction.to, quote.transaction.data, quote.transaction.value);
        setRow({ txHash: swapHash });

        const rawBought = Number(formatUnits(BigInt(quote.buyAmount), B20_DECIMALS)) * (priceByTicker[pos.ticker]?.multiplier ?? 1);
        basis[pos.ticker] = {
          invested: (basis[pos.ticker]?.invested ?? 0) + rows[i].usd,
          raw: (basis[pos.ticker]?.raw ?? 0) + rawBought,
        };
        localStorage.setItem("bindex_basis", JSON.stringify(basis));
        setRow({ status: "done" });
      } catch (e) {
        setRow({ status: "error", detail: String((e as Error).message ?? e).slice(0, 140) });
      }
    }
    setExecuting(false);
  }, [proposal, address, executing, investUsd, checkAllowance, sendTx, priceByTicker]);

  const loadPortfolio = useCallback(async () => {
    if (!address) return;
    setLoadingPortfolio(true);
    try {
      const res = await fetch(`/api/prices?holder=${address}`);
      const data = await res.json();
      if (data.prices) setPortfolio(data.prices);
    } catch {} finally {
      setLoadingPortfolio(false);
    }
  }, [address]);

  const [sellingTicker, setSellingTicker] = useState<string | null>(null);
  const [sellMsg, setSellMsg] = useState<string | null>(null);

  const sellPosition = useCallback(
    async (row: PriceRow & { value: number }) => {
      if (!address || sellingTicker || executing) return;
      const est = row.scaledBalance * row.price;
      if (!window.confirm(`Vender toda a posição: ${row.scaledBalance.toFixed(8)} ${row.ticker} (~${usd(est)})?`)) return;
      setSellingTicker(row.ticker);
      setSellMsg(null);
      try {
        const qRes = await fetch("/api/swap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticker: row.ticker,
            usdAmount: "0",
            taker: address,
            direction: "sell",
            fromAmountRaw: row.rawBalance,
          }),
        });
        const quote = await qRes.json();
        if (!qRes.ok) throw new Error(quote.error ?? "Falha na cotação de venda");

        const ok = await checkAllowance(row.address, quote.spender, BigInt(quote.sellAmount));
        if (!ok) {
          const approveData = encodeFunctionData({
            abi: erc20AbiFull,
            functionName: "approve",
            args: [quote.spender as `0x${string}`, maxUint256],
          });
          await sendTx(row.address, approveData);
        }

        await sendTx(quote.transaction.to, quote.transaction.data, quote.transaction.value);

        const basis = JSON.parse(localStorage.getItem("bindex_basis") ?? "{}");
        delete basis[row.ticker];
        localStorage.setItem("bindex_basis", JSON.stringify(basis));
        setSellMsg(`Venda de ${row.ticker} concluída — ${usd(Number(formatUnits(BigInt(quote.buyAmount), USDC.decimals)))} em USDC.`);
        await loadPortfolio();
      } catch (e) {
        setSellMsg(`Erro na venda de ${row.ticker}: ${String((e as Error).message ?? e).slice(0, 120)}`);
      } finally {
        setSellingTicker(null);
      }
    },
    [address, sellingTicker, executing, checkAllowance, sendTx, loadPortfolio],
  );

  useEffect(() => {
    if (tab === "index" && isConnected) loadPortfolio();
  }, [tab, isConnected, loadPortfolio]);

  const [basis, setBasis] = useState<Record<string, { invested: number; raw: number }>>({});

  useEffect(() => {
    try {
      setBasis(JSON.parse(localStorage.getItem("bindex_basis") ?? "{}"));
    } catch {
      setBasis({});
    }
  }, [portfolio, address, execRows]);

  const portfolioRows = useMemo(() => {
    if (!portfolio) return [];
    return portfolio
      .filter((p) => p.scaledBalance > 0)
      .map((p) => {
        const b = basis[p.ticker] ?? { invested: 0, raw: 0 };
        const value = p.scaledBalance * p.price;
        const cost = p.scaledBalance > 0 && b.raw > 0 ? (p.scaledBalance / b.raw) * b.invested : 0;
        return { ...p, value, cost, pnl: value - cost, pnlPct: cost > 0 ? ((value - cost) / cost) * 100 : 0 };
      })
      .sort((a, b) => b.value - a.value);
  }, [portfolio, basis]);

  const totalValue = portfolioRows.reduce((s, r) => s + r.value, 0);
  const totalCost = portfolioRows.reduce((s, r) => s + r.cost, 0);

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-[#0000FF] focus:px-3 focus:py-2 focus:text-sm focus:text-white"
      >
        Pular para o conteúdo
      </a>
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#05070f]/90 backdrop-blur">
        <div className="safe-x mx-auto flex w-full max-w-3xl items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0000FF] font-bold text-white" aria-hidden="true">b</div>
            <h1 className="text-sm font-semibold" translate="no">
              B20Index AI
              <span className="block text-[10px] font-normal text-zinc-400">índices de ações na Base</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] ${marketOpen ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}>
              {marketOpen ? "mercado aberto" : "mercado fechado"}
            </span>
            {isConnected ? (
              <button
                onClick={() => disconnect()}
                aria-label="Desconectar carteira"
                title="Desconectar carteira"
                className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5"
              >
                {address?.slice(0, 6)}…{address?.slice(-4)}
              </button>
            ) : (
              <button
                onClick={() => connect({ connector: connectors[0] })}
                className="rounded-lg bg-[#0000FF] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
              >
                Conectar carteira
              </button>
            )}
          </div>
        </div>
        <div className="safe-x mx-auto flex w-full max-w-3xl gap-1 pb-2" role="tablist" aria-label="Seções">
          {(["chat", "index"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${tab === t ? "bg-white/10 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              {t === "chat" ? "Agente" : "Meu Índice"}
            </button>
          ))}
        </div>
      </header>

      <main id="conteudo" className="mx-auto w-full max-w-3xl flex-1 safe-x py-6">
        {tab === "chat" ? (
          <div className="flex flex-col gap-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed break-words ${
                    m.role === "user" ? "bg-[#0000FF]/80 text-white" : "bg-white/5 text-zinc-200"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            <div aria-live="polite">
              {thinking && (
                <div className="flex justify-start">
                  <div className="rounded-2xl bg-white/5 px-4 py-3 text-sm text-zinc-400">analisando preços ao vivo…</div>
                </div>
              )}
            </div>

            {proposal && (
              <div className="rounded-2xl border border-[#0000FF]/40 bg-gradient-to-b from-[#0000FF]/10 to-transparent p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#7b7bff]">Proposta de índice</span>
                  <span className="text-[10px] text-zinc-500">aprovada pelo validador da whitelist</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase text-zinc-500">
                      <th className="pb-2">Ticker</th>
                      <th className="pb-2">Preço</th>
                      <th className="pb-2 text-right">Peso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proposal.positions.map((p) => {
                      const pr = priceByTicker[p.ticker];
                      return (
                        <tr key={p.ticker} className="border-t border-white/5">
                          <td className="py-2">
                            <div className="font-semibold" translate="no">{p.ticker}</div>
                            <div className="text-[11px] text-zinc-500 break-words">{p.rationale}</div>
                          </td>
                          <td className="py-2 text-zinc-300 tabular-nums">{pr ? usd(pr.price) : "…"}</td>
                          <td className="py-2 text-right">
                            <div className="font-semibold text-[#7b7bff] tabular-nums">{p.weight}%</div>
                            <div className="mt-1 h-1 w-20 rounded-full bg-white/10 sm:ml-auto" aria-hidden="true">
                              <div className="h-1 rounded-full bg-[#0000FF]" style={{ width: `${Math.min(p.weight * 2, 100)}%` }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {(() => {
                  const minTotal = Math.ceil((PER_POSITION_MIN / Math.min(...proposal.positions.map((p) => p.weight))) * 100 * 100) / 100;
                  const below = parseUsd(investUsd) < minTotal;
                  return (
                    <>
                      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                        <div className={`flex flex-1 items-center rounded-xl border bg-black/30 px-3 ${below ? "border-amber-500/50" : "border-white/15"}`}>
                          <label htmlFor="invest-usd" className="text-xs text-zinc-500">US$</label>
                          <input
                            id="invest-usd"
                            name="invest-usd"
                            value={investUsd}
                            onChange={(e) => setInvestUsd(e.target.value.replace(/[^0-9.,]/g, ""))}
                            inputMode="decimal"
                            autoComplete="off"
                            aria-label="Valor total em dólares americanos"
                            aria-invalid={below}
                            className="w-full bg-transparent px-2 py-2 text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-[#6366f1]"
                            placeholder="20…"
                          />
                        </div>
                        <button
                          onClick={execute}
                          disabled={!isConnected || executing || below}
                          className="rounded-xl bg-[#0000FF] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
                        >
                          {executing ? "Executando…" : isConnected ? "Executar na Base" : "Conecte a carteira"}
                        </button>
                      </div>
                      <p className={`mt-1.5 text-xs ${below ? "text-amber-400" : "text-zinc-500"}`} aria-live="polite">
                        Mínimo {usd(minTotal)} — a menor posição ({Math.min(...proposal.positions.map((p) => p.weight))}%)
                        não pode ficar abaixo de {usd(PER_POSITION_MIN)}
                        {below && " — aumente o valor"}
                      </p>
                      {execError && (
                        <p className="mt-2 rounded-xl border border-red-500/30 bg-red-500/10 p-2.5 text-sm text-red-300" role="alert">
                          {execError}
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {execRows.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4" aria-live="polite">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Execução</div>
                <div className="flex flex-col gap-1.5 text-sm">
                  {execRows.map((r) => (
                    <div key={r.ticker} className="flex items-center justify-between gap-2">
                      <span>
                        {r.ticker} <span className="text-zinc-500">· {usd(r.usd)}</span>
                        {r.txHash && (
                          <a
                            href={`https://basescan.org/tx/${r.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-2 text-[11px] text-[#7b7bff] hover:underline"
                          >
                            Basescan ↗
                          </a>
                        )}
                      </span>
                      <span
                        className={
                          r.status === "done"
                            ? "text-emerald-400"
                            : r.status === "error"
                              ? "text-red-400"
                              : "text-amber-300"
                        }
                      >
                        {r.status === "pending" && "…"}
                        {r.status === "approving" && "aprovando USDC"}
                        {r.status === "swapping" && "trocando"}
                        {r.status === "done" && "✓ concluído"}
                        {r.status === "error" && `erro: ${r.detail}`}
                      </span>
                    </div>
                  ))}
                </div>
                {execRows.every((r) => r.status === "done") && (
                  <button
                    onClick={() => setTab("index")}
                    className="mt-3 w-full rounded-xl border border-emerald-500/40 bg-emerald-500/10 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/20"
                  >
                    Ver Meu Índice →
                  </button>
                )}
              </div>
            )}

            <div ref={chatEndRef} />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {!isConnected ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-sm text-zinc-400">
                Conecte a carteira para ver seu índice.
              </div>
            ) : loadingPortfolio ? (
              <div className="p-8 text-center text-sm text-zinc-400">carregando saldos onchain…</div>
            ) : portfolioRows.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-sm text-zinc-400">
                Nenhuma posição B20 encontrada nesta carteira. Monte um índice no Agente.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-[11px] uppercase text-zinc-500">Valor do índice</div>
                    <div className="text-2xl font-bold tabular-nums">{usd(totalValue)}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-[11px] uppercase text-zinc-500">P&L (custo local)</div>
                    <div className={`text-2xl font-bold tabular-nums ${totalValue - totalCost >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {usd(totalValue - totalCost)}
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase text-zinc-500">
                        <th className="pb-2">Ticker</th>
                        <th className="pb-2 text-right">Qtd (scaled)</th>
                        <th className="pb-2 text-right">Preço</th>
                        <th className="pb-2 text-right">Valor</th>
                        <th className="pb-2 text-right">P&L</th>
                        <th className="pb-2 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {portfolioRows.map((r) => (
                        <tr key={r.ticker} className="border-t border-white/5">
                          <td className="py-2 font-semibold" translate="no">{r.ticker}</td>
                          <td className="py-2 text-right text-zinc-400 tabular-nums">{r.scaledBalance.toFixed(6)}</td>
                          <td className="py-2 text-right text-zinc-300 tabular-nums">{usd(r.price)}</td>
                          <td className="py-2 text-right tabular-nums">{usd(r.value)}</td>
                          <td className={`py-2 text-right tabular-nums ${r.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {r.cost > 0 ? `${usd(r.pnl)} (${r.pnlPct.toFixed(1)}%)` : "—"}
                          </td>
                          <td className="py-2 text-right">
                            <button
                              onClick={() => sellPosition(r)}
                              disabled={sellingTicker !== null || executing}
                              className="rounded-lg border border-red-500/40 px-2.5 py-1 text-[11px] font-medium text-red-300 hover:bg-red-500/10 disabled:opacity-40"
                            >
                              {sellingTicker === r.ticker ? "vendendo…" : "Vender"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {sellMsg && (
                    <p className="mt-3 rounded-xl border border-white/15 bg-white/5 p-2.5 text-xs text-zinc-300" aria-live="polite">
                      {sellMsg}
                    </p>
                  )}
                  <button
                    onClick={loadPortfolio}
                    className="mt-3 w-full rounded-xl border border-white/15 py-2 text-xs text-zinc-300 hover:bg-white/5"
                  >
                    atualizar preços onchain
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </main>

      {tab === "chat" && (
        <div className="safe-bottom sticky bottom-0 border-t border-white/10 bg-[#05070f]/95 backdrop-blur">
          <div className="safe-x mx-auto w-full max-w-3xl pt-3">
            {messages.length <= 1 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="rounded-full border border-white/15 px-3 py-1 text-xs text-zinc-300 hover:bg-white/5"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage(input);
              }}
              className="flex gap-2"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                name="prompt"
                id="prompt"
                autoComplete="off"
                aria-label="Descreva o índice desejado"
                placeholder="quero exposição a IA, sem Tesla…"
                className="flex-1 rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-sm focus:border-[#0000FF] focus-visible:outline-2 focus-visible:outline-[#6366f1]"
              />
              <button
                type="submit"
                disabled={thinking}
                className="rounded-xl bg-[#0000FF] px-5 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
              >
                {thinking ? "Enviando…" : "Enviar"}
              </button>
            </form>
            <p className="mt-2 text-center text-[10px] text-zinc-600">
              Coinbase Tokenized Stocks (B20) · Reg S: apenas jurisdições elegíveis fora dos EUA · não é recomendação de investimento
            </p>
            <p className="mt-1 text-center text-[10px]">
              <a
                href="https://onchaindonation.vercel.app"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-500 hover:text-[#7b7bff] hover:underline"
              >
                Onchain Donation Agent — doações onchain pelo mesmo construtor
              </a>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}



