"use client";

export default function ReceiptForecastHideHighConfidenceKpi() {
  return (
    <style jsx global>{`
      .receipt-forecast-active-v13 .forecast-kpis-v13 {
        grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
      }

      .receipt-forecast-active-v13 .forecast-kpis-v13 > article:nth-child(3) {
        display: none !important;
      }

      @media (max-width: 1100px) {
        .receipt-forecast-active-v13 .forecast-kpis-v13 {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        }
      }

      @media (max-width: 760px) {
        .receipt-forecast-active-v13 .forecast-kpis-v13 {
          grid-template-columns: 1fr !important;
        }
      }
    `}</style>
  );
}
