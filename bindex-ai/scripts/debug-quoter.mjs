import { createPublicClient, http, fallback, encodeFunctionData, getAddress } from "viem";
import { base } from "viem/chains";

const client = createPublicClient({
  chain: base,
  transport: fallback([http("https://base.publicnode.com"), http("https://base.llamarpc.com")]),
});

const USDC = getAddress("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
const NVDA = getAddress("0xb20000000000000000000078ee7ce2fE4908108C");
const QUOTER = getAddress("0x3d4e44Eb1374240CE5F74B896E16807AD4507537");

const quoterAbi = [
  {
    name: "quoteExactInputSingle",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
];

const data = encodeFunctionData({
  abi: quoterAbi,
  functionName: "quoteExactInputSingle",
  args: [{ tokenIn: USDC, tokenOut: NVDA, amountIn: 5000000n, fee: 3000, sqrtPriceLimitX96: 0n }],
});
console.log("calldata:", data);

try {
  const res = await client.call({ to: QUOTER, data });
  console.log("client.call res:", res);
} catch (e) {
  console.log("client.call ERRO:", e.shortMessage, e.details ?? "");
}

try {
  const out = await client.readContract({
    address: QUOTER,
    abi: quoterAbi,
    functionName: "quoteExactInputSingle",
    args: [{ tokenIn: USDC, tokenOut: NVDA, amountIn: 5000000n, fee: 3000, sqrtPriceLimitX96: 0n }],
  });
  console.log("readContract out:", out);
} catch (e) {
  console.log("readContract ERRO:", e.shortMessage, e.details ?? "");
}
