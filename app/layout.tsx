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
      </body>
    </html>
  );
}
