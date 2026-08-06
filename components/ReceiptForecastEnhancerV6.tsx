"use client";

import { CalendarClock, CheckCircle2, ChevronDown, CircleAlert, TrendingDown, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { compactCurrency, currency, formatDate, integer } from "@/lib/format";
import { ANALYSIS_DATA_EVENT, loadAnalysisState, OFFLINE_DATA_CLEARED_EVENT } from "@/lib/offlineStorage";
import { canonicalReceiptClientName } from "@/lib/receiptClientNames";
import type { ImportState, Receipt } from "@/lib/types";

type Confidence = "Alta" | "Média" | "Baixa" | "Insuficiente";
type Trend = "Em alta" | "Estável" | "Em queda" | "Sem base";

type ForecastWeek = {
  id: string;
  label: string;
  start: Date;
  end: Date;
  startDay: number;
  endDay: number;
};

type HistoryMonth = {
  key: string;
  label: string;
  shortLabel: string;
  start: Date;
};

type ClientHistory = {
  key: string;
  clientName: string;
  monthlyTotals: number[];
  monthlyCounts: number[];
  dailyTotals: Array<Map<number, number>>;
};

type ActualSummary = {
  total: number;
  dates: string[];
  entries: number;
};

type ForecastRow = {
  key: string;
  clientKey: string;
  clientName: string;
  weekId: string;
  weekLabel: string;
  predictedStart: string;
  predictedEnd: string;
  predictedBestDate: string;
  estimate: number;
  monthlyEventValues: number[];
  activeMonths: number;
  confidence: Confidence;
  trend: Trend;
  actual?: ActualSummary;
  actualOnly: boolean;
};

type ForecastAnalysis = {
  months: HistoryMonth[];
  periodLabel: string;
  clients: ClientHistory[];
  validReceiptCount: number;
  ignoredReceiptCount: number;
};

const EMPTY_STATE: ImportState = { invoices: [], receipts: [] };
const HISTORY_MONTHS = 3;
const MONTH_FORMATTER = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
const SHORT_MONTH_FORMATTER = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" });
const CONFIDENCE_ORDER: Record<Confidence, number> = { Alta: 0, Média: 1, Baixa: 2, Insuficiente: 3 };

function parseIsoDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoDate(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1, 12, 0, 0, 0);
}

function dateInMonth(month: Date, day: number) {
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return new Date(month.getFullYear(), month.getMonth(), Math.min(Math.max(1, day), lastDay), 12, 0, 0, 0);
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function normalizeKey(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
}

function isDemoReceipt(receipt: Receipt) {
  return receipt.id.startsWith("demo-receipt-") || receipt.sourceSheet === "DEMONSTRAÇÃO";
}

function sourceReceipts(receipts: Receipt[]) {
  const real = receipts.filter((receipt) => !isDemoReceipt(receipt));
  return real.length ? real : receipts;
}

function buildWeeks(month: Date): ForecastWeek[] {
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0, 12, 0, 0, 0);
  const groups = new Map<string, Date[]>();

  for (let day = 1; day <= monthEnd.getDate(); day += 1) {
    const date = new Date(month.getFullYear(), month.getMonth(), day, 12, 0, 0, 0);
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    const monday = new Date(date);
    monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    const id = toIsoDate(monday);
    const dates = groups.get(id) ?? [];
    dates.push(date);
    groups.set(id, dates);
  }

  return [...groups.entries()].map(([id, dates], index) => ({
    id,
    label: `Semana ${index + 1} · ${formatDate(toIsoDate(dates[0]))} a ${formatDate(toIsoDate(dates[dates.length - 1]))}`,
    start: dates[0],
    end: dates[dates.length - 1],
    startDay: dates[0].getDate(),
    endDay: dates[dates.length - 1].getDate(),
  }));
}

function confidenceFor(activeMonths: number, representativeDays: number[]): Confidence {
  if (activeMonths < 2) return "Insuficiente";
  const spread = representativeDays.length ? Math.max(...representativeDays) - Math.min(...representativeDays) : 99;
  if (activeMonths === 3 && spread <= 3) return "Alta";
  if (activeMonths >= 2 && spread <= 5) return "Média";
  return "Baixa";
}

function trendFor(values: number[]): Trend {
  const active = values.filter((value) => value > 0);
  if (active.length < 2) return "Sem base";
  const first = active[0];
  const last = active[active.length - 1];
  if (!first) return "Sem base";
  const variation = (last - first) / Math.abs(first);
  if (variation > 0.1) return "Em alta";
  if (variation < -0.1) return "Em queda";
  return "Estável";
}

function representativeDay(daily: Map<number, number>, startDay: number, endDay: number) {
  const entries = [...daily.entries()]
    .filter(([day, amount]) => day >= startDay && day <= endDay && amount > 0)
    .sort((left, right) => left[0] - right[0]);
  if (!entries.length) return 0;
  const total = entries.reduce((sum, entry) => sum + entry[1], 0);
  let accumulated = 0;
  for (const [day, amount] of entries) {
    accumulated += amount;
    if (accumulated >= total / 2) return day;
  }
  return entries[entries.length - 1][0];
}

function eventValueForRange(daily: Map<number, number>, startDay: number, endDay: number) {
  const eventTotals = [...daily.entries()]
    .filter(([day, amount]) => day >= startDay && day <= endDay && amount > 0)
    .map(([, amount]) => amount);
  return median(eventTotals);
}

function buildHistory(receipts: Receipt[], now = new Date()): ForecastAnalysis {
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0, 0);
  const historyStart = addMonths(currentMonth, -HISTORY_MONTHS);
  const months = Array.from({ length: HISTORY_MONTHS }, (_, index) => {
    const start = addMonths(historyStart, index);
    return {
      key: monthKey(start),
      label: MONTH_FORMATTER.format(start),
      shortLabel: SHORT_MONTH_FORMATTER.format(start).replace(" de ", "/"),
      start,
    };
  });
  const monthIndex = new Map(months.map((month, index) => [month.key, index]));
  const byClient = new Map<string, ClientHistory>();
  let validReceiptCount = 0;
  let ignoredReceiptCount = 0;

  sourceReceipts(receipts).forEach((receipt) => {
    const date = parseIsoDate(receipt.receiptDate);
    const clientName = canonicalReceiptClientName(receipt.clientHint || receipt.description);
    const index = date ? monthIndex.get(monthKey(date)) : undefined;
    if (!date || index === undefined || !clientName || !Number.isFinite(receipt.amount) || receipt.amount <= 0) {
      ignoredReceiptCount += 1;
      return;
    }

    validReceiptCount += 1;
    const key = normalizeKey(clientName);
    const client = byClient.get(key) ?? {
      key,
      clientName,
      monthlyTotals: Array(HISTORY_MONTHS).fill(0) as number[],
      monthlyCounts: Array(HISTORY_MONTHS).fill(0) as number[],
      dailyTotals: Array.from({ length: HISTORY_MONTHS }, () => new Map<number, number>()),
    };
    client.monthlyTotals[index] += receipt.amount;
    client.monthlyCounts[index] += 1;
    const day = date.getDate();
    client.dailyTotals[index].set(day, (client.dailyTotals[index].get(day) ?? 0) + receipt.amount);
    byClient.set(key, client);
  });

  return {
    months,
    periodLabel: `${MONTH_FORMATTER.format(months[0].start)} a ${MONTH_FORMATTER.format(months[months.length - 1].start)}`,
    clients: [...byClient.values()].sort((left, right) => left.clientName.localeCompare(right.clientName, "pt-BR")),
    validReceiptCount,
    ignoredReceiptCount,
  };
}

function buildActuals(receipts: Receipt[], selectedMonth: Date, weeks: ForecastWeek[]) {
  const result = new Map<string, ActualSummary>();
  sourceReceipts(receipts).forEach((receipt) => {
    const date = parseIsoDate(receipt.receiptDate);
    const clientName = canonicalReceiptClientName(receipt.clientHint || receipt.description);
    if (!date || monthKey(date) !== monthKey(selectedMonth) || !clientName || !Number.isFinite(receipt.amount) || receipt.amount <= 0) return;
    const week = weeks.find((item) => date.getDate() >= item.startDay && date.getDate() <= item.endDay);
    if (!week) return;
    const key = `${normalizeKey(clientName)}|${week.id}`;
    const current = result.get(key) ?? { total: 0, dates: [], entries: 0 };
    current.total += receipt.amount;
    current.entries += 1;
    if (!current.dates.includes(receipt.receiptDate)) current.dates.push(receipt.receiptDate);
    current.dates.sort();
    result.set(key, current);
  });
  return result;
}

function buildRows(analysis: ForecastAnalysis, receipts: Receipt[], selectedMonth: Date, weeks: ForecastWeek[]) {
  const actuals = buildActuals(receipts, selectedMonth, weeks);
  const rows: ForecastRow[] = [];

  analysis.clients.forEach((client) => {
    weeks.forEach((week) => {
      const monthlyEventValues = client.dailyTotals.map((daily) => eventValueForRange(daily, week.startDay, week.endDay));
      const representativeDays = client.dailyTotals
        .map((daily) => representativeDay(daily, week.startDay, week.endDay))
        .filter((day) => day > 0);
      const activeMonths = monthlyEventValues.filter((value) => value > 0).length;
      const actualKey = `${client.key}|${week.id}`;
      const actual = actuals.get(actualKey);
      if (!activeMonths && !actual) return;

      const bestDay = representativeDays.length
        ? Math.min(week.endDay, Math.max(week.startDay, Math.round(median(representativeDays))))
        : actual?.dates[0] ? parseIsoDate(actual.dates[0])?.getDate() ?? week.startDay : week.startDay;
      const estimate = median(monthlyEventValues.filter((value) => value > 0));
      rows.push({
        key: actualKey,
        clientKey: client.key,
        clientName: client.clientName,
        weekId: week.id,
        weekLabel: week.label,
        predictedStart: toIsoDate(week.start),
        predictedEnd: toIsoDate(week.end),
        predictedBestDate: toIsoDate(dateInMonth(selectedMonth, bestDay)),
        estimate,
        monthlyEventValues,
        activeMonths,
        confidence: confidenceFor(activeMonths, representativeDays),
        trend: trendFor(monthlyEventValues),
        actual,
        actualOnly: activeMonths === 0,
      });
      actuals.delete(actualKey);
    });
  });

  actuals.forEach((actual, key) => {
    const [clientKey, weekId] = key.split("|");
    const week = weeks.find((item) => item.id === weekId);
    if (!week) return;
    const receipt = sourceReceipts(receipts).find((item) => {
      const date = parseIsoDate(item.receiptDate);
      const name = canonicalReceiptClientName(item.clientHint || item.description);
      return date && monthKey(date) === monthKey(selectedMonth) && normalizeKey(name) === clientKey;
    });
    const clientName = receipt ? canonicalReceiptClientName(receipt.clientHint || receipt.description) : clientKey;
    rows.push({
      key,
      clientKey,
      clientName,
      weekId,
      weekLabel: week.label,
      predictedStart: toIsoDate(week.start),
      predictedEnd: toIsoDate(week.end),
      predictedBestDate: actual.dates[0] ?? toIsoDate(week.start),
      estimate: 0,
      monthlyEventValues: Array(HISTORY_MONTHS).fill(0) as number[],
      activeMonths: 0,
      confidence: "Insuficiente",
      trend: "Sem base",
      actual,
      actualOnly: true,
    });
  });

  return rows.sort((left, right) =>
    left.predictedBestDate.localeCompare(right.predictedBestDate)
    || CONFIDENCE_ORDER[left.confidence] - CONFIDENCE_ORDER[right.confidence]
    || right.estimate - left.estimate
    || left.clientName.localeCompare(right.clientName, "pt-BR"),
  );
}

function confidenceClass(confidence: Confidence) {
  return confidence.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function trendIcon(trend: Trend) {
  if (trend === "Em alta") return <TrendingUp size={14} />;
  if (trend === "Em queda") return <TrendingDown size={14} />;
  return null;
}

function actualDescription(actual: ActualSummary) {
  const dates = actual.dates.length === 1
    ? formatDate(actual.dates[0])
    : `${formatDate(actual.dates[0])} a ${formatDate(actual.dates[actual.dates.length - 1])}`;
  return `${currency.format(actual.total)} · ${dates}`;
}

function ForecastView({ data }: { data: ImportState }) {
  const analysis = useMemo(() => buildHistory(data.receipts), [data.receipts]);
  const monthOptions = useMemo(() => {
    const now = new Date();
    const current = new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0, 0);
    return Array.from({ length: 12 }, (_, index) => addMonths(current, index));
  }, []);
  const [selectedMonthKey, setSelectedMonthKey] = useState(() => monthKey(monthOptions[0]));
  const [selectedWeek, setSelectedWeek] = useState("all");
  const [selectedClient, setSelectedClient] = useState("all");
  const [selectedConfidence, setSelectedConfidence] = useState<Confidence | "Todas">("Todas");
  const [selectedDetailKey, setSelectedDetailKey] = useState<string | null>(null);

  const selectedMonth = monthOptions.find((month) => monthKey(month) === selectedMonthKey) ?? monthOptions[0];
  const weeks = useMemo(() => buildWeeks(selectedMonth), [selectedMonthKey]);
  const rows = useMemo(() => buildRows(analysis, data.receipts, selectedMonth, weeks), [analysis, data.receipts, selectedMonthKey, weeks]);

  const availableClients = useMemo(() => {
    const map = new Map<string, string>();
    rows
      .filter((row) => selectedWeek === "all" || row.weekId === selectedWeek)
      .filter((row) => selectedConfidence === "Todas" || row.confidence === selectedConfidence)
      .forEach((row) => map.set(row.clientKey, row.clientName));
    return [...map.entries()].map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [rows, selectedWeek, selectedConfidence]);

  useEffect(() => {
    if (selectedClient !== "all" && !availableClients.some((client) => client.key === selectedClient)) setSelectedClient("all");
  }, [availableClients, selectedClient]);

  const scopeRows = useMemo(() => rows.filter((row) =>
    (selectedClient === "all" || row.clientKey === selectedClient)
    && (selectedConfidence === "Todas" || row.confidence === selectedConfidence),
  ), [rows, selectedClient, selectedConfidence]);
  const filteredRows = useMemo(() => scopeRows.filter((row) => selectedWeek === "all" || row.weekId === selectedWeek), [scopeRows, selectedWeek]);

  const weeklySummary = useMemo(() => weeks.map((week) => {
    const weekRows = scopeRows.filter((row) => row.weekId === week.id);
    const valid = weekRows.filter((row) => row.confidence !== "Insuficiente" || row.actual);
    return {
      ...week,
      forecast: valid.filter((row) => !row.actual).reduce((sum, row) => sum + row.estimate, 0),
      received: valid.reduce((sum, row) => sum + (row.actual?.total ?? 0), 0),
      clients: new Set(valid.map((row) => row.clientKey)).size,
      names: [...new Set(valid.map((row) => row.clientName))].slice(0, 4),
    };
  }), [scopeRows, weeks]);

  const selectedRows = selectedWeek === "all" ? scopeRows : scopeRows.filter((row) => row.weekId === selectedWeek);
  const remainingForecast = scopeRows.filter((row) => !row.actual && row.confidence !== "Insuficiente").reduce((sum, row) => sum + row.estimate, 0);
  const receivedTotal = scopeRows.reduce((sum, row) => sum + (row.actual?.total ?? 0), 0);
  const selectedForecast = selectedRows.filter((row) => !row.actual && row.confidence !== "Insuficiente").reduce((sum, row) => sum + row.estimate, 0);
  const highConfidence = scopeRows.filter((row) => !row.actual && row.confidence === "Alta").reduce((sum, row) => sum + row.estimate, 0);

  const selectedClientKeys = useMemo(() => new Set(scopeRows.map((row) => row.clientKey)), [scopeRows]);
  const monthlyHistory = useMemo(() => analysis.months.map((month, index) => ({
    month: month.shortLabel,
    amount: analysis.clients.filter((client) => selectedClientKeys.has(client.key)).reduce((sum, client) => sum + client.monthlyTotals[index], 0),
  })), [analysis.clients, analysis.months, selectedClientKeys]);

  const selectedDetail = rows.find((row) => row.key === selectedDetailKey) ?? null;

  if (!data.receipts.length) {
    return <section className="receipt-forecast-page-v6"><div className="forecast-empty-v6"><CalendarClock size={42} /><span>PREVISÃO DE RECEBIMENTOS</span><h2>Importe a mesma planilha usada em Recebimentos.</h2><p>A previsão será calculada automaticamente, sem segundo upload.</p></div></section>;
  }

  return (
    <section className="receipt-forecast-page-v6">
      <div className="forecast-heading-v6">
        <div><span>PREVISÃO POR RECEBIMENTO</span><h2>Previsão de Recebimentos</h2><p>Calculada com os três meses completos de {analysis.periodLabel}. O valor previsto usa a mediana dos recebimentos ocorridos na mesma faixa de dias, e não o total mensal do cliente.</p></div>
        <div className="forecast-method-v6"><CalendarClock size={20} /><div><strong>Mesma base de Recebimentos</strong><span>Sem duplicar planilhas</span></div></div>
      </div>

      <section className="forecast-filter-v6">
        <div className="forecast-filter-title-v6"><span>Filtros da previsão</span><small>Atualizam cards, tabela e gráfico</small></div>
        <label><span>Cliente</span><div><select value={selectedClient} onChange={(event: ChangeEvent<HTMLSelectElement>) => setSelectedClient(event.target.value)}><option value="all">{selectedWeek === "all" ? "Todos os clientes" : `Todos da semana (${availableClients.length})`}</option>{availableClients.map((client) => <option key={client.key} value={client.key}>{client.name}</option>)}</select><ChevronDown size={15} /></div></label>
        <label><span>Mês previsto</span><div><select value={selectedMonthKey} onChange={(event: ChangeEvent<HTMLSelectElement>) => { setSelectedMonthKey(event.target.value); setSelectedWeek("all"); }} >{monthOptions.map((month) => <option key={monthKey(month)} value={monthKey(month)}>{MONTH_FORMATTER.format(month)}</option>)}</select><ChevronDown size={15} /></div></label>
        <label><span>Janela provável</span><div><select value={selectedWeek} onChange={(event: ChangeEvent<HTMLSelectElement>) => setSelectedWeek(event.target.value)}><option value="all">Todas as semanas</option>{weeks.map((week) => <option key={week.id} value={week.id}>{week.label}</option>)}</select><ChevronDown size={15} /></div></label>
        <label><span>Confiança</span><div><select value={selectedConfidence} onChange={(event: ChangeEvent<HTMLSelectElement>) => { setSelectedConfidence(event.target.value as Confidence | "Todas"); setSelectedClient("all"); }}><option value="Todas">Todas</option><option value="Alta">Alta</option><option value="Média">Média</option><option value="Baixa">Baixa</option><option value="Insuficiente">Insuficiente</option></select><ChevronDown size={15} /></div></label>
        {(selectedClient !== "all" || selectedWeek !== "all" || selectedConfidence !== "Todas") ? <button type="button" onClick={() => { setSelectedClient("all"); setSelectedWeek("all"); setSelectedConfidence("Todas"); }}>Limpar</button> : null}
      </section>

      <section className="forecast-kpis-v6">
        <article><span>Previsão restante do mês</span><strong>{currency.format(remainingForecast)}</strong><small>{MONTH_FORMATTER.format(selectedMonth)}</small></article>
        <article><span>Recebido no mês</span><strong>{currency.format(receivedTotal)}</strong><small>Somente datas já lançadas</small></article>
        <article><span>Janela selecionada</span><strong>{currency.format(selectedForecast)}</strong><small>{selectedWeek === "all" ? "Todas as semanas" : weeks.find((week) => week.id === selectedWeek)?.label}</small></article>
        <article><span>Alta confiança</span><strong>{currency.format(highConfidence)}</strong><small>Recorrência nos 3 meses</small></article>
      </section>

      <section className="forecast-main-v6">
        <article className="forecast-panel-v6"><div className="forecast-panel-head-v6"><div><h3>Comparativo dos últimos três meses</h3><p>Totais realmente recebidos por mês</p></div></div><div className="forecast-chart-v6"><ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyHistory} margin={{ top: 12, right: 8, left: 4, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#e8ebf2" vertical={false} /><XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "#788198", fontSize: 12 }} /><YAxis tickFormatter={(value: number | string) => compactCurrency.format(Number(value))} tickLine={false} axisLine={false} tick={{ fill: "#9aa2b3", fontSize: 11 }} width={72} /><Tooltip formatter={(value: number | string) => currency.format(Number(value))} /><Bar dataKey="amount" name="Recebido" fill="#5d72f6" radius={[6, 6, 0, 0]} maxBarSize={56} /></BarChart></ResponsiveContainer></div></article>
        <article className="forecast-panel-v6"><div className="forecast-panel-head-v6"><div><h3>Previsão e recebidos por semana</h3><p>{MONTH_FORMATTER.format(selectedMonth)}</p></div></div><div className="forecast-weeks-v6">{weeklySummary.map((week) => <button key={week.id} type="button" className={selectedWeek === week.id ? "active" : ""} onClick={() => setSelectedWeek((current) => current === week.id ? "all" : week.id)}><span>{week.label}</span><strong>{currency.format(week.forecast)}</strong><small>{integer.format(week.clients)} clientes na semana</small><em>{week.received > 0 ? `Recebido: ${currency.format(week.received)}` : "Nenhum recebimento lançado"}</em><i>{week.names.length ? week.names.join(" · ") : "Sem previsão nesta semana"}</i></button>)}</div></article>
      </section>

      <article className="forecast-panel-v6">
        <div className="forecast-panel-head-v6"><div><h3>Previsão por cliente</h3><p>{integer.format(filteredRows.length)} previsões após os filtros</p></div></div>
        <div className="forecast-table-v6"><table><thead><tr><th>Cliente</th><th>Janela provável</th><th>Melhor data</th><th className="number">Valor previsto</th><th>Situação na semana</th><th>Presença</th><th>Tendência</th><th>Confiança</th></tr></thead><tbody>{filteredRows.map((row) => <tr key={row.key} onClick={() => setSelectedDetailKey((current) => current === row.key ? null : row.key)}><td className="client"><strong>{row.clientName}</strong><span>{row.actualOnly ? "Recebimento sem padrão histórico nessa semana" : "Estimativa por evento recebido"}</span></td><td><strong>{formatDate(row.predictedStart)} a {formatDate(row.predictedEnd)}</strong></td><td>{formatDate(row.predictedBestDate)}</td><td className="number"><strong>{row.estimate ? currency.format(row.estimate) : "—"}</strong></td><td>{row.actual ? <span className="status received"><CheckCircle2 size={13} />Recebido nesta semana<small>{actualDescription(row.actual)}</small></span> : <span className="status forecast">Previsto<small>Sem recebimento lançado nesta semana</small></span>}</td><td>{row.activeMonths}/3 meses</td><td><span className={`trend ${row.trend.toLowerCase().replace(" ", "-")}`}>{trendIcon(row.trend)}{row.trend}</span></td><td><span className={`confidence ${confidenceClass(row.confidence)}`}>{row.confidence}</span></td></tr>)}{!filteredRows.length ? <tr><td colSpan={8} className="empty-row">Nenhuma previsão encontrada nos filtros selecionados.</td></tr> : null}</tbody></table></div>
      </article>

      {selectedDetail ? <article className="forecast-panel-v6 forecast-detail-v6"><div className="forecast-panel-head-v6"><div><h3>{selectedDetail.clientName}</h3><p>Base usada para a faixa de {formatDate(selectedDetail.predictedStart)} a {formatDate(selectedDetail.predictedEnd)}.</p></div><button type="button" onClick={() => setSelectedDetailKey(null)}>Fechar detalhe</button></div><div className="forecast-basis-v6"><div className="basis-months">{analysis.months.map((month, index) => <span key={month.key}><small>{month.label}</small><b>{selectedDetail.monthlyEventValues[index] ? currency.format(selectedDetail.monthlyEventValues[index]) : "Sem recebimento"}</b></span>)}</div><div className="basis-result"><span>Mediana dos recebimentos na mesma semana</span><strong>{selectedDetail.estimate ? currency.format(selectedDetail.estimate) : "Histórico insuficiente"}</strong></div></div></article> : null}

      <div className="forecast-note-v6"><CircleAlert size={17} /><span>O valor previsto representa um recebimento típico dentro daquela semana. Recebimentos realizados aparecem somente na semana da data efetiva. {analysis.ignoredReceiptCount ? `${integer.format(analysis.ignoredReceiptCount)} registros ficaram fora do histórico por período ou dados inválidos.` : ""}</span></div>
    </section>
  );
}

export default function ReceiptForecastEnhancerV6() {
  const [data, setData] = useState<ImportState>(EMPTY_STATE);
  const [active, setActive] = useState(false);
  const [navTarget, setNavTarget] = useState<HTMLElement | null>(null);
  const [contentTarget, setContentTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let mounted = true;
    const handleData = (event: Event) => { const detail = (event as CustomEvent<ImportState>).detail; if (detail) setData(detail); };
    const handleCleared = () => setData(EMPTY_STATE);
    void loadAnalysisState().then((stored) => { if (mounted && stored) setData(stored); });
    window.addEventListener(ANALYSIS_DATA_EVENT, handleData);
    window.addEventListener(OFFLINE_DATA_CLEARED_EVENT, handleCleared);
    return () => { mounted = false; window.removeEventListener(ANALYSIS_DATA_EVENT, handleData); window.removeEventListener(OFFLINE_DATA_CLEARED_EVENT, handleCleared); };
  }, []);

  useEffect(() => {
    const syncTargets = () => {
      const nav = document.querySelector<HTMLElement>("aside.sidebar nav");
      if (nav) {
        let mount = document.getElementById("receipt-forecast-nav-v6");
        if (!mount) {
          mount = document.createElement("span");
          mount.id = "receipt-forecast-nav-v6";
          mount.style.display = "contents";
          const receiptButton = [...nav.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === "Recebimentos");
          if (receiptButton) receiptButton.after(mount); else nav.append(mount);
        }
        setNavTarget(mount);
      }
      setContentTarget(document.querySelector<HTMLElement>(".content-area"));
    };
    syncTargets();
    const observer = new MutationObserver(syncTargets);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); document.getElementById("receipt-forecast-nav-v6")?.remove(); };
  }, []);

  useEffect(() => {
    const handleNavigation = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button") : null;
      if (!target || target.dataset.forecastNavV6 === "true") return;
      if (target.closest("aside.sidebar nav") || target.textContent?.includes("Atualizar bases")) setActive(false);
    };
    document.addEventListener("click", handleNavigation, true);
    return () => document.removeEventListener("click", handleNavigation, true);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("receipt-forecast-active-v6", active);
    if (active) {
      const title = document.querySelector<HTMLElement>(".topbar-title h1");
      if (title) title.textContent = "Previsão de Recebimentos";
    }
    return () => document.body.classList.remove("receipt-forecast-active-v6");
  }, [active]);

  return <>{navTarget ? createPortal(<button type="button" data-forecast-nav-v6="true" className={active ? "active" : ""} onClick={() => { setActive(true); document.querySelector<HTMLButtonElement>(".mobile-close")?.click(); }}><CalendarClock size={19} />Previsão</button>, navTarget) : null}{active && contentTarget ? createPortal(<ForecastView data={data} />, contentTarget) : null}<style jsx global>{`
    .receipt-forecast-active-v6 .content-area > :not(.receipt-forecast-page-v6){display:none!important}.receipt-forecast-page-v6{display:grid;gap:20px;animation:v6fade .18s ease-out}@keyframes v6fade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
    .forecast-heading-v6{display:flex;justify-content:space-between;gap:22px;align-items:flex-start}.forecast-heading-v6>div:first-child>span{display:block;color:#5d72f6;font-size:11px;font-weight:800;letter-spacing:.1em;margin-bottom:6px}.forecast-heading-v6 h2{margin:0;color:#20263a;font-size:clamp(24px,2.2vw,34px)}.forecast-heading-v6 p{max-width:820px;margin:7px 0 0;color:#788198;line-height:1.55}.forecast-method-v6{display:flex;min-width:280px;gap:10px;align-items:center;padding:14px 16px;border:1px solid #dfe4f1;border-radius:14px;background:#fff;color:#5d72f6}.forecast-method-v6 div{display:grid}.forecast-method-v6 strong{color:#27304b;font-size:13px}.forecast-method-v6 span{color:#8a92a5;font-size:11px}
    .forecast-filter-v6{display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap;padding:14px;border:1px solid #e3e7f0;border-radius:15px;background:#fff}.forecast-filter-title-v6{display:grid;min-width:180px;margin-right:auto}.forecast-filter-title-v6 span{font-size:12px;font-weight:800;color:#35405a}.forecast-filter-title-v6 small{font-size:10px;color:#929aac}.forecast-filter-v6 label{display:grid;gap:5px}.forecast-filter-v6 label>span{font-size:9px;font-weight:800;color:#8b94a8;text-transform:uppercase}.forecast-filter-v6 label>div{display:flex;height:38px;align-items:center;gap:7px;padding:0 10px;border:1px solid #dfe4ee;border-radius:9px}.forecast-filter-v6 select{min-width:155px;border:0;outline:0;background:transparent;color:#374158;font-size:11px;appearance:none}.forecast-filter-v6 button,.forecast-detail-v6 button{height:38px;padding:0 12px;border:1px solid #dfe4ee;border-radius:9px;background:#fff;color:#626c83;font-size:11px;font-weight:700;cursor:pointer}
    .forecast-kpis-v6{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px}.forecast-kpis-v6 article{display:grid;min-height:122px;align-content:space-between;padding:17px;border:1px solid #e4e8f1;border-radius:15px;background:#fff;box-shadow:0 8px 25px rgba(39,51,89,.05)}.forecast-kpis-v6 span{font-size:11px;font-weight:700;color:#747d92}.forecast-kpis-v6 strong{font-size:clamp(19px,2vw,27px);color:#22293d}.forecast-kpis-v6 small{font-size:10px;color:#9aa1b1}
    .forecast-main-v6{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(350px,.9fr);gap:15px}.forecast-panel-v6{overflow:hidden;border:1px solid #e4e8f1;border-radius:15px;background:#fff;box-shadow:0 8px 25px rgba(39,51,89,.045)}.forecast-panel-head-v6{display:flex;justify-content:space-between;gap:14px;align-items:center;padding:17px 19px 13px}.forecast-panel-head-v6 h3{margin:0;color:#2b344b;font-size:14px}.forecast-panel-head-v6 p{margin:4px 0 0;color:#8d95a8;font-size:10px}.forecast-chart-v6{height:285px;padding:0 12px 13px}.forecast-weeks-v6{display:grid;gap:8px;padding:0 14px 14px}.forecast-weeks-v6 button{display:grid;gap:3px;padding:11px 12px;border:1px solid #e4e8f1;border-radius:10px;background:#fff;text-align:left;cursor:pointer}.forecast-weeks-v6 button.active{border-color:#7c8df4;background:#f5f6ff}.forecast-weeks-v6 span{font-size:10px;font-weight:700;color:#606a81}.forecast-weeks-v6 strong{font-size:15px;color:#27304b}.forecast-weeks-v6 small{font-size:9px;color:#8992a6}.forecast-weeks-v6 em{font-size:9px;font-style:normal;font-weight:700;color:#16866f}.forecast-weeks-v6 i{overflow:hidden;color:#929aac;font-size:8px;font-style:normal;text-overflow:ellipsis;white-space:nowrap}
    .forecast-table-v6{overflow-x:auto;border-top:1px solid #edf0f5}.forecast-table-v6 table{width:100%;min-width:1120px;border-collapse:collapse}.forecast-table-v6 th,.forecast-table-v6 td{padding:12px 14px;border-bottom:1px solid #edf0f5;text-align:left;font-size:11px}.forecast-table-v6 th{background:#fafbfe;color:#7e879b;font-size:9px;letter-spacing:.04em;text-transform:uppercase}.forecast-table-v6 th.number,.forecast-table-v6 td.number{text-align:right}.forecast-table-v6 tbody tr{cursor:pointer}.forecast-table-v6 tbody tr:hover{background:#f7f8ff}.forecast-table-v6 td.client{display:grid;min-width:250px;gap:3px}.forecast-table-v6 td.client strong{color:#283148}.forecast-table-v6 td.client span{font-size:9px;color:#9aa2b3}.status{display:inline-grid;gap:3px;padding:6px 8px;border-radius:9px;font-size:9px;font-weight:800}.status small{font-size:8px;font-weight:500}.status.received{background:#e9f8f3;color:#16866f}.status.forecast{background:#eef0ff;color:#5367df}.confidence,.trend{display:inline-flex;align-items:center;gap:4px;padding:5px 8px;border-radius:999px;font-size:9px;font-weight:800;white-space:nowrap}.confidence.alta{background:#e8f8f3;color:#16866f}.confidence.media{background:#eef0ff;color:#5367df}.confidence.baixa{background:#fff4dd;color:#9b6c08}.confidence.insuficiente{background:#f1f2f5;color:#7c8392}.trend{padding-left:0;background:transparent;color:#6e778d}.trend.em-alta{color:#16866f}.trend.em-queda{color:#c55767}.empty-row{padding:28px!important;text-align:center!important;color:#8d95a8!important}
    .forecast-detail-v6{padding-bottom:17px}.forecast-basis-v6{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:14px;padding:0 19px}.basis-months{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.basis-months span,.basis-result{display:grid;gap:5px;padding:12px;border:1px solid #e7eaf2;border-radius:10px;background:#fbfcff}.basis-months small,.basis-result span{font-size:9px;color:#8992a6}.basis-months b{font-size:12px;color:#343d54}.basis-result{align-content:center;background:#f5f6ff}.basis-result strong{font-size:17px;color:#4254c7}.forecast-note-v6{display:flex;gap:9px;align-items:flex-start;padding:13px 15px;border:1px solid #f0dcae;border-radius:11px;background:#fffaf0;color:#805f18}.forecast-note-v6 span{font-size:11px;line-height:1.5}.forecast-empty-v6{display:grid;min-height:440px;place-items:center;align-content:center;gap:9px;padding:35px;border:1px dashed #cfd6e6;border-radius:17px;background:#fff;color:#5d72f6;text-align:center}.forecast-empty-v6 span{font-size:10px;font-weight:800;letter-spacing:.12em}.forecast-empty-v6 h2{margin:0;color:#27304b}.forecast-empty-v6 p{margin:0;color:#7f889d}
    @media(max-width:1100px){.forecast-kpis-v6{grid-template-columns:repeat(2,minmax(0,1fr))}.forecast-main-v6{grid-template-columns:1fr}}@media(max-width:760px){.forecast-heading-v6{display:grid}.forecast-method-v6{min-width:0}.forecast-kpis-v6{grid-template-columns:1fr}.forecast-filter-title-v6{width:100%}.forecast-filter-v6 label{flex:1 1 100%}.forecast-filter-v6 label>div,.forecast-filter-v6 select{width:100%}.forecast-basis-v6{grid-template-columns:1fr}.basis-months{grid-template-columns:1fr}.forecast-chart-v6{height:250px}}
  `}</style></>;
}
