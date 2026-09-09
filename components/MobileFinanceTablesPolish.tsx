"use client";

export default function MobileFinanceTablesPolish({ scope }: { scope: "invoices" | "receipts" | "forecast" }) {
  return (
    <style jsx global>{`
      @media (max-width: 760px) {
        ${scope === "invoices" || scope === "receipts" ? `
          .table-wrap {
            overflow: visible !important;
            border: 0 !important;
            background: transparent !important;
          }
          .table-wrap table,
          .table-wrap tbody {
            display: block !important;
            width: 100% !important;
          }
          .table-wrap thead { display: none !important; }
          .table-wrap tbody {
            display: grid !important;
            gap: 10px !important;
          }
          .table-wrap tbody tr {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            width: 100% !important;
            padding: 12px !important;
            overflow: hidden !important;
            border: 1px solid #e5e8ef !important;
            border-radius: 14px !important;
            background: #fff !important;
            box-shadow: 0 5px 16px rgba(31,39,67,.035) !important;
          }
          .table-wrap tbody td {
            display: flex !important;
            min-width: 0 !important;
            min-height: 0 !important;
            padding: 7px 6px !important;
            border: 0 !important;
            flex-direction: column !important;
            align-items: flex-start !important;
            justify-content: flex-start !important;
            gap: 3px !important;
            text-align: left !important;
            white-space: normal !important;
            overflow-wrap: break-word !important;
            word-break: normal !important;
            line-height: 1.32 !important;
            font-size: 12px !important;
          }
          .table-wrap tbody td::before {
            display: block !important;
            color: #9199aa !important;
            font-size: 8px !important;
            font-weight: 800 !important;
            letter-spacing: .55px !important;
            text-transform: uppercase !important;
          }
          .table-wrap tbody td.number {
            text-align: left !important;
            align-items: flex-start !important;
          }
          .table-wrap tbody td.number strong { font-size: 13px !important; }
          .table-wrap .client-cell,
          .table-wrap .description-cell {
            grid-column: 1 / -1 !important;
            font-size: 13px !important;
          }
          .table-wrap .description-cell {
            color: #4d5669 !important;
          }
          .nf-pill, .bank-pill {
            max-width: 100% !important;
            width: fit-content !important;
            white-space: normal !important;
          }
          ${scope === "invoices" ? `
            .table-wrap tbody td:nth-child(1)::before { content: "Emissão"; }
            .table-wrap tbody td:nth-child(2)::before { content: "NF"; }
            .table-wrap tbody td:nth-child(3)::before { content: "Cliente"; }
            .table-wrap tbody td:nth-child(4)::before { content: "Código"; }
            .table-wrap tbody td:nth-child(5)::before { content: "Valor bruto"; }
            .table-wrap tbody td:nth-child(6)::before { content: "Valor líquido"; }
          ` : `
            .table-wrap tbody td:nth-child(1)::before { content: "Recebimento"; }
            .table-wrap tbody td:nth-child(2)::before { content: "Banco"; }
            .table-wrap tbody td:nth-child(3)::before { content: "Descrição"; }
            .table-wrap tbody td:nth-child(4)::before { content: "NF identificada"; }
            .table-wrap tbody td:nth-child(5)::before { content: "Valor"; }
            .table-wrap tbody td:nth-child(3) { grid-column: 1 / -1 !important; }
          `}
          .table-toolbar > div[style] {
            width: 100% !important;
            min-width: 0 !important;
            margin-left: 0 !important;
            grid-template-columns: 1fr !important;
            gap: 4px !important;
          }
          .table-toolbar > div[style] span { text-align: left !important; }
          .table-pagination {
            gap: 10px !important;
            align-items: stretch !important;
            flex-direction: column !important;
          }
          .table-pagination > div {
            width: 100% !important;
            justify-content: space-between !important;
          }
        ` : `
          .forecast-table-v13 {
            overflow: visible !important;
            border: 0 !important;
            background: transparent !important;
          }
          .forecast-table-v13 table,
          .forecast-table-v13 tbody {
            display: block !important;
            width: 100% !important;
          }
          .forecast-table-v13 thead { display: none !important; }
          .forecast-table-v13 tbody {
            display: grid !important;
            gap: 10px !important;
            padding: 0 8px 10px !important;
          }
          .forecast-table-v13 tbody tr {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0 !important;
            width: 100% !important;
            padding: 12px !important;
            border: 1px solid #e5e8ef !important;
            border-radius: 14px !important;
            background: #fff !important;
            box-shadow: 0 5px 16px rgba(31,39,67,.04) !important;
          }
          .forecast-table-v13 tbody td,
          .forecast-table-v13 tbody td.client {
            display: flex !important;
            min-width: 0 !important;
            min-height: 0 !important;
            padding: 7px 6px !important;
            border: 0 !important;
            flex-direction: column !important;
            align-items: flex-start !important;
            justify-content: flex-start !important;
            gap: 3px !important;
            white-space: normal !important;
            overflow-wrap: break-word !important;
            word-break: normal !important;
            line-height: 1.28 !important;
            font-size: 11.5px !important;
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
            font-size: 14px !important;
            color: #20263a !important;
          }
          .forecast-table-v13 tbody td:nth-child(4) {
            grid-column: 1 / -1 !important;
          }
          .forecast-table-v13 tbody td:nth-child(7) {
            align-items: flex-end !important;
            justify-content: flex-end !important;
          }
          .forecast-table-v13 tbody td:nth-child(7)::before { align-self: flex-start; }
          .forecast-table-v13 tbody td:nth-child(7) button {
            min-width: 42px !important;
            min-height: 42px !important;
          }
          .forecast-filter-v13 {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            grid-template-areas:
              "title title"
              "client month"
              "week confidence"
              "pending clear" !important;
          }
          .forecast-filter-v13 > button {
            width: 100% !important;
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
