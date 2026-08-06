"use client";

import { CalendarClock, ChevronDown, CircleAlert, Search, TrendingDown, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { compactCurrency, currency, formatDate, integer } from "@/lib/format";
import {
  ANALYSIS_DATA_EVENT,
  loadAnalysisState,
  OFFLINE_DATA_CLEARED_EVENT,
} from "@/lib/offlineStorage";
import { canonicalReceiptClientName } from "@/lib/receiptClientNames";
import type { ImportState, Receipt } from "@/lib/types";

type Confidence = "Alta" | "Média" | "Baixa" | "Insuficiente";
type Trend = "Em alta" | "Estável" | "Em queda" | "Sem base";

type HistoryMonth = {
  key: string;
  label: string;
  shortLabel: string;
  start: Date;
};

type ClientForecast = {
  key: string;
  clientName: string;
  confidence: Confidence;
  trend: Trend;
  startDay: number;
  medianDay: number;
  endDay: number;
  predictedStart: string;
  predictedBestDate: string;
  predictedEnd: string;
  projectedMonthly: number;
  receivedTotal: number;
  activeMonths: number;
  paymentDateCount: number;
  receiptCount: number;
  monthlyTotals: number[];
  monthlyCounts: number[];
  paymentDates: Array<{ date: string; amount: number; receiptCount: number }>;
};

type ForecastAnalysis = {
  periodLabel: string;
  months: HistoryMonth[];
  monthlyComparison: Array<{ month: string; amount: number; receipts: number }>;
  dayBands: Array<{ band: string; amount: number; receipts: number }>;
  clients: ClientForecast[];
  historyTotal: number;
  monthlyAverage: number;
  projectedNext30Days: number;
  highConfidenceProjection: number;
  topBand: string;
  validReceiptCount: number;
  ignoredReceiptCount: number;
};

const EMPTY_STATE: ImportState = { invoices: [], receipts: [] };
const DAY_BANDS = [
  { label: "Dias 1 a 5", start: 1, end: 5 },
  { label: "Dias 6 a 10", start: 6, end: 10 },
  { label: "Dias 11 a 15", start: 11, end: 15 },
  { label: "Dias 16 a 20", start: 16, end: 20 },
  { label: "Dias 21 a 25", start: 21, end: 25 },
  { label: "Dias 26 ao fim", start: 26, end: 31 },
] as const;
const MONTH_FORMATTER = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
const SHORT_MONTH_FORMATTER = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" });
const CONFIDENCE_ORDER: Record<Confidence, number> = {
  Alta: 0,
  Média: 1,
  Baixa: 2,
  Insuficiente: 3,
};
const BAR_COLORS = ["#5d72f6", "#22c7a9", "#f8b84e", "#ef718a", "#9b7cf7", "#58b9ee"];

function parseIsoDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1, 12, 0, 0, 0);
}

function daysInMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function dateInMonth(month: Date, day: number) {
  return new Date(
    month.getFullYear(),
    month.getMonth(),
    Math.min(Math.max(1, Math.round(day)), daysInMonth(month)),
    12,
    0,
    0,
    0,
  );
}

function quantile(values: number[], percentile: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * percentile;
  const base = Math.floor(position);
  const rest = position - base;
  const next = sorted[base + 1];
  return next === undefined ? sorted[base] : sorted[base] + rest * (next - sorted[base]);
}

function trendFor(monthlyTotals: number[]): Trend {
  if (monthlyTotals.filter((value) => value > 0).length < 3) return "Sem base";
  const first = monthlyTotals.slice(0, 3).reduce((sum, value) => sum + value, 0) / 3;
  const last = monthlyTotals.slice(3).reduce((sum, value) => sum + value, 0) / 3;
  if (first === 0) return last > 0 ? "Em alta" : "Sem base";
  const variation = (last - first) / Math.abs(first);
  if (variation > 0.1) return "Em alta";
  if (variation < -0.1) return "Em queda";
  return "Estável";
}

function confidenceFor(activeMonths: number, paymentDateCount: number, windowSpan: number): Confidence {
  if (activeMonths < 2 || paymentDateCount < 3) return "Insuficiente";
  if (activeMonths >= 5 && paymentDateCount >= 6 && windowSpan <= 5) return "Alta";
  if (activeMonths >= 3 && paymentDateCount >= 4 && windowSpan <= 10) return "Média";
  return "Baixa";
}

function nextForecastMonth(now: Date, endDay: number) {
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0, 0);
  return endDay >= now.getDate() ? currentMonth : addMonths(currentMonth, 1);
}

function isDemoReceipt(receipt: Receipt) {
  return receipt.id.startsWith("demo-receipt-") || receipt.sourceSheet === "DEMONSTRAÇÃO";
}

function buildForecastAnalysis(receipts: Receipt[], now = new Date()): ForecastAnalysis {
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0, 0);
  const historyStart = addMonths(currentMonthStart, -6);
  const historyEnd = currentMonthStart;
  const months: HistoryMonth[] = Array.from({ length: 6 }, (_, index) => {
    const start = addMonths(historyStart, index);
    return {
      key: monthKey(start),
      label: MONTH_FORMATTER.format(start),
      shortLabel: SHORT_MONTH_FORMATTER.format(start).replace(" de ", "/"),
      start,
    };
  });
  const monthIndex = new Map(months.map((month, index) => [month.key, index]));
  const realReceipts = receipts.filter((receipt) => !isDemoReceipt(receipt));
  const sourceReceipts = realReceipts.length ? realReceipts : receipts;
  const validReceipts: Array<Receipt & { parsedDate: Date; clientName: string }> = [];
  let ignoredReceiptCount = 0;

  sourceReceipts.forEach((receipt) => {
    const parsedDate = parseIsoDate(receipt.receiptDate);
    const clientName = canonicalReceiptClientName(receipt.clientHint || receipt.description);
    if (
      !parsedDate
      || parsedDate < historyStart
      || parsedDate >= historyEnd
      || !clientName
      || !Number.isFinite(receipt.amount)
      || receipt.amount <= 0
    ) {
      ignoredReceiptCount += 1;
      return;
    }
    validReceipts.push({ ...receipt, parsedDate, clientName });
  });

  type ClientAccumulator = {
    clientName: string;
    monthlyTotals: number[];
    monthlyCounts: number[];
    daily: Map<string, { amount: number; receiptCount: number }>;
    receiptCount: number;
  };

  const byClient = new Map<string, ClientAccumulator>();
  const monthlyComparison = months.map((month) => ({ month: month.shortLabel, amount: 0, receipts: 0 }));
  const dayBands = DAY_BANDS.map((band) => ({ band: band.label, amount: 0, receipts: 0 }));

  validReceipts.forEach((receipt) => {
    const key = receipt.clientName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
    const accumulator = byClient.get(key) ?? {
      clientName: receipt.clientName,
      monthlyTotals: Array(6).fill(0) as number[],
      monthlyCounts: Array(6).fill(0) as number[],
      daily: new Map<string, { amount: number; receiptCount: number }>(),
      receiptCount: 0,
    };
    const receiptMonthIndex = monthIndex.get(monthKey(receipt.parsedDate));
    if (receiptMonthIndex === undefined) return;

    accumulator.monthlyTotals[receiptMonthIndex] += receipt.amount;
    accumulator.monthlyCounts[receiptMonthIndex] += 1;
    accumulator.receiptCount += 1;
    const dailyEntry = accumulator.daily.get(receipt.receiptDate) ?? { amount: 0, receiptCount: 0 };
    dailyEntry.amount += receipt.amount;
    dailyEntry.receiptCount += 1;
    accumulator.daily.set(receipt.receiptDate, dailyEntry);
    byClient.set(key, accumulator);

    monthlyComparison[receiptMonthIndex].amount += receipt.amount;
    monthlyComparison[receiptMonthIndex].receipts += 1;
    const day = receipt.parsedDate.getDate();
    const bandIndex = DAY_BANDS.findIndex((band) => day >= band.start && day <= band.end);
    if (bandIndex >= 0) {
      dayBands[bandIndex].amount += receipt.amount;
      dayBands[bandIndex].receipts += 1;
    }
  });

  const clients = [...byClient.entries()].map(([key, accumulator]): ClientForecast => {
    const paymentDates = [...accumulator.daily.entries()]
      .map(([date, value]) => ({ date, ...value }))
      .sort((left, right) => left.date.localeCompare(right.date));
    const days = paymentDates
      .map((entry) => parseIsoDate(entry.date)?.getDate() ?? 0)
      .filter((day) => day > 0);
    const startDay = Math.max(1, Math.floor(quantile(days, 0.25)));
    const medianDay = Math.max(1, Math.round(quantile(days, 0.5)));
    const endDay = Math.max(startDay, Math.ceil(quantile(days, 0.75)));
    const activeMonths = accumulator.monthlyTotals.filter((value) => value > 0).length;
    const confidence = confidenceFor(activeMonths, paymentDates.length, endDay - startDay);
    const forecastMonth = nextForecastMonth(now, endDay);
    const predictedStart = dateInMonth(forecastMonth, startDay);
    const predictedBestDate = dateInMonth(forecastMonth, medianDay);
    const predictedEnd = dateInMonth(forecastMonth, endDay);
    const receivedTotal = accumulator.monthlyTotals.reduce((sum, value) => sum + value, 0);

    return {
      key,
      clientName: accumulator.clientName,
      confidence,
      trend: trendFor(accumulator.monthlyTotals),
      startDay,
      medianDay,
      endDay,
      predictedStart: toIsoDate(predictedStart),
      predictedBestDate: toIsoDate(predictedBestDate),
      predictedEnd: toIsoDate(predictedEnd),
      projectedMonthly: receivedTotal / 6,
      receivedTotal,
      activeMonths,
      paymentDateCount: paymentDates.length,
      receiptCount: accumulator.receiptCount,
      monthlyTotals: accumulator.monthlyTotals,
      monthlyCounts: accumulator.monthlyCounts,
      paymentDates,
    };
  }).sort((left, right) =>
    CONFIDENCE_ORDER[left.confidence] - CONFIDENCE_ORDER[right.confidence]
    || right.projectedMonthly - left.projectedMonthly
    || left.clientName.localeCompare(right.clientName, "pt-BR"),
  );

  const historyTotal = validReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);
  const horizon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30, 23, 59, 59, 999);
  const projectedNext30Days = clients.reduce((sum, client) => {
    if (client.confidence === "Insuficiente") return sum;
    const forecastDate = parseIsoDate(client.predictedStart);
    return forecastDate && forecastDate <= horizon ? sum + client.projectedMonthly : sum;
  }, 0);
  const highConfidenceProjection = clients
    .filter((client) => client.confidence === "Alta")
    .reduce((sum, client) => sum + client.projectedMonthly, 0);
  const strongestBand = [...dayBands].sort((left, right) => right.amount - left.amount)[0];

  return {
    periodLabel: `${MONTH_FORMATTER.format(months[0].start)} a ${MONTH_FORMATTER.format(months[5].start)}`,
    months,
    monthlyComparison,
    dayBands,
    clients,
    historyTotal,
    monthlyAverage: historyTotal / 6,
    projectedNext30Days,
    highConfidenceProjection,
    topBand: strongestBand?.amount ? strongestBand.band : "Sem concentração identificada",
    validReceiptCount: validReceipts.length,
    ignoredReceiptCount,
  };
}

function confidenceClass(confidence: Confidence) {
  return confidence
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function trendIcon(trend: Trend) {
  if (trend === "Em alta") return <TrendingUp size={15} />;
  if (trend === "Em queda") return <TrendingDown size={15} />;
  return null;
}

function ReceiptForecastView({ data }: { data: ImportState }) {
  const [search, setSearch] = useState("");
  const [confidence, setConfidence] = useState<Confidence | "Todas">("Todas");
  const [selectedClientKey, setSelectedClientKey] = useState<string | null>(null);
  const analysis = useMemo(() => buildForecastAnalysis(data.receipts), [data.receipts]);
  const filteredClients = useMemo(() => {
    const normalizedSearch = search
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
    return analysis.clients.filter((client) =>
      (confidence === "Todas" || client.confidence === confidence)
      && (!normalizedSearch || client.clientName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .includes(normalizedSearch)),
    );
  }, [analysis.clients, confidence, search]);
  const selectedClient = analysis.clients.find((client) => client.key === selectedClientKey) ?? null;

  if (!data.receipts.length) {
    return (
      <section className="receipt-forecast-page">
        <div className="forecast-empty">
          <CalendarClock size={42} />
          <span>PREVISÃO DE RECEBIMENTOS</span>
          <h2>Importe a mesma planilha usada em Recebimentos.</h2>
          <p>
            Esta aba não possui upload próprio. A previsão será calculada automaticamente após a importação da planilha de conciliação.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="receipt-forecast-page">
      <div className="forecast-heading">
        <div>
          <span>HISTÓRICO AUTOMÁTICO</span>
          <h2>Previsão de Recebimentos</h2>
          <p>
            Janela provável calculada com a mesma planilha de Recebimentos, considerando os seis meses completos de {analysis.periodLabel}.
          </p>
        </div>
        <div className="forecast-method-note">
          <CalendarClock size={20} />
          <div><strong>Sem segundo upload</strong><span>Atualização automática com a base de recebimentos</span></div>
        </div>
      </div>

      {analysis.validReceiptCount === 0 ? (
        <div className="forecast-warning">
          <CircleAlert size={20} />
          <div>
            <strong>Não há recebimentos válidos nos últimos seis meses completos.</strong>
            <span>A previsão não foi inventada. Atualize a planilha ou verifique se as abas mensais cobrem o período analisado.</span>
          </div>
        </div>
      ) : null}

      <section className="forecast-kpi-grid">
        <article className="forecast-kpi">
          <span>Recebido nos 6 meses</span>
          <strong>{currency.format(analysis.historyTotal)}</strong>
          <small>{integer.format(analysis.validReceiptCount)} lançamentos analisados</small>
        </article>
        <article className="forecast-kpi">
          <span>Média mensal histórica</span>
          <strong>{currency.format(analysis.monthlyAverage)}</strong>
          <small>Total do período dividido por seis</small>
        </article>
        <article className="forecast-kpi">
          <span>Previsão para 30 dias</span>
          <strong>{currency.format(analysis.projectedNext30Days)}</strong>
          <small>Somente clientes com base estatística mínima</small>
        </article>
        <article className="forecast-kpi">
          <span>Alta confiança</span>
          <strong>{currency.format(analysis.highConfidenceProjection)}</strong>
          <small>Concentração principal: {analysis.topBand}</small>
        </article>
      </section>

      <section className="forecast-chart-grid">
        <article className="forecast-panel forecast-panel-wide">
          <div className="forecast-panel-header">
            <div><h3>Comparativo dos últimos seis meses</h3><p>Valores efetivamente recebidos por mês</p></div>
          </div>
          <div className="forecast-chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analysis.monthlyComparison} margin={{ top: 12, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8ebf2" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "#788198", fontSize: 12 }} />
                <YAxis tickFormatter={(value: number | string) => compactCurrency.format(Number(value))} tickLine={false} axisLine={false} tick={{ fill: "#9aa2b3", fontSize: 11 }} width={72} />
                <Tooltip formatter={(value: number | string) => currency.format(Number(value))} />
                <Bar dataKey="amount" name="Recebido" fill="#5d72f6" radius={[6, 6, 0, 0]} maxBarSize={44} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="forecast-panel">
          <div className="forecast-panel-header">
            <div><h3>Concentração por dia do mês</h3><p>Faixas em que o dinheiro costuma entrar</p></div>
          </div>
          <div className="forecast-chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analysis.dayBands} layout="vertical" margin={{ top: 4, right: 8, left: 12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8ebf2" horizontal={false} />
                <XAxis type="number" tickFormatter={(value: number | string) => compactCurrency.format(Number(value))} tickLine={false} axisLine={false} tick={{ fill: "#9aa2b3", fontSize: 10 }} />
                <YAxis type="category" dataKey="band" tickLine={false} axisLine={false} width={104} tick={{ fill: "#788198", fontSize: 11 }} />
                <Tooltip formatter={(value: number | string) => currency.format(Number(value))} />
                <Bar dataKey="amount" name="Recebido" radius={[0, 6, 6, 0]} maxBarSize={28}>
                  {analysis.dayBands.map((band, index) => <Cell key={band.band} fill={BAR_COLORS[index % BAR_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      </section>

      <article className="forecast-panel forecast-table-panel">
        <div className="forecast-panel-header forecast-table-header">
          <div>
            <h3>Previsão por cliente</h3>
            <p>{integer.format(filteredClients.length)} clientes após os filtros</p>
          </div>
          <div className="forecast-table-controls">
            <label className="forecast-search">
              <Search size={17} />
              <input value={search} onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)} placeholder="Buscar cliente" />
            </label>
            <label className="forecast-select">
              <select value={confidence} onChange={(event: ChangeEvent<HTMLSelectElement>) => setConfidence(event.target.value as Confidence | "Todas")}>
                <option value="Todas">Todas as confianças</option>
                <option value="Alta">Alta</option>
                <option value="Média">Média</option>
                <option value="Baixa">Baixa</option>
                <option value="Insuficiente">Insuficiente</option>
              </select>
              <ChevronDown size={15} />
            </label>
            {(search || confidence !== "Todas") ? (
              <button type="button" className="forecast-clear" onClick={() => { setSearch(""); setConfidence("Todas"); }}>
                Limpar
              </button>
            ) : null}
          </div>
        </div>

        <div className="forecast-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Janela provável</th>
                <th>Melhor data</th>
                <th className="number">Valor mensal estimado</th>
                <th>Presença</th>
                <th>Tendência</th>
                <th>Confiança</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map((client) => (
                <tr
                  key={client.key}
                  className={selectedClientKey === client.key ? "forecast-row-selected" : ""}
                  onClick={() => setSelectedClientKey((current) => current === client.key ? null : client.key)}
                >
                  <td className="forecast-client-cell">
                    <strong>{client.clientName}</strong>
                    <span>{integer.format(client.receiptCount)} lançamentos em {integer.format(client.paymentDateCount)} datas</span>
                  </td>
                  <td>
                    {client.confidence === "Insuficiente"
                      ? <span className="forecast-muted">Histórico insuficiente</span>
                      : <strong>{formatDate(client.predictedStart)} a {formatDate(client.predictedEnd)}</strong>}
                  </td>
                  <td>{client.confidence === "Insuficiente" ? "—" : formatDate(client.predictedBestDate)}</td>
                  <td className="number"><strong>{currency.format(client.projectedMonthly)}</strong></td>
                  <td>{client.activeMonths}/6 meses</td>
                  <td><span className={`forecast-trend ${client.trend.toLowerCase().replace(" ", "-")}`}>{trendIcon(client.trend)}{client.trend}</span></td>
                  <td><span className={`forecast-confidence ${confidenceClass(client.confidence)}`}>{client.confidence}</span></td>
                </tr>
              ))}
              {!filteredClients.length ? (
                <tr><td colSpan={7} className="forecast-no-results">Nenhum cliente encontrado com os filtros selecionados.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>

      {selectedClient ? (
        <article className="forecast-panel forecast-detail-panel">
          <div className="forecast-panel-header">
            <div>
              <h3>{selectedClient.clientName}</h3>
              <p>
                {selectedClient.confidence === "Insuficiente"
                  ? "Ainda não existem datas suficientes para formar uma janela confiável."
                  : `A janela foi calculada pelas datas centrais do histórico: dias ${selectedClient.startDay} a ${selectedClient.endDay}, com mediana no dia ${selectedClient.medianDay}.`}
              </p>
            </div>
            <button type="button" className="forecast-clear" onClick={() => setSelectedClientKey(null)}>Fechar detalhe</button>
          </div>
          <div className="forecast-detail-grid">
            <div className="forecast-month-history">
              {analysis.months.map((month, index) => (
                <div key={month.key}>
                  <span>{month.shortLabel}</span>
                  <strong>{currency.format(selectedClient.monthlyTotals[index])}</strong>
                  <small>{integer.format(selectedClient.monthlyCounts[index])} lançamentos</small>
                </div>
              ))}
            </div>
            <div className="forecast-date-history">
              <strong>Datas consideradas</strong>
              <div>
                {selectedClient.paymentDates.slice(-12).reverse().map((entry) => (
                  <span key={entry.date}>
                    <b>{formatDate(entry.date)}</b>
                    <i>{currency.format(entry.amount)} · {integer.format(entry.receiptCount)} lançamentos</i>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </article>
      ) : null}

      <div className="forecast-footnote">
        <CircleAlert size={17} />
        <span>
          A base de Recebimentos não contém vencimentos nem títulos em aberto. Portanto, esta aba prevê a janela e o valor provável por comportamento histórico; ela não promete a data exata de uma nota específica.
          {analysis.ignoredReceiptCount ? ` ${integer.format(analysis.ignoredReceiptCount)} registros ficaram fora do cálculo por estarem fora do período, terem valor não positivo ou dados inválidos.` : ""}
        </span>
      </div>
    </section>
  );
}

export default function ReceiptForecastEnhancer() {
  const [data, setData] = useState<ImportState>(EMPTY_STATE);
  const [active, setActive] = useState(false);
  const [navTarget, setNavTarget] = useState<HTMLElement | null>(null);
  const [contentTarget, setContentTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let mounted = true;
    const handleData = (event: Event) => {
      const detail = (event as CustomEvent<ImportState>).detail;
      if (detail) setData(detail);
    };
    const handleCleared = () => setData(EMPTY_STATE);

    void loadAnalysisState().then((stored) => {
      if (mounted && stored) setData(stored);
    });
    window.addEventListener(ANALYSIS_DATA_EVENT, handleData);
    window.addEventListener(OFFLINE_DATA_CLEARED_EVENT, handleCleared);
    return () => {
      mounted = false;
      window.removeEventListener(ANALYSIS_DATA_EVENT, handleData);
      window.removeEventListener(OFFLINE_DATA_CLEARED_EVENT, handleCleared);
    };
  }, []);

  useEffect(() => {
    const syncTargets = () => {
      const nav = document.querySelector<HTMLElement>("aside.sidebar nav");
      if (nav) {
        let mount = document.getElementById("receipt-forecast-nav-mount");
        if (!mount) {
          mount = document.createElement("span");
          mount.id = "receipt-forecast-nav-mount";
          mount.style.display = "contents";
          const receiptButton = [...nav.querySelectorAll<HTMLButtonElement>("button")]
            .find((button) => button.textContent?.trim() === "Recebimentos");
          if (receiptButton) receiptButton.after(mount);
          else nav.append(mount);
        }
        setNavTarget(mount);
      }
      setContentTarget(document.querySelector<HTMLElement>(".content-area"));
    };

    syncTargets();
    const observer = new MutationObserver(syncTargets);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      document.getElementById("receipt-forecast-nav-mount")?.remove();
    };
  }, []);

  useEffect(() => {
    const handleOtherNavigation = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button") : null;
      if (!target || target.dataset.forecastNav === "true") return;
      if (target.closest("aside.sidebar nav") || target.textContent?.includes("Atualizar bases")) {
        setActive(false);
      }
    };
    document.addEventListener("click", handleOtherNavigation, true);
    return () => document.removeEventListener("click", handleOtherNavigation, true);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("receipt-forecast-active", active);
    if (active) {
      const title = document.querySelector<HTMLElement>(".topbar-title h1");
      if (title) title.textContent = "Previsão de Recebimentos";
    }
    return () => document.body.classList.remove("receipt-forecast-active");
  }, [active]);

  return (
    <>
      {navTarget ? createPortal(
        <button
          type="button"
          data-forecast-nav="true"
          className={active ? "active" : ""}
          aria-pressed={active}
          onClick={() => {
            setActive(true);
            document.querySelector<HTMLButtonElement>(".mobile-close")?.click();
          }}
        >
          <CalendarClock size={19} />
          Previsão
        </button>,
        navTarget,
      ) : null}

      {active && contentTarget ? createPortal(<ReceiptForecastView data={data} />, contentTarget) : null}

      <style jsx global>{`
        .receipt-forecast-active .content-area > :not(.receipt-forecast-page) {
          display: none !important;
        }

        .receipt-forecast-page {
          display: grid;
          gap: 22px;
          animation: forecastFadeIn 180ms ease-out;
        }

        @keyframes forecastFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .forecast-heading {
          display: flex;
          justify-content: space-between;
          gap: 24px;
          align-items: flex-start;
        }

        .forecast-heading > div:first-child > span {
          display: block;
          margin-bottom: 6px;
          color: #5d72f6;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .11em;
        }

        .forecast-heading h2 {
          margin: 0;
          color: #20263a;
          font-size: clamp(24px, 2.2vw, 34px);
        }

        .forecast-heading p {
          max-width: 760px;
          margin: 7px 0 0;
          color: #788198;
          line-height: 1.55;
        }

        .forecast-method-note {
          display: flex;
          min-width: 290px;
          gap: 11px;
          align-items: center;
          padding: 14px 16px;
          border: 1px solid #dfe4f1;
          border-radius: 14px;
          background: #fff;
          color: #5d72f6;
          box-shadow: 0 8px 24px rgba(39, 51, 89, .06);
        }

        .forecast-method-note div {
          display: grid;
          gap: 2px;
        }

        .forecast-method-note strong { color: #27304b; font-size: 13px; }
        .forecast-method-note span { color: #7e879d; font-size: 11px; }

        .forecast-warning,
        .forecast-footnote {
          display: flex;
          gap: 11px;
          align-items: flex-start;
          padding: 14px 16px;
          border: 1px solid #f0dcae;
          border-radius: 12px;
          background: #fffaf0;
          color: #805f18;
        }

        .forecast-warning div { display: grid; gap: 3px; }
        .forecast-warning strong { font-size: 13px; }
        .forecast-warning span, .forecast-footnote span { font-size: 12px; line-height: 1.5; }

        .forecast-kpi-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
        }

        .forecast-kpi {
          display: grid;
          min-height: 132px;
          align-content: space-between;
          padding: 18px;
          border: 1px solid #e4e8f1;
          border-radius: 16px;
          background: #fff;
          box-shadow: 0 9px 28px rgba(39, 51, 89, .055);
        }

        .forecast-kpi span { color: #727c93; font-size: 12px; font-weight: 700; }
        .forecast-kpi strong { color: #20263a; font-size: clamp(20px, 2vw, 28px); }
        .forecast-kpi small { color: #98a0b1; font-size: 11px; }

        .forecast-chart-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.55fr) minmax(340px, .9fr);
          gap: 16px;
        }

        .forecast-panel {
          overflow: hidden;
          border: 1px solid #e4e8f1;
          border-radius: 16px;
          background: #fff;
          box-shadow: 0 9px 28px rgba(39, 51, 89, .05);
        }

        .forecast-panel-header {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: center;
          padding: 18px 20px 0;
        }

        .forecast-panel-header h3 { margin: 0; color: #27304b; font-size: 15px; }
        .forecast-panel-header p { margin: 4px 0 0; color: #8d95a8; font-size: 11px; }
        .forecast-chart-box { height: 300px; padding: 10px 14px 14px; }

        .forecast-table-header { align-items: flex-end; padding-bottom: 14px; }
        .forecast-table-controls { display: flex; gap: 9px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }

        .forecast-search,
        .forecast-select {
          display: flex;
          height: 38px;
          align-items: center;
          gap: 8px;
          padding: 0 11px;
          border: 1px solid #dfe4ee;
          border-radius: 10px;
          background: #fff;
          color: #929aad;
        }

        .forecast-search input,
        .forecast-select select {
          min-width: 170px;
          border: 0;
          outline: 0;
          background: transparent;
          color: #333b52;
          font: inherit;
          font-size: 12px;
        }

        .forecast-select select { appearance: none; padding-right: 4px; }

        .forecast-clear {
          min-height: 36px;
          padding: 0 12px;
          border: 1px solid #dfe4ee;
          border-radius: 9px;
          background: #fff;
          color: #626c83;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }

        .forecast-clear:hover { border-color: #bfc8dc; color: #39425a; }

        .forecast-table-wrap { overflow-x: auto; border-top: 1px solid #edf0f5; }
        .forecast-table-wrap table { width: 100%; border-collapse: collapse; min-width: 1080px; }
        .forecast-table-wrap th,
        .forecast-table-wrap td { padding: 13px 16px; border-bottom: 1px solid #edf0f5; text-align: left; font-size: 12px; }
        .forecast-table-wrap th { background: #fafbfe; color: #7d869a; font-size: 10px; letter-spacing: .035em; text-transform: uppercase; }
        .forecast-table-wrap td { color: #515a70; }
        .forecast-table-wrap th.number,
        .forecast-table-wrap td.number { text-align: right; }
        .forecast-table-wrap tbody tr { cursor: pointer; transition: background 140ms ease; }
        .forecast-table-wrap tbody tr:hover,
        .forecast-table-wrap tbody tr.forecast-row-selected { background: #f7f8ff; }

        .forecast-client-cell { display: grid; min-width: 270px; gap: 3px; }
        .forecast-client-cell strong { color: #27304b; font-size: 12px; }
        .forecast-client-cell span { color: #98a0b1; font-size: 10px; }
        .forecast-muted { color: #9aa2b3; }

        .forecast-confidence,
        .forecast-trend {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 5px 8px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 800;
          white-space: nowrap;
        }

        .forecast-confidence.alta { background: #e8f8f3; color: #16866f; }
        .forecast-confidence.media { background: #eef0ff; color: #5367df; }
        .forecast-confidence.baixa { background: #fff4dd; color: #9b6c08; }
        .forecast-confidence.insuficiente { background: #f1f2f5; color: #7c8392; }
        .forecast-trend { padding-left: 0; background: transparent; color: #6e778d; }
        .forecast-trend.em-alta { color: #16866f; }
        .forecast-trend.em-queda { color: #c55767; }

        .forecast-detail-panel { padding-bottom: 18px; }
        .forecast-detail-grid { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(300px, .8fr); gap: 18px; padding: 18px 20px 0; }
        .forecast-month-history { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
        .forecast-month-history div { display: grid; gap: 5px; padding: 12px; border: 1px solid #e7eaf2; border-radius: 11px; background: #fbfcff; }
        .forecast-month-history span { color: #848da2; font-size: 10px; text-transform: uppercase; }
        .forecast-month-history strong { color: #27304b; font-size: 13px; }
        .forecast-month-history small { color: #a1a8b8; font-size: 9px; }
        .forecast-date-history { display: grid; gap: 10px; align-content: start; }
        .forecast-date-history > strong { color: #3c455c; font-size: 12px; }
        .forecast-date-history > div { display: grid; max-height: 190px; overflow: auto; border: 1px solid #e7eaf2; border-radius: 11px; }
        .forecast-date-history span { display: flex; justify-content: space-between; gap: 10px; padding: 9px 11px; border-bottom: 1px solid #edf0f5; }
        .forecast-date-history span:last-child { border-bottom: 0; }
        .forecast-date-history b { color: #444e65; font-size: 10px; }
        .forecast-date-history i { color: #8d95a8; font-size: 9px; font-style: normal; text-align: right; }

        .forecast-no-results { padding: 28px !important; text-align: center !important; color: #8d95a8 !important; }

        .forecast-empty {
          display: grid;
          min-height: 460px;
          place-items: center;
          align-content: center;
          gap: 10px;
          padding: 38px;
          border: 1px dashed #cfd6e6;
          border-radius: 18px;
          background: #fff;
          color: #5d72f6;
          text-align: center;
        }

        .forecast-empty span { margin-top: 8px; font-size: 10px; font-weight: 800; letter-spacing: .12em; }
        .forecast-empty h2 { margin: 0; color: #27304b; }
        .forecast-empty p { max-width: 610px; margin: 0; color: #7f889d; line-height: 1.55; }

        @media (max-width: 1100px) {
          .forecast-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .forecast-chart-grid { grid-template-columns: 1fr; }
        }

        @media (max-width: 760px) {
          .forecast-heading { display: grid; }
          .forecast-method-note { min-width: 0; }
          .forecast-kpi-grid { grid-template-columns: 1fr; }
          .forecast-table-header { align-items: stretch; }
          .forecast-table-controls { justify-content: stretch; }
          .forecast-search,
          .forecast-select { flex: 1 1 100%; }
          .forecast-search input,
          .forecast-select select { min-width: 0; width: 100%; }
          .forecast-detail-grid { grid-template-columns: 1fr; }
          .forecast-month-history { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .forecast-chart-box { height: 270px; }
        }
      `}</style>
    </>
  );
}
