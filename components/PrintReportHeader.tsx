export type PrintReportMeta = {
  title: string;
  filters: string;
  generatedAt: string;
  source: string;
  scope: string;
  truncated: boolean;
};

export default function PrintReportHeader({ meta }: { meta: PrintReportMeta }) {
  return (
    <header className="print-report-header" aria-hidden="true" style={{ display: "none" }}>
      <div className="print-report-brand">
        <img src="/report-assets/biomega-logo.jpg" alt="Biomega" />
        <div>
          <span>FINANCIAL ANALYTICS</span>
          <h1>{meta.title}</h1>
          <p>{meta.filters}</p>
          <p>Fonte: {meta.source}{meta.scope ? ` • Abrangência: ${meta.scope}` : ""}</p>
          {meta.truncated ? <p className="print-report-warning">Atenção: a impressão contém apenas a página visível. A exportação inclui todo o resultado filtrado.</p> : null}
        </div>
      </div>
      <p className="print-report-generated-at">{meta.generatedAt}</p>
      <div className="print-report-page-number" aria-hidden="true">Página <span className="current-page" /></div>
    </header>
  );
}
