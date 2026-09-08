import { createPublicClient, http, fallback } from "viem";
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
const UNI_V3_FACTORY = "0x33128a8fC17869897dcE68Ed026d694621f6FDfD";

const tokens = {
  NVDAc: "0xb20000000000000000000078ee7ce2fE4908108C",
  AAPLc: "0xb200000000000000000000C2e324d24d7eEcd1fb",
  TSLAc: "0xb2000000000000000000001e800a7f5189430cD0",
  METAc: "0xb2000000000000000000008bC8786B856E61707C",
  MSFTc: "0xB200000000000000000000Ab99cFa739E253872B",
  GOOGLc: "0xb2000000000000000000002D0BA3164cc74f58B7",
  COINc: "0xb200000000000000000000c85a31389D71F3ecfb",
  MSTRc: "0xb2000000000000000000004884b426556b92883d",
};

const factoryAbi = [
  {
    name: "getPool",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "fee", type: "uint24" },
    ],
    outputs: [{ name: "", type: "address" }],
  },
]

const slot0Abi = [
  {
    name: "slot0",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
  },
]

const poolAbi = [...slot0Abi, {
  name: "liquidity",
  type: "function",
  stateMutability: "view",
  inputs: [],
  outputs: [{ name: "", type: "uint128" }],
}]

const fees = [100, 500, 3000, 10000];

for (const [ticker, addr] of Object.entries(tokens)) {
  for (const against of [["USDC", USDC], ["WETH", WETH]]) {
    for (const fee of fees) {
      const pool = await client.readContract({
        address: UNI_V3_FACTORY,
        abi: factoryAbi,
        functionName: "getPool",
        args: [addr, against[1], fee],
      });
      if (pool !== "0x0000000000000000000000000000000000000000") {
        const [slot0, liq] = await Promise.all([
          client.readContract({ address: pool, abi: slot0Abi, functionName: "slot0" }),
          client.readContract({ address: pool, abi: poolAbi, functionName: "liquidity" }),
        ]);
        console.log(`${ticker}/${against[0]} fee=${fee} pool=${pool} liq=${liq.toString()} sqrtPrice=${slot0[0].toString()}`);
      }
    }
  }
}
console.log("done");


