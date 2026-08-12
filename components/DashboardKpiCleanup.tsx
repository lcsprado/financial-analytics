"use client";

export default function DashboardKpiCleanup() {
  return (
    <style jsx global>{`
      /*
       * A Visão Geral já tem uma estrutura fixa para os KPIs:
       * Emitido, Recebido, Composição Cielo, Diferença e Ticket médio.
       * O Ticket médio foi descontinuado visualmente e os quatro indicadores
       * principais devem ocupar o grid ampliado desde o primeiro paint.
       *
       * Antes isso era feito depois da renderização via DOM, o que criava uma
       * condição de corrida ao recuperar os dados offline: em algumas aberturas
       * o dashboard aparecia com cinco colunas até um F5. Mantemos a regra
       * exclusivamente em CSS, aplicada à própria grade da Visão Geral.
       */
      .kpi-grid.overview-print-kpis > .kpi-card:last-child {
        display: none !important;
      }

      @media (min-width: 1001px) {
        .kpi-grid.overview-print-kpis {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        }

        .kpi-grid.overview-print-kpis .kpi-card {
          min-height: 128px;
          padding: 20px 22px;
        }

        .kpi-grid.overview-print-kpis .kpi-card > strong {
          font-size: clamp(27px, 2.2vw, 34px);
        }
      }

      @media (min-width: 641px) and (max-width: 1000px) {
        .kpi-grid.overview-print-kpis {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        }
      }

      @media (max-width: 640px) {
        .kpi-grid.overview-print-kpis {
          grid-template-columns: 1fr !important;
        }
      }
    `}</style>
  );
}
