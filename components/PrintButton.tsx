"use client";

import { Printer } from "lucide-react";
import { useRef } from "react";

export default function PrintButton() {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const filtersRef = useRef<HTMLParagraphElement>(null);
  const generatedAtRef = useRef<HTMLParagraphElement>(null);

  function handlePrint() {
    const currentTitle = document.querySelector(".topbar-title h1")?.textContent?.trim() || "Painel financeiro";
    const filters = Array.from(document.querySelectorAll(".filter-bar label"))
      .map((label) => {
        const name = label.querySelector(":scope > span")?.textContent?.trim();
        const select = label.querySelector("select") as HTMLSelectElement | null;
        const value = select?.selectedOptions[0]?.textContent?.trim();
        return name && value ? `${name}: ${value}` : null;
      })
      .filter(Boolean)
      .join(" • ");

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

  return (
    <>
      <section className="print-report-header" aria-hidden="true">
        <div>
          <span>FINANCIAL ANALYTICS</span>
          <h1 ref={titleRef}>Relatório financeiro</h1>
          <p ref={filtersRef}>Todos os dados disponíveis</p>
        </div>
        <p ref={generatedAtRef} />
      </section>

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

      <style jsx global>{`
        .print-report-header {
          display: none;
        }

        .print-button-floating {
          position: fixed;
          top: 22px;
          right: 220px;
          z-index: 35;
          background: #ffffff;
          box-shadow: 0 5px 16px rgba(28, 35, 60, 0.08);
        }

        @media (max-width: 980px) {
          .print-button-floating {
            right: 78px;
          }

          .print-button-floating span {
            display: none;
          }
        }

        @media (max-width: 580px) {
          .print-button-floating {
            top: auto;
            right: 16px;
            bottom: 16px;
            width: 46px;
            height: 46px;
            padding: 0;
            border-radius: 50%;
            box-shadow: 0 10px 28px rgba(28, 35, 60, 0.2);
          }
        }

        @media print {
          @page {
            size: landscape;
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
        }
      `}</style>
    </>
  );
}
