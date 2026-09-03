"use client";

export default function ReceiptForecastTableFitFix() {
  return (
    <style jsx global>{`
      .receipt-forecast-page-v13 .forecast-table-v13 table {
        width: 100% !important;
        min-width: 0 !important;
        table-layout: fixed;
      }

      .receipt-forecast-page-v13 .forecast-table-v13 th,
      .receipt-forecast-page-v13 .forecast-table-v13 td {
        padding-left: 9px;
        padding-right: 9px;
        overflow-wrap: anywhere;
      }

      .receipt-forecast-page-v13 .forecast-table-v13 th:nth-child(1),
      .receipt-forecast-page-v13 .forecast-table-v13 td:nth-child(1) { width: 30%; }
      .receipt-forecast-page-v13 .forecast-table-v13 th:nth-child(2),
      .receipt-forecast-page-v13 .forecast-table-v13 td:nth-child(2) { width: 13%; }
      .receipt-forecast-page-v13 .forecast-table-v13 th:nth-child(3),
      .receipt-forecast-page-v13 .forecast-table-v13 td:nth-child(3) { width: 13%; }
      .receipt-forecast-page-v13 .forecast-table-v13 th:nth-child(4),
      .receipt-forecast-page-v13 .forecast-table-v13 td:nth-child(4) { width: 14%; }
      .receipt-forecast-page-v13 .forecast-table-v13 th:nth-child(5),
      .receipt-forecast-page-v13 .forecast-table-v13 td:nth-child(5) { width: 10%; }
      .receipt-forecast-page-v13 .forecast-table-v13 th:nth-child(6),
      .receipt-forecast-page-v13 .forecast-table-v13 td:nth-child(6) { width: 8%; }
      .receipt-forecast-page-v13 .forecast-table-v13 th:nth-child(7),
      .receipt-forecast-page-v13 .forecast-table-v13 td:nth-child(7) { width: 12%; }

      .receipt-forecast-page-v13 .forecast-table-v13 td.client {
        min-width: 0 !important;
      }

      .receipt-forecast-page-v13 .row-actions-v13 {
        flex-wrap: wrap;
      }
    `}</style>
  );
}
