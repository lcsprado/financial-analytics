"use client";

import { useEffect } from "react";

export default function DashboardVisualPolishV1() {
  useEffect(() => {
    const syncScope = () => {
      const title = document.querySelector<HTMLElement>(".topbar-title h1")?.textContent?.trim().toLowerCase() || "";
      document.body.classList.toggle("dashboard-overview-polish-v1", title === "visão geral" || title === "visao geral");
    };

    syncScope();
    const observer = new MutationObserver(syncScope);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    document.addEventListener("click", syncScope, true);

    return () => {
      observer.disconnect();
      document.removeEventListener("click", syncScope, true);
      document.body.classList.remove("dashboard-overview-polish-v1");
    };
  }, []);

  return (
    <style jsx global>{`
      /* Visão geral: acabamento visual sem alterar estrutura ou cálculos */
      .dashboard-overview-polish-v1 .content-area {
        padding-top: 30px;
      }

      .dashboard-overview-polish-v1 .topbar {
        border-bottom-color: #e9ecf3;
        box-shadow: 0 4px 18px rgba(31, 39, 67, .025);
      }

      .dashboard-overview-polish-v1 .topbar-title h1 {
        font-size: 23px;
        letter-spacing: -.65px;
      }

      .dashboard-overview-polish-v1 .filter-bar {
        margin-bottom: 20px;
        padding: 14px 16px;
        border-color: #e4e8f0;
        border-radius: 14px;
        box-shadow: 0 7px 22px rgba(31, 39, 67, .035);
      }

      .dashboard-overview-polish-v1 .filter-heading span {
        color: #31384b;
        letter-spacing: -.12px;
      }

      .dashboard-overview-polish-v1 .select-wrap select {
        height: 36px;
        border-color: #e2e6ee;
        border-radius: 9px;
        background: #fafbfe;
        transition: border-color .16s ease, box-shadow .16s ease, background .16s ease;
      }

      .dashboard-overview-polish-v1 .select-wrap select:hover {
        border-color: #d5daE5;
        background: #fff;
      }

      .dashboard-overview-polish-v1 .select-wrap select:focus {
        border-color: rgba(93,114,246,.48);
        box-shadow: 0 0 0 3px rgba(93,114,246,.09);
        background: #fff;
      }

      .dashboard-overview-polish-v1 .kpi-grid {
        gap: 14px;
        margin-bottom: 18px;
      }

      .dashboard-overview-polish-v1 .kpi-card {
        min-height: 144px;
        padding: 19px 20px 18px;
        border-color: #e5e8ef;
        border-radius: 16px;
        box-shadow: 0 9px 28px rgba(31, 39, 67, .055);
        transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
      }

      .dashboard-overview-polish-v1 .kpi-card:hover {
        transform: translateY(-2px);
        border-color: #dce1eb;
        box-shadow: 0 13px 34px rgba(31, 39, 67, .075);
      }

      .dashboard-overview-polish-v1 .kpi-card::after {
        width: 86px;
        height: 86px;
        right: -34px;
        bottom: -44px;
        opacity: .72;
      }

      .dashboard-overview-polish-v1 .kpi-title {
        color: #778195;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: .015em;
      }

      .dashboard-overview-polish-v1 .kpi-icon {
        width: 35px;
        height: 35px;
        border-radius: 10px;
      }

      .dashboard-overview-polish-v1 .kpi-card strong {
        margin-top: 13px;
        color: #20263a;
        font-size: clamp(23px, 2vw, 30px);
        line-height: 1.04;
        letter-spacing: -1.25px;
      }

      .dashboard-overview-polish-v1 .kpi-detail {
        margin-top: 8px;
        color: #969eae;
        font-size: 9.5px;
        line-height: 1.35;
      }

      .dashboard-overview-polish-v1 .chart-grid,
      .dashboard-overview-polish-v1 .lower-grid {
        gap: 18px;
        margin-bottom: 18px;
      }

      .dashboard-overview-polish-v1 .panel {
        padding: 20px;
        border-color: #e5e8ef;
        border-radius: 16px;
        box-shadow: 0 9px 28px rgba(31, 39, 67, .05);
      }

      .dashboard-overview-polish-v1 .panel-header {
        margin-bottom: 14px;
      }

      .dashboard-overview-polish-v1 .panel-header h2 {
        color: #292f42;
        font-size: 14.5px;
        font-weight: 800;
        letter-spacing: -.3px;
      }

      .dashboard-overview-polish-v1 .panel-header p {
        margin-top: 5px;
        color: #929bad;
        font-size: 9.5px;
        line-height: 1.4;
      }

      .dashboard-overview-polish-v1 .chart-tooltip {
        border-color: #e0e5ee;
        border-radius: 11px;
        box-shadow: 0 14px 34px rgba(25, 32, 55, .13);
      }

      .dashboard-overview-polish-v1 .insight-strip {
        border-color: #e4e8f0;
        border-radius: 14px;
        box-shadow: 0 7px 22px rgba(31, 39, 67, .035);
      }

      .dashboard-overview-polish-v1 .table-wrap {
        border-color: #e9ecf2;
        border-radius: 12px;
        background: #fff;
      }

      .dashboard-overview-polish-v1 th {
        padding-top: 12px;
        padding-bottom: 12px;
        background: #f8f9fc;
        color: #7e8799;
        font-size: 8.5px;
        font-weight: 850;
      }

      .dashboard-overview-polish-v1 td {
        padding-top: 12px;
        padding-bottom: 12px;
        border-top-color: #f0f2f6;
        color: #586174;
      }

      .dashboard-overview-polish-v1 tbody tr {
        transition: background .14s ease;
      }

      .dashboard-overview-polish-v1 tbody tr:hover {
        background: #f8f9ff;
      }

      /* Previsão: mesma linguagem visual da visão geral */
      .receipt-forecast-active-v13 .receipt-forecast-page-v13 {
        gap: 18px;
      }

      .receipt-forecast-active-v13 .forecast-heading-v13 {
        align-items: center;
        padding: 3px 2px 1px;
      }

      .receipt-forecast-active-v13 .forecast-heading-v13 h2 {
        color: #20263a;
        letter-spacing: -.8px;
      }

      .receipt-forecast-active-v13 .forecast-heading-v13 p {
        color: #8993a6;
        line-height: 1.5;
      }

      .receipt-forecast-active-v13 .forecast-filter-v13 {
        border-color: #e4e8f0 !important;
        border-radius: 14px !important;
        box-shadow: 0 7px 22px rgba(31,39,67,.035) !important;
      }

      .receipt-forecast-active-v13 .forecast-filter-v13 select,
      .receipt-forecast-active-v13 .forecast-filter-v13 input {
        border-color: #e2e6ee !important;
        background: #fafbfe !important;
        transition: border-color .16s ease, box-shadow .16s ease, background .16s ease;
      }

      .receipt-forecast-active-v13 .forecast-filter-v13 select:focus,
      .receipt-forecast-active-v13 .forecast-filter-v13 input:focus {
        border-color: rgba(93,114,246,.48) !important;
        box-shadow: 0 0 0 3px rgba(93,114,246,.09) !important;
        background: #fff !important;
      }

      .receipt-forecast-active-v13 .forecast-kpis-v13 {
        gap: 12px !important;
      }

      .receipt-forecast-active-v13 .forecast-kpis-v13 article {
        min-height: 118px;
        border-color: #e5e8ef !important;
        border-radius: 15px !important;
        box-shadow: 0 8px 24px rgba(31,39,67,.045) !important;
        transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
      }

      .receipt-forecast-active-v13 .forecast-kpis-v13 article:hover {
        transform: translateY(-2px);
        border-color: #dce1eb !important;
        box-shadow: 0 12px 30px rgba(31,39,67,.065) !important;
      }

      .receipt-forecast-active-v13 .forecast-kpis-v13 article.active {
        border-color: rgba(93,114,246,.32) !important;
        box-shadow: 0 10px 28px rgba(93,114,246,.10) !important;
      }

      .receipt-forecast-active-v13 .forecast-kpis-v13 article > span {
        color: #768094 !important;
        font-size: 9.5px !important;
        font-weight: 800 !important;
      }

      .receipt-forecast-active-v13 .forecast-kpis-v13 article > strong {
        color: #20263a !important;
        letter-spacing: -.8px;
      }

      .receipt-forecast-active-v13 .forecast-accuracy-v14 {
        padding: 13px !important;
        border-color: #e2e7f0 !important;
        border-radius: 15px !important;
        background: linear-gradient(135deg,#f7f8ff 0%,#fbfcff 42%,#fff 100%) !important;
        box-shadow: 0 8px 26px rgba(31,39,67,.04);
      }

      .receipt-forecast-active-v13 .forecast-accuracy-v14 > div {
        padding: 7px 13px !important;
      }

      .receipt-forecast-active-v13 .forecast-accuracy-v14 strong {
        font-size: 19px !important;
        letter-spacing: -.5px;
      }

      .receipt-forecast-active-v13 .forecast-main-v13 {
        gap: 18px !important;
      }

      .receipt-forecast-active-v13 .forecast-panel-v13 {
        border-color: #e5e8ef !important;
        border-radius: 16px !important;
        box-shadow: 0 9px 28px rgba(31,39,67,.05) !important;
      }

      .receipt-forecast-active-v13 .forecast-panel-head-v13 {
        padding-bottom: 2px;
      }

      .receipt-forecast-active-v13 .forecast-panel-head-v13 h3 {
        color: #292f42;
        font-weight: 800;
        letter-spacing: -.28px;
      }

      .receipt-forecast-active-v13 .forecast-panel-head-v13 p {
        color: #929bad !important;
      }

      .receipt-forecast-active-v13 .forecast-weeks-v13 button {
        border-color: #e7eaf1 !important;
        border-radius: 13px !important;
        background: #fcfcfe !important;
        box-shadow: none !important;
        transition: transform .16s ease, border-color .16s ease, background .16s ease, box-shadow .16s ease;
      }

      .receipt-forecast-active-v13 .forecast-weeks-v13 button:hover {
        transform: translateY(-1px);
        border-color: #dbe0eb !important;
        background: #fff !important;
        box-shadow: 0 8px 20px rgba(31,39,67,.05) !important;
      }

      .receipt-forecast-active-v13 .forecast-weeks-v13 button.active {
        border-color: rgba(93,114,246,.40) !important;
        background: #f7f8ff !important;
        box-shadow: 0 8px 22px rgba(93,114,246,.08) !important;
      }

      .receipt-forecast-active-v13 .forecast-table-v13 {
        border-color: #e8ebf1 !important;
        border-radius: 12px !important;
      }

      .receipt-forecast-active-v13 .forecast-table-v13 th {
        background: #f8f9fc !important;
        color: #7e8799 !important;
        font-size: 8.5px !important;
        font-weight: 850 !important;
      }

      .receipt-forecast-active-v13 .forecast-table-v13 td {
        border-top-color: #eff1f5 !important;
      }

      .receipt-forecast-active-v13 .forecast-table-v13 tbody tr {
        transition: background .14s ease;
      }

      .receipt-forecast-active-v13 .forecast-table-v13 tbody tr:hover {
        background: #f8f9ff !important;
      }

      .receipt-forecast-active-v13 .forecast-table-v13 .status {
        border-radius: 8px !important;
      }

      .receipt-forecast-active-v13 .forecast-note-v13 {
        border-radius: 12px !important;
        color: #7f899c !important;
      }

      @media (max-width: 1180px) {
        .dashboard-overview-polish-v1 .kpi-grid {
          gap: 11px;
        }
        .dashboard-overview-polish-v1 .kpi-card {
          padding: 17px;
        }
      }

      @media (max-width: 760px) {
        .dashboard-overview-polish-v1 .content-area {
          padding-top: 20px;
        }
        .dashboard-overview-polish-v1 .filter-bar {
          padding: 13px;
        }
        .dashboard-overview-polish-v1 .kpi-card {
          min-height: 126px;
          border-radius: 14px;
        }
        .dashboard-overview-polish-v1 .panel {
          padding: 16px;
          border-radius: 14px;
        }
        .receipt-forecast-active-v13 .forecast-heading-v13 {
          align-items: flex-start;
        }
        .receipt-forecast-active-v13 .forecast-kpis-v13 article {
          min-height: 108px;
        }
        .receipt-forecast-active-v13 .forecast-accuracy-v14 {
          padding: 10px !important;
        }
      }

      @media print {
        .dashboard-overview-polish-v1 .kpi-card,
        .dashboard-overview-polish-v1 .panel,
        .receipt-forecast-active-v13 .forecast-panel-v13,
        .receipt-forecast-active-v13 .forecast-kpis-v13 article {
          box-shadow: none !important;
          transform: none !important;
        }
      }
    `}</style>
  );
}
