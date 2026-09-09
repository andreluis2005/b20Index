import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "B20Index AI — seu índice de ações na Base",
  description:
    "Descreva o que você quer. A IA monta, executa e mantém seu portfólio de ações tokenizadas (B20) na Base.",
  metadataBase: new URL("https://b20index.vercel.app"),
  openGraph: {
    title: "B20Index AI",
    description:
      "Seu índice de Coinbase Tokenized Stocks (B20) montado por IA e executado onchain na Base.",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "B20Index AI" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#05070f",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){r.unregister()})})}",
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-[#05070f] text-zinc-100">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
