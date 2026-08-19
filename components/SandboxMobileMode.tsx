"use client";

export default function SandboxMobileMode() {
  return <style jsx global>{`
    /* Camada responsiva exclusiva da branch de teste. Não altera cálculos ou dados. */
    html[data-sandbox-role="viewer"] .sidebar nav > button:last-of-type {
      display: none !important;
    }

    @media (max-width: 760px) {
      html, body {
        max-width: 100%;
        overflow-x: hidden;
      }

      body {
        padding-bottom: 24px;
      }

      .sandbox-test-banner {
        min-height: 36px !important;
        padding: 6px 10px !important;
      }

      .sandbox-test-banner > div {
        gap: 7px !important;
      }

      .sandbox-test-banner strong {
        font-size: 11px;
        letter-spacing: .04em;
      }

      .sandbox-test-banner button {
        padding: 5px 8px !important;
        font-size: 11px;
      }

      .sidebar {
        width: min(86vw, 310px) !important;
        padding: 18px 14px !important;
      }

      .brand {
        padding-bottom: 20px !important;
      }

      .sidebar-status,
      .portfolio-signature {
        padding-left: 10px !important;
        padding-right: 10px !important;
      }

      .topbar {
        height: 64px !important;
        padding: 0 12px !important;
        gap: 8px;
      }

      .topbar-title {
        min-width: 0;
        gap: 8px !important;
      }

      .topbar-title h1 {
        max-width: 70vw;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 18px !important;
      }

      .topbar-title span {
        display: none;
      }

      .menu-button {
        flex: 0 0 auto;
        width: 38px;
        height: 38px;
        display: grid !important;
        place-items: center;
        border: 1px solid #e6e9f1 !important;
        border-radius: 10px;
        background: #fff !important;
      }

      /* No celular as ações administrativas continuam acessíveis pelo menu lateral. */
      .topbar-actions {
        display: none !important;
      }

      .content-area {
        width: 100%;
        padding: 12px 10px 28px !important;
      }

      .alert {
        align-items: flex-start;
        font-size: 11px;
      }

      .filter-bar {
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 10px !important;
        padding: 12px !important;
        border-radius: 14px !important;
      }

      .filter-heading {
        grid-column: 1 / -1;
        width: 100% !important;
        margin: 0 0 2px !important;
      }

      .filter-bar label {
        width: 100%;
        min-width: 0;
      }

      .filter-bar .select-wrap,
      .filter-bar .select-wrap select {
        width: 100% !important;
        min-width: 0 !important;
      }

      .filter-bar .client-filter {
        grid-column: 1 / -1;
      }

      .filter-bar .clear-filter {
        grid-column: 2;
        justify-self: end;
      }

      .kpi-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 9px !important;
        margin-bottom: 12px !important;
      }

      .kpi-card {
        min-height: 112px !important;
        padding: 13px !important;
        border-radius: 13px !important;
      }

      .kpi-card strong {
        margin-top: 9px !important;
        font-size: clamp(17px, 5.1vw, 22px) !important;
        letter-spacing: -.7px !important;
        overflow-wrap: anywhere;
      }

      .kpi-title {
        font-size: 9px !important;
      }

      .kpi-icon {
        width: 29px !important;
        height: 29px !important;
      }

      .kpi-detail {
        margin-top: 5px !important;
        font-size: 9px !important;
      }

      .chart-grid,
      .lower-grid {
        display: grid !important;
        grid-template-columns: 1fr !important;
        gap: 10px !important;
        margin-bottom: 10px !important;
      }

      .panel {
        padding: 13px !important;
        border-radius: 14px !important;
        box-shadow: 0 8px 24px rgba(28,35,60,.055) !important;
      }

      .panel-header {
        align-items: flex-start !important;
      }

      .panel-header h2 {
        font-size: 13px !important;
      }

      .chart-box {
        height: 235px !important;
      }

      .short-chart {
        height: 215px !important;
      }

      .pie-layout {
        min-height: 0 !important;
      }

      .pie-chart-box {
        height: 180px !important;
      }

      .table-toolbar {
        gap: 8px !important;
        margin-bottom: 10px !important;
      }

      .table-toolbar > span {
        text-align: right;
        font-size: 10px !important;
      }

      .search-box {
        height: 40px !important;
      }

      /* Emissões e Recebimentos viram cards no celular. */
      .table-wrap {
        overflow: visible !important;
        border: 0 !important;
        border-radius: 0 !important;
      }

      .table-wrap table,
      .table-wrap tbody {
        display: block;
        width: 100%;
        min-width: 0 !important;
      }

      .table-wrap thead {
        display: none;
      }

      .table-wrap tbody {
        display: grid;
        gap: 9px;
      }

      .table-wrap tbody tr {
        display: grid;
        width: 100%;
        overflow: hidden;
        border: 1px solid #e7eaf1;
        border-radius: 13px;
        background: #fff;
        box-shadow: 0 5px 16px rgba(28,35,60,.035);
      }

      .table-wrap tbody tr:hover {
        background: #fff !important;
      }

      .table-wrap tbody td {
        min-width: 0;
        padding: 8px 11px !important;
        display: grid;
        grid-template-columns: 92px minmax(0, 1fr);
        align-items: start;
        gap: 9px;
        border-top: 1px solid #f0f2f6 !important;
        color: #4f596e;
        font-size: 10px !important;
        text-align: left !important;
        overflow-wrap: anywhere;
      }

      .table-wrap tbody td:first-child {
        border-top: 0 !important;
      }

      .table-wrap tbody td::before {
        color: #9099aa;
        font-size: 8px;
        font-weight: 900;
        letter-spacing: .05em;
        text-transform: uppercase;
      }

      .table-wrap table:has(thead th:nth-child(6)) tbody td:nth-child(1)::before { content: "Emissão"; }
      .table-wrap table:has(thead th:nth-child(6)) tbody td:nth-child(2)::before { content: "NF"; }
      .table-wrap table:has(thead th:nth-child(6)) tbody td:nth-child(3)::before { content: "Cliente"; }
      .table-wrap table:has(thead th:nth-child(6)) tbody td:nth-child(4)::before { content: "Código"; }
      .table-wrap table:has(thead th:nth-child(6)) tbody td:nth-child(5)::before { content: "Valor bruto"; }
      .table-wrap table:has(thead th:nth-child(6)) tbody td:nth-child(6)::before { content: "Valor líquido"; }

      .table-wrap table:has(thead th:nth-child(5)):not(:has(thead th:nth-child(6))) tbody td:nth-child(1)::before { content: "Recebimento"; }
      .table-wrap table:has(thead th:nth-child(5)):not(:has(thead th:nth-child(6))) tbody td:nth-child(2)::before { content: "Banco"; }
      .table-wrap table:has(thead th:nth-child(5)):not(:has(thead th:nth-child(6))) tbody td:nth-child(3)::before { content: "Descrição"; }
      .table-wrap table:has(thead th:nth-child(5)):not(:has(thead th:nth-child(6))) tbody td:nth-child(4)::before { content: "NF"; }
      .table-wrap table:has(thead th:nth-child(5)):not(:has(thead th:nth-child(6))) tbody td:nth-child(5)::before { content: "Valor"; }

      .table-wrap .description-cell,
      .table-wrap .client-cell {
        white-space: normal !important;
        overflow: visible !important;
        text-overflow: clip !important;
      }

      .table-wrap td.number strong {
        font-size: 11px;
      }

      .table-note {
        font-size: 9px !important;
      }

      .empty-state {
        min-height: calc(100vh - 150px) !important;
        padding: 30px 10px !important;
      }

      .empty-orb {
        width: 68px !important;
        height: 68px !important;
        border-radius: 21px !important;
        margin-bottom: 18px !important;
      }

      .empty-state h1 {
        margin-top: 10px !important;
        font-size: clamp(30px, 10vw, 40px) !important;
        letter-spacing: -1.5px !important;
      }

      .empty-state > p {
        font-size: 13px !important;
      }

      .feature-row {
        gap: 10px !important;
        margin-top: 26px !important;
      }

      /* Previsão: cards e leitura vertical, sem tabela horizontal. */
      .receipt-forecast-page-v13 {
        gap: 12px !important;
      }

      .forecast-heading-v13 {
        gap: 12px !important;
      }

      .forecast-heading-v13 h2 {
        font-size: 24px !important;
      }

      .forecast-heading-v13 p {
        font-size: 11px !important;
      }

      .forecast-heading-actions-v13 {
        display: grid !important;
        grid-template-columns: 1fr 1fr;
        width: 100%;
      }

      .forecast-heading-actions-v13 button {
        width: 100%;
        justify-content: center;
        padding: 0 8px !important;
      }

      .forecast-filter-v13 {
        padding: 12px !important;
        gap: 9px !important;
      }

      .forecast-filter-title-v13 {
        width: 100%;
        min-width: 0 !important;
      }

      .forecast-filter-v13 > button {
        flex: 1 1 auto;
      }

      .forecast-kpis-v13 {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 9px !important;
      }

      .forecast-kpis-v13 article {
        min-height: 105px !important;
        padding: 13px !important;
      }

      .forecast-kpis-v13 strong {
        font-size: clamp(16px, 5vw, 21px) !important;
        overflow-wrap: anywhere;
      }

      .forecast-main-v13 {
        gap: 10px !important;
      }

      .forecast-chart-v13 {
        height: 230px !important;
      }

      .forecast-weeks-v13 {
        max-height: none !important;
      }

      .forecast-table-v13 {
        overflow: visible !important;
        border-top: 0 !important;
      }

      .forecast-table-v13 table,
      .forecast-table-v13 tbody {
        display: block;
        width: 100%;
        min-width: 0 !important;
      }

      .forecast-table-v13 thead {
        display: none;
      }

      .forecast-table-v13 tbody {
        display: grid;
        gap: 8px;
        padding: 0 10px 10px;
      }

      .forecast-table-v13 tbody tr {
        display: grid;
        overflow: hidden;
        border: 1px solid #e4e8f1;
        border-radius: 12px;
        background: #fff;
      }

      .forecast-table-v13 tbody td,
      .forecast-table-v13 tbody td.client {
        display: grid !important;
        grid-template-columns: 92px minmax(0, 1fr);
        min-width: 0 !important;
        gap: 8px !important;
        padding: 8px 10px !important;
        border-bottom: 1px solid #edf0f5 !important;
        text-align: left !important;
        overflow-wrap: anywhere;
      }

      .forecast-table-v13 tbody td::before {
        color: #9099aa;
        font-size: 8px;
        font-weight: 900;
        letter-spacing: .04em;
        text-transform: uppercase;
      }

      .forecast-table-v13 tbody td:nth-child(1)::before { content: "Cliente"; }
      .forecast-table-v13 tbody td:nth-child(2)::before { content: "Janela"; }
      .forecast-table-v13 tbody td:nth-child(3)::before { content: "Valor"; }
      .forecast-table-v13 tbody td:nth-child(4)::before { content: "Situação"; }
      .forecast-table-v13 tbody td:nth-child(5)::before { content: "Histórico"; }
      .forecast-table-v13 tbody td:nth-child(6)::before { content: "Confiança"; }
      .forecast-table-v13 tbody td:nth-child(7)::before { content: "Ajustar"; }

      .forecast-table-v13 .row-actions-v13 {
        justify-content: flex-start;
      }

      .forecast-basis-v13 {
        padding: 0 10px 12px !important;
      }

      .forecast-modal-backdrop-v13 {
        padding: 8px !important;
      }

      .forecast-modal-v13 {
        max-height: 94vh !important;
        border-radius: 14px !important;
      }

      .modal-head-v13,
      .modal-form-v13 {
        padding: 14px !important;
      }
    }

    @media (max-width: 380px) {
      .kpi-grid,
      .forecast-kpis-v13 {
        grid-template-columns: 1fr !important;
      }

      .filter-bar {
        grid-template-columns: 1fr !important;
      }

      .filter-bar .filter-heading,
      .filter-bar .client-filter,
      .filter-bar .clear-filter {
        grid-column: 1 !important;
      }

      .forecast-heading-actions-v13 {
        grid-template-columns: 1fr !important;
      }
    }
  `}</style>;
}
