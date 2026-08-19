"use client";

export default function SandboxTablePerformance() {
  return (
    <style jsx global>{`
      @media (max-width: 760px) {
        .table-wrap tbody tr,
        .forecast-table-v13 tbody tr {
          content-visibility: auto;
          contain-intrinsic-size: auto 150px;
        }
      }

      @media print {
        .table-wrap tbody tr,
        .forecast-table-v13 tbody tr {
          content-visibility: visible !important;
          contain-intrinsic-size: none !important;
        }
      }
    `}</style>
  );
}
