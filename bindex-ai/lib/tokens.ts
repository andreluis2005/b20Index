import { getAddress } from "viem";

const ca = (a: string) => getAddress(a) as `0x${string}`;

export const CHAIN_ID = 8453;

export const USDC = {
  address: ca("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"),
  decimals: 6,
} as const;

export const ALLOWANCE_HOLDER = ca("0x0000000000001fF3684f28c67538d4D072C22734");

export const UNISWAP_ROUTER = ca("0x2626664c2603336E57B271c5C0b26F421741e481");
export const UNISWAP_FACTORY = ca("0x33128a8fC17869897dcE68Ed026d694621f6FDfD");
export const UNIV3_FEE_CANDIDATES = [3000, 10000, 500] as const;
export const B20_DECIMALS = 8;
export const PRICE_SANITY_MAX_DEV = 0.35;

export type StockToken = {
  ticker: string;
  name: string;
  address: `0x${string}`;
  feed: `0x${string}`;
  sector: string;
};

const RAW_STOCKS = [
  { ticker: "AAPLc", name: "Apple", address: "0xb200000000000000000000C2e324d24d7eEcd1fb", feed: "0x787f13dEa48Db0897CbCDD985de77809D837F988", sector: "Consumer Tech" },
  { ticker: "NVDAc", name: "NVIDIA", address: "0xb20000000000000000000078ee7ce2fE4908108C", feed: "0x04689a41629776563E6822F76f2e57D148d28513", sector: "AI / Semiconductors" },
  { ticker: "METAc", name: "Meta", address: "0xb2000000000000000000008bC8786B856E61707C", feed: "0x6526aE6797A76123638b863AeE4dD27Ba4E4b27D", sector: "AI / Social" },
  { ticker: "GOOGLc", name: "Alphabet", address: "0xb2000000000000000000002D0BA3164cc74f58B7", feed: "0x5bF49E0ffA937CE2FfF033c739aD7C634c4D34F2", sector: "AI / Internet" },
  { ticker: "AMZNc", name: "Amazon", address: "0xb200000000000000000000d9192b6B456483C2E8", feed: "0x06A8E4b3aBB3B7543d8396FB2B763d22820cB295", sector: "E-commerce / Cloud" },
  { ticker: "MSFTc", name: "Microsoft", address: "0xB200000000000000000000Ab99cFa739E253872B", feed: "0xeB10A6c9aa7E537aEd766C08c35Dae35B321b18c", sector: "AI / Software" },
  { ticker: "MSTRc", name: "MicroStrategy", address: "0xb2000000000000000000004884b426556b92883d", feed: "0xB3cE282CD188b35DA0E38D8Bc7d58e33173D202a", sector: "Bitcoin Treasury" },
  { ticker: "TSLAc", name: "Tesla", address: "0xb2000000000000000000001e800a7f5189430cD0", feed: "0xFaf869185383a24F8cb00e27BdA6b63B9905DCb4", sector: "EV / Robotics" },
  { ticker: "SPCXc", name: "SpaceX", address: "0xb2000000000000000000007b9fcbd005511aCBd5", feed: "0x6A634B235903C4ad6376892180d6fF8612e3Fa68", sector: "Space" },
  { ticker: "SNDKc", name: "SanDisk", address: "0xb200000000000000000000397293Cb8cda9a10c5", feed: "0x388b0dC46C0Fb05A74BeE0994fa5b02c6Fcca2eA", sector: "Semiconductors" },
];

export const STOCKS: StockToken[] = RAW_STOCKS.map((s) => ({
  ...s,
  address: ca(s.address),
  feed: ca(s.feed),
}));

export const STOCKS_BY_TICKER: Record<string, StockToken> = Object.fromEntries(
  STOCKS.map((s) => [s.ticker, s]),
);

export const MAX_STALENESS_SECONDS = 60 * 60 * 3;

export const RPC_URLS = [
  "https://base.publicnode.com",
  "https://base.llamarpc.com",
  "https://1rpc.io/base",
  "https://mainnet.base.org",
];
