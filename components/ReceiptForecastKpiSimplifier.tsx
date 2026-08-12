"use client";

export default function ReceiptForecastKpiSimplifier() {
  return (
    <style jsx global>{`
      .receipt-forecast-active-v13 .forecast-kpis-v13 {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      }

      .receipt-forecast-active-v13 .forecast-kpis-v13 > article:nth-child(3),
      .receipt-forecast-active-v13 .forecast-kpis-v13 > article:nth-child(4),
      .receipt-forecast-active-v13 #forecast-accuracy-v14,
      .receipt-forecast-active-v13 .forecast-accuracy-v14 {
        display: none !important;
      }

      @media (max-width: 760px) {
        .receipt-forecast-active-v13 .forecast-kpis-v13 {
          grid-template-columns: 1fr !important;
        }
      }
    `}</style>
  );
}
