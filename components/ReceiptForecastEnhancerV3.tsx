"use client";

import { CalendarClock, ChevronDown, CircleAlert, TrendingDown, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
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
  monthlyEstimate: number;
  activeMonths: number;
  monthlyTotals: number[];
  monthlyCounts: number[];
  representativeDays: number[];
};

type ForecastRow = ClientForecast & {
  predictedStart: string;
  predictedBestDate: string;
  predictedEnd: string;
  weekId: string;
};

type ForecastWeek = {
  id: string;
  label: string;
  start: Date;
  end: Date;
};

type ForecastAnalysis = {
  periodLabel: string;
  months: HistoryMonth[];
  clients: ClientForecast[];
  validReceiptCount: number;
  ignoredReceiptCount: number;
};

const EMPTY_STATE: ImportState = { invoices: [], receipts: [] };
const HISTORY_MONTHS = 3;
const MONTH_FORMATTER = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
const SHORT_MONTH_FORMATTER = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" });
const CONFIDENCE_ORDER: Record<Confidence, number> = {
  Alta: 0,
  Média: 1,
  Baixa: 2,
  Insuficiente: 3,
};

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

function adjustToBusinessDayInsideMonth(date: Date) {
  const adjusted = new Date(date);
  if (adjusted.getDay() === 6) adjusted.setDate(adjusted.getDate() - 1);
  if (adjusted.getDay() === 0) adjusted.setDate(adjusted.getDate() + 1);
  if (adjusted.getMonth() !== date.getMonth()) {
    adjusted.setTime(date.getTime());
    adjusted.setDate(adjusted.getDate() - 2);
  }
  return adjusted;
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

function median(values: number[]) {
  return quantile(values, 0.5);
}

function weightedMedianDay(entries: Array<{ day: number; amount: number }>) {
  const sorted = [...entries]
    .filter((entry) => entry.amount > 0)
    .sort((left, right) => left.day - right.day);
  if (!sorted.length) return 0;
  const total = sorted.reduce((sum, entry) => sum + entry.amount, 0);
  let accumulated = 0;
  for (const entry of sorted) {
    accumulated += entry.amount;
    if (accumulated >= total / 2) return entry.day;
  }
  return sorted[sorted.length - 1].day;
}

function trendFor(monthlyTotals: number[]): Trend {
  const activeValues = monthlyTotals.filter((value) => value > 0);
  if (activeValues.length < 2) return "Sem base";
  const first = activeValues[0];
  const last = activeValues[activeValues.length - 1];
  if (first === 0) return last > 0 ? "Em alta" : "Sem base";
  const variation = (last - first) / Math.abs(first);
  if (variation > 0.1) return "Em alta";
  if (variation < -0.1) return "Em queda";
  return "Estável";
}

function confidenceFor(activeMonths: number, windowSpan: number): Confidence {
  if (activeMonths < 2) return "Insuficiente";
  if (activeMonths === 3 && windowSpan <= 7) return "Alta";
  if (activeMonths >= 2 && windowSpan <= 12) return "Média";
  return "Baixa";
}

function isDemoReceipt(receipt: Receipt) {
  return receipt.id.startsWith("demo-receipt-") || receipt.sourceSheet === "DEMONSTRAÇÃO";
}

function buildForecastAnalysis(receipts: Receipt[], now = new Date()): ForecastAnalysis {
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0, 0);
  const historyStart = addMonths(currentMonthStart, -HISTORY_MONTHS);
  const historyEnd = currentMonthStart;
  const months: HistoryMonth[] = Array.from({ length: HISTORY_MONTHS }, (_, index) => {
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

  type ClientAccumulator = {
    clientName: string;
    monthlyTotals: number[];
    monthlyCounts: number[];
    monthlyDailyTotals: Array<Map<number, number>>;
  };

  const byClient = new Map<string, ClientAccumulator>();
  let validReceiptCount = 0;
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

    const receiptMonthIndex = monthIndex.get(monthKey(parsedDate));
    if (receiptMonthIndex === undefined) {
      ignoredReceiptCount += 1;
      return;
    }

    validReceiptCount += 1;
    const key = clientName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase();
    const accumulator = byClient.get(key) ?? {
      clientName,
      monthlyTotals: Array(HISTORY_MONTHS).fill(0) as number[],
      monthlyCounts: Array(HISTORY_MONTHS).fill(0) as number[],
      monthlyDailyTotals: Array.from({ length: HISTORY_MONTHS }, () => new Map<number, number>()),
    };

    accumulator.monthlyTotals[receiptMonthIndex] += receipt.amount;
    accumulator.monthlyCounts[receiptMonthIndex] += 1;
    const day = parsedDate.getDate();
    const dailyTotal = accumulator.monthlyDailyTotals[receiptMonthIndex].get(day) ?? 0;
    accumulator.monthlyDailyTotals[receiptMonthIndex].set(day, dailyTotal + receipt.amount);
    byClient.set(key, accumulator);
  });

  const clients = [...byClient.entries()].map(([key, accumulator]): ClientForecast => {
    const representativeDays = accumulator.monthlyDailyTotals
      .map((dailyTotals) => weightedMedianDay(
        [...dailyTotals.entries()].map(([day, amount]) => ({ day, amount })),
      ))
      .filter((day) => day > 0);
    const startDay = Math.max(1, Math.floor(quantile(representativeDays, 0.25)));
    const medianDay = Math.max(1, Math.round(quantile(representativeDays, 0.5)));
    const endDay = Math.max(startDay, Math.ceil(quantile(representativeDays, 0.75)));
    const activeMonthlyTotals = accumulator.monthlyTotals.filter((value) => value > 0);
    const activeMonths = activeMonthlyTotals.length;

    return {
      key,
      clientName: accumulator.clientName,
      confidence: confidenceFor(activeMonths, endDay - startDay),
      trend: trendFor(accumulator.monthlyTotals),
      startDay,
      medianDay,
      endDay,
      monthlyEstimate: activeMonthlyTotals.length ? median(activeMonthlyTotals) : 0,
      activeMonths,
      monthlyTotals: accumulator.monthlyTotals,
      monthlyCounts: accumulator.monthlyCounts,
      representativeDays,
    };
  }).sort((left, right) =>
    CONFIDENCE_ORDER[left.confidence] - CONFIDENCE_ORDER[right.confidence]
    || right.monthlyEstimate - left.monthlyEstimate
    || left.clientName.localeCompare(right.clientName, "pt-BR"),
  );

  return {
    periodLabel: `${MONTH_FORMATTER.format(months[0].start)} a ${MONTH_FORMATTER.format(months[months.length - 1].start)}`,
    months,
    clients,
    validReceiptCount,
    ignoredReceiptCount,
  };
}

function buildForecastWeeks(month: Date): ForecastWeek[] {
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0, 12, 0, 0, 0);
  const groups = new Map<string, Date[]>();

  for (let day = 1; day <= monthEnd.getDate(); day += 1) {
    const date = new Date(month.getFullYear(), month.getMonth(), day, 12, 0, 0, 0);
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    const monday = new Date(date);
    monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    const key = toIsoDate(monday);
    const list = groups.get(key) ?? [];
    list.push(date);
    groups.set(key, list);
  }

  return [...groups.entries()].map(([id, dates], index) => ({
    id,
    label: `Semana ${index + 1} · ${formatDate(toIsoDate(dates[0]))} a ${formatDate(toIsoDate(dates[dates.length - 1]))}`,
    start: dates[0],
    end: dates[dates.length - 1],
  }));
}

function weekForDate(weeks: ForecastWeek[], date: Date) {
  return weeks.find((week) => date >= week.start && date <= week.end)?.id ?? "outside";
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
  const analysis = useMemo(() => buildForecastAnalysis(data.receipts), [data.receipts]);
  const forecastMonthOptions = useMemo(() => {
    const now = new Date();
    const current = new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0, 0);
    return Array.from({ length: 12 }, (_, index) => addMonths(current, index));
  }, []);
  const [selectedMonthKey, setSelectedMonthKey] = useState(() => monthKey(forecastMonthOptions[0]));
  const [selectedClient, setSelectedClient] = useState("all");
  const [selectedConfidence, setSelectedConfidence] = useState<Confidence | "Todas">("Todas");
  const [selectedWeek, setSelectedWeek] = useState("all");
  const [selectedDetailKey, setSelectedDetailKey] = useState<string | null>(null);

  const selectedMonth = forecastMonthOptions.find((month) => monthKey(month) === selectedMonthKey)
    ?? forecastMonthOptions[0];
  const weeks = useMemo(() => buildForecastWeeks(selectedMonth), [selectedMonth]);
  const rows = useMemo<ForecastRow[]>(() => analysis.clients.map((client) => {
    const start = adjustToBusinessDayInsideMonth(dateInMonth(selectedMonth, client.startDay));
    const best = adjustToBusinessDayInsideMonth(dateInMonth(selectedMonth, client.medianDay));
    const end = adjustToBusinessDayInsideMonth(dateInMonth(selectedMonth, client.endDay));
    return {
      ...client,
      predictedStart: toIsoDate(start),
      predictedBestDate: toIsoDate(best),
      predictedEnd: toIsoDate(end),
      weekId: weekForDate(weeks, best),
    };
  }), [analysis.clients, selectedMonth, weeks]);

  const clientOptions = useMemo(() => analysis.clients
    .map((client) => ({ key: client.key, name: client.clientName }))
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR")), [analysis.clients]);

  const scopeRows = useMemo(() => rows.filter((row) =>
    (selectedClient === "all" || row.key === selectedClient)
    && (selectedConfidence === "Todas" || row.confidence === selectedConfidence),
  ), [rows, selectedClient, selectedConfidence]);

  const filteredRows = useMemo(() => scopeRows.filter((row) =>
    selectedWeek === "all" || row.weekId === selectedWeek,
  ), [scopeRows, selectedWeek]);

  const selectedHistoryClients = useMemo(() => analysis.clients.filter((client) =>
    (selectedClient === "all" || client.key === selectedClient)
    && (selectedConfidence === "Todas" || client.confidence === selectedConfidence),
  ), [analysis.clients, selectedClient, selectedConfidence]);

  const monthlyHistory = useMemo(() => analysis.months.map((month, index) => ({
    month: month.shortLabel,
    amount: selectedHistoryClients.reduce((sum, client) => sum + client.monthlyTotals[index], 0),
  })), [analysis.months, selectedHistoryClients]);

  const weeklySummary = useMemo(() => weeks.map((week) => {
    const weekRows = scopeRows.filter((row) => row.weekId === week.id && row.confidence !== "Insuficiente");
    return {
      ...week,
      amount: weekRows.reduce((sum, row) => sum + row.monthlyEstimate, 0),
      clients: weekRows.length,
      names: weekRows.slice(0, 4).map((row) => row.clientName),
    };
  }), [scopeRows, weeks]);

  const selectedWeekRows = selectedWeek === "all"
    ? scopeRows.filter((row) => row.confidence !== "Insuficiente")
    : scopeRows.filter((row) => row.weekId === selectedWeek && row.confidence !== "Insuficiente");
  const selectedWeekTotal = selectedWeekRows.reduce((sum, row) => sum + row.monthlyEstimate, 0);
  const monthForecastTotal = scopeRows
    .filter((row) => row.confidence !== "Insuficiente")
    .reduce((sum, row) => sum + row.monthlyEstimate, 0);
  const highConfidenceTotal = scopeRows
    .filter((row) => row.confidence === "Alta")
    .reduce((sum, row) => sum + row.monthlyEstimate, 0);
  const selectedDetail = rows.find((row) => row.key === selectedDetailKey) ?? null;

  function clearFilters() {
    setSelectedClient("all");
    setSelectedConfidence("Todas");
    setSelectedWeek("all");
  }

  if (!data.receipts.length) {
    return (
      <section className="receipt-forecast-page-v3">
        <div className="forecast-empty-v3">
          <CalendarClock size={42} />
          <span>PREVISÃO DE RECEBIMENTOS</span>
          <h2>Importe a mesma planilha usada em Recebimentos.</h2>
          <p>Não existe outro upload. A previsão será calculada automaticamente com a base já utilizada.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="receipt-forecast-page-v3">
      <div className="forecast-heading-v3">
        <div>
          <span>HISTÓRICO AUTOMÁTICO</span>
          <h2>Previsão de Recebimentos</h2>
          <p>
            Previsão mensal e semanal calculada somente com os três meses completos de {analysis.periodLabel}.
            Clientes sem recebimentos nesse período não entram na previsão.
          </p>
        </div>
        <div className="forecast-method-v3">
          <CalendarClock size={20} />
          <div><strong>Mesma base de Recebimentos</strong><span>Sem segundo upload</span></div>
        </div>
      </div>

      <section className="forecast-filter-bar-v3">
        <div className="forecast-filter-title-v3"><span>Filtros da previsão</span><small>Recalculam todos os valores abaixo</small></div>
        <label>
          <span>Cliente</span>
          <div className="forecast-select-v3">
            <select value={selectedClient} onChange={(event: ChangeEvent<HTMLSelectElement>) => {
              setSelectedClient(event.target.value);
              setSelectedWeek("all");
            }}>
              <option value="all">Todos os clientes</option>
              {clientOptions.map((client) => <option key={client.key} value={client.key}>{client.name}</option>)}
            </select>
            <ChevronDown size={15} />
          </div>
        </label>
        <label>
          <span>Mês previsto</span>
          <div className="forecast-select-v3">
            <select value={selectedMonthKey} onChange={(event: ChangeEvent<HTMLSelectElement>) => {
              setSelectedMonthKey(event.target.value);
              setSelectedWeek("all");
            }}>
              {forecastMonthOptions.map((month) => (
                <option key={monthKey(month)} value={monthKey(month)}>{MONTH_FORMATTER.format(month)}</option>
              ))}
            </select>
            <ChevronDown size={15} />
          </div>
        </label>
        <label>
          <span>Janela provável</span>
          <div className="forecast-select-v3">
            <select value={selectedWeek} onChange={(event: ChangeEvent<HTMLSelectElement>) => setSelectedWeek(event.target.value)}>
              <option value="all">Todas as semanas</option>
              {weeks.map((week) => <option key={week.id} value={week.id}>{week.label}</option>)}
            </select>
            <ChevronDown size={15} />
          </div>
        </label>
        <label>
          <span>Confiança</span>
          <div className="forecast-select-v3">
            <select value={selectedConfidence} onChange={(event: ChangeEvent<HTMLSelectElement>) => {
              setSelectedConfidence(event.target.value as Confidence | "Todas");
              setSelectedWeek("all");
            }}>
              <option value="Todas">Todas</option>
              <option value="Alta">Alta</option>
              <option value="Média">Média</option>
              <option value="Baixa">Baixa</option>
              <option value="Insuficiente">Insuficiente</option>
            </select>
            <ChevronDown size={15} />
          </div>
        </label>
        {(selectedClient !== "all" || selectedConfidence !== "Todas" || selectedWeek !== "all") ? (
          <button type="button" className="forecast-clear-v3" onClick={clearFilters}>Limpar</button>
        ) : null}
      </section>

      <section className="forecast-kpis-v3">
        <article><span>Previsão do mês</span><strong>{currency.format(monthForecastTotal)}</strong><small>{MONTH_FORMATTER.format(selectedMonth)}</small></article>
        <article><span>Janela selecionada</span><strong>{currency.format(selectedWeekTotal)}</strong><small>{selectedWeek === "all" ? "Todas as semanas" : weeks.find((week) => week.id === selectedWeek)?.label}</small></article>
        <article><span>Alta confiança</span><strong>{currency.format(highConfidenceTotal)}</strong><small>Recebimento nos 3 meses e janela estável</small></article>
        <article><span>Clientes previstos</span><strong>{integer.format(filteredRows.filter((row) => row.confidence !== "Insuficiente").length)}</strong><small>{integer.format(analysis.validReceiptCount)} lançamentos analisados</small></article>
      </section>

      <section className="forecast-main-grid-v3">
        <article className="forecast-panel-v3">
          <div className="forecast-panel-header-v3">
            <div><h3>Comparativo dos últimos três meses</h3><p>Valores realmente recebidos em cada mês</p></div>
          </div>
          <div className="forecast-chart-v3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyHistory} margin={{ top: 12, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8ebf2" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "#788198", fontSize: 12 }} />
                <YAxis tickFormatter={(value: number | string) => compactCurrency.format(Number(value))} tickLine={false} axisLine={false} tick={{ fill: "#9aa2b3", fontSize: 11 }} width={72} />
                <Tooltip formatter={(value: number | string) => currency.format(Number(value))} />
                <Bar dataKey="amount" name="Recebido" fill="#5d72f6" radius={[6, 6, 0, 0]} maxBarSize={56} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="forecast-panel-v3">
          <div className="forecast-panel-header-v3">
            <div><h3>Previsão por semana</h3><p>{MONTH_FORMATTER.format(selectedMonth)}</p></div>
          </div>
          <div className="forecast-weeks-v3">
            {weeklySummary.map((week) => (
              <button
                key={week.id}
                type="button"
                className={selectedWeek === week.id ? "active" : ""}
                onClick={() => setSelectedWeek((current) => current === week.id ? "all" : week.id)}
              >
                <span>{week.label}</span>
                <strong>{currency.format(week.amount)}</strong>
                <small>{integer.format(week.clients)} clientes previstos</small>
                {week.names.length ? <i>{week.names.join(" · ")}</i> : <i>Sem previsão nesta semana</i>}
              </button>
            ))}
          </div>
        </article>
      </section>

      <article className="forecast-panel-v3">
        <div className="forecast-panel-header-v3 forecast-table-header-v3">
          <div><h3>Previsão por cliente</h3><p>{integer.format(filteredRows.length)} clientes após os filtros</p></div>
        </div>
        <div className="forecast-table-wrap-v3">
          <table>
            <thead><tr><th>Cliente</th><th>Semana prevista</th><th>Janela provável</th><th>Melhor data</th><th className="number">Valor estimado</th><th>Presença</th><th>Tendência</th><th>Confiança</th></tr></thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.key} onClick={() => setSelectedDetailKey((current) => current === row.key ? null : row.key)}>
                  <td className="forecast-client-v3"><strong>{row.clientName}</strong><span>Cliente analisado individualmente</span></td>
                  <td>{weeks.find((week) => week.id === row.weekId)?.label ?? "Fora das semanas úteis"}</td>
                  <td>{row.confidence === "Insuficiente" ? "Histórico insuficiente" : `${formatDate(row.predictedStart)} a ${formatDate(row.predictedEnd)}`}</td>
                  <td>{row.confidence === "Insuficiente" ? "—" : formatDate(row.predictedBestDate)}</td>
                  <td className="number"><strong>{currency.format(row.monthlyEstimate)}</strong></td>
                  <td>{row.activeMonths}/3 meses</td>
                  <td><span className={`forecast-trend-v3 ${row.trend.toLowerCase().replace(" ", "-")}`}>{trendIcon(row.trend)}{row.trend}</span></td>
                  <td><span className={`forecast-confidence-v3 ${confidenceClass(row.confidence)}`}>{row.confidence}</span></td>
                </tr>
              ))}
              {!filteredRows.length ? <tr><td colSpan={8} className="forecast-empty-row-v3">Nenhum cliente encontrado nos filtros selecionados.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </article>

      {selectedDetail ? (
        <article className="forecast-panel-v3 forecast-detail-v3">
          <div className="forecast-panel-header-v3">
            <div>
              <h3>{selectedDetail.clientName}</h3>
              <p>
                Confiança baseada em {selectedDetail.activeMonths} dos últimos 3 meses e nas datas representativas: {selectedDetail.representativeDays.join(", ") || "sem dados"}.
              </p>
            </div>
            <button type="button" className="forecast-clear-v3" onClick={() => setSelectedDetailKey(null)}>Fechar detalhe</button>
          </div>
          <div className="forecast-history-grid-v3">
            {analysis.months.map((month, index) => (
              <div key={month.key}>
                <span>{month.shortLabel}</span>
                <strong>{currency.format(selectedDetail.monthlyTotals[index])}</strong>
                <small>{integer.format(selectedDetail.monthlyCounts[index])} lançamentos</small>
              </div>
            ))}
          </div>
        </article>
      ) : null}

      <div className="forecast-note-v3">
        <CircleAlert size={17} />
        <span>
          A previsão usa somente os três meses completos anteriores ao mês atual. O valor estimado é a mediana dos meses em que houve recebimento. Clientes sem recebimentos nesse intervalo não entram no cálculo.
          {analysis.ignoredReceiptCount ? ` ${integer.format(analysis.ignoredReceiptCount)} registros ficaram fora do cálculo por período, valor ou data inválida.` : ""}
        </span>
      </div>
    </section>
  );
}

export default function ReceiptForecastEnhancerV3() {
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
        let mount = document.getElementById("receipt-forecast-nav-mount-v3");
        if (!mount) {
          mount = document.createElement("span");
          mount.id = "receipt-forecast-nav-mount-v3";
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
      document.getElementById("receipt-forecast-nav-mount-v3")?.remove();
    };
  }, []);

  useEffect(() => {
    const handleOtherNavigation = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button") : null;
      if (!target || target.dataset.forecastNavV3 === "true") return;
      if (target.closest("aside.sidebar nav") || target.textContent?.includes("Atualizar bases")) setActive(false);
    };
    document.addEventListener("click", handleOtherNavigation, true);
    return () => document.removeEventListener("click", handleOtherNavigation, true);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("receipt-forecast-active-v3", active);
    if (active) {
      const title = document.querySelector<HTMLElement>(".topbar-title h1");
      if (title) title.textContent = "Previsão de Recebimentos";
    }
    return () => document.body.classList.remove("receipt-forecast-active-v3");
  }, [active]);

  return (
    <>
      {navTarget ? createPortal(
        <button
          type="button"
          data-forecast-nav-v3="true"
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
        .receipt-forecast-active-v3 .content-area > :not(.receipt-forecast-page-v3) { display: none !important; }
        .receipt-forecast-page-v3 { display: grid; gap: 20px; animation: forecastV3Fade 180ms ease-out; }
        @keyframes forecastV3Fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        .forecast-heading-v3 { display: flex; justify-content: space-between; align-items: flex-start; gap: 22px; }
        .forecast-heading-v3 > div:first-child > span { display: block; margin-bottom: 6px; color: #5d72f6; font-size: 11px; font-weight: 800; letter-spacing: .11em; }
        .forecast-heading-v3 h2 { margin: 0; color: #20263a; font-size: clamp(24px, 2.2vw, 34px); }
        .forecast-heading-v3 p { max-width: 780px; margin: 7px 0 0; color: #788198; line-height: 1.55; }
        .forecast-method-v3 { display: flex; min-width: 270px; gap: 10px; align-items: center; padding: 14px 16px; border: 1px solid #dfe4f1; border-radius: 14px; background: #fff; color: #5d72f6; }
        .forecast-method-v3 div { display: grid; gap: 2px; }
        .forecast-method-v3 strong { color: #27304b; font-size: 13px; }
        .forecast-method-v3 span { color: #7e879d; font-size: 11px; }
        .forecast-filter-bar-v3 { display: grid; grid-template-columns: auto repeat(4, minmax(150px, 1fr)) auto; gap: 12px; align-items: end; padding: 16px; border: 1px solid #e3e7f0; border-radius: 15px; background: #fff; }
        .forecast-filter-title-v3 { display: grid; align-self: center; min-width: 145px; gap: 2px; }
        .forecast-filter-title-v3 span { color: #323b52; font-size: 12px; font-weight: 800; }
        .forecast-filter-title-v3 small { color: #959daf; font-size: 10px; }
        .forecast-filter-bar-v3 label { display: grid; gap: 6px; color: #778097; font-size: 10px; font-weight: 700; }
        .forecast-select-v3 { display: flex; height: 40px; align-items: center; gap: 7px; padding: 0 10px; border: 1px solid #dfe4ee; border-radius: 10px; background: #fff; color: #929aad; }
        .forecast-select-v3 select { width: 100%; min-width: 0; border: 0; outline: 0; appearance: none; background: transparent; color: #333b52; font: inherit; font-size: 12px; }
        .forecast-clear-v3 { min-height: 38px; padding: 0 12px; border: 1px solid #dfe4ee; border-radius: 9px; background: #fff; color: #626c83; font-size: 12px; font-weight: 700; cursor: pointer; }
        .forecast-kpis-v3 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
        .forecast-kpis-v3 article { display: grid; min-height: 128px; align-content: space-between; padding: 18px; border: 1px solid #e4e8f1; border-radius: 16px; background: #fff; }
        .forecast-kpis-v3 span { color: #727c93; font-size: 12px; font-weight: 700; }
        .forecast-kpis-v3 strong { color: #20263a; font-size: clamp(20px, 2vw, 28px); }
        .forecast-kpis-v3 small { color: #98a0b1; font-size: 11px; }
        .forecast-main-grid-v3 { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(350px, .95fr); gap: 16px; }
        .forecast-panel-v3 { overflow: hidden; border: 1px solid #e4e8f1; border-radius: 16px; background: #fff; }
        .forecast-panel-header-v3 { display: flex; justify-content: space-between; gap: 16px; align-items: center; padding: 18px 20px 0; }
        .forecast-panel-header-v3 h3 { margin: 0; color: #27304b; font-size: 15px; }
        .forecast-panel-header-v3 p { margin: 4px 0 0; color: #8d95a8; font-size: 11px; }
        .forecast-chart-v3 { height: 310px; padding: 10px 14px 14px; }
        .forecast-weeks-v3 { display: grid; gap: 9px; padding: 14px 18px 18px; }
        .forecast-weeks-v3 button { display: grid; gap: 4px; padding: 12px 14px; border: 1px solid #e4e8f1; border-radius: 12px; background: #fbfcff; text-align: left; cursor: pointer; }
        .forecast-weeks-v3 button:hover, .forecast-weeks-v3 button.active { border-color: #aeb9f4; background: #f2f4ff; }
        .forecast-weeks-v3 span { color: #586178; font-size: 11px; font-weight: 800; }
        .forecast-weeks-v3 strong { color: #20263a; font-size: 18px; }
        .forecast-weeks-v3 small { color: #8d95a8; font-size: 10px; }
        .forecast-weeks-v3 i { overflow: hidden; color: #707a91; font-size: 9px; font-style: normal; text-overflow: ellipsis; white-space: nowrap; }
        .forecast-table-header-v3 { padding-bottom: 14px; }
        .forecast-table-wrap-v3 { overflow-x: auto; border-top: 1px solid #edf0f5; }
        .forecast-table-wrap-v3 table { width: 100%; min-width: 1250px; border-collapse: collapse; }
        .forecast-table-wrap-v3 th, .forecast-table-wrap-v3 td { padding: 13px 15px; border-bottom: 1px solid #edf0f5; text-align: left; font-size: 12px; }
        .forecast-table-wrap-v3 th { background: #fafbfe; color: #7d869a; font-size: 10px; letter-spacing: .035em; text-transform: uppercase; }
        .forecast-table-wrap-v3 th.number, .forecast-table-wrap-v3 td.number { text-align: right; }
        .forecast-table-wrap-v3 tbody tr { cursor: pointer; }
        .forecast-table-wrap-v3 tbody tr:hover { background: #f7f8ff; }
        .forecast-client-v3 { display: grid; min-width: 240px; gap: 3px; }
        .forecast-client-v3 strong { color: #27304b; font-size: 12px; }
        .forecast-client-v3 span { color: #98a0b1; font-size: 10px; }
        .forecast-confidence-v3, .forecast-trend-v3 { display: inline-flex; align-items: center; gap: 5px; padding: 5px 8px; border-radius: 999px; font-size: 10px; font-weight: 800; white-space: nowrap; }
        .forecast-confidence-v3.alta { background: #e8f8f3; color: #16866f; }
        .forecast-confidence-v3.media { background: #eef0ff; color: #5367df; }
        .forecast-confidence-v3.baixa { background: #fff4dd; color: #9b6c08; }
        .forecast-confidence-v3.insuficiente { background: #f1f2f5; color: #7c8392; }
        .forecast-trend-v3 { padding-left: 0; background: transparent; color: #6e778d; }
        .forecast-trend-v3.em-alta { color: #16866f; }
        .forecast-trend-v3.em-queda { color: #c55767; }
        .forecast-history-grid-v3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; padding: 18px 20px 20px; }
        .forecast-history-grid-v3 div { display: grid; gap: 5px; padding: 12px; border: 1px solid #e7eaf2; border-radius: 11px; background: #fbfcff; }
        .forecast-history-grid-v3 span { color: #848da2; font-size: 10px; text-transform: uppercase; }
        .forecast-history-grid-v3 strong { color: #27304b; font-size: 13px; }
        .forecast-history-grid-v3 small { color: #a1a8b8; font-size: 9px; }
        .forecast-note-v3 { display: flex; gap: 10px; align-items: flex-start; padding: 14px 16px; border: 1px solid #f0dcae; border-radius: 12px; background: #fffaf0; color: #805f18; }
        .forecast-note-v3 span { font-size: 12px; line-height: 1.5; }
        .forecast-empty-row-v3 { padding: 28px !important; text-align: center !important; color: #8d95a8 !important; }
        .forecast-empty-v3 { display: grid; min-height: 460px; place-items: center; align-content: center; gap: 10px; padding: 38px; border: 1px dashed #cfd6e6; border-radius: 18px; background: #fff; color: #5d72f6; text-align: center; }
        .forecast-empty-v3 h2 { margin: 0; color: #27304b; }
        .forecast-empty-v3 p { max-width: 600px; margin: 0; color: #7f889d; }
        @media (max-width: 1250px) {
          .forecast-filter-bar-v3 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .forecast-filter-title-v3 { grid-column: 1 / -1; }
          .forecast-kpis-v3 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .forecast-main-grid-v3 { grid-template-columns: 1fr; }
        }
        @media (max-width: 760px) {
          .forecast-heading-v3 { display: grid; }
          .forecast-method-v3 { min-width: 0; }
          .forecast-filter-bar-v3 { grid-template-columns: 1fr; }
          .forecast-kpis-v3 { grid-template-columns: 1fr; }
          .forecast-history-grid-v3 { grid-template-columns: 1fr; }
          .forecast-chart-v3 { height: 270px; }
        }
      `}</style>
    </>
  );
}
