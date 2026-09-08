# B20Index AI — Especificação do Projeto

> **Pitch:** *Descreva o que você quer. A IA monta, executa e mantém seu portfólio de ações tokenizadas na Base.*
>
> Mini App onde o usuário conversa em linguagem natural (ex.: *"quero exposição a IA, sem Tesla"*) e um agente retorna um portfólio ponderado dos Tokenized Stocks (B20) emitidos pela Coinbase, executa os swaps com a carteira do usuário e monitora/rebalanceia com P&L em tempo real.

---

## 1. Evento: Base Builder Quest — Tokenized Stocks

| Item | Detalhe |
|---|---|
| Tarefa | Construir um projeto que ajude pessoas a **negociar ou usar Ações Tokenizadas da Coinbase no Base** |
| Premiação | **$2.000** projeto principal + **$3.000** divididos entre 5 finalistas |
| Deadline | **9 de setembro de 2026, 23:59 EST** (= 10/09/2026, 00:59 BRT → enviar até ~20h BRT de 09/09 por segurança) |
| Submissão 1 | Loom de demo publicado no X, marcando **@buildonbase** |
| Submissão 2 | Formulário Google Docs "Base Builder Quest - Tokenized Stocks" |
| Seleção | A critério da Base, notificação por e-mail |
| Legal | 18+, nulo onde proibido, sujeito a revisão de política interna |

### Frentes sugeridas pela Base (RFB)
1. Neobrokerages  ← *cobrimos*
2. Personalized Index Creation  ← *cobrimos (core)*
3. Gifting and Rewards
4. Yield Stripping and Credit
5. Memes and Agents  ← *cobrimos (agente AI)*

---

## 2. Por que vence

- Cobre **3 das 5 frentes** do RFB oficial; "AI indexes" foi exemplo citado pela própria Base no anúncio
- **Zero contratos próprios no MVP** → build em dias, risco mínimo, compliance simples (negociação B20 é permissionless; KYC só em mint/redeem pelos Authorized Participants)
- Demo Loom de 2–3 min com momento "uau": prompt → portfólio → swap real onchain
- Distribuição nativa como **Mini App** (roda na Base App e no browser)

---

## 3. Fundamentos técnicos (docs atualizadas da Base)

### 3.1 B20 — o padrão das ações tokenizadas
- Extensão de ERC-20, implementado como **precompile nativo** no upgrade **Beryl** (auditorias: Base + Spearbit; bounty: Cantina + HackerOne)
- ⚠️ **Não há bytecode/contrato verificado por endereço no Basescan** (precompiles)
- **Multipliers**: 1 token ≠ permanentemente 1 share. Dividendos/splits alteram `multiplier()` (WAD, 18 decimais)
  - `scaledBalanceOf(account)` = saldo raw × multiplier → **usar sempre para valuation**
  - `toScaledBalance(raw)` / `toRawBalance(scaled)` — conversões
  - Agendado (ERC-8056): `updateUIMultiplier`; emergência: `updateMultiplier` (deprecated)
- **Policies**: `isAuthorized(policyID, account)` pode bloquear transferências (sanções). `approve()` não é policy-gated
- **Announcements**: eventos `Announcement`/`EndAnnouncement` para corporate actions
- `transferWithMemo(bytes32)` para anexar referências offchain
- Descoberta de novos tokens: evento **`B20Created`** na factory; identificar tokens **por endereço**, nunca por símbolo
- Registry onchain: `0x3f3E8cf41cdd3b1D118c16471aB0113DfDDd5CaD`

### 3.2 Contratos dos tokens (Base Mainnet, chain 8453)

**Whitelist ativa (10 tickers — decisão de liquidez 07/09)**: AAPLc, NVDAc, METAc, GOOGLc, AMZNc, MSFTc, MSTRc, TSLAc, SPCXc, SNDKc. COINc e CRCLc ficam **fora** (sem liquidez DEX encontrada); INTCc fora (sem pool utilizável).

| Ticker | Empresa | Contrato |
|---|---|---|
| AAPLc | Apple | `0xb200000000000000000000C2e324d24d7eEcd1fb` |
| NVDAc | NVIDIA | `0xb20000000000000000000078ee7ce2fE4908108C` |
| METAc | Meta | `0xb2000000000000000000008bC8786B856E61707C` |
| GOOGLc | Alphabet | `0xb2000000000000000000002D0BA3164cc74f58B7` |
| AMZNc | Amazon | `0xb200000000000000000000d9192b6B456483C2E8` |
| MSFTc | Microsoft | `0xB200000000000000000000Ab99cFa739E253872B` |
| MSTRc | MicroStrategy | `0xb2000000000000000000004884b426556b92883d` |
| TSLAc | Tesla | `0xb2000000000000000000001e800a7f5189430cD0` |
| SPCXc | SpaceX | `0xb2000000000000000000007b9fcbd005511aCBd5` |
| SNDKc | SanDisk | `0xb200000000000000000000397293Cb8cda9a10c5` |

⚠️ Sempre validar contra base.org/stocks. Se o token não está na lista, a Coinbase não emitiu.
⚠️ **B20 tem 8 decimais** (não 18) — validado onchain via `decimals()`.

### 3.3 Feeds Chainlink (Total Return, 8 decimais, 24/5)

| Feed | Proxy |
|---|---|
| AAPL | `0x787f13dEa48Db0897CbCDD985de77809D837F988` |
| AMZN | `0x06A8E4b3aBB3B7543d8396FB2B763d22820cB295` |
| COIN | `0x408e44f504A7371a345F03a73dDC96A4b48e8aa7` |
| CRCL | `0x0231cF2635D1E17bB5c2462cc7504Ba1fBd61f33` |
| GOOGL | `0x5bF49E0ffA937CE2FfF033c739aD7C634c4D34F2` |
| INTC | `0xAB657C39bac0D5886250D70849e2E3E008F2EECB` |
| META | `0x6526aE6797A76123638b863AeE4dD27Ba4E4b27D` |
| MSFT | `0xeB10A6c9aa7E537aEd766C08c35Dae35B321b18c` |
| MSTR | `0xB3cE282CD188b35DA0E38D8Bc7d58e33173D202a` |
| NVDA | `0x04689a41629776563E6822F76f2e57D148d28513` |
| SNDK | `0x388b0dC46C0Fb05A74BeE0994fa5b02c6Fcca2eA` |
| SPCX | `0x6A634B235903C4ad6376892180d6fF8612e3Fa68` |
| TSLA | `0xFaf869185383a24F8cb00e27BdA6b63B9905DCb4` |

**Regras do feed:**
- `Token Price = Preço da ação × Multiplier` (Total Return, inclui dividendos)
- Atualiza com desvio 0,5% ou heartbeat 24h; **fora do pregão congela** (fins de semana, feriados, corporate actions)
- ⚠️ **Sempre ler `updatedAt` e aplicar bound de staleness**; nunca liquidar contra feed congelado
- `latestRoundData()` interface V3 padrão, ler via proxy

### 3.4 Liquidez e execução (mapeada onchain em 07/09)

- **LiFi Aggregator** (`li.quest/v1`) = **rota primária** — funciona sem chave (200 req/2h), 10/10 tickers a preço de mercado, roteia internamente por 1inch/Fly/KyberSwap (inclui Uniswap V4, onde está a liquidez real: NVDAc ~$2,3M, AAPLc ~$1,5M)
- **Uniswap V3 direto** = fallback onchain puro (slot0 + sanity vs Chainlink) p/ 10/10; NVDAc V3 ~8% defasado → só cai aqui se LiFi indisponível
- **0x Swap API**: bloqueia B20 (422 `BUY_TOKEN_NOT_AUTHORIZED_FOR_TRADE`) — não usar
- **Aerodrome**: apenas pools-dust nos pares B20 — não usar
- Spender LiFi = Diamond `0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE`
- Lending (roadmap): Morpho, Aave, Euler

### 3.5 Ecossistema/desenvolvimento
- **Base MCP**: `https://mcp.base.org` (agentes AI onchain; aprovação via Base Account)
- **Base Skills**: `npx skills add base/base-skills`
- **Base Account SDK**: `@base-org/account` (sub-accounts, spend permissions, `pay()`)
- **Mini App**: `@coinbase/onchainkit` + metadata de embed no `layout.tsx`

---

## 4. Arquitetura do MVP

```
┌─────────────────────────────────────────────────────┐
│  Mini App (Next.js + OnchainKit + Base Account)     │
│                                                     │
│  Tela 1: Chat        Tela 2: Proposta    Tela 3: Índice
│  linguagem natural → portfólio + pesos → P&L/rebalance
└──────────┬──────────────────────────────────────────┘
           │
   ┌───────┴────────┐         ┌──────────────────┐
   │ API /chat      │         │ API /prices      │
   │ LLM function-  │◄────────│ Chainlink feeds  │
   │ calling        │ contexto│ + multiplier B20 │
   │ whitelist B20  │ preços  │ + staleness      │
   └───────┬────────┘         └──────────────────┘
           │ proposta JSON {ticker, peso%, rationale}
   ┌───────┴────────┐
   │ API /swap      │  0x Swap API v2 (fallback Aerodrome)
   │ USDC → B20×N   │  execução pela carteira do usuário
   └────────────────┘
```

### Fluxo do usuário
1. **Chat**: usuário descreve objetivo em linguagem natural
2. **Proposta**: tabela com tickers, pesos (soma 100%), preços live, rationale — botão "Executar"
3. **Execução**: batch de swaps USDC→B20 assinados na carteira (Base Account)
4. **Meu Índice**: `scaledBalanceOf × preço feed` = valor; P&L; botão "Rebalancear"

### Restrições do agente (function-calling)
- Tickers: **apenas** a whitelist dos 13 B20s (por endereço)
- Pesos: inteiros, soma exatamente 100
- Proibições do usuário respeitadas (ex.: "sem Tesla")
- Valor mínimo por posição p/ evitar poeira (gas)

---

## 5. Stack exata

| Camada | Escolha |
|---|---|
| Framework | Next.js (App Router, TypeScript, Tailwind) |
| Wallet | Base Account SDK + OnchainKit |
| Onchain reads | viem (public client Base 8453) |
| Swaps | 0x Swap API v2 → fallback Aerodrome Router |
| IA | LLM API com tool-calling restrito (chave em env) |
| Dev speedup | Base MCP (`https://mcp.base.org`) + base-skills |
| Deploy | Vercel |

---

## 6. Cronograma (7/9 → 9/9)

### Hoje (Seg 7)
- [x] Estrutura + SPEC.md
- [x] Scaffold `bindex-ai`
- [x] Testar liquidez: Aerodrome tem pools-dust; **liquidez real = Uniswap V3** (fee 0.3%/1%); 0x como primário
- [x] **Descoberta: B20 tem 8 decimais** (como os feeds) — corrigido em todo o código
- [x] Módulo preços: feeds Chainlink + multiplier + staleness (13/13 tickers ao vivo ✓)
- [x] Chat com proposta de portfólio (validador whitelist + retry) — aguarda chave OpenRouter
- [x] Cotação de swaps: 0x (primário) → Uniswap V3 slot0 + sanity Chainlink (AAPL 0,2% dev ✓)

### Amanhã (Ter 8)
- [x] Chaves no .env.local (OpenRouter ✓, 0x ✓ porém bloqueada p/ B20, LiFi keyless ✓)
- [x] Agente validado E2E: "índice de IA sem Tesla" → GOOGLc 40% + MSFTc 40% + METAc 20% ✓
- [x] Cotação LiFi 10/10 tickers a preço de mercado ✓
- [ ] Execução de swaps via carteira (valores pequenos, mainnet)
- [ ] Aba "Meu Índice" com P&L — teste real
- [ ] Polish visual + deploy Vercel
- [ ] Rehearsal completo do fluxo

### Terça 9 (enviar até 20h BRT)
- [ ] Gravar Loom (roteiro abaixo)
- [ ] Post no X @buildonbase com link do Loom
- [ ] Formulário Google Docs
- [ ] (Opcional) aplicar Base Batches 004

---

## 7. Roteiro do Loom (2m30s máx)

| Tempo | Conteúdo |
|---|---|
| 0:00–0:15 | Problema: "Comprar ações dos EUA de fora é caro e burocrático. E se você pudesse apenas... pedir?" |
| 0:15–1:30 | **Demo**: digitar prompt no chat → proposta de portfólio aparece com preços reais → clicar Executar → swaps confirmados na Base → aba Meu Índice com P&L |
| 1:30–2:00 | Stack: B20 nativo da Base, feeds Chainlink, 0x, Base Account. "Zero contratos próprios — usamos exatamente o que a Base nos dá" |
| 2:00–2:30 | Visão: rebalanceamento contínuo, lending com Morpho, gifting. CTA: "bIndex — seu índice, suas regras, onchain." |

---

## 8. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Liquidez 0x insuficiente p/ B20 | Testar quote no dia 1; fallback Aerodrome Router direto |
| Feed congelado (fora do pregão) | Exibir `updatedAt` + badge "mercado fechado"; nunca travar a UI |
| Multiplier muda durante demo | Ler sempre `scaledBalanceOf`; cache curto |
| Jurisdição (Reg S, não-US) | Disclaimer na UI; geo-check simples; sem mint/redeem |
| Tempo curto | Escopo congelado; polimento > features |

---

## 9. Contratos próprios (CONTINGÊNCIA — não no MVP)

Só se necessário. Código Solidity será **gerado para deploy manual via Remix** pelo dono do projeto:

- **`IndexVault.sol`** (plano B): deposita USDC, emite shares do índice, rebalanceia via 0x; dono deploya no Remix e informa o endereço ao app
- Instruções incluirão: versão do compilador, args de deploy, endereços B20, rede Base Mainnet 8453

---

## 10. Checklist final de submissão

- [ ] Demo funcional e estável (URL pública)
- [ ] Loom ≤ 3 min, áudio claro, marcando @buildonbase no post do X
- [ ] Formulário: nome, link do repo, link do app, link do Loom
- [ ] Repo com README (setup, stack, endereços usados)
- [ ] Disclaimer Reg S / não-US visível no app
- [ ] Enviado até ~20h BRT de 09/09/2026

