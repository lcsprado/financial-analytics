"use client";

export default function SandboxMobileKpiFit() {
  return (
    <style jsx global>{`
      @media (max-width: 760px) {
        .overview-print-kpis .kpi-card > strong,
        .overview-print-kpis .kpi-card strong {
          font-size: clamp(14.5px, 4.5vw, 19px) !important;
          line-height: 1.05 !important;
          letter-spacing: -.85px !important;
          white-space: nowrap !important;
          overflow-wrap: normal !important;
          word-break: normal !important;
        }
      }
    `}</style>
  );
}
