"use client";

export default function ReceiptForecastComparativeCleanup() {
  return (
    <style jsx global>{`
      .receipt-forecast-active-v13 .forecast-main-v13 {
        grid-template-columns: minmax(0, 1fr) !important;
      }

      .receipt-forecast-active-v13 .forecast-main-v13 > .forecast-panel-v13:first-child {
        display: none !important;
      }
    `}</style>
  );
}
