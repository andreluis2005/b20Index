import { createPublicClient, http, erc20Abi, fallback } from "viem";
import { base } from "viem/chains";

const client = createPublicClient({
  chain: base,
  transport: fallback([
    http("https://base.publicnode.com"),
    http("https://base.llamarpc.com"),
    http("https://1rpc.io/base"),
    http("https://mainnet.base.org"),
  ]),
});

const AAPL_TOKEN = "0xb200000000000000000000C2e324d24d7eEcd1fb";
const NVDA_TOKEN = "0xb20000000000000000000078ee7ce2fE4908108C";
const AAPL_FEED = "0x787f13dEa48Db0897CbCDD985de77809D837F988";
const NVDA_FEED = "0x04689a41629776563E6822F76f2e57D148d28513";

const aggregatorAbi = [
  {
    name: "latestRoundData",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
];

const b20AssetAbi = [
  {
    name: "multiplier",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "scaledBalanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
];

const now = Math.floor(Date.now() / 1000);

const aaplFeed = await client.readContract({ address: AAPL_FEED, abi: aggregatorAbi, functionName: "latestRoundData" });
const nvdaFeed = await client.readContract({ address: NVDA_FEED, abi: aggregatorAbi, functionName: "latestRoundData" });
const aaplSym = await client.readContract({ address: AAPL_TOKEN, abi: erc20Abi, functionName: "symbol" });
const nvdaSym = await client.readContract({ address: NVDA_TOKEN, abi: erc20Abi, functionName: "symbol" });
const aaplMult = await client.readContract({ address: AAPL_TOKEN, abi: b20AssetAbi, functionName: "multiplier" });
const nvdaMult = await client.readContract({ address: NVDA_TOKEN, abi: b20AssetAbi, functionName: "multiplier" });

for (const [name, feed] of [["AAPL", aaplFeed], ["NVDA", nvdaFeed]]) {
  const price = Number(feed[1]) / 1e8;
  const age = now - Number(feed[3]);
  console.log(`${name} feed: $${price.toFixed(2)} | updatedAt: ${age}s atrás | round ${feed[0]}`);
}

console.log(`AAPLc symbol: ${aaplSym} | multiplier: ${Number(aaplMult) / 1e18}`);
console.log(`NVDAc symbol: ${nvdaSym} | multiplier: ${Number(nvdaMult) / 1e18}`);
console.log("OK: leituras onchain funcionando");
