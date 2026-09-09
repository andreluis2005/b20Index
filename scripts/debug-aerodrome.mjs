import { createPublicClient, http, fallback } from "viem";
import { base } from "viem/chains";

const client = createPublicClient({
  chain: base,
  transport: fallback([http("https://base.publicnode.com"), http("https://base.llamarpc.com")]),
});

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const WETH = "0x4200000000000000000000000000000000000006";
const FACTORY = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da";

const STOCKS = {
  AAPLc: "0xb200000000000000000000C2e324d24d7eEcd1fb",
  AMZNc: "0xb200000000000000000000d9192b6B456483C2E8",
  COINc: "0xb200000000000000000000c85a31389D71F3ecfb",
  CRCLc: "0xB20000000000000000000019f6E7C675b73C2e4D",
  GOOGLc: "0xb2000000000000000000002D0BA3164cc74f58B7",
  INTCc: "0xB2000000000000000000004AFF16039bA04bdFBc",
  METAc: "0xb2000000000000000000008bC8786B856E61707C",
  MSFTc: "0xB200000000000000000000Ab99cFa739E253872B",
  MSTRc: "0xb2000000000000000000004884b426556b92883d",
  NVDAc: "0xb20000000000000000000078ee7ce2fE4908108C",
  SNDKc: "0xb200000000000000000000397293Cb8cda9a10c5",
  SPCXc: "0xb2000000000000000000007b9fcbd005511aCBd5",
  TSLAc: "0xb2000000000000000000001e800a7f5189430cD0",
};

const factoryAbi = [
  { name: "getPool", type: "function", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }, { type: "bool" }], outputs: [{ type: "address" }] },
];
const poolAbi = [
  { name: "getReserves", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }] },
  { name: "token0", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
];

for (const [ticker, addr] of Object.entries(STOCKS)) {
  for (const against of [["USDC", USDC], ["WETH", WETH]]) {
    for (const stable of [false, true]) {
      const pool = await client.readContract({ address: FACTORY, abi: factoryAbi, functionName: "getPool", args: [addr, against[1], stable] });
      if (pool !== "0x0000000000000000000000000000000000000000") {
        const [r0, r1] = await client.readContract({ address: pool, abi: poolAbi, functionName: "getReserves" });
        const t0 = await client.readContract({ address: pool, abi: poolAbi, functionName: "token0" });
        const isStock0 = t0.toLowerCase() === addr.toLowerCase();
        const stockRes = isStock0 ? r0 : r1;
        const otherRes = isStock0 ? r1 : r0;
        if (otherRes > 0n) {
          console.log(`${ticker}/${against[0]} stable=${stable} pool=${pool} stockRes=${stockRes} otherRes=${otherRes}`);
        }
      }
    }
  }
}
console.log("fim");

