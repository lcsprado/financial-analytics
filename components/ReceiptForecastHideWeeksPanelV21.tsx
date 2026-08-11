"use client";

export default function ReceiptForecastHideWeeksPanelV21() {
  return (
    <style jsx global>{`
      .receipt-forecast-active-v13 .forecast-panel-v13:has(.forecast-weeks-v13) {
        display: none !important;
      }
    `}</style>
  );
}
