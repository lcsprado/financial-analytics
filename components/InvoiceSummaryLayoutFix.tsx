"use client";

export default function InvoiceSummaryLayoutFix() {
  return (
    <style jsx global>{`
      .topbar-title h1:has(+ *) { min-width: 0; }

      .panel:has(.invoice-emission-chart) .table-toolbar {
        display: grid !important;
        grid-template-columns: minmax(260px, 1fr) auto !important;
        align-items: center !important;
        gap: 12px 18px !important;
      }

      .panel:has(.invoice-emission-chart) .table-toolbar .search-box {
        min-width: 0 !important;
        width: 100% !important;
      }

      .panel:has(.invoice-emission-chart) [data-invoice-summary-slot] {
        margin-left: 0 !important;
        min-width: 0 !important;
        max-width: 100% !important;
      }

      .panel:has(.invoice-emission-chart) .invoice-summary-values {
        display: flex !important;
        align-items: center !important;
        justify-content: flex-end !important;
        flex-wrap: wrap !important;
        gap: 8px 18px !important;
      }

      .panel:has(.invoice-emission-chart) .invoice-summary-values span {
        display: inline-flex !important;
        align-items: baseline !important;
        gap: 4px !important;
        min-width: 0 !important;
        white-space: nowrap !important;
      }

      .panel:has(.invoice-emission-chart) .table-export {
        grid-column: 1 / -1 !important;
        justify-self: start !important;
      }

      @media (max-width: 1180px) {
        .panel:has(.invoice-emission-chart) .table-toolbar {
          grid-template-columns: 1fr !important;
        }

        .panel:has(.invoice-emission-chart) .invoice-summary-values {
          justify-content: flex-start !important;
        }

        .panel:has(.invoice-emission-chart) [data-invoice-summary-slot],
        .panel:has(.invoice-emission-chart) .table-export {
          width: 100% !important;
        }
      }

      @media (max-width: 760px) {
        .panel:has(.invoice-emission-chart) .invoice-summary-values {
          display: grid !important;
          grid-template-columns: 1fr !important;
          gap: 6px !important;
        }

        .panel:has(.invoice-emission-chart) .invoice-summary-values span {
          white-space: normal !important;
        }
      }
    `}</style>
  );
}
