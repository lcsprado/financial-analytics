"use client";

import { useEffect } from "react";

const BIOMEGA_MARK = "data:image/jpeg;base64,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";

export default function ReceiptForecastPrintRefinementV18() {
  useEffect(() => {
    const logo = document.querySelector<HTMLImageElement>(".print-report-header .print-report-brand img");
    if (!logo) return;
    const previous = logo.src;
    logo.src = BIOMEGA_MARK;
    return () => {
      logo.src = previous;
    };
  }, []);

  return (
    <style jsx global>{`
      @media print {
        .receipt-forecast-active-v13 .forecast-main-v13 {
          display: none !important;
        }

        .receipt-forecast-active-v13 .forecast-table-v13 th:nth-child(5),
        .receipt-forecast-active-v13 .forecast-table-v13 td:nth-child(5),
        .receipt-forecast-active-v13 .forecast-table-v13 th:nth-child(7),
        .receipt-forecast-active-v13 .forecast-table-v13 td:nth-child(7) {
          display: none !important;
        }

        .receipt-forecast-active-v13 .forecast-table-v13 table {
          table-layout: fixed !important;
          width: 100% !important;
        }

        .receipt-forecast-active-v13 .forecast-table-v13 th:nth-child(1),
        .receipt-forecast-active-v13 .forecast-table-v13 td:nth-child(1) {
          width: 36% !important;
        }

        .receipt-forecast-active-v13 .forecast-table-v13 th:nth-child(2),
        .receipt-forecast-active-v13 .forecast-table-v13 td:nth-child(2) {
          width: 16% !important;
        }

        .receipt-forecast-active-v13 .forecast-table-v13 th:nth-child(3),
        .receipt-forecast-active-v13 .forecast-table-v13 td:nth-child(3) {
          width: 14% !important;
        }

        .receipt-forecast-active-v13 .forecast-table-v13 th:nth-child(4),
        .receipt-forecast-active-v13 .forecast-table-v13 td:nth-child(4) {
          width: 24% !important;
        }

        .receipt-forecast-active-v13 .forecast-table-v13 th:nth-child(6),
        .receipt-forecast-active-v13 .forecast-table-v13 td:nth-child(6) {
          width: 10% !important;
        }

        .print-report-header.forecast-print-header .print-report-brand img {
          display: block !important;
          width: 38px !important;
          height: 38px !important;
          object-fit: contain !important;
          flex: 0 0 38px !important;
          padding: 0 !important;
          margin: 0 !important;
          border: 0 !important;
          border-radius: 0 !important;
          background: transparent !important;
          filter: grayscale(1) contrast(1.08) !important;
          opacity: .9 !important;
        }

        .print-report-header.forecast-print-header .print-report-brand {
          gap: 9px !important;
        }
      }
    `}</style>
  );
}
