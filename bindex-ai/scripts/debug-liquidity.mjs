import { createPublicClient, http, fallback, encodeFunctionData, parseAbi } from "viem";
import { base } from "viem/chains";

const client = createPublicClient({
  chain: base,
  transport: fallback([
    http("https://base.publicnode.com"),
    http("https://base.llamarpc.com"),
  ]),
});

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const WETH = "0x4200000000000000000000000000000000000006";
const NVDA = "0xb20000000000000000000078ee7ce2fE4908108C";
const AAPL = "0xb200000000000000000000C2e324d24d7eEcd1fb";
const ROUTER = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43";
const FACTORY = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da";

const factoryAbi = parseAbi(["function getPool(address, address, bool) view returns (address)"]);
const poolAbi = parseAbi([
  "function getReserves() view returns (uint256, uint256, uint256)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
]);
const routerAbi = parseAbi([
  "function getAmountsOut(uint256, (address,address,bool,address)[]) view returns (uint256[])",
]);

const routes = [
  ["NVDA volatil direto", USDC, NVDA, false],
  ["NVDA stable direto", USDC, NVDA, true],
  ["NVDA via WETH volatil", null, null, false],
];

for (const [name, a, b, stable] of [[
  "NVDA direto volatil", USDC, NVDA, false,
], ["NVDA direto stable", USDC, NVDA, true]]) {
  const pool = await client.readContract({ address: FACTORY, abi: factoryAbi, functionName: "getPool", args: [a, b, stable] });
  console.log(`${name}: pool = ${pool}`);
  if (pool !== "0x0000000000000000000000000000000000000000") {
    const [r0, r1] = await client.readContract({ address: pool, abi: poolAbi, functionName: "getReserves" });
    const t0 = await client.readContract({ address: pool, abi: poolAbi, functionName: "token0" });
    const t1 = await client.readContract({ address: pool, abi: poolAbi, functionName: "token1" });
    const isUsdc0 = t0.toLowerCase() === USDC.toLowerCase();
    const resUsdc = isUsdc0 ? r0 : r1;
    const resTok = isUsdc0 ? r1 : r0;
    console.log(`  reserves USDC=${Number(resUsdc) / 1e6} TOK=${Number(resTok) / 1e18} | preco TOK=$${(Number(resUsdc) / 1e6) / (Number(resTok) / 1e18)}`);
  }
}

const wethPool = await client.readContract({ address: FACTORY, abi: factoryAbi, functionName: "getPool", args: [USDC, WETH, false] });
const wethNvdaPool = await client.readContract({ address: FACTORY, abi: factoryAbi, functionName: "getPool", args: [WETH, NVDA, false] });
console.log(`USDC/WETH pool: ${wethPool}`);
console.log(`WETH/NVDAc pool: ${wethNvdaPool}`);

try {
  const out = await client.readContract({
    address: ROUTER,
    abi: routerAbi,
    functionName: "getAmountsOut",
    args: [5000000n, [{ from: USDC, to: NVDA, stable: false, factory: FACTORY }]],
  });
  console.log("getAmountsOut direto:", out.map((x) => x.toString()));
} catch (e) {
  console.log("getAmountsOut direto ERRO:", e.shortMessage);
}

try {
  const out = await client.readContract({
    address: ROUTER,
    abi: routerAbi,
    functionName: "getAmountsOut",
    args: [5000000n, [
      { from: USDC, to: WETH, stable: false, factory: FACTORY },
      { from: WETH, to: NVDA, stable: false, factory: FACTORY },
    ]],
  });
  console.log("getAmountsOut via WETH:", out.map((x) => x.toString()));
} catch (e) {
  console.log("getAmountsOut via WETH ERRO:", e.shortMessage);
}
