import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Financial Analytics | Lucas Prado",
  description: "Dashboard financeiro para análise de emissões e recebimentos.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
