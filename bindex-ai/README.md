# B20Index AI

> Descreva o que você quer. A IA monta, executa e mantém seu portfólio de ações tokenizadas (B20) na Base.

Mini App criado para o **Base Builder Quest — Tokenized Stocks** (set/2026).

## Como funciona

1. **Chat**: o usuário descreve a exposição desejada em linguagem natural
2. **Agente**: LLM (OpenRouter) propõe um índice com pesos — validado contra a whitelist dos 13 B20s emitidos pela Coinbase
3. **Execução**: swaps USDC → B20 assinados pela sua carteira (0x Swap API com fallback Uniswap V3 direto)
4. **Meu Índice**: saldos onchain (`scaledBalanceOf` × multiplier B20) × preços Chainlink = P&L

## Stack

- Next.js 16 (App Router) + Tailwind
- wagmi + viem (Base Mainnet 8453)
- Feeds Chainlink (Total Return, 8 decimais, com detecção de staleness)
- B20: `multiplier()` e `scaledBalanceOf()` — native precompiles do upgrade Beryl
- 0x Swap API v2 (AllowanceHolder) → fallback Uniswap V3 (quoting via `slot0` + sanity check vs Chainlink)

## Rodando

```bash
npm install
cp .env.example .env.local   # preencha OPENROUTER_API_KEY e ZEROX_API_KEY
npm run dev
```

Scripts de verificação onchain (sem chave):

```bash
node scripts/verify-onchain.mjs
```

## Avisos

- Coinbase Tokenized Stocks são emitidos pela Coinbase sob Reg S — **apenas jurisdições elegíveis fora dos EUA**
- Negociação secundária é permissionless; mint/redeem restrito a Authorized Participants
- Este software é experimental; não constitui recomendação de investimento

