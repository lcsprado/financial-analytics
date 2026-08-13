export type PrintReportMeta = {
  title: string;
  filters: string;
  generatedAt: string;
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
        </div>
      </div>
      <p className="print-report-generated-at">{meta.generatedAt}</p>
    </header>
  );
}
