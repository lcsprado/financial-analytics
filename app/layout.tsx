import type { Metadata } from "next";
import PwaControls from "@/components/PwaControls";
import ReceiptChannelSummary from "@/components/ReceiptChannelSummary";
import "./globals.css";
import "./print-fix.css";

export const metadata: Metadata = {
  title: "Financial Analytics | Lucas Prado",
  description: "Dashboard financeiro para análise de emissões e recebimentos.",
  manifest: "/manifest.webmanifest",
  applicationName: "Financial Analytics",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Analytics",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <head>
        <meta name="theme-color" content="#5d72f6" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body>
        {children}
        <ReceiptChannelSummary />
        <PwaControls />
        <a
          href="https://lcsprado.com.br"
          target="_blank"
          rel="noreferrer"
          aria-label="lcsprado.com.br"
          style={{
            position: "fixed",
            right: 10,
            bottom: 10,
            zIndex: 9999,
            padding: "5px 8px",
            borderRadius: 999,
            background: "rgba(0,0,0,.38)",
            border: "1px solid rgba(255,255,255,.14)",
            color: "rgba(255,255,255,.68)",
            fontSize: 10,
            lineHeight: 1,
            letterSpacing: ".04em",
            textDecoration: "none",
            backdropFilter: "blur(8px)",
          }}
        >
          lcsprado.com.br
        </a>
      </body>
    </html>
  );
}
