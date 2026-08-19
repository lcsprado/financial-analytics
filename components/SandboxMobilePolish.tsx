"use client";

import { useEffect, useState } from "react";
import {
  CalendarClock,
  LayoutDashboard,
  Menu,
  ReceiptText,
  WalletCards,
} from "lucide-react";

type MobileSection = "overview" | "invoices" | "receipts" | "forecast";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function currentSection(): MobileSection {
  if (document.body.classList.contains("receipt-forecast-active-v13")) return "forecast";
  const title = normalize(document.querySelector<HTMLElement>(".topbar-title h1")?.textContent ?? "");
  if (title === "EMISSOES") return "invoices";
  if (title === "RECEBIMENTOS") return "receipts";
  return "overview";
}

function clickSidebarItem(section: MobileSection) {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("aside.sidebar nav button"));
  const target = section === "forecast"
    ? buttons.find((button) => button.dataset.forecastNavV13 === "true" || normalize(button.textContent ?? "").startsWith("PREVISAO"))
    : buttons.find((button) => {
        const text = normalize(button.textContent ?? "");
        if (section === "overview") return text.startsWith("VISAO GERAL");
        if (section === "invoices") return text.startsWith("EMISSOES");
        return text.startsWith("RECEBIMENTOS");
      });
  target?.click();
}

export default function SandboxMobilePolish() {
  const [section, setSection] = useState<MobileSection>("overview");

  useEffect(() => {
    let frame: number | null = null;
    const sync = () => {
      frame = null;
      const next = currentSection();
      setSection((current) => current === next ? current : next);
    };
    const schedule = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(sync);
    };

    sync();
    document.addEventListener("click", schedule, true);
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class"] });

    return () => {
      document.removeEventListener("click", schedule, true);
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  const navigate = (next: MobileSection) => {
    setSection(next);
    clickSidebarItem(next);
  };

  return (
    <>
      <nav className="sandbox-mobile-bottom-nav" aria-label="Navegação principal no celular">
        <button type="button" className={section === "overview" ? "active" : ""} onClick={() => navigate("overview")}><LayoutDashboard size={19} /><span>Visão</span></button>
        <button type="button" className={section === "invoices" ? "active" : ""} onClick={() => navigate("invoices")}><ReceiptText size={19} /><span>Emissões</span></button>
        <button type="button" className={section === "receipts" ? "active" : ""} onClick={() => navigate("receipts")}><WalletCards size={19} /><span>Receb.</span></button>
        <button type="button" className={section === "forecast" ? "active" : ""} onClick={() => navigate("forecast")}><CalendarClock size={19} /><span>Previsão</span></button>
        <button type="button" onClick={() => document.querySelector<HTMLButtonElement>(".menu-button")?.click()}><Menu size={20} /><span>Menu</span></button>
      </nav>

      <style jsx global>{`
        .sandbox-mobile-bottom-nav { display: none; }

        @media (max-width: 760px) {
          :root { --sandbox-mobile-nav-height: 68px; }

          html { -webkit-text-size-adjust: 100%; }
          body {
            padding-bottom: calc(var(--sandbox-mobile-nav-height) + env(safe-area-inset-bottom) + 16px) !important;
            background: #f3f5f9 !important;
          }

          button, input, select, textarea { -webkit-tap-highlight-color: transparent; }
          button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
            outline: 3px solid rgba(93,114,246,.18);
            outline-offset: 1px;
          }

          .sandbox-mobile-bottom-nav {
            position: fixed;
            z-index: 1800;
            left: 8px;
            right: 8px;
            bottom: max(8px, env(safe-area-inset-bottom));
            min-height: var(--sandbox-mobile-nav-height);
            display: grid;
            grid-template-columns: repeat(5, minmax(0,1fr));
            align-items: center;
            padding: 6px;
            border: 1px solid rgba(222,226,236,.96);
            border-radius: 20px;
            background: rgba(255,255,255,.96);
            box-shadow: 0 14px 38px rgba(27,35,58,.17);
            backdrop-filter: blur(18px);
          }
          .sandbox-mobile-bottom-nav button {
            min-width: 0;
            min-height: 54px;
            display: grid;
            place-items: center;
            align-content: center;
            gap: 3px;
            padding: 5px 2px;
            border: 0;
            border-radius: 14px;
            color: #7d8699;
            background: transparent;
            font-size: 9px;
            font-weight: 800;
          }
          .sandbox-mobile-bottom-nav button.active {
            color: #5166df;
            background: #eef1ff;
          }
          .sandbox-mobile-bottom-nav button span {
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .sandbox-test-banner {
            position: relative !important;
            min-height: 38px !important;
            padding: 6px 10px !important;
          }
          .sandbox-test-banner > div { min-width: 0; }
          .sandbox-test-banner > div > span:not(.sandbox-banner-error) { display: none !important; }

          .topbar {
            top: 0 !important;
            height: 62px !important;
            padding: 0 11px !important;
            border-bottom-color: #e5e8ef !important;
            background: rgba(255,255,255,.96) !important;
            box-shadow: 0 4px 18px rgba(31,39,67,.04) !important;
          }
          .menu-button {
            width: 42px !important;
            height: 42px !important;
            border-radius: 12px !important;
            box-shadow: 0 3px 10px rgba(31,39,67,.04);
          }
          .topbar-title h1 {
            max-width: calc(100vw - 88px) !important;
            font-size: 18px !important;
            font-weight: 800;
            letter-spacing: -.45px !important;
          }
          .topbar-actions { display: none !important; }

          .content-area,
          .dashboard-overview-polish-v1 .content-area {
            padding: 12px 10px 24px !important;
          }

          .filter-bar,
          .dashboard-overview-polish-v1 .filter-bar {
            display: grid !important;
            grid-template-columns: repeat(2,minmax(0,1fr)) !important;
            width: 100%;
            margin-bottom: 12px !important;
            padding: 12px !important;
            gap: 9px !important;
            border: 1px solid #e3e7ef !important;
            border-radius: 16px !important;
            background: #fff !important;
            box-shadow: 0 7px 20px rgba(31,39,67,.035) !important;
          }
          .filter-heading {
            grid-column: 1/-1 !important;
            margin: 0 0 2px !important;
          }
          .filter-heading span { font-size: 12px !important; }
          .filter-heading small { font-size: 9px !important; }
          .filter-bar label {
            width: 100% !important;
            min-width: 0 !important;
          }
          .filter-bar label > span {
            margin-bottom: 1px;
            font-size: 8px !important;
          }
          .filter-bar .select-wrap,
          .filter-bar .select-wrap select {
            width: 100% !important;
            min-width: 0 !important;
          }
          .filter-bar .select-wrap select {
            height: 44px !important;
            padding-left: 12px !important;
            border-radius: 11px !important;
            background: #f8f9fc !important;
            font-size: 12px !important;
          }
          .filter-bar .client-filter {
            grid-column: 1/-1 !important;
          }
          .client-filter,
          .client-filter .select-wrap,
          .multi-client-navigation {
            width: 100% !important;
          }
          .multi-client-navigation {
            grid-template-columns: minmax(0,1fr) 40px !important;
            gap: 7px !important;
          }
          .multi-client-trigger,
          .multi-client-arrows {
            height: 44px !important;
          }
          .multi-client-trigger {
            border-radius: 11px !important;
            font-size: 12px !important;
          }
          .multi-client-arrows button {
            min-width: 40px !important;
          }
          .multi-client-popover {
            position: fixed !important;
            z-index: 2200 !important;
            left: 10px !important;
            right: 10px !important;
            top: auto !important;
            bottom: calc(var(--sandbox-mobile-nav-height) + env(safe-area-inset-bottom) + 16px) !important;
            width: auto !important;
            max-height: min(62vh,520px);
            padding: 11px !important;
            border-radius: 18px !important;
            box-shadow: 0 22px 70px rgba(24,31,49,.24) !important;
          }
          .multi-client-search { height: 44px !important; border-radius: 11px !important; }
          .multi-client-list { max-height: min(45vh,390px) !important; }
          .multi-client-list > button { min-height: 42px !important; font-size: 11px !important; }
          .clear-filter {
            grid-column: 1/-1 !important;
            width: max-content;
            min-height: 38px !important;
            justify-self: end !important;
            padding: 0 4px !important;
          }

          /* Período: inicial e final lado a lado no celular. */
          [data-invoice-date-filter],
          [data-receipt-date-filter] {
            display: grid !important;
            grid-template-columns: repeat(2,minmax(0,1fr)) !important;
            align-items: end !important;
            gap: 8px !important;
            margin-bottom: 12px !important;
            padding: 12px !important;
            border: 1px solid #e3e7ef !important;
            border-radius: 15px !important;
            background: #f8f9fc !important;
          }
          [data-invoice-date-filter] > div:first-child,
          [data-receipt-date-filter] > div:first-child {
            grid-column: 1/-1 !important;
            width: 100% !important;
            margin: 0 0 2px !important;
          }
          [data-invoice-date-filter] > label,
          [data-receipt-date-filter] > label {
            width: 100% !important;
            min-width: 0 !important;
          }
          [data-invoice-date-filter] input,
          [data-receipt-date-filter] input {
            width: 100% !important;
            min-width: 0 !important;
            height: 44px !important;
            padding: 0 8px !important;
            border-radius: 11px !important;
            font-size: 11px !important;
          }
          [data-invoice-date-filter] > button,
          [data-receipt-date-filter] > button {
            grid-column: 1/-1 !important;
            width: max-content;
            min-height: 36px !important;
            justify-self: end;
            padding: 0 3px !important;
          }

          .kpi-grid,
          .kpi-grid.kpi-grid-core-only,
          .dashboard-overview-polish-v1 .kpi-grid,
          .dashboard-overview-polish-v1 .kpi-grid.kpi-grid-core-only {
            grid-template-columns: repeat(2,minmax(0,1fr)) !important;
            gap: 9px !important;
            margin-bottom: 10px !important;
          }
          .kpi-card,
          .dashboard-overview-polish-v1 .kpi-card,
          .kpi-grid.kpi-grid-core-only .kpi-card {
            min-height: 116px !important;
            padding: 13px 12px !important;
            border-radius: 15px !important;
            box-shadow: 0 7px 22px rgba(31,39,67,.055) !important;
          }
          .kpi-card strong,
          .dashboard-overview-polish-v1 .kpi-card strong,
          .kpi-grid.kpi-grid-core-only .kpi-card > strong {
            margin-top: 9px !important;
            font-size: clamp(17px,5.2vw,22px) !important;
            line-height: 1.06 !important;
            letter-spacing: -.7px !important;
            overflow-wrap: anywhere;
          }
          .kpi-title { font-size: 8.5px !important; }
          .kpi-detail {
            display: -webkit-box !important;
            max-width: 100% !important;
            margin-top: 6px !important;
            overflow: hidden !important;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            white-space: normal !important;
            font-size: 8.5px !important;
            line-height: 1.25 !important;
          }
          .receipt-channel-kpi-slot { grid-column: 1/-1; }

          .chart-grid,
          .lower-grid,
          .dashboard-overview-polish-v1 .chart-grid,
          .dashboard-overview-polish-v1 .lower-grid {
            gap: 10px !important;
            margin-bottom: 10px !important;
          }
          .panel,
          .dashboard-overview-polish-v1 .panel {
            padding: 13px !important;
            border-radius: 16px !important;
            box-shadow: 0 7px 22px rgba(31,39,67,.045) !important;
          }
          .panel-header {
            margin-bottom: 10px !important;
            gap: 8px !important;
          }
          .panel-header h2 { font-size: 13px !important; }
          .panel-header p { font-size: 9px !important; line-height: 1.35 !important; }
          .chart-series-toggle {
            width: 100% !important;
            min-height: 40px;
            border-radius: 11px !important;
          }
          .chart-series-toggle button { min-height: 34px !important; }
          .chart-box { height: 225px !important; }
          .short-chart { height: 205px !important; }
          .pie-chart-box { height: 170px !important; }
          .pie-legend { gap: 7px !important; }
          .pie-legend > div { font-size: 9px !important; }

          .table-toolbar {
            display: grid !important;
            grid-template-columns: 1fr !important;
            gap: 8px !important;
            align-items: stretch !important;
          }
          .table-toolbar .search-box {
            width: 100% !important;
            height: 44px !important;
            border-radius: 11px !important;
            background: #f8f9fc !important;
          }
          .table-toolbar > span { text-align: left !important; }
          .table-wrap tbody { gap: 9px !important; }
          .table-wrap tbody tr {
            border-radius: 15px !important;
            box-shadow: 0 5px 16px rgba(31,39,67,.035) !important;
          }
          .table-wrap tbody td {
            grid-template-columns: 88px minmax(0,1fr) !important;
            min-height: 38px;
            align-items: center !important;
            padding: 8px 10px !important;
            line-height: 1.35;
          }
          .table-wrap tbody td::before { font-size: 7.5px !important; }
          .table-wrap tbody td.number strong { color: #20263a; font-size: 12px !important; }
          .nf-pill, .bank-pill { width: fit-content; }

          .print-table-summary,
          .insight-strip {
            grid-template-columns: 1fr 1fr !important;
            gap: 0 !important;
            border-radius: 14px !important;
            overflow: hidden;
          }
          .print-table-summary > span,
          .insight-strip > div {
            min-width: 0;
            padding: 10px !important;
          }

          /* Cielo: leitura e controles pensados para toque. */
          .receipt-channel-summary {
            width: 100% !important;
            padding: 13px !important;
            border-radius: 15px !important;
          }
          .receipt-channel-heading {
            display: grid !important;
            grid-template-columns: 1fr !important;
            gap: 11px !important;
          }
          .receipt-channel-heading h3 {
            margin: 5px 0 !important;
            font-size: 22px !important;
            letter-spacing: -.7px;
          }
          .receipt-channel-actions {
            width: 100% !important;
            display: grid !important;
            grid-template-columns: 1fr !important;
            gap: 7px !important;
          }
          .receipt-channel-actions button {
            width: 100% !important;
            min-height: 42px !important;
            justify-content: center !important;
            border-radius: 11px !important;
          }
          .receipt-channel-breakdown {
            grid-template-columns: 1fr !important;
            gap: 8px !important;
          }
          .receipt-channel-card { border-radius: 12px !important; }

          /* Previsão: interface vertical, controles grandes e sem faixa horizontal. */
          .receipt-forecast-page-v13 { gap: 11px !important; }
          .forecast-heading-v13 { gap: 11px !important; }
          .forecast-heading-v13 h2 { font-size: 23px !important; line-height: 1.08; }
          .forecast-heading-v13 p { font-size: 10.5px !important; }
          .forecast-heading-actions-v13 {
            display: grid !important;
            grid-template-columns: repeat(2,minmax(0,1fr)) !important;
            gap: 7px !important;
          }
          .forecast-heading-actions-v13 button {
            min-height: 44px !important;
            height: auto !important;
            justify-content: center !important;
            padding: 8px !important;
            border-radius: 11px !important;
          }
          .forecast-filter-v13 {
            display: grid !important;
            grid-template-columns: repeat(2,minmax(0,1fr)) !important;
            gap: 8px !important;
            padding: 12px !important;
            border-radius: 15px !important;
          }
          .forecast-filter-title-v13 { grid-column: 1/-1; }
          .forecast-filter-v13 label { width: 100% !important; min-width: 0 !important; }
          .forecast-filter-v13 label > div,
          .forecast-filter-v13 select {
            width: 100% !important;
            min-width: 0 !important;
          }
          .forecast-filter-v13 label > div { height: 44px !important; border-radius: 11px !important; }
          .forecast-filter-v13 > button {
            min-height: 42px !important;
            height: auto !important;
            border-radius: 11px !important;
          }
          .forecast-only-pending-button-v16 { grid-column: 1/-1; }
          .forecast-kpis-v13 { grid-template-columns: repeat(2,minmax(0,1fr)) !important; gap: 8px !important; }
          .forecast-kpis-v13 article {
            min-height: 108px !important;
            padding: 13px !important;
            border-radius: 14px !important;
          }
          .forecast-kpis-v13 strong { font-size: clamp(16px,5vw,21px) !important; overflow-wrap: anywhere; }
          .forecast-main-v13 { grid-template-columns: 1fr !important; gap: 9px !important; }
          .forecast-panel-v13 { border-radius: 15px !important; }
          .forecast-panel-head-v13 { padding: 13px 13px 10px !important; }
          .forecast-chart-v13 { height: 220px !important; }
          .forecast-weeks-v13 { max-height: none !important; gap: 7px; padding: 8px !important; }
          .forecast-weeks-v13 button { min-height: 96px; border-radius: 12px !important; }
          .forecast-table-v13 tbody { padding: 0 8px 9px !important; }
          .forecast-table-v13 tbody tr { border-radius: 13px !important; }
          .forecast-table-v13 tbody td,
          .forecast-table-v13 tbody td.client {
            grid-template-columns: 82px minmax(0,1fr) !important;
            align-items: start !important;
            min-height: 38px;
          }
          .forecast-basis-v13 { padding: 0 10px 12px !important; }
          .forecast-basis-v13 > div { grid-template-columns: 1fr !important; }
          .forecast-note-v13 { border-radius: 13px !important; }
          .forecast-modal-backdrop-v13 {
            align-items: end !important;
            padding: 0 !important;
          }
          .forecast-modal-v13 {
            width: 100% !important;
            max-height: 92dvh !important;
            border-radius: 20px 20px 0 0 !important;
          }
          .modal-head-v13 { position: sticky; top: 0; z-index: 2; background: #fff; }
          .modal-form-v13 input,
          .modal-form-v13 select,
          .modal-form-v13 textarea { min-height: 44px !important; font-size: 16px !important; }
          .modal-actions-v13 {
            position: sticky;
            bottom: 0;
            padding: 10px 0 0;
            background: #fff;
          }
          .modal-actions-v13 button { min-height: 44px !important; flex: 1; }

          .upload-grid, .import-results { gap: 9px !important; }
          .upload-card {
            min-height: 0 !important;
            padding: 15px !important;
            border-radius: 15px !important;
          }
          .upload-card .secondary-button { min-height: 42px; }
          .import-actions { gap: 8px !important; }
          .import-actions button { min-height: 44px; border-radius: 11px !important; }

          .sidebar {
            width: min(88vw,320px) !important;
            padding-bottom: calc(18px + env(safe-area-inset-bottom)) !important;
            box-shadow: 20px 0 60px rgba(15,18,28,.18);
          }
          .sidebar nav button { min-height: 46px !important; border-radius: 11px !important; }
          .sidebar-status { margin-top: 16px !important; }

          .pwa-controls,
          .connection-notice {
            max-width: calc(100vw - 20px) !important;
          }
        }

        @media (max-width: 360px) {
          .kpi-grid,
          .kpi-grid.kpi-grid-core-only,
          .dashboard-overview-polish-v1 .kpi-grid,
          .forecast-kpis-v13 {
            grid-template-columns: 1fr !important;
          }
          .forecast-filter-v13 { grid-template-columns: 1fr !important; }
          .forecast-filter-title-v13,
          .forecast-only-pending-button-v16 { grid-column: 1 !important; }
          .forecast-heading-actions-v13 { grid-template-columns: 1fr !important; }
        }

        @media print {
          .sandbox-mobile-bottom-nav { display: none !important; }
        }
      `}</style>
    </>
  );
}
