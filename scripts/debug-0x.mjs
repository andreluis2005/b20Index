import fs from "fs";
import path from "path";

const envPath = path.join(process.cwd(), ".env.local");
const env = Object.fromEntries(
  fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const key = env.ZEROX_API_KEY;
console.log("chave presente:", key ? `sim (${key.length} chars, prefixo ${key.slice(0, 6)}…)` : "NÃO");

const url = new URL("https://api.0x.org/swap/allowance-holder/quote");
url.searchParams.set("chainId", "8453");
url.searchParams.set("sellToken", "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
url.searchParams.set("buyToken", "0xb20000000000000000000078ee7ce2fE4908108C");
url.searchParams.set("sellAmount", "5000000");
url.searchParams.set("taker", "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
url.searchParams.set("slippageBps", "100");

const res = await fetch(url, { headers: { "0x-api-key": key, "0x-version": "v2" } });
const text = await res.text();
console.log("status:", res.status);
console.log(text.slice(0, 800));

