"use client";

import { useEffect, useState } from "react";
import ClientFilterInteractionFix from "@/components/ClientFilterInteractionFix";
import DashboardKpiCleanup from "@/components/DashboardKpiCleanup";
import DashboardVisualControls from "@/components/DashboardVisualControls";
import DashboardVisualPolishV1 from "@/components/DashboardVisualPolishV1";
import InvoiceAnalyticsEnhancer from "@/components/InvoiceAnalyticsEnhancer";
import InvoiceDateRangeFilter from "@/components/InvoiceDateRangeFilter";
import MonthlyVariationEnhancer from "@/components/MonthlyVariationEnhancer";
import ReceiptClientIdentityRefresh from "@/components/ReceiptClientIdentityRefresh";
import ReceiptClientLinkManager from "@/components/ReceiptClientLinkManager";
import ReceiptClientsFallback from "@/components/ReceiptClientsFallback";
import ReceiptDateRangeFilter from "@/components/ReceiptDateRangeFilter";
import ReceiptForecastComparativeCleanup from "@/components/ReceiptForecastComparativeCleanup";
import ReceiptForecastCrossWeekFilterFix from "@/components/ReceiptForecastCrossWeekFilterFix";
import ReceiptForecastExecutivePrintPolishV17 from "@/components/ReceiptForecastExecutivePrintPolishV17";
import ReceiptForecastHideWeeksPanelV21 from "@/components/ReceiptForecastHideWeeksPanelV21";
import ReceiptForecastLogoPrintFixV20 from "@/components/ReceiptForecastLogoPrintFixV20";
import ReceiptForecastOnlyPendingToggle from "@/components/ReceiptForecastOnlyPendingToggle";
import ReceiptForecastPrintFinalV19 from "@/components/ReceiptForecastPrintFinalV19";
import ReceiptForecastPrintRefinementV18 from "@/components/ReceiptForecastPrintRefinementV18";
import ReceiptForecastReceivedRuleFix from "@/components/ReceiptForecastReceivedRuleFix";
import ReceiptForecastWeekCardsPolishV15 from "@/components/ReceiptForecastWeekCardsPolishV15";
import ScopedClientFilterEnhancerV2 from "@/components/ScopedClientFilterEnhancerV2";

type Scope = "overview" | "invoices" | "receipts" | "clients" | "import" | "forecast";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function readScope(): Scope {
  if (document.body.classList.contains("receipt-forecast-active-v13")) return "forecast";

  const title = normalize(document.querySelector<HTMLElement>(".topbar-title h1")?.textContent ?? "");
  if (title === "EMISSOES") return "invoices";
  if (title === "RECEBIMENTOS") return "receipts";
  if (title === "CLIENTES") return "clients";
  if (title === "IMPORTACAO" || title === "IMPORTAR DADOS") return "import";
  if (title.includes("PREVISAO")) return "forecast";
  return "overview";
}

function scopeFromButton(button: HTMLButtonElement): Scope | null {
  if (button.dataset.forecastNavV13 === "true") return "forecast";

  const text = normalize(button.textContent ?? "");
  if (text.startsWith("VISAO GERAL")) return "overview";
  if (text.startsWith("EMISSOES")) return "invoices";
  if (text.startsWith("RECEBIMENTOS")) return "receipts";
  if (text.startsWith("CLIENTES")) return "clients";
  if (text.startsWith("IMPORTAR DADOS") || text.includes("ATUALIZAR BASES")) return "import";
  return null;
}

export default function PerformanceScopedEnhancers() {
  const [scope, setScope] = useState<Scope>("overview");

  useEffect(() => {
    let scheduled: number | null = null;

    const sync = () => {
      scheduled = null;
      const next = readScope();
      setScope((current) => current === next ? current : next);
    };

    const scheduleSync = () => {
      if (scheduled !== null) return;
      scheduled = window.setTimeout(sync, 0);
    };

    const onClick = (event: MouseEvent) => {
      const button = event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>("button")
        : null;

      if (button) {
        const inSidebar = Boolean(button.closest("aside.sidebar nav"));
        const direct = inSidebar || normalize(button.textContent ?? "").includes("ATUALIZAR BASES")
          ? scopeFromButton(button)
          : null;
        if (direct) setScope((current) => current === direct ? current : direct);
      }

      scheduleSync();
    };

    sync();
    document.addEventListener("click", onClick, true);
    document.addEventListener("change", scheduleSync, true);

    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("change", scheduleSync, true);
      if (scheduled !== null) window.clearTimeout(scheduled);
    };
  }, []);

  const standardView = scope !== "forecast" && scope !== "import";

  return (
    <>
      {standardView ? <ScopedClientFilterEnhancerV2 key={`client-filter-${scope}`} /> : null}
      {standardView ? <ClientFilterInteractionFix /> : null}

      {scope === "overview" ? (
        <>
          <ReceiptClientIdentityRefresh />
          <DashboardKpiCleanup />
          <DashboardVisualControls />
          <MonthlyVariationEnhancer />
          <DashboardVisualPolishV1 />
        </>
      ) : null}

      {scope === "invoices" ? (
        <>
          <InvoiceDateRangeFilter />
          <InvoiceAnalyticsEnhancer />
        </>
      ) : null}

      {scope === "receipts" ? (
        <>
          <ReceiptClientIdentityRefresh />
          <ReceiptClientLinkManager />
          <ReceiptDateRangeFilter />
        </>
      ) : null}

      {scope === "clients" ? <ReceiptClientsFallback /> : null}

      {scope === "forecast" ? (
        <>
          <ReceiptForecastReceivedRuleFix />
          <ReceiptForecastCrossWeekFilterFix />
          <ReceiptForecastOnlyPendingToggle />
          <ReceiptForecastExecutivePrintPolishV17 />
          <ReceiptForecastPrintRefinementV18 />
          <ReceiptForecastComparativeCleanup />
          <ReceiptForecastWeekCardsPolishV15 />
          <DashboardVisualPolishV1 />
          <ReceiptForecastPrintFinalV19 />
          <ReceiptForecastLogoPrintFixV20 />
          <ReceiptForecastHideWeeksPanelV21 />
        </>
      ) : null}
    </>
  );
}
