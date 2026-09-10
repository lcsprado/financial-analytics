"use client";

export default function ViewerForecastReadOnlyGuard() {
  return <style jsx global>{`
    html[data-dashboard-role="viewer"] .forecast-heading-actions-v13 > button:first-child,
    html[data-dashboard-role="viewer"] .forecast-table-v13 th:last-child,
    html[data-dashboard-role="viewer"] .forecast-table-v13 td:last-child,
    html[data-dashboard-role="viewer"] .adjustments-list-v13 button {
      display: none !important;
    }
  `}</style>;
}
