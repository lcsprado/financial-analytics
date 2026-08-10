"use client";

import { Printer } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";

const BIOMEGA_LOGO = "data:image/png;base64,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";

function parseBrazilianDate(value: string) {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 12);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatBrazilianDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function forecastPeriodLabel(weekLabel: string) {
  const values = [...weekLabel.matchAll(/(\d{2}\/\d{2}\/\d{4})/g)].map((match) => match[1]);
  if (values.length < 2) return "";
  const start = parseBrazilianDate(values[0]);
  const end = parseBrazilianDate(values[1]);
  if (!start || !end) return `${values[0]} a ${values[1]}`;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const effectiveStart = today >= start && today <= end ? today : start;
  const startText = formatBrazilianDate(effectiveStart);
  const endText = formatBrazilianDate(end);
  return startText === endText ? startText : `${startText} a ${endText}`;
}

export default function PrintButton() {
  const headerRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const filtersRef = useRef<HTMLParagraphElement>(null);
  const generatedAtRef = useRef<HTMLParagraphElement>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(document.querySelector<HTMLElement>(".topbar-actions"));
  }, []);

  function handlePrint() {
    const forecastActive = document.body.classList.contains("receipt-forecast-active-v13");
    const currentTitle = forecastActive
      ? "Previsão de Recebimentos"
      : document.querySelector(".topbar-title h1")?.textContent?.trim() || "Painel financeiro";

    let filters = Array.from(document.querySelectorAll(".filter-bar label"))
      .map((label) => {
        const name = label.querySelector(":scope > span")?.textContent?.trim();
        const select = label.querySelector("select") as HTMLSelectElement | null;
        const value = select?.selectedOptions[0]?.textContent?.trim();
        return name && value ? `${name}: ${value}` : null;
      })
      .filter(Boolean)
      .join(" • ");

    if (forecastActive) {
      const selects = document.querySelectorAll<HTMLSelectElement>(".forecast-filter-v13 select");
      const client = selects[0]?.selectedOptions[0]?.textContent?.trim() || "Todos os clientes";
      const month = selects[1]?.selectedOptions[0]?.textContent?.trim() || "";
      const selectedWeek = selects[2]?.selectedOptions[0]?.textContent?.trim() || "";
      const currentWeek = document.querySelector<HTMLElement>(".forecast-weeks-v13 button.week-current-v15 > span")?.textContent?.trim() || "";
      const confidence = selects[3]?.selectedOptions[0]?.textContent?.trim() || "Todas";
      const period = forecastPeriodLabel(selectedWeek.includes("/") ? selectedWeek : currentWeek);
      const onlyPending = document.body.classList.contains("forecast-only-pending-v16");

      filters = [
        period ? `Período previsto: ${period}` : null,
        month ? `Mês: ${month}` : null,
        `Cliente: ${client}`,
        `Confiança: ${confidence}`,
        `Visão: ${onlyPending ? "Somente a receber" : "Previsão semanal"}`,
      ].filter(Boolean).join(" • ");
    }

    headerRef.current?.classList.toggle("forecast-print-header", forecastActive);
    if (titleRef.current) titleRef.current.textContent = currentTitle;
    if (filtersRef.current) filtersRef.current.textContent = filters || "Todos os dados disponíveis";
    if (generatedAtRef.current) {
      generatedAtRef.current.textContent = `Gerado em ${new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "long",
        timeStyle: "short",
      }).format(new Date())}`;
    }

    const previousTitle = document.title;
    document.title = `Financial Analytics - ${currentTitle}`;

    try {
      window.print();
    } finally {
      window.setTimeout(() => {
        document.title = previousTitle;
      }, 0);
    }
  }

  const printButton = (
    <button
      type="button"
      className="print-button-floating ghost-button compact"
      onClick={handlePrint}
      aria-label="Imprimir aba atual"
      title="Imprimir aba atual"
    >
      <Printer size={17} />
      <span>Imprimir</span>
    </button>
  );

  return (
    <>
      <section ref={headerRef} className="print-report-header" aria-hidden="true">
        <div className="print-report-brand">
          <img src={BIOMEGA_LOGO} alt="Biomega" />
          <div>
            <span>FINANCIAL ANALYTICS</span>
            <h1 ref={titleRef}>Relatório financeiro</h1>
            <p ref={filtersRef}>Todos os dados disponíveis</p>
          </div>
        </div>
        <p ref={generatedAtRef} />
      </section>

      {portalTarget ? createPortal(printButton, portalTarget) : null}

      <style jsx global>{`
        .print-report-header {
          display: none;
        }

        .print-report-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }

        .print-report-brand img {
          display: none;
        }

        .topbar-actions .print-button-floating {
          position: static;
          flex: 0 0 auto;
          z-index: auto;
          background: #ffffff;
          box-shadow: none;
        }

        @media (max-width: 980px) {
          .topbar-actions .print-button-floating span {
            display: none;
          }
        }

        @media print {
          @page {
            size: A4 landscape;
            margin: 10mm;
          }

          html,
          body {
            background: #ffffff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .app-shell {
            display: block !important;
            min-height: auto !important;
          }

          .sidebar,
          .sidebar-backdrop,
          .topbar,
          .filter-bar,
          .alert,
          .print-button-floating,
          .search-box,
          .clear-filter,
          .import-actions,
          .upload-grid,
          .privacy-note {
            display: none !important;
          }

          .print-report-header {
            display: flex !important;
            align-items: flex-end;
            justify-content: space-between;
            gap: 24px;
            margin-bottom: 14px;
            padding-bottom: 10px;
            border-bottom: 2px solid #5d72f6;
          }

          .print-report-header span {
            color: #5d72f6;
            font-size: 9px;
            font-weight: 900;
            letter-spacing: 1.4px;
          }

          .print-report-header h1 {
            margin: 4px 0 3px;
            font-size: 22px;
          }

          .print-report-header p {
            margin: 0;
            color: #697286;
            font-size: 9px;
          }

          .print-report-header > p {
            white-space: nowrap;
            text-align: right;
          }

          .print-report-header.forecast-print-header {
            align-items: center;
            border-bottom: 1px solid #9aa0aa;
          }

          .print-report-header.forecast-print-header .print-report-brand img {
            display: block;
            width: 84px;
            height: auto;
            flex: 0 0 auto;
            filter: grayscale(1) contrast(.86);
            opacity: .78;
          }

          .print-report-header.forecast-print-header span {
            color: #4a4f59;
          }

          .print-report-header.forecast-print-header h1 {
            font-size: 21px;
          }

          .main-content {
            margin-left: 0 !important;
          }

          .content-area {
            max-width: none !important;
            padding: 0 !important;
          }

          .panel,
          .kpi-card,
          .insight-strip,
          .client-summary-card,
          .import-results {
            box-shadow: none !important;
            break-inside: avoid;
          }

          .kpi-grid {
            grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
            gap: 8px !important;
            margin-bottom: 9px !important;
          }

          .kpi-card {
            min-height: 105px !important;
            padding: 13px !important;
          }

          .kpi-card strong {
            font-size: 18px !important;
          }

          .chart-grid,
          .lower-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 9px !important;
            margin-bottom: 9px !important;
          }

          .panel {
            padding: 12px !important;
          }

          .chart-box {
            height: 235px !important;
          }

          .short-chart {
            height: 205px !important;
          }

          .pie-layout {
            min-height: 235px !important;
          }

          .insight-strip {
            padding: 10px 13px !important;
          }

          .table-toolbar {
            margin-bottom: 8px !important;
          }

          .table-wrap {
            overflow: visible !important;
          }

          table {
            min-width: 0 !important;
          }

          thead {
            display: table-header-group;
          }

          th,
          td {
            padding: 6px 7px !important;
            font-size: 8px !important;
          }

          tr {
            break-inside: avoid;
          }

          .description-cell {
            min-width: 0 !important;
          }

          .client-summary-card {
            padding: 16px !important;
          }

          .client-summary-card h2 {
            margin: 6px 0 10px !important;
            font-size: 20px !important;
          }

          .client-summary-card strong {
            font-size: 24px !important;
          }

          /* Relatório executivo da Previsão */
          .receipt-forecast-active-v13 .forecast-heading-v13,
          .receipt-forecast-active-v13 .forecast-filter-v13,
          .receipt-forecast-active-v13 .forecast-accuracy-v14,
          .receipt-forecast-active-v13 .forecast-note-v13,
          .receipt-forecast-active-v13 .forecast-detail-v13 {
            display: none !important;
          }

          .receipt-forecast-active-v13 .receipt-forecast-page-v13 {
            display: block !important;
            color: #111827 !important;
          }

          .receipt-forecast-active-v13 .forecast-kpis-v13 {
            display: grid !important;
            grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
            gap: 7px !important;
            margin: 0 0 10px !important;
          }

          .receipt-forecast-active-v13 .forecast-kpis-v13 article {
            min-height: 74px !important;
            padding: 10px 12px !important;
            border: 1px solid #cfd3da !important;
            border-radius: 8px !important;
            background: #fff !important;
            box-shadow: none !important;
            break-inside: avoid;
          }

          .receipt-forecast-active-v13 .forecast-kpis-v13 article span,
          .receipt-forecast-active-v13 .forecast-kpis-v13 article small {
            color: #59606c !important;
          }

          .receipt-forecast-active-v13 .forecast-kpis-v13 article strong {
            color: #111827 !important;
            font-size: 17px !important;
          }

          .receipt-forecast-active-v13 .forecast-main-v13 {
            display: block !important;
            margin: 0 !important;
          }

          .receipt-forecast-active-v13 .forecast-main-v13 > .forecast-panel-v13:first-child {
            display: none !important;
          }

          .receipt-forecast-active-v13 .forecast-main-v13 > .forecast-panel-v13:last-child {
            padding: 9px !important;
            border: 1px solid #cfd3da !important;
            border-radius: 8px !important;
            box-shadow: none !important;
            break-inside: avoid;
          }

          .receipt-forecast-active-v13 .forecast-main-v13 .forecast-panel-head-v13 {
            margin-bottom: 6px !important;
          }

          .receipt-forecast-active-v13 .forecast-main-v13 .forecast-panel-head-v13 h3 {
            font-size: 13px !important;
            margin: 0 !important;
          }

          .receipt-forecast-active-v13 .forecast-main-v13 .forecast-panel-head-v13 p {
            font-size: 7.5px !important;
            margin: 2px 0 0 !important;
          }

          .receipt-forecast-active-v13 .forecast-weeks-v13 {
            display: grid !important;
            grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
            gap: 6px !important;
            max-height: none !important;
            overflow: visible !important;
            padding: 0 !important;
            border: 0 !important;
            background: #fff !important;
          }

          .receipt-forecast-active-v13 .forecast-weeks-v13 button {
            display: block !important;
            min-height: 78px !important;
            padding: 8px 9px !important;
            border: 1px solid #d6d9df !important;
            border-radius: 7px !important;
            background: #fff !important;
            box-shadow: none !important;
            transform: none !important;
            break-inside: avoid;
          }

          .receipt-forecast-active-v13 .forecast-weeks-v13 button > span,
          .receipt-forecast-active-v13 .forecast-weeks-v13 button > strong,
          .receipt-forecast-active-v13 .forecast-weeks-v13 button > em,
          .receipt-forecast-active-v13 .forecast-weeks-v13 button > small {
            display: block !important;
            margin: 0 0 3px !important;
            color: #20242c !important;
            font-size: 7.5px !important;
            line-height: 1.25 !important;
            text-align: left !important;
          }

          .receipt-forecast-active-v13 .forecast-weeks-v13 button > strong {
            font-size: 10px !important;
          }

          .receipt-forecast-active-v13 .forecast-weeks-v13 button > em {
            color: #444b55 !important;
            font-style: normal !important;
            font-weight: 700 !important;
          }

          .receipt-forecast-active-v13 .forecast-weeks-v13 button > i,
          .receipt-forecast-active-v13 .forecast-weeks-v13 button.week-current-v15 > span::after {
            display: none !important;
          }

          .receipt-forecast-active-v13 .forecast-panel-v13:has(.forecast-table-v13) {
            break-before: page;
            padding: 0 !important;
            border: 0 !important;
            box-shadow: none !important;
          }

          .receipt-forecast-active-v13 .forecast-panel-v13:has(.forecast-table-v13) button {
            display: none !important;
          }

          .receipt-forecast-active-v13 .forecast-panel-v13:has(.forecast-table-v13) .forecast-panel-head-v13 {
            margin-bottom: 7px !important;
          }

          .receipt-forecast-active-v13 .forecast-panel-v13:has(.forecast-table-v13) .forecast-panel-head-v13 h3 {
            font-size: 14px !important;
          }

          .receipt-forecast-active-v13 .forecast-table-v13 {
            overflow: visible !important;
          }

          .receipt-forecast-active-v13 .forecast-table-v13 table {
            width: 100% !important;
            min-width: 0 !important;
            border-collapse: collapse !important;
          }

          .receipt-forecast-active-v13 .forecast-table-v13 th,
          .receipt-forecast-active-v13 .forecast-table-v13 td {
            padding: 5px 6px !important;
            border-bottom: 1px solid #dadde2 !important;
            font-size: 7.2px !important;
            line-height: 1.25 !important;
            vertical-align: top !important;
          }

          .receipt-forecast-active-v13 .forecast-table-v13 th {
            color: #383e48 !important;
            background: #f0f1f3 !important;
            font-weight: 800 !important;
          }

          .receipt-forecast-active-v13 .forecast-table-v13 td.client strong {
            font-size: 7.5px !important;
            color: #171b22 !important;
          }

          .receipt-forecast-active-v13 .forecast-table-v13 td.client span,
          .receipt-forecast-active-v13 .forecast-table-v13 .status small {
            color: #5d646f !important;
            font-size: 6.8px !important;
          }

          .receipt-forecast-active-v13 .forecast-table-v13 th:last-child,
          .receipt-forecast-active-v13 .forecast-table-v13 td:last-child {
            display: none !important;
          }

          .receipt-forecast-active-v13 .forecast-table-v13 tbody tr[data-only-pending-received="true"] {
            display: none !important;
          }

          .receipt-forecast-active-v13 .forecast-table-v13 .confidence,
          .receipt-forecast-active-v13 .forecast-table-v13 .status {
            color: #222831 !important;
            background: transparent !important;
            border: 0 !important;
          }
        }
      `}</style>
    </>
  );
}
