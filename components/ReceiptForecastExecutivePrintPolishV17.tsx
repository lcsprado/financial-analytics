"use client";

import { useEffect, useRef } from "react";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function setTextWithRestore(element: Element | null, value: string, restores: Array<() => void>) {
  if (!element) return;
  const previous = element.textContent ?? "";
  if (previous === value) return;
  element.textContent = value;
  restores.push(() => { element.textContent = previous; });
}

export default function ReceiptForecastExecutivePrintPolishV17() {
  const restoreRef = useRef<null | (() => void)>(null);

  useEffect(() => {
    const restore = () => {
      restoreRef.current?.();
      restoreRef.current = null;
    };

    const prepare = () => {
      restore();
      if (!document.body.classList.contains("receipt-forecast-active-v13")) return;

      const restores: Array<() => void> = [];
      document.body.classList.add("forecast-executive-print-v17");
      restores.push(() => document.body.classList.remove("forecast-executive-print-v17"));

      const tablePanel = [...document.querySelectorAll<HTMLElement>(".forecast-panel-v13")]
        .find((panel) => Boolean(panel.querySelector(".forecast-table-v13")));

      if (tablePanel) {
        setTextWithRestore(
          tablePanel.querySelector(".forecast-panel-head-v13 h3"),
          "Clientes previstos no período",
          restores,
        );

        tablePanel.querySelectorAll<HTMLElement>(".forecast-table-v13 td.client > span").forEach((note) => {
          if (normalize(note.textContent || "") !== "PADRAO DE PAGAMENTO PELOS ULTIMOS 3 MESES") return;
          note.classList.add("print-hide-standard-note-v17");
          restores.push(() => note.classList.remove("print-hide-standard-note-v17"));
        });
      }

      restoreRef.current = () => {
        while (restores.length) restores.pop()?.();
      };
    };

    window.addEventListener("beforeprint", prepare);
    window.addEventListener("afterprint", restore);

    return () => {
      window.removeEventListener("beforeprint", prepare);
      window.removeEventListener("afterprint", restore);
      restore();
    };
  }, []);

  return (
    <style jsx global>{`
      @media print {
        @page {
          size: A4 landscape;
          margin: 7mm 8mm;
        }

        body.forecast-executive-print-v17 .print-report-header {
          margin-bottom: 6px !important;
          padding-bottom: 6px !important;
          border-bottom-width: 1px !important;
        }

        body.forecast-executive-print-v17 .print-report-header h1 {
          margin: 2px 0 !important;
          font-size: 18px !important;
          line-height: 1.05 !important;
        }

        body.forecast-executive-print-v17 .print-report-header p,
        body.forecast-executive-print-v17 .print-report-header span {
          font-size: 7px !important;
          line-height: 1.2 !important;
        }

        body.forecast-executive-print-v17 .forecast-heading-v13,
        body.forecast-executive-print-v17 .forecast-filter-v13,
        body.forecast-executive-print-v17 .forecast-accuracy-v14,
        body.forecast-executive-print-v17 .forecast-note-v13,
        body.forecast-executive-print-v17 .client-identity-v16-badge,
        body.forecast-executive-print-v17 .forecast-main-v13 > .forecast-panel-v13:first-child,
        body.forecast-executive-print-v17 .row-actions-v13,
        body.forecast-executive-print-v17 .forecast-table-v13 th:last-child,
        body.forecast-executive-print-v17 .forecast-table-v13 td:last-child,
        body.forecast-executive-print-v17 .print-hide-standard-note-v17 {
          display: none !important;
        }

        body.forecast-executive-print-v17 .receipt-forecast-page-v13 {
          display: block !important;
          gap: 0 !important;
        }

        body.forecast-executive-print-v17 .forecast-kpis-v13 {
          display: grid !important;
          grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
          gap: 5px !important;
          margin: 0 0 6px !important;
        }

        body.forecast-executive-print-v17 .forecast-kpis-v13 article {
          min-height: 0 !important;
          padding: 7px 9px !important;
          border: 1px solid #cfd3da !important;
          border-radius: 7px !important;
          background: #fff !important;
          box-shadow: none !important;
          break-inside: avoid !important;
        }

        body.forecast-executive-print-v17 .forecast-kpis-v13 article > span {
          font-size: 6.6px !important;
          line-height: 1.1 !important;
        }

        body.forecast-executive-print-v17 .forecast-kpis-v13 article > strong {
          margin: 3px 0 2px !important;
          font-size: 14px !important;
          line-height: 1.05 !important;
          white-space: nowrap !important;
        }

        body.forecast-executive-print-v17 .forecast-kpis-v13 article > small {
          font-size: 6.2px !important;
          line-height: 1.15 !important;
        }

        body.forecast-executive-print-v17 .forecast-main-v13 {
          display: block !important;
          margin: 0 0 5px !important;
        }

        body.forecast-executive-print-v17 .forecast-main-v13 > .forecast-panel-v13:last-child {
          display: block !important;
          margin: 0 0 5px !important;
          padding: 6px !important;
          border: 1px solid #d5d8de !important;
          border-radius: 7px !important;
          box-shadow: none !important;
          break-inside: avoid !important;
        }

        body.forecast-executive-print-v17 .forecast-main-v13 > .forecast-panel-v13:last-child .forecast-panel-head-v13 {
          margin: 0 0 4px !important;
          padding: 0 2px 4px !important;
        }

        body.forecast-executive-print-v17 .forecast-main-v13 > .forecast-panel-v13:last-child .forecast-panel-head-v13 h3 {
          margin: 0 !important;
          font-size: 10px !important;
          line-height: 1.1 !important;
        }

        body.forecast-executive-print-v17 .forecast-main-v13 > .forecast-panel-v13:last-child .forecast-panel-head-v13 p {
          margin: 2px 0 0 !important;
          font-size: 6px !important;
          line-height: 1.1 !important;
        }

        body.forecast-executive-print-v17 .forecast-weeks-v13 {
          display: grid !important;
          grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
          gap: 4px !important;
          max-height: none !important;
          padding: 0 !important;
          overflow: visible !important;
          border: 0 !important;
          background: transparent !important;
        }

        body.forecast-executive-print-v17 .forecast-weeks-v13 button {
          display: block !important;
          min-width: 0 !important;
          min-height: 0 !important;
          height: auto !important;
          padding: 6px !important;
          border: 1px solid #d9dde4 !important;
          border-radius: 6px !important;
          background: #fff !important;
          box-shadow: none !important;
          transform: none !important;
          text-align: left !important;
          overflow: visible !important;
        }

        body.forecast-executive-print-v17 .forecast-weeks-v13 button.active,
        body.forecast-executive-print-v17 .forecast-weeks-v13 button.week-current-v15 {
          border-color: #aeb4bf !important;
          background: #f5f5f5 !important;
          box-shadow: none !important;
        }

        body.forecast-executive-print-v17 .forecast-weeks-v13 button > span,
        body.forecast-executive-print-v17 .forecast-weeks-v13 button > strong,
        body.forecast-executive-print-v17 .forecast-weeks-v13 button > em,
        body.forecast-executive-print-v17 .forecast-weeks-v13 button > small {
          display: block !important;
          width: 100% !important;
          margin: 0 !important;
          white-space: normal !important;
          text-align: left !important;
        }

        body.forecast-executive-print-v17 .forecast-weeks-v13 button > span {
          min-height: 0 !important;
          font-size: 6.6px !important;
          line-height: 1.15 !important;
        }

        body.forecast-executive-print-v17 .forecast-weeks-v13 button > span::after {
          display: none !important;
        }

        body.forecast-executive-print-v17 .forecast-weeks-v13 button > strong {
          margin-top: 4px !important;
          font-size: 8.2px !important;
          line-height: 1.1 !important;
          white-space: nowrap !important;
        }

        body.forecast-executive-print-v17 .forecast-weeks-v13 button > em {
          margin-top: 3px !important;
          font-size: 7px !important;
          line-height: 1.1 !important;
          white-space: nowrap !important;
        }

        body.forecast-executive-print-v17 .forecast-weeks-v13 button > small {
          margin-top: 3px !important;
          font-size: 5.8px !important;
          line-height: 1.1 !important;
        }

        body.forecast-executive-print-v17 .forecast-weeks-v13 button > i {
          display: none !important;
        }

        body.forecast-executive-print-v17 .forecast-panel-v13:has(.forecast-table-v13) {
          margin: 0 !important;
          padding: 0 !important;
          border: 0 !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          break-inside: auto !important;
          page-break-before: auto !important;
        }

        body.forecast-executive-print-v17 .forecast-panel-v13:has(.forecast-table-v13) .forecast-panel-head-v13 {
          margin: 0 !important;
          padding: 3px 0 4px !important;
          border: 0 !important;
        }

        body.forecast-executive-print-v17 .forecast-panel-v13:has(.forecast-table-v13) .forecast-panel-head-v13 h3 {
          margin: 0 !important;
          font-size: 10px !important;
          line-height: 1.1 !important;
        }

        body.forecast-executive-print-v17 .forecast-panel-v13:has(.forecast-table-v13) .forecast-panel-head-v13 p {
          display: none !important;
        }

        body.forecast-executive-print-v17 .forecast-table-v13 {
          overflow: visible !important;
          border: 1px solid #cfd3da !important;
          border-radius: 0 !important;
        }

        body.forecast-executive-print-v17 .forecast-table-v13 table {
          width: 100% !important;
          min-width: 0 !important;
          table-layout: fixed !important;
          border-collapse: collapse !important;
        }

        body.forecast-executive-print-v17 .forecast-table-v13 thead {
          display: table-header-group !important;
        }

        body.forecast-executive-print-v17 .forecast-table-v13 tr {
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }

        body.forecast-executive-print-v17 .forecast-table-v13 th,
        body.forecast-executive-print-v17 .forecast-table-v13 td {
          padding: 3px 4px !important;
          border-bottom: 1px solid #d9dce2 !important;
          font-size: 6.3px !important;
          line-height: 1.14 !important;
          vertical-align: top !important;
          overflow-wrap: anywhere !important;
        }

        body.forecast-executive-print-v17 .forecast-table-v13 th {
          background: #f2f3f5 !important;
          color: #4b505a !important;
          font-size: 5.8px !important;
          font-weight: 900 !important;
          letter-spacing: .035em !important;
        }

        body.forecast-executive-print-v17 .forecast-table-v13 th:nth-child(1),
        body.forecast-executive-print-v17 .forecast-table-v13 td:nth-child(1) { width: 39% !important; }
        body.forecast-executive-print-v17 .forecast-table-v13 th:nth-child(2),
        body.forecast-executive-print-v17 .forecast-table-v13 td:nth-child(2) { width: 15% !important; }
        body.forecast-executive-print-v17 .forecast-table-v13 th:nth-child(3),
        body.forecast-executive-print-v17 .forecast-table-v13 td:nth-child(3) { width: 12% !important; }
        body.forecast-executive-print-v17 .forecast-table-v13 th:nth-child(4),
        body.forecast-executive-print-v17 .forecast-table-v13 td:nth-child(4) { width: 18% !important; }
        body.forecast-executive-print-v17 .forecast-table-v13 th:nth-child(5),
        body.forecast-executive-print-v17 .forecast-table-v13 td:nth-child(5) { width: 9% !important; }
        body.forecast-executive-print-v17 .forecast-table-v13 th:nth-child(6),
        body.forecast-executive-print-v17 .forecast-table-v13 td:nth-child(6) { width: 7% !important; }

        body.forecast-executive-print-v17 .forecast-table-v13 td.client strong {
          display: block !important;
          font-size: 6.6px !important;
          line-height: 1.12 !important;
        }

        body.forecast-executive-print-v17 .forecast-table-v13 td.client span,
        body.forecast-executive-print-v17 .forecast-table-v13 .status small {
          margin-top: 1px !important;
          font-size: 5.6px !important;
          line-height: 1.12 !important;
        }

        body.forecast-executive-print-v17 .forecast-table-v13 .status b,
        body.forecast-executive-print-v17 .forecast-table-v13 .confidence {
          font-size: 6.2px !important;
          line-height: 1.1 !important;
        }
      }
    `}</style>
  );
}
