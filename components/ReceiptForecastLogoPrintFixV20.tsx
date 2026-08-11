"use client";

export default function ReceiptForecastLogoPrintFixV20() {
  return (
    <style jsx global>{`
      @media print {
        .print-report-header.forecast-print-header .print-report-brand {
          gap: 8px !important;
        }

        .print-report-header.forecast-print-header .print-report-brand img {
          display: block !important;
          width: 34px !important;
          height: 46px !important;
          flex: 0 0 34px !important;
          object-fit: cover !important;
          object-position: center center !important;
          padding: 0 !important;
          margin: 0 !important;
          border: 0 !important;
          border-radius: 0 !important;
          background: transparent !important;
          filter: none !important;
          opacity: 1 !important;
          box-shadow: none !important;
          mix-blend-mode: multiply !important;
        }
      }
    `}</style>
  );
}
