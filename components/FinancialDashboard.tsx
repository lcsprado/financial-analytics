"use client";

import {
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  FileBarChart,
  FileSpreadsheet,
  LayoutDashboard,
  Menu,
  ReceiptText,
  RefreshCcw,
  Search,
  TrendingDown,
  TrendingUp,
  UploadCloud,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChangeEvent, DragEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { calculateDashboard, getAvailableYears } from "@/lib/analytics";
import { compactCurrency, currency, formatDate, integer, percent } from "@/lib/format";
import { createDemoData } from "@/lib/demo";
import { parseInvoiceWorkbook, parseReceiptWorkbook } from "@/lib/parsers";
import {
  CHANNEL_DATA_EVENT,
  clearOfflineData,
  hasStorageConsent,
  INCLUDE_CHANNEL_STORAGE_KEY,
  loadAnalysisState,
  loadChannelPayload,
  notifyAnalysisData,
  OFFLINE_DATA_CLEARED_EVENT,
  readStoredFilter,
  saveAnalysisState,
  saveChannelPayload,
  saveImportedFile,
  saveStoredFilter,
  setStorageConsent,
  STORAGE_CONSENT_EVENT,
} from "@/lib/offlineStorage";
import { parseChannelWorkbook, type ChannelPayload } from "@/components/ReceiptChannelSummary";
import type { ImportState, PeriodFilter } from "@/lib/types";

type View = "overview" | "invoices" | "receipts" | "clients" | "import";
type ImportKind = "invoices" | "receipts";

type NavItem = {
  id: View;
  label: string;
  icon: typeof LayoutDashboard;
};

const NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "invoices", label: "Emissões", icon: ReceiptText },
  { id: "receipts", label: "Recebimentos", icon: WalletCards },
  { id: "clients", label: "Clientes", icon: Users },
  { id: "import", label: "Importar dados", icon: UploadCloud },
];

const PIE_COLORS = ["#5d72f6", "#22c7a9", "#f8b84e", "#ef718a", "#9b7cf7", "#58b9ee"];
const INCLUDE_CHANNEL_EVENT = "financial-analytics-receipt-channels-include-changed";
const printVariation = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

type ReceiptChannelEntry = {
  receiptDate: string;
  amount: number;
  bank: string;
};

function channelEntryMatchesPeriod(entry: ReceiptChannelEntry, filter: PeriodFilter) {
  const date = new Date(`${entry.receiptDate}T12:00:00`);
  return !Number.isNaN(date.getTime())
    && (filter.year === "all" || date.getFullYear() === filter.year)
    && (filter.month === "all" || date.getMonth() === filter.month);
}

function KpiCard({
  title,
  value,
  detail,
  icon,
  tone = "primary",
}: {
  title: string;
  value: string;
  detail: string;
  icon: ReactNode;
  tone?: "primary" | "success" | "warning" | "danger";
}) {
  return (
    <article className={`kpi-card kpi-${tone}`}>
      <div className="kpi-topline">
        <span className="kpi-title">{title}</span>
        <span className="kpi-icon">{icon}</span>
      </div>
      <strong>{value}</strong>
      <span className="kpi-detail">{detail}</span>
    </article>
  );
}

function variationLabel(current: number, previous: number) {
  if (!previous) return "—";
  return `${printVariation.format(((current - previous) / previous) * 100)}%`;
}

function Panel({ title, subtitle, children, className = "" }: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-header">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function UploadCard({
  kind,
  title,
  description,
  fileName,
  loading,
  onFile,
}: {
  kind: ImportKind;
  title: string;
  description: string;
  fileName?: string;
  loading: boolean;
  onFile: (kind: ImportKind, file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) onFile(kind, file);
  };

  return (
    <div
      className={`upload-card ${dragging ? "is-dragging" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        hidden
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const file = event.target.files?.[0];
          if (file) onFile(kind, file);
          event.target.value = "";
        }}
      />
      <span className="upload-icon"><FileSpreadsheet size={28} /></span>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
        {fileName && <span className="file-pill"><CheckCircle2 size={14} /> {fileName}</span>}
      </div>
      <button className="secondary-button" type="button" disabled={loading}>
        {loading ? <><RefreshCcw className="spin" size={16} /> Processando</> : "Selecionar arquivo"}
      </button>
    </div>
  );
}

function EmptyState({ onImport, onDemo }: { onImport: () => void; onDemo: () => void }) {
  return (
    <div className="empty-state">
      <div className="empty-orb"><BarChart3 size={40} /></div>
      <span className="eyebrow">FINANCIAL ANALYTICS</span>
      <h1>Transforme suas planilhas em decisões financeiras.</h1>
      <p>
        Importe a FINR020 e a planilha de conciliação. Os dados são processados no seu navegador e não são enviados a um servidor.
      </p>
      <div className="empty-actions">
        <button className="primary-button" onClick={onImport}><UploadCloud size={18} /> Importar planilhas</button>
        <button className="ghost-button" onClick={onDemo}><FileBarChart size={18} /> Abrir demonstração</button>
      </div>
      <div className="feature-row">
        <span><CheckCircle2 size={16} /> Leitura automática da FINR020</span>
        <span><CheckCircle2 size={16} /> Recebimentos por banco e mês</span>
        <span><CheckCircle2 size={16} /> Filtros e detalhamento</span>
      </div>
    </div>
  );
}

function FinancialTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <strong>{label}</strong>
      {payload.map((item) => (
        <span key={item.name}><i style={{ background: item.color }} /> {item.name}: {currency.format(item.value)}</span>
      ))}
    </div>
  );
}

export default function FinancialDashboard() {
  const demo = useMemo(() => createDemoData(), []);
  const [data, setData] = useState<ImportState>({ invoices: [], receipts: [] });
  const [view, setView] = useState<View>("overview");
  const [filter, setFilter] = useState<PeriodFilter>({ year: 2026, month: "all", client: "" });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState<ImportKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [receiptChannels, setReceiptChannels] = useState<ReceiptChannelEntry[]>([]);
  const [includeReceiptChannels, setIncludeReceiptChannels] = useState(false);
  const [storageConsent, setStorageConsentState] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    setFilter(readStoredFilter());
    setStorageConsentState(hasStorageConsent());
    void loadAnalysisState()
      .then((stored) => {
        if (!active || !stored) return;
        setData(stored);
        notifyAnalysisData(stored);
        setNotice("A última análise salva neste dispositivo foi recuperada.");
      })
      .catch(() => {
        if (active) setError("Não foi possível recuperar a análise salva neste dispositivo.");
      })
      .finally(() => {
        if (active) setHydrated(true);
      });
    if (!hasStorageConsent()) setHydrated(true);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const syncReceiptChannels = async () => {
      const payload = await loadChannelPayload<ChannelPayload>();
      setReceiptChannels(payload?.entries ?? []);
      setIncludeReceiptChannels(window.localStorage.getItem(INCLUDE_CHANNEL_STORAGE_KEY) === "true");
    };
    void syncReceiptChannels();
    window.addEventListener("storage", syncReceiptChannels);
    window.addEventListener(CHANNEL_DATA_EVENT, syncReceiptChannels);
    window.addEventListener(INCLUDE_CHANNEL_EVENT, syncReceiptChannels);
    return () => {
      window.removeEventListener("storage", syncReceiptChannels);
      window.removeEventListener(CHANNEL_DATA_EVENT, syncReceiptChannels);
      window.removeEventListener(INCLUDE_CHANNEL_EVENT, syncReceiptChannels);
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    notifyAnalysisData(data);
    if (!hasStorageConsent() || (!data.invoices.length && !data.receipts.length)) return;
    const timer = window.setTimeout(() => {
      void saveAnalysisState(data).catch(() => {
        setError("O navegador não conseguiu salvar esta análise para recuperação offline.");
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [data, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveStoredFilter(filter);
  }, [filter, hydrated]);

  useEffect(() => {
    const handleConsent = () => {
      const next = hasStorageConsent();
      setStorageConsentState(next);
      if (next && (data.invoices.length || data.receipts.length)) {
        void saveAnalysisState(data);
      }
    };
    const handleCleared = () => {
      setData({ invoices: [], receipts: [] });
      setReceiptChannels([]);
      setSearch("");
      setView("overview");
      setFilter({ year: 2026, month: "all", client: "" });
      setNotice("Os dados salvos neste dispositivo foram apagados.");
    };
    window.addEventListener(STORAGE_CONSENT_EVENT, handleConsent);
    window.addEventListener(OFFLINE_DATA_CLEARED_EVENT, handleCleared);
    return () => {
      window.removeEventListener(STORAGE_CONSENT_EVENT, handleConsent);
      window.removeEventListener(OFFLINE_DATA_CLEARED_EVENT, handleCleared);
    };
  }, [data]);

  const years = useMemo(() => getAvailableYears(data.invoices, data.receipts), [data]);
  const clients = useMemo(() => [...new Set(data.invoices.map((item) => item.clientName))].sort(), [data.invoices]);
  const dashboard = useMemo(() => {
    const base = calculateDashboard(data.invoices, data.receipts, filter);
    if (!includeReceiptChannels || filter.client) return base;

    const periodChannels = receiptChannels.filter((entry) => channelEntryMatchesPeriod(entry, filter));
    const channelTotal = periodChannels.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const monthly = base.monthly.map((month) => ({
      ...month,
      received: month.received + receiptChannels
        .filter((entry) => {
          const date = new Date(`${entry.receiptDate}T12:00:00`);
          return !Number.isNaN(date.getTime())
            && (filter.year === "all" || date.getFullYear() === filter.year)
            && date.getMonth() === month.monthIndex;
        })
        .reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
    }));

    return {
      ...base,
      received: base.received + channelTotal,
      difference: base.emitted - base.received - channelTotal,
      receiptCount: base.receiptCount + periodChannels.length,
      monthly,
    };
  }, [data, filter, includeReceiptChannels, receiptChannels]);
  const hasData = data.invoices.length > 0 || data.receipts.length > 0;

  useEffect(() => {
    if (years.length && filter.year !== "all" && !years.includes(filter.year)) {
      setFilter((current) => ({ ...current, year: years[0] }));
    }
  }, [years, filter.year]);

  async function handleFile(kind: ImportKind, file: File) {
    setLoading(kind);
    setError(null);
    setNotice(null);
    try {
      if (kind === "invoices") {
        const invoices = await parseInvoiceWorkbook(file);
        setData((current) => ({ ...current, invoices, invoiceFileName: file.name }));
        await saveImportedFile("invoices", file);
        setNotice(`${integer.format(invoices.length)} emissões importadas com sucesso.`);
      } else {
        const [receipts, channels] = await Promise.all([
          parseReceiptWorkbook(file),
          parseChannelWorkbook(file),
        ]);
        setData((current) => ({ ...current, receipts, receiptFileName: file.name }));
        setReceiptChannels(channels.entries);
        await Promise.all([
          saveImportedFile("receipts", file),
          saveChannelPayload(channels),
        ]);
        window.dispatchEvent(new Event(CHANNEL_DATA_EVENT));
        setNotice(
          `${integer.format(receipts.length)} recebimentos e `
          + `${integer.format(channels.entries.length)} lançamentos Cielo/PIX importados com sucesso.`,
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível processar o arquivo.");
    } finally {
      setLoading(null);
    }
  }

  function loadDemo() {
    setData({ ...demo, invoiceFileName: "FINR020 — demonstração", receiptFileName: "Conciliação — demonstração" });
    setFilter({ year: 2026, month: "all", client: "" });
    setView("overview");
    setNotice("Demonstração carregada. Importe suas planilhas para substituir os dados.");
  }

  async function clearData() {
    await clearOfflineData();
    setData({ invoices: [], receipts: [] });
    setReceiptChannels([]);
    setSearch("");
    setView("overview");
    setFilter({ year: 2026, month: "all", client: "" });
  }

  const invoiceRows = dashboard.filteredInvoices
    .filter((item) => `${item.invoiceNumber} ${item.clientName} ${item.clientCode}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.emissionDate.localeCompare(a.emissionDate));

  const receiptRows = dashboard.filteredReceipts
    .filter((item) => `${item.description} ${item.bank}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.receiptDate.localeCompare(a.receiptDate));

  const titleByView: Record<View, string> = {
    overview: "Visão geral",
    invoices: "Emissões",
    receipts: "Recebimentos",
    clients: "Clientes",
    import: "Importação",
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <span className="brand-mark"><CircleDollarSign size={24} /></span>
          <div><strong>Financial</strong><span>Analytics</span></div>
          <button className="mobile-close" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu"><X /></button>
        </div>

        <nav>
          <span className="nav-caption">ANÁLISES</span>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={view === item.id ? "active" : ""}
                onClick={() => {
                  setView(item.id);
                  setSidebarOpen(false);
                }}
              >
                <Icon size={19} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-status">
          <span className={`status-dot ${hasData ? "online" : ""}`} />
          <div><strong>{hasData ? "Dados carregados" : "Aguardando dados"}</strong><small>Processamento local e privado</small></div>
        </div>
        <div className="portfolio-signature"><span>LP</span><div><strong>Lucas Prado</strong><small>Finance & Automation</small></div></div>
      </aside>

      {sidebarOpen && <button className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu" />}

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-title">
            <button className="menu-button" onClick={() => setSidebarOpen(true)} aria-label="Abrir menu"><Menu /></button>
            <div><span>PAINEL FINANCEIRO</span><h1>{titleByView[view]}</h1></div>
          </div>
          <div className="topbar-actions">
            {hasData && (
              <>
                <button className="ghost-button compact" onClick={() => setView("import")}><UploadCloud size={17} /> Atualizar bases</button>
                <button className="icon-button" onClick={clearData} title="Limpar dados"><RefreshCcw size={18} /></button>
              </>
            )}
          </div>
        </header>

        <div className="content-area">
          {!hasData && view !== "import" ? (
            <EmptyState onImport={() => setView("import")} onDemo={loadDemo} />
          ) : (
            <>
              {error && <div className="alert error"><X size={18} /> {error}<button onClick={() => setError(null)}>Fechar</button></div>}
              {notice && <div className="alert success"><CheckCircle2 size={18} /> {notice}<button onClick={() => setNotice(null)}>Fechar</button></div>}

              {view !== "import" && (
                <section className="filter-bar">
                  <div className="filter-heading"><span>Filtros</span><small>Atualizam todos os indicadores</small></div>
                  <label>
                    <span>Ano</span>
                    <div className="select-wrap">
                      <select value={filter.year} onChange={(event) => setFilter((current) => ({ ...current, year: event.target.value === "all" ? "all" : Number(event.target.value) }))}>
                        <option value="all">Todos</option>
                        {years.map((year) => <option key={year} value={year}>{year}</option>)}
                      </select>
                      <ChevronDown size={15} />
                    </div>
                  </label>
                  <label>
                    <span>Mês</span>
                    <div className="select-wrap">
                      <select value={filter.month} onChange={(event) => setFilter((current) => ({ ...current, month: event.target.value === "all" ? "all" : Number(event.target.value) }))}>
                        <option value="all">Todos</option>
                        {dashboard.monthly.map((item) => <option key={item.monthIndex} value={item.monthIndex}>{item.month}</option>)}
                      </select>
                      <ChevronDown size={15} />
                    </div>
                  </label>
                  <label className="client-filter">
                    <span>Cliente</span>
                    <div className="select-wrap">
                      <select value={filter.client} onChange={(event) => setFilter((current) => ({ ...current, client: event.target.value }))}>
                        <option value="">Todos os clientes</option>
                        {clients.map((client) => <option key={client} value={client}>{client}</option>)}
                      </select>
                      <ChevronDown size={15} />
                    </div>
                  </label>
                  {(filter.year !== "all" || filter.month !== "all" || filter.client) && (
                    <button className="clear-filter" onClick={() => setFilter({ year: years[0] ?? "all", month: "all", client: "" })}>Limpar</button>
                  )}
                </section>
              )}

              {view === "overview" && (
                <>
                  <section className="kpi-grid overview-print-kpis">
                    <KpiCard title="Receita emitida" value={currency.format(dashboard.emitted)} detail={`${integer.format(dashboard.invoiceCount)} notas no período`} icon={<TrendingUp size={20} />} />
                    <KpiCard title="Recebido" value={currency.format(dashboard.received)} detail={`${integer.format(dashboard.receiptCount)} lançamentos`} icon={<CircleDollarSign size={20} />} tone="success" />
                    <div id="receipt-channel-kpi-slot" className="receipt-channel-kpi-slot" />
                    <KpiCard
                      title="Diferença do período"
                      value={currency.format(dashboard.difference)}
                      detail={dashboard.difference >= 0 ? "Emitido acima do recebido" : "Recebido acima do emitido"}
                      icon={dashboard.difference >= 0 ? <TrendingDown size={20} /> : <TrendingUp size={20} />}
                      tone={dashboard.difference >= 0 ? "warning" : "success"}
                    />
                    <KpiCard title="Ticket médio" value={currency.format(dashboard.ticket)} detail={`Maior cliente: ${dashboard.largestClient}`} icon={<Building2 size={20} />} />
                  </section>

                  <section className="chart-grid overview-print-page-one">
                    <Panel title="Emitido × recebido" subtitle="Clique em um mês para filtrar o painel" className="wide-panel">
                      <div className="chart-box">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={dashboard.monthly} margin={{ top: 14, right: 8, left: 8, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e8ebf2" vertical={false} />
                            <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "#788198", fontSize: 12 }} />
                            <YAxis tickFormatter={(value) => compactCurrency.format(Number(value))} tickLine={false} axisLine={false} tick={{ fill: "#9aa2b3", fontSize: 11 }} width={74} />
                            <Tooltip content={<FinancialTooltip />} cursor={{ fill: "rgba(93, 114, 246, 0.06)" }} />
                            <Legend iconType="circle" wrapperStyle={{ paddingTop: 12, fontSize: 12 }} />
                            <Bar name="Emitido" dataKey="emitted" fill="#5d72f6" radius={[6, 6, 0, 0]} maxBarSize={34} cursor="pointer" onClick={(entry) => {
                              const monthIndex = (entry as { monthIndex?: number }).monthIndex;
                              if (monthIndex !== undefined) setFilter((current) => ({ ...current, month: monthIndex }));
                            }} />
                            <Bar name="Recebido" dataKey="received" fill="#22c7a9" radius={[6, 6, 0, 0]} maxBarSize={34} cursor="pointer" onClick={(entry) => {
                              const monthIndex = (entry as { monthIndex?: number }).monthIndex;
                              if (monthIndex !== undefined) setFilter((current) => ({ ...current, month: monthIndex }));
                            }} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      {dashboard.monthly.length > 1 && (
                        <section className="print-monthly-variation" aria-label="Variação mensal impressa">
                          <div><strong>Variação mês a mês</strong><span>Comparação com o mês anterior</span></div>
                          <div className="print-monthly-variation-grid">
                            {dashboard.monthly.slice(1).map((item, index) => (
                              <article key={item.monthIndex}>
                                <strong>{item.month}</strong>
                                <span><b>E</b>{variationLabel(item.emitted, dashboard.monthly[index].emitted)}</span>
                                <span><b>R</b>{variationLabel(item.received, dashboard.monthly[index].received)}</span>
                              </article>
                            ))}
                          </div>
                        </section>
                      )}
                    </Panel>

                    <Panel title="Recebimentos por banco" subtitle="Distribuição da entrada financeira">
                      <div className="pie-layout">
                        <div className="pie-chart-box">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={dashboard.banks.slice(0, 6)} dataKey="value" nameKey="name" innerRadius={62} outerRadius={90} paddingAngle={3} stroke="none">
                                {dashboard.banks.slice(0, 6).map((item, index) => <Cell key={item.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
                              </Pie>
                              <Tooltip formatter={(value) => currency.format(Number(value))} />
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="pie-center"><strong>{integer.format(dashboard.banks.length)}</strong><span>bancos</span></div>
                        </div>
                        <div className="pie-legend">
                          {dashboard.banks.slice(0, 6).map((item, index) => (
                            <div key={item.name}><i style={{ background: PIE_COLORS[index % PIE_COLORS.length] }} /><span>{item.name}</span><strong>{compactCurrency.format(item.value)}</strong></div>
                          ))}
                          {!dashboard.banks.length && <p className="muted">Importe a planilha de conciliação.</p>}
                        </div>
                      </div>
                    </Panel>
                  </section>

                  <section className="lower-grid overview-print-page-two">
                    <Panel title="Top clientes" subtitle="Ranking por valor emitido">
                      <div className="ranking-list">
                        {dashboard.topClients.slice(0, 7).map((client, index) => {
                          const share = dashboard.emitted ? client.value / dashboard.emitted : 0;
                          return (
                            <button key={client.name} onClick={() => setFilter((current) => ({ ...current, client: client.name }))}>
                              <span className="rank-number">{String(index + 1).padStart(2, "0")}</span>
                              <div><strong>{client.name}</strong><span><i style={{ width: `${Math.max(4, share * 100)}%` }} /></span></div>
                              <b>{compactCurrency.format(client.value)}</b>
                            </button>
                          );
                        })}
                      </div>
                    </Panel>

                    <Panel title="Evolução financeira" subtitle="Tendência mensal das bases importadas" className="wide-panel">
                      <div className="chart-box short-chart">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={dashboard.monthly} margin={{ top: 12, right: 14, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e8ebf2" vertical={false} />
                            <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "#788198", fontSize: 12 }} />
                            <YAxis tickFormatter={(value) => compactCurrency.format(Number(value))} tickLine={false} axisLine={false} tick={{ fill: "#9aa2b3", fontSize: 11 }} width={72} />
                            <Tooltip content={<FinancialTooltip />} />
                            <Line name="Emitido" type="monotone" dataKey="emitted" stroke="#5d72f6" strokeWidth={3} dot={{ r: 3, fill: "#5d72f6" }} activeDot={{ r: 5 }} />
                            <Line name="Recebido" type="monotone" dataKey="received" stroke="#22c7a9" strokeWidth={3} dot={{ r: 3, fill: "#22c7a9" }} activeDot={{ r: 5 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </Panel>
                  </section>

                  <section className="insight-strip overview-print-insights">
                    <div><span>Taxa de identificação de NF</span><strong>{percent.format(dashboard.matchRate)}</strong><small>Recebimentos com NF localizada na FINR020</small></div>
                    <div><span>Concentração do maior cliente</span><strong>{percent.format(dashboard.emitted ? (dashboard.topClients[0]?.value ?? 0) / dashboard.emitted : 0)}</strong><small>Participação na receita emitida</small></div>
                    <div><span>Valor médio recebido</span><strong>{currency.format(dashboard.receiptCount ? dashboard.received / dashboard.receiptCount : 0)}</strong><small>Por lançamento bancário</small></div>
                  </section>
                </>
              )}

              {view === "invoices" && (
                <Panel title="Notas emitidas" subtitle={`${integer.format(invoiceRows.length)} registros após os filtros`}>
                  <div className="print-table-summary">
                    <span>Registros <strong>{integer.format(invoiceRows.length)}</strong></span>
                    <span>Ticket médio <strong>{currency.format(invoiceRows.length ? invoiceRows.reduce((sum, item) => sum + item.grossValue, 0) / invoiceRows.length : 0)}</strong></span>
                    <span>Total bruto <strong>{currency.format(invoiceRows.reduce((sum, item) => sum + item.grossValue, 0))}</strong></span>
                    <span>Total líquido <strong>{currency.format(invoiceRows.reduce((sum, item) => sum + item.netValue, 0))}</strong></span>
                  </div>
                  <div className="table-toolbar">
                    <div className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por NF, cliente ou código" /></div>
                    <div style={{ marginLeft: "auto", display: "grid", gridTemplateColumns: "1fr 1fr", width: "32%", minWidth: 320 }}>
                      <span style={{ textAlign: "right" }}>Total bruto: <strong>{currency.format(invoiceRows.reduce((sum, item) => sum + item.grossValue, 0))}</strong></span>
                      <span style={{ textAlign: "right" }}>Total líquido: <strong>{currency.format(invoiceRows.reduce((sum, item) => sum + item.netValue, 0))}</strong></span>
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Emissão</th><th>NF</th><th>Cliente</th><th>Código</th><th className="number">Valor bruto</th><th className="number">Valor líquido</th></tr></thead>
                      <tbody>
                        {invoiceRows.slice(0, 500).map((item) => (
                          <tr key={item.id}><td>{formatDate(item.emissionDate)}</td><td><span className="nf-pill">{item.invoiceNumber || "—"}</span></td><td className="client-cell">{item.clientName}</td><td>{item.clientCode || "—"}</td><td className="number"><strong>{currency.format(item.grossValue)}</strong></td><td className="number">{currency.format(item.netValue)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {invoiceRows.length > 500 && <p className="table-note">Exibindo os 500 registros mais recentes. Use os filtros para reduzir o resultado.</p>}
                </Panel>
              )}

              {view === "receipts" && (
                <Panel title="Recebimentos bancários" subtitle={`${integer.format(receiptRows.length)} lançamentos após os filtros`}>
                  <div className="print-table-summary">
                    <span>Lançamentos <strong>{integer.format(receiptRows.length)}</strong></span>
                    <span>Valor médio <strong>{currency.format(receiptRows.length ? receiptRows.reduce((sum, item) => sum + item.amount, 0) / receiptRows.length : 0)}</strong></span>
                    <span>Total recebido <strong>{currency.format(receiptRows.reduce((sum, item) => sum + item.amount, 0))}</strong></span>
                  </div>
                  <div className="table-toolbar">
                    <div className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por cliente, NF ou banco" /></div>
                    <span>Total: <strong>{currency.format(receiptRows.reduce((sum, item) => sum + item.amount, 0))}</strong></span>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Recebimento</th><th>Banco</th><th>Descrição</th><th>NF identificada</th><th className="number">Valor</th></tr></thead>
                      <tbody>
                        {receiptRows.slice(0, 500).map((item) => (
                          <tr key={item.id}><td>{formatDate(item.receiptDate)}</td><td><span className="bank-pill">{item.bank}</span></td><td className="description-cell">{item.description}</td><td>{item.invoiceNumbers.length ? item.invoiceNumbers.join(", ") : <span className="muted">Não identificada</span>}</td><td className={`number ${item.amount < 0 ? "negative" : ""}`}><strong>{currency.format(item.amount)}</strong></td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {receiptRows.length > 500 && <p className="table-note">Exibindo os 500 lançamentos mais recentes. Use os filtros para reduzir o resultado.</p>}
                </Panel>
              )}

              {view === "clients" && (
                <section className="clients-page">
                  <div className="client-summary-card">
                    <span>Maior cliente do período</span>
                    <h2>{dashboard.largestClient}</h2>
                    <strong>{currency.format(dashboard.topClients[0]?.value ?? 0)}</strong>
                    <small>{percent.format(dashboard.emitted ? (dashboard.topClients[0]?.value ?? 0) / dashboard.emitted : 0)} da receita emitida</small>
                  </div>
                  <Panel title="Desempenho por cliente" subtitle="Clique em uma linha para abrir o cliente no painel">
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th>#</th><th>Cliente</th><th className="number">Receita emitida</th><th className="number">Participação</th><th>Representação</th></tr></thead>
                        <tbody>
                          {dashboard.topClients.map((item, index) => {
                            const participation = dashboard.emitted ? item.value / dashboard.emitted : 0;
                            return (
                              <tr key={item.name} className="clickable-row" onClick={() => {
                                setFilter((current) => ({ ...current, client: item.name }));
                                setView("overview");
                              }}>
                                <td>{index + 1}</td><td className="client-cell">{item.name}</td><td className="number"><strong>{currency.format(item.value)}</strong></td><td className="number">{percent.format(participation)}</td><td><div className="table-progress"><i style={{ width: `${participation * 100}%` }} /></div></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Panel>
                </section>
              )}

              {view === "import" && (
                <section className="import-page">
                  <div className="import-intro">
                    <span className="eyebrow">ATUALIZAÇÃO DAS BASES</span>
                    <h2>Importe as duas planilhas do processo financeiro.</h2>
                    <p>O sistema reconhece automaticamente a aba “Registros de duplicatas” da FINR020 e as seções “RECEBIMENTOS” das abas mensais da conciliação.</p>
                  </div>
                  <div className="upload-grid">
                    <UploadCard kind="invoices" title="1. FINR020 — Emissões" description="Colunas esperadas: Data da Emissão, NF Eletr, Valor, Líquido e Nome Cliente." fileName={data.invoiceFileName} loading={loading === "invoices"} onFile={handleFile} />
                    <UploadCard kind="receipts" title="2. Conciliação — Recebimentos" description="Abas mensais com blocos por banco e a linha de início RECEBIMENTOS." fileName={data.receiptFileName} loading={loading === "receipts"} onFile={handleFile} />
                  </div>
                  <label className="offline-storage-choice">
                    <input
                      type="checkbox"
                      checked={storageConsent}
                      onChange={(event) => {
                        setStorageConsent(event.target.checked);
                        setStorageConsentState(event.target.checked);
                      }}
                    />
                    <span>
                      <strong>Guardar planilhas e análise neste dispositivo</strong>
                      <small>Permite recuperar o painel offline por até 30 dias. Você pode apagar quando quiser.</small>
                    </span>
                  </label>
                  <div className="import-results">
                    <div><span className="result-icon violet"><ReceiptText /></span><strong>{integer.format(data.invoices.length)}</strong><span>emissões carregadas</span></div>
                    <div><span className="result-icon green"><WalletCards /></span><strong>{integer.format(data.receipts.length)}</strong><span>recebimentos carregados</span></div>
                    <div><span className="result-icon gold"><CheckCircle2 /></span><strong>{percent.format(dashboard.matchRate)}</strong><span>recebimentos com NF identificada</span></div>
                  </div>
                  <div className="privacy-note"><CheckCircle2 size={18} /><div><strong>Seus dados permanecem no navegador.</strong><span>As planilhas são processadas localmente. Ao limpar os dados, o conteúdo armazenado neste navegador é removido.</span></div></div>
                  <div className="import-actions"><button className="ghost-button" onClick={loadDemo}><FileBarChart size={17} /> Usar demonstração</button><button className="primary-button" onClick={() => setView("overview")} disabled={!hasData}><LayoutDashboard size={17} /> Abrir dashboard</button></div>
                </section>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
