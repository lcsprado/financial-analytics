"use client";

export default function MobileFinanceTablesPolish({ scope }: { scope: "invoices" | "receipts" | "forecast" }) {
  return (
    <style jsx global>{`
      @media (max-width: 760px) {
        .content-area,
        .panel,
        .table-wrap,
        .forecast-panel-v13,
        .forecast-table-v13 {
          min-width: 0 !important;
          max-width: 100% !important;
          box-sizing: border-box !important;
        }

        ${scope === "invoices" || scope === "receipts" ? `
          .panel {
            padding: 16px !important;
            border-radius: 20px !important;
            border-color: #e7eaf2 !important;
            box-shadow: 0 12px 30px rgba(31,39,67,.055) !important;
          }
          .panel-header {
            margin-bottom: 14px !important;
          }
          .panel-header h2 {
            font-size: 20px !important;
            letter-spacing: -.55px !important;
          }
          .panel-header p {
            margin-top: 4px !important;
            font-size: 11px !important;
          }
          .native-date-filter {
            border-radius: 16px !important;
            background: linear-gradient(180deg,#fafbfe,#f6f8fc) !important;
            border-color: #e5e9f2 !important;
          }
          .table-toolbar {
            gap: 10px !important;
            margin-top: 12px !important;
            margin-bottom: 14px !important;
          }
          .table-toolbar .search-box {
            height: 50px !important;
            border-radius: 14px !important;
            background: #f8f9fc !important;
            border-color: #e4e8f0 !important;
          }
          .table-toolbar .search-box input {
            font-size: 14px !important;
          }
          .table-toolbar .table-export {
            min-height: 48px !important;
            border-radius: 14px !important;
            background: #fff !important;
            border-color: #e4e8f0 !important;
            font-size: 13px !important;
          }
          .table-toolbar > span,
          .table-toolbar > div[style] {
            color: #7d8699 !important;
            font-size: 12px !important;
          }
          .table-toolbar > span strong,
          .table-toolbar > div[style] strong {
            color: #252c3f !important;
            font-size: 13px !important;
          }
          .table-wrap {
            width: 100% !important;
            overflow: visible !important;
            border: 0 !important;
            background: transparent !important;
          }
          .table-wrap table,
          .table-wrap tbody {
            display: block !important;
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
            table-layout: fixed !important;
            box-sizing: border-box !important;
          }
          .table-wrap thead { display: none !important; }
          .table-wrap tbody {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 12px !important;
          }
          .table-wrap tbody tr {
            position: relative !important;
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
            padding: 15px 16px 14px !important;
            overflow: hidden !important;
            border: 1px solid #e5e8ef !important;
            border-radius: 18px !important;
            background: linear-gradient(180deg,#fff 0%,#fcfdff 100%) !important;
            box-shadow: 0 9px 24px rgba(31,39,67,.055) !important;
            box-sizing: border-box !important;
          }
          .table-wrap tbody tr::before {
            content: "";
            position: absolute;
            left: 0;
            top: 16px;
            bottom: 16px;
            width: 3px;
            border-radius: 0 4px 4px 0;
            background: #dfe4ff;
          }
          .table-wrap tbody td {
            display: flex !important;
            width: auto !important;
            min-width: 0 !important;
            max-width: 100% !important;
            min-height: 0 !important;
            padding: 8px 7px !important;
            border: 0 !important;
            flex-direction: column !important;
            align-items: flex-start !important;
            justify-content: flex-start !important;
            gap: 4px !important;
            text-align: left !important;
            white-space: normal !important;
            overflow: hidden !important;
            overflow-wrap: anywhere !important;
            word-break: normal !important;
            line-height: 1.32 !important;
            font-size: 13px !important;
            box-sizing: border-box !important;
            color: #3e475a !important;
          }
          .table-wrap tbody td::before {
            display: block !important;
            color: #9aa2b3 !important;
            font-size: 8.5px !important;
            font-weight: 800 !important;
            letter-spacing: .8px !important;
            text-transform: uppercase !important;
          }
          .table-wrap tbody td.number {
            text-align: left !important;
            align-items: flex-start !important;
          }
          .table-wrap tbody td.number strong {
            max-width: 100% !important;
            font-size: 15px !important;
            color: #222a3d !important;
            letter-spacing: -.2px !important;
            overflow-wrap: anywhere !important;
          }
          .table-wrap .client-cell,
          .table-wrap .description-cell {
            grid-column: 1 / -1 !important;
            margin: 2px 0 4px !important;
            padding-top: 10px !important;
            padding-bottom: 10px !important;
            border-top: 1px solid #f0f2f6 !important;
            border-bottom: 1px solid #f0f2f6 !important;
            font-size: 14px !important;
            color: #2c3447 !important;
          }
          .table-wrap .client-cell { font-weight: 700 !important; }
          .table-wrap .description-cell { font-weight: 500 !important; }
          .nf-pill, .bank-pill {
            max-width: 100% !important;
            width: fit-content !important;
            white-space: normal !important;
            overflow-wrap: anywhere !important;
            border-radius: 10px !important;
            font-weight: 800 !important;
          }
          .nf-pill {
            padding: 5px 9px !important;
            background: #eef1ff !important;
            color: #596ee6 !important;
          }
          .bank-pill {
            padding: 6px 9px !important;
            background: #eaf8f4 !important;
            color: #25866f !important;
          }
          ${scope === "invoices" ? `
            .table-wrap tbody tr::before { background: #dfe4ff; }
            .table-wrap tbody td:nth-child(1)::before { content: "Emissão"; }
            .table-wrap tbody td:nth-child(2)::before { content: "NF"; }
            .table-wrap tbody td:nth-child(3)::before { content: "Cliente"; }
            .table-wrap tbody td:nth-child(4)::before { content: "Código"; }
            .table-wrap tbody td:nth-child(5)::before { content: "Valor bruto"; }
            .table-wrap tbody td:nth-child(6)::before { content: "Valor líquido"; }
          ` : `
            .table-wrap tbody tr::before { background: #c9eee4; }
            .table-wrap tbody td:nth-child(1)::before { content: "Recebimento"; }
            .table-wrap tbody td:nth-child(2)::before { content: "Banco"; }
            .table-wrap tbody td:nth-child(3)::before { content: "Descrição"; }
            .table-wrap tbody td:nth-child(4)::before { content: "NF identificada"; }
            .table-wrap tbody td:nth-child(5)::before { content: "Valor"; }
            .table-wrap tbody td:nth-child(3) { grid-column: 1 / -1 !important; }
          `}
          .table-toolbar,
          .table-toolbar > * {
            min-width: 0 !important;
            max-width: 100% !important;
          }
          .table-toolbar > div[style] {
            width: 100% !important;
            min-width: 0 !important;
            margin-left: 0 !important;
            grid-template-columns: 1fr !important;
            gap: 4px !important;
          }
          .table-toolbar > div[style] span { text-align: left !important; }
          .table-pagination {
            margin-top: 16px !important;
            padding-top: 14px !important;
            border-top: 1px solid #edf0f5 !important;
            gap: 10px !important;
            align-items: stretch !important;
            flex-direction: column !important;
            color: #8b93a5 !important;
            font-size: 12px !important;
          }
          .table-pagination > div {
            width: 100% !important;
            justify-content: space-between !important;
          }
          .table-pagination button {
            min-height: 42px !important;
            border-radius: 12px !important;
          }
        ` : `
          .forecast-table-v13 {
            width: 100% !important;
            overflow: visible !important;
            border: 0 !important;
            background: transparent !important;
          }
          .forecast-table-v13 table,
          .forecast-table-v13 tbody {
            display: block !important;
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
            table-layout: fixed !important;
            box-sizing: border-box !important;
          }
          .forecast-table-v13 thead { display: none !important; }
          .forecast-table-v13 tbody {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 10px !important;
            padding: 0 8px 10px !important;
          }
          .forecast-table-v13 tbody tr {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0 !important;
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
            padding: 12px !important;
            overflow: hidden !important;
            border: 1px solid #e5e8ef !important;
            border-radius: 14px !important;
            background: #fff !important;
            box-shadow: 0 5px 16px rgba(31,39,67,.04) !important;
            box-sizing: border-box !important;
          }
          .forecast-table-v13 tbody td,
          .forecast-table-v13 tbody td.client {
            display: flex !important;
            width: auto !important;
            min-width: 0 !important;
            max-width: 100% !important;
            min-height: 0 !important;
            padding: 7px 6px !important;
            border: 0 !important;
            flex-direction: column !important;
            align-items: flex-start !important;
            justify-content: flex-start !important;
            gap: 3px !important;
            white-space: normal !important;
            overflow: hidden !important;
            overflow-wrap: anywhere !important;
            word-break: normal !important;
            line-height: 1.28 !important;
            font-size: 11.5px !important;
            box-sizing: border-box !important;
          }
          .forecast-table-v13 tbody td::before {
            display: block !important;
            color: #9199aa !important;
            font-size: 7.5px !important;
            font-weight: 800 !important;
            letter-spacing: .45px !important;
            text-transform: uppercase !important;
          }
          .forecast-table-v13 tbody td:nth-child(1) {
            grid-column: 1 / -1 !important;
            padding-bottom: 10px !important;
            border-bottom: 1px solid #eef0f4 !important;
            font-size: 14px !important;
          }
          .forecast-table-v13 tbody td:nth-child(1)::before { content: "Cliente"; }
          .forecast-table-v13 tbody td:nth-child(2)::before { content: "Janela"; }
          .forecast-table-v13 tbody td:nth-child(3)::before { content: "Valor"; }
          .forecast-table-v13 tbody td:nth-child(4)::before { content: "Situação"; }
          .forecast-table-v13 tbody td:nth-child(5)::before { content: "Presença histórica"; }
          .forecast-table-v13 tbody td:nth-child(6)::before { content: "Confiança"; }
          .forecast-table-v13 tbody td:nth-child(7)::before { content: "Ajustar"; }
          .forecast-table-v13 tbody td:nth-child(3) strong {
            max-width: 100% !important;
            font-size: 14px !important;
            color: #20263a !important;
            overflow-wrap: anywhere !important;
          }
          .forecast-table-v13 tbody td:nth-child(4) { grid-column: 1 / -1 !important; }
          .forecast-table-v13 tbody td:nth-child(7) {
            align-items: flex-start !important;
            justify-content: flex-start !important;
          }
          .forecast-table-v13 tbody td:nth-child(7) button {
            position: static !important;
            inset: auto !important;
            transform: none !important;
            margin: 0 !important;
            min-width: 42px !important;
            min-height: 42px !important;
          }
          .forecast-filter-v13 {
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            grid-template-areas:
              "title title"
              "client month"
              "week confidence"
              "pending clear" !important;
            box-sizing: border-box !important;
          }
          .forecast-filter-v13 > button {
            width: 100% !important;
            min-width: 0 !important;
            justify-self: stretch !important;
          }
          @media (max-width: 360px) {
            .forecast-table-v13 tbody tr { grid-template-columns: 1fr !important; }
            .forecast-table-v13 tbody td:nth-child(1),
            .forecast-table-v13 tbody td:nth-child(4) { grid-column: 1 !important; }
          }
        `}
      }
    `}</style>
  );
}
