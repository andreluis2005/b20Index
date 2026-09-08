import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type PriceRow = {
  ticker: string;
  name: string;
  sector: string;
  price: number;
  stale: boolean;
};

type Body = {
  messages: { role: "user" | "assistant"; content: string }[];
  prices: PriceRow[];
};

const TOOL_SCHEMA = {
  type: "function",
  function: {
    name: "propose_portfolio",
    description:
      "Propose a tokenized-stock index portfolio on Base. Call exactly once at the end of your reasoning.",
    parameters: {
      type: "object",
      properties: {
        positions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              ticker: { type: "string" },
              weight: { type: "number" },
              rationale: { type: "string" },
            },
            required: ["ticker", "weight", "rationale"],
          },
        },
        summary: { type: "string" },
      },
      required: ["positions", "summary"],
    },
  },
} as const;

function systemPrompt(prices: PriceRow[]): string {
  const list = prices
    .map(
      (p) =>
        `- ${p.ticker} (${p.name}) — setor: ${p.sector} — preço US$ ${p.price.toFixed(2)}${p.stale ? " [feed defasado: mercado fechado]" : ""}`,
    )
    .join("\n");
  return `Você é o agente do bIndex AI, um Mini App na blockchain Base que monta índices personalizados de Coinbase Tokenized Stocks (tokens B20).

REGRAS ABSOLUTAS:
1. Use APENAS os tickers da lista abaixo. Nenhum outro ativo existe.
2. Pesos são porcentagens inteiras (1–100) e SOMAM EXATAMENTE 100.
3. Entre 2 e 6 posições por portfólio.
4. Respeite exclusões pedidas pelo usuário (ex.: "sem Tesla" = nunca inclua TSLAc).
5. Nunca dê conselho de investimento garantido; fale em termos de exposição e concentração.
6. Responda no idioma do usuário (padrão: português).
7. Quando o usuário pedir um portfólio ou ajuste, chame propose_portfolio UMA vez com o resultado final. O summary deve ter no máximo 3 frases, explicando a lógica.

CATÁLOGO DISPONÍVEL (preços ao vivo agora):
${list}

Ações B20 são lastreadas 1:1 em ações reais sob custódia regulada (emitidas pela Coinbase, Reg S — apenas jurisdições fora dos EUA). Dividendos viram multiplier, não caixa.`;
}

function validateProposal(raw: any, prices: PriceRow[]) {
  const valid = new Map(prices.map((p) => [p.ticker.toUpperCase(), p]));
  const positions = raw?.positions;
  if (!Array.isArray(positions) || positions.length < 2 || positions.length > 6) {
    return { ok: false as const, error: "Portfólio precisa de 2 a 6 posições" };
  }
  const seen = new Set<string>();
  let total = 0;
  const clean = [];
  for (const p of positions) {
    const upper = String(p.ticker ?? "").toUpperCase();
    const canonical = valid.get(upper);
    if (!canonical) {
      return { ok: false as const, error: `Ticker inválido: ${upper}` };
    }
    if (seen.has(upper)) {
      return { ok: false as const, error: `Ticker repetido: ${upper}` };
    }
    seen.add(upper);
    const weight = Math.round(Number(p.weight));
    if (!Number.isFinite(weight) || weight < 1 || weight > 100) {
      return { ok: false as const, error: `Peso inválido para ${upper}` };
    }
    total += weight;
    clean.push({ ticker: canonical.ticker, weight, rationale: String(p.rationale ?? "").slice(0, 200) });
  }
  if (total !== 100) {
    return { ok: false as const, error: `Pesos somam ${total}, precisam somar 100` };
  }
  return { ok: true as const, positions: clean, summary: String(raw?.summary ?? "").slice(0, 400) };
}

export async function POST(req: NextRequest) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY ausente em .env.local" },
      { status: 500 },
    );
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const messages = (body.messages ?? [])
    .filter((m) => m && typeof m.content === "string" && m.content.trim())
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));

  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "Última mensagem deve ser do usuário" }, { status: 400 });
  }

  const model = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";
  const sys = systemPrompt(body.prices ?? []);

  const callOpenRouter = (msgs: any[]) =>
    fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://bindex-ai.vercel.app",
        "X-Title": "bIndex AI",
      },
      body: JSON.stringify({
        model,
        messages: msgs,
        tools: [TOOL_SCHEMA],
        tool_choice: "auto",
        temperature: 0.4,
        max_tokens: 900,
      }),
    });

  try {
    let res = await callOpenRouter([
      { role: "system", content: sys },
      ...messages,
    ]);
    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json(
        { error: `OpenRouter ${res.status}`, detail: detail.slice(0, 500) },
        { status: 502 },
      );
    }
    let data = await res.json();
    const choice = data.choices?.[0]?.message;

    const toolCall = choice?.tool_calls?.find(
      (t: any) => t?.function?.name === "propose_portfolio",
    );

    if (!toolCall) {
      return NextResponse.json({
        reply:
          choice?.content ??
          "Não consegui propor um portfólio. Tente reformular (ex.: 'monte um índice de IA sem Tesla').",
        proposal: null,
      });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch {
      return NextResponse.json({ error: "Resposta do modelo não é JSON válido" }, { status: 502 });
    }

    let check = validateProposal(parsed, body.prices ?? []);
    if (!check.ok) {
      const retryRes = await callOpenRouter([
        { role: "system", content: sys },
        ...messages,
        choice,
        {
          role: "tool",
          tool_call_id: toolCall.id,
          content: `ERRO DE VALIDAÇÃO: ${check.error}. Corrija e chame propose_portfolio novamente respeitando todas as regras.`,
        },
      ]);
      if (retryRes.ok) {
        const retryData = await retryRes.json();
        const retryMsg = retryData.choices?.[0]?.message;
        const retryCall = retryMsg?.tool_calls?.find(
          (t: any) => t?.function?.name === "propose_portfolio",
        );
        if (retryCall) {
          try {
            const retryParsed = JSON.parse(retryCall.function.arguments);
            const retryCheck = validateProposal(retryParsed, body.prices ?? []);
            if (retryCheck.ok) {
              return NextResponse.json({
                reply: retryCheck.summary,
                proposal: { positions: retryCheck.positions, summary: retryCheck.summary },
              });
            }
          } catch {}
        }
      }
      return NextResponse.json({
        reply: `Não consegui gerar um portfólio válido (${check.error}). Tente simplificar o pedido.`,
        proposal: null,
      });
    }

    return NextResponse.json({
      reply: check.summary,
      proposal: { positions: check.positions, summary: check.summary },
    });
  } catch (e) {
    console.error("chat error", e);
    return NextResponse.json({ error: "Falha no agente", detail: String(e) }, { status: 500 });
  }
}
