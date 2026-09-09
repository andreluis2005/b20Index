import { createPublicClient, http, fallback, decodeAbiParameters, parseAbiParameters } from "viem";
import { base } from "viem/chains";

const client = createPublicClient({
  chain: base,
  transport: fallback([
    http("https://base.publicnode.com"),
    http("https://base.llamarpc.com"),
    http("https://1rpc.io/base"),
  ]),
});

const AAPL_FEED = "0x787f13dEa48Db0897CbCDD985de77809D837F988";

const selectors = {
  latestRoundData: "0xfeaf968c",
  latestAnswer: "0x668a0f02",
  decimals: "0x313ce567",
  latestTimestamp: "0x607a5e28",
  description: "0x7284e816",
};

for (const [name, sel] of Object.entries(selectors)) {
  try {
    const res = await client.call({
      to: AAPL_FEED,
      data: sel,
    });
    console.log(name, "->", res.data, `(${res.data ? (res.data.length - 2) / 2 : 0} bytes)`);
    if (name === "description" && res.data) {
      console.log("  decoded:", decodeAbiParameters(parseAbiParameters("string"), res.data)[0]);
    }
    if (name === "decimals" && res.data) {
      console.log("  decoded:", Number(decodeAbiParameters(parseAbiParameters("uint8"), res.data)[0]));
    }
    if (name === "latestAnswer" && res.data) {
      console.log("  decoded:", Number(decodeAbiParameters(parseAbiParameters("int256"), res.data)[0]));
    }
  } catch (e) {
    console.log(name, "ERRO:", e.shortMessage ?? e.message);
  }
}
