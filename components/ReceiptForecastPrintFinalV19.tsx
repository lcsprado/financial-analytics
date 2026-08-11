"use client";

export default function ReceiptForecastPrintFinalV19() {
  return (
    <style jsx global>{`
      @media print {
        body.receipt-forecast-active-v13.forecast-executive-print-v17 .forecast-main-v13,
        body.receipt-forecast-active-v13.forecast-executive-print-v17 .forecast-panel-v13:has(.forecast-weeks-v13),
        body.receipt-forecast-active-v13.forecast-executive-print-v17 .forecast-weeks-v13 {
          display: none !important;
          margin: 0 !important;
          padding: 0 !important;
          height: 0 !important;
          min-height: 0 !important;
          max-height: 0 !important;
          overflow: hidden !important;
          border: 0 !important;
        }

        body.receipt-forecast-active-v13.forecast-executive-print-v17 .forecast-table-v13 th:nth-child(5),
        body.receipt-forecast-active-v13.forecast-executive-print-v17 .forecast-table-v13 td:nth-child(5),
        body.receipt-forecast-active-v13.forecast-executive-print-v17 .forecast-table-v13 th:nth-child(7),
        body.receipt-forecast-active-v13.forecast-executive-print-v17 .forecast-table-v13 td:nth-child(7) {
          display: none !important;
        }

        body.receipt-forecast-active-v13.forecast-executive-print-v17 .forecast-table-v13 th:nth-child(1),
        body.receipt-forecast-active-v13.forecast-executive-print-v17 .forecast-table-v13 td:nth-child(1) {
          width: 38% !important;
        }

        body.receipt-forecast-active-v13.forecast-executive-print-v17 .forecast-table-v13 th:nth-child(2),
        body.receipt-forecast-active-v13.forecast-executive-print-v17 .forecast-table-v13 td:nth-child(2) {
          width: 17% !important;
        }

        body.receipt-forecast-active-v13.forecast-executive-print-v17 .forecast-table-v13 th:nth-child(3),
        body.receipt-forecast-active-v13.forecast-executive-print-v17 .forecast-table-v13 td:nth-child(3) {
          width: 14% !important;
        }

        body.receipt-forecast-active-v13.forecast-executive-print-v17 .forecast-table-v13 th:nth-child(4),
        body.receipt-forecast-active-v13.forecast-executive-print-v17 .forecast-table-v13 td:nth-child(4) {
          width: 23% !important;
        }

        body.receipt-forecast-active-v13.forecast-executive-print-v17 .forecast-table-v13 th:nth-child(6),
        body.receipt-forecast-active-v13.forecast-executive-print-v17 .forecast-table-v13 td:nth-child(6) {
          width: 8% !important;
        }
      }
    `}</style>
  );
}
