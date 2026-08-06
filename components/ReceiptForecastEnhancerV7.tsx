"use client";

import { CalendarClock, CheckCircle2, ChevronDown, CircleAlert } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { compactCurrency, currency, formatDate, integer } from "@/lib/format";
import { ANALYSIS_DATA_EVENT, loadAnalysisState, OFFLINE_DATA_CLEARED_EVENT } from "@/lib/offlineStorage";
import { canonicalReceiptClientName } from "@/lib/receiptClientNames";
import type { ImportState, Receipt } from "@/lib/types";

type Confidence = "Alta" | "Média" | "Baixa" | "Insuficiente";

type ForecastWeek = {
  id: string;
  index: number;
  label: string;
  start: Date;
  end: Date;
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
  weekTotals: number[][];
  weekDays: number[][];
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
  weekStart: string;
  weekEnd: string;
  estimatedDate: string;
  estimate: number;
  historicalValues: number[];
  activeMonths: number;
  confidence: Confidence;
  actual?: ActualSummary;
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

function addDays(date: Date, amount: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1, 12, 0, 0, 0);
}

function firstMondayOfMonth(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12, 0, 0, 0);
  const distance = (8 - first.getDay()) % 7;
  return addDays(first, distance);
}

function buildWeeks(month: Date): ForecastWeek[] {
  const weeks: ForecastWeek[] = [];
  let monday = firstMondayOfMonth(month);
  let index = 0;

  while (monday.getMonth() === month.getMonth() && monday.getFullYear() === month.getFullYear()) {
    const friday = addDays(monday, 4);
    weeks.push({
      id: toIsoDate(monday),
      index,
      label: `Semana ${index + 1} · ${formatDate(toIsoDate(monday))} a ${formatDate(toIsoDate(friday))}`,
      start: monday,
      end: friday,
    });
    monday = addDays(monday, 7);
    index += 1;
  }

  return weeks;
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

function isBetween(date: Date, start: Date, end: Date) {
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

function weekIndexForDate(date: Date, baseMonth: Date) {
  return buildWeeks(baseMonth).find((week) => isBetween(date, week.start, week.end))?.index ?? -1;
}

function confidenceFor(activeMonths: number, weekdays: number[]): Confidence {
  if (activeMonths < 2) return "Insuficiente";
  const spread = weekdays.length ? Math.max(...weekdays) - Math.min(...weekdays) : 99;
  if (activeMonths === 3 && spread <= 2) return "Alta";
  if (activeMonths >= 2 && spread <= 4) return "Média";
  return "Baixa";
}

function estimatedDateForWeek(week: ForecastWeek, historicalWeekdays: number[]) {
  const weekday = historicalWeekdays.length ? Math.round(median(historicalWeekdays)) : 1;
  return addDays(week.start, Math.min(5, Math.max(1, weekday)) - 1);
}

function buildHistory(receipts: Receipt[], now = new Date()) {
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0, 0);
  const historyStart = addMonths(currentMonth, -HISTORY_MONTHS);
  const months: HistoryMonth[] = Array.from({ length: HISTORY_MONTHS }, (_, index) => {
    const start = addMonths(historyStart, index);
    return {
      key: monthKey(start),
      label: MONTH_FORMATTER.format(start),
      shortLabel: SHORT_MONTH_FORMATTER.format(start).replace(" de ", "/"),
      start,
    };
  });
  const clients = new Map<string, ClientHistory>();
  let validReceiptCount = 0;
  let ignoredReceiptCount = 0;

  sourceReceipts(receipts).forEach((receipt) => {
    const date = parseIsoDate(receipt.receiptDate);
    const clientName = canonicalReceiptClientName(receipt.clientHint || receipt.description);
    const monthIndex = date ? months.findIndex((month) => buildWeeks(month.start).some((week) => isBetween(date, week.start, week.end))) : -1;

    if (!date || monthIndex < 0 || !clientName || !Number.isFinite(receipt.amount) || receipt.amount <= 0) {
      ignoredReceiptCount += 1;
      return;
    }

    const historyMonth = months[monthIndex];
    const weekIndex = weekIndexForDate(date, historyMonth.start);
    if (weekIndex < 0) {
      ignoredReceiptCount += 1;
      return;
    }

    validReceiptCount += 1;
    const key = normalizeKey(clientName);
    const client = clients.get(key) ?? {
      key,
      clientName,
      monthlyTotals: Array(HISTORY_MONTHS).fill(0) as number[],
      weekTotals: Array.from({ length: HISTORY_MONTHS }, () => Array(6).fill(0) as number[]),
      weekDays: Array.from({ length: HISTORY_MONTHS }, () => Array(6).fill(0) as number[]),
    };

    client.monthlyTotals[monthIndex] += receipt.amount;
    client.weekTotals[monthIndex][weekIndex] += receipt.amount;
    const weekday = date.getDay();
    if (!client.weekDays[monthIndex][weekIndex]) client.weekDays[monthIndex][weekIndex] = weekday;
    clients.set(key, client);
  });

  return {
    months,
    clients: [...clients.values()].sort((left, right) => left.clientName.localeCompare(right.clientName, "pt-BR")),
    periodLabel: `${MONTH_FORMATTER.format(months[0].start)} a ${MONTH_FORMATTER.format(months[months.length - 1].start)}`,
    validReceiptCount,
    ignoredReceiptCount,
  };
}

function buildActuals(receipts: Receipt[], weeks: ForecastWeek[]) {
  const actuals = new Map<string, ActualSummary>();

  sourceReceipts(receipts).forEach((receipt) => {
    const date = parseIsoDate(receipt.receiptDate);
    const clientName = canonicalReceiptClientName(receipt.clientHint || receipt.description);
    if (!date || !clientName || !Number.isFinite(receipt.amount) || receipt.amount <= 0) return;
    const week = weeks.find((item) => isBetween(date, item.start, item.end));
    if (!week) return;

    const key = `${normalizeKey(clientName)}|${week.id}`;
    const current = actuals.get(key) ?? { total: 0, dates: [], entries: 0 };
    current.total += receipt.amount;
    current.entries += 1;
    if (!current.dates.includes(receipt.receiptDate)) current.dates.push(receipt.receiptDate);
    current.dates.sort();
    actuals.set(key, current);
  });

  return actuals;
}

function buildRows(analysis: ReturnType<typeof buildHistory>, receipts: Receipt[], weeks: ForecastWeek[]) {
  const actuals = buildActuals(receipts, weeks);
  const rows: ForecastRow[] = [];

  analysis.clients.forEach((client) => {
    weeks.forEach((week) => {
      const historicalValues = client.weekTotals.map((month) => month[week.index] ?? 0);
      const historicalWeekdays = client.weekDays.map((month) => month[week.index] ?? 0).filter((day) => day > 0);
      const activeMonths = historicalValues.filter((value) => value > 0).length;
      const key = `${client.key}|${week.id}`;
      const actual = actuals.get(key);
      if (!activeMonths && !actual) return;

      rows.push({
        key,
        clientKey: client.key,
        clientName: client.clientName,
        weekId: week.id,
        weekLabel: week.label,
        weekStart: toIsoDate(week.start),
        weekEnd: toIsoDate(week.end),
        estimatedDate: toIsoDate(estimatedDateForWeek(week, historicalWeekdays)),
        estimate: median(historicalValues.filter((value) => value > 0)),
        historicalValues,
        activeMonths,
        confidence: confidenceFor(activeMonths, historicalWeekdays),
        actual,
      });
      actuals.delete(key);
    });
  });

  actuals.forEach((actual, key) => {
    const [clientKey, weekId] = key.split("|");
    const week = weeks.find((item) => item.id === weekId);
    if (!week) return;
    const matchingReceipt = sourceReceipts(receipts).find((receipt) => {
      const date = parseIsoDate(receipt.receiptDate);
      const name = canonicalReceiptClientName(receipt.clientHint || receipt.description);
      return date && isBetween(date, week.start, week.end) && normalizeKey(name) === clientKey;
    });

    rows.push({
      key,
      clientKey,
      clientName: matchingReceipt ? canonicalReceiptClientName(matchingReceipt.clientHint || matchingReceipt.description) : clientKey,
      weekId,
      weekLabel: week.label,
      weekStart: toIsoDate(week.start),
      weekEnd: toIsoDate(week.end),
      estimatedDate: actual.dates[0] ?? toIsoDate(week.start),
      estimate: 0,
      historicalValues: Array(HISTORY_MONTHS).fill(0) as number[],
      activeMonths: 0,
      confidence: "Insuficiente",
      actual,
    });
  });

  return rows.sort((left, right) =>
    left.weekStart.localeCompare(right.weekStart)
    || CONFIDENCE_ORDER[left.confidence] - CONFIDENCE_ORDER[right.confidence]
    || (right.actual?.total ?? right.estimate) - (left.actual?.total ?? left.estimate)
    || left.clientName.localeCompare(right.clientName, "pt-BR"),
  );
}

function confidenceClass(confidence: Confidence) {
  return confidence.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function actualDates(actual: ActualSummary) {
  if (actual.dates.length === 1) return formatDate(actual.dates[0]);
  return actual.dates.map(formatDate).join(", ");
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
  const weeks = useMemo(() => buildWeeks(selectedMonth), [selectedMonthKey, selectedMonth]);
  const rows = useMemo(() => buildRows(analysis, data.receipts, weeks), [analysis, data.receipts, weeks]);

  const confidenceRows = useMemo(() => rows.filter((row) => selectedConfidence === "Todas" || row.confidence === selectedConfidence), [rows, selectedConfidence]);
  const weekRows = useMemo(() => confidenceRows.filter((row) => selectedWeek === "all" || row.weekId === selectedWeek), [confidenceRows, selectedWeek]);

  const availableClients = useMemo(() => {
    const names = new Map<string, string>();
    weekRows.forEach((row) => names.set(row.clientKey, row.clientName));
    return [...names.entries()].map(([key, name]) => ({ key, name })).sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
  }, [weekRows]);

  useEffect(() => {
    if (selectedClient !== "all" && !availableClients.some((client) => client.key === selectedClient)) setSelectedClient("all");
  }, [availableClients, selectedClient]);

  const filteredRows = useMemo(() => weekRows.filter((row) => selectedClient === "all" || row.clientKey === selectedClient), [weekRows, selectedClient]);
  const pendingForecast = filteredRows.filter((row) => !row.actual && row.confidence !== "Insuficiente").reduce((sum, row) => sum + row.estimate, 0);
  const received = filteredRows.reduce((sum, row) => sum + (row.actual?.total ?? 0), 0);
  const highConfidencePending = filteredRows.filter((row) => !row.actual && row.confidence === "Alta").reduce((sum, row) => sum + row.estimate, 0);
  const uniqueClients = new Set(filteredRows.map((row) => row.clientKey)).size;

  const weeklySummary = useMemo(() => weeks.map((week) => {
    const scoped = confidenceRows
      .filter((row) => row.weekId === week.id)
      .filter((row) => selectedClient === "all" || row.clientKey === selectedClient);
    return {
      ...week,
      forecast: scoped.filter((row) => !row.actual && row.confidence !== "Insuficiente").reduce((sum, row) => sum + row.estimate, 0),
      received: scoped.reduce((sum, row) => sum + (row.actual?.total ?? 0), 0),
      clients: new Set(scoped.map((row) => row.clientKey)).size,
      names: [...new Set(scoped.map((row) => row.clientName))].slice(0, 4),
    };
  }), [confidenceRows, selectedClient, weeks]);

  const selectedClientKeys = useMemo(() => new Set(filteredRows.map((row) => row.clientKey)), [filteredRows]);
  const monthlyHistory = useMemo(() => analysis.months.map((month, index) => ({
    month: month.shortLabel,
    amount: analysis.clients.filter((client) => selectedClientKeys.has(client.key)).reduce((sum, client) => sum + client.monthlyTotals[index], 0),
  })), [analysis.clients, analysis.months, selectedClientKeys]);

  const selectedDetail = rows.find((row) => row.key === selectedDetailKey) ?? null;
  const scopeLabel = selectedWeek === "all"
    ? MONTH_FORMATTER.format(selectedMonth)
    : weeks.find((week) => week.id === selectedWeek)?.label ?? MONTH_FORMATTER.format(selectedMonth);

  if (!data.receipts.length) {
    return <section className="receipt-forecast-page-v7"><div className="forecast-empty-v7"><CalendarClock size={42} /><span>PREVISÃO DE RECEBIMENTOS</span><h2>Importe a mesma planilha usada em Recebimentos.</h2><p>A previsão será calculada automaticamente, sem segundo upload.</p></div></section>;
  }

  return (
    <section className="receipt-forecast-page-v7">
      <div className="forecast-heading-v7">
        <div><span>PREVISÃO SEMANAL</span><h2>Previsão de Recebimentos</h2><p>Histórico dos três meses completos de {analysis.periodLabel}. Recebimentos já realizados substituem a previsão e aparecem somente na semana da data efetiva.</p></div>
        <div className="forecast-method-v7"><CalendarClock size={20} /><div><strong>Sem segundo upload</strong><span>Mesma base de Recebimentos</span></div></div>
      </div>

      <section className="forecast-filter-v7">
        <div className="forecast-filter-title-v7"><span>Filtros</span><small>Todo o painel usa o mesmo escopo</small></div>
        <label><span>Cliente</span><div><select value={selectedClient} onChange={(event: ChangeEvent<HTMLSelectElement>) => setSelectedClient(event.target.value)}><option value="all">{selectedWeek === "all" ? "Todos os clientes" : `Todos da semana (${availableClients.length})`}</option>{availableClients.map((client) => <option key={client.key} value={client.key}>{client.name}</option>)}</select><ChevronDown size={15} /></div></label>
        <label><span>Mês previsto</span><div><select value={selectedMonthKey} onChange={(event: ChangeEvent<HTMLSelectElement>) => { setSelectedMonthKey(event.target.value); setSelectedWeek("all"); setSelectedClient("all"); }}>{monthOptions.map((month) => <option key={monthKey(month)} value={monthKey(month)}>{MONTH_FORMATTER.format(month)}</option>)}</select><ChevronDown size={15} /></div></label>
        <label><span>Semana</span><div><select value={selectedWeek} onChange={(event: ChangeEvent<HTMLSelectElement>) => { setSelectedWeek(event.target.value); setSelectedClient("all"); }}><option value="all">Todas as semanas</option>{weeks.map((week) => <option key={week.id} value={week.id}>{week.label}</option>)}</select><ChevronDown size={15} /></div></label>
        <label><span>Confiança</span><div><select value={selectedConfidence} onChange={(event: ChangeEvent<HTMLSelectElement>) => { setSelectedConfidence(event.target.value as Confidence | "Todas"); setSelectedClient("all"); }}><option value="Todas">Todas</option><option value="Alta">Alta</option><option value="Média">Média</option><option value="Baixa">Baixa</option><option value="Insuficiente">Insuficiente</option></select><ChevronDown size={15} /></div></label>
        {(selectedClient !== "all" || selectedWeek !== "all" || selectedConfidence !== "Todas") ? <button type="button" onClick={() => { setSelectedClient("all"); setSelectedWeek("all"); setSelectedConfidence("Todas"); }}>Limpar</button> : null}
      </section>

      <section className="forecast-kpis-v7">
        <article><span>A receber no período</span><strong>{currency.format(pendingForecast)}</strong><small>{scopeLabel}</small></article>
        <article><span>Recebido no período</span><strong>{currency.format(received)}</strong><small>Somente valores lançados nas datas da semana</small></article>
        <article><span>Alta confiança a receber</span><strong>{currency.format(highConfidencePending)}</strong><small>Somente pendentes do período filtrado</small></article>
        <article><span>Clientes no período</span><strong>{integer.format(uniqueClients)}</strong><small>Previstos e recebidos no mesmo escopo</small></article>
      </section>

      <section className="forecast-main-v7">
        <article className="forecast-panel-v7"><div className="forecast-panel-head-v7"><div><h3>Comparativo dos últimos três meses</h3><p>Recebimentos reais dos clientes filtrados</p></div></div><div className="forecast-chart-v7"><ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyHistory} margin={{ top: 12, right: 8, left: 4, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#e8ebf2" vertical={false} /><XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "#788198", fontSize: 12 }} /><YAxis tickFormatter={(value: number | string) => compactCurrency.format(Number(value))} tickLine={false} axisLine={false} tick={{ fill: "#9aa2b3", fontSize: 11 }} width={72} /><Tooltip formatter={(value: number | string) => currency.format(Number(value))} /><Bar dataKey="amount" name="Recebido" fill="#5d72f6" radius={[6, 6, 0, 0]} maxBarSize={56} /></BarChart></ResponsiveContainer></div></article>
        <article className="forecast-panel-v7"><div className="forecast-panel-head-v7"><div><h3>Semanas de {MONTH_FORMATTER.format(selectedMonth)}</h3><p>A semana final continua no mês seguinte</p></div></div><div className="forecast-weeks-v7">{weeklySummary.map((week) => <button key={week.id} type="button" className={selectedWeek === week.id ? "active" : ""} onClick={() => { setSelectedWeek((current) => current === week.id ? "all" : week.id); setSelectedClient("all"); }}><span>{week.label}</span><strong>A receber: {currency.format(week.forecast)}</strong><em>Recebido: {currency.format(week.received)}</em><small>{integer.format(week.clients)} clientes</small><i>{week.names.length ? week.names.join(" · ") : "Sem movimentação nesta semana"}</i></button>)}</div></article>
      </section>

      <article className="forecast-panel-v7">
        <div className="forecast-panel-head-v7"><div><h3>Clientes do período</h3><p>{integer.format(filteredRows.length)} registros no filtro atual</p></div></div>
        <div className="forecast-table-v7"><table><thead><tr><th>Cliente</th><th>Janela</th><th className="number">Valor da semana</th><th>Situação</th><th>Presença histórica</th><th>Confiança</th></tr></thead><tbody>{filteredRows.map((row) => <tr key={row.key} onClick={() => setSelectedDetailKey((current) => current === row.key ? null : row.key)}><td className="client"><strong>{row.clientName}</strong><span>{row.actual ? "Valor real lançado" : "Mediana da mesma semana nos últimos 3 meses"}</span></td><td><strong>{formatDate(row.weekStart)} a {formatDate(row.weekEnd)}</strong></td><td className="number"><strong>{currency.format(row.actual?.total ?? row.estimate)}</strong></td><td>{row.actual ? <span className="status received"><b><CheckCircle2 size={13} />Recebido</b><small>{actualDates(row.actual)}</small></span> : <span className="status forecast"><b>Previsto</b><small>Data provável: {formatDate(row.estimatedDate)}</small></span>}</td><td>{row.activeMonths}/3 meses</td><td><span className={`confidence ${confidenceClass(row.confidence)}`}>{row.confidence}</span></td></tr>)}{!filteredRows.length ? <tr><td colSpan={6} className="empty-row">Nenhum cliente encontrado no período selecionado.</td></tr> : null}</tbody></table></div>
      </article>

      {selectedDetail ? <article className="forecast-panel-v7 forecast-detail-v7"><div className="forecast-panel-head-v7"><div><h3>{selectedDetail.clientName}</h3><p>Valores da mesma semana usados no cálculo.</p></div><button type="button" onClick={() => setSelectedDetailKey(null)}>Fechar</button></div><div className="forecast-basis-v7"><div>{analysis.months.map((month, index) => <span key={month.key}><small>{month.label}</small><b>{selectedDetail.historicalValues[index] ? currency.format(selectedDetail.historicalValues[index]) : "Sem recebimento"}</b></span>)}</div><aside><span>{selectedDetail.actual ? "Recebido no período" : "Mediana prevista"}</span><strong>{currency.format(selectedDetail.actual?.total ?? selectedDetail.estimate)}</strong>{selectedDetail.actual ? <small>Datas: {actualDates(selectedDetail.actual)}</small> : null}</aside></div></article> : null}

      <div className="forecast-note-v7"><CircleAlert size={17} /><span>Quando existe recebimento lançado na semana, o sistema remove o valor previsto daquele cliente e apresenta apenas o valor real recebido e a respectiva data. A semana iniciada em 31/08 termina em 04/09.</span></div>
    </section>
  );
}

export default function ReceiptForecastEnhancerV7() {
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
        let mount = document.getElementById("receipt-forecast-nav-v7");
        if (!mount) {
          mount = document.createElement("span");
          mount.id = "receipt-forecast-nav-v7";
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
    return () => { observer.disconnect(); document.getElementById("receipt-forecast-nav-v7")?.remove(); };
  }, []);

  useEffect(() => {
    const handleNavigation = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button") : null;
      if (!target || target.dataset.forecastNavV7 === "true") return;
      if (target.closest("aside.sidebar nav") || target.textContent?.includes("Atualizar bases")) setActive(false);
    };
    document.addEventListener("click", handleNavigation, true);
    return () => document.removeEventListener("click", handleNavigation, true);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("receipt-forecast-active-v7", active);
    if (active) {
      const title = document.querySelector<HTMLElement>(".topbar-title h1");
      if (title) title.textContent = "Previsão de Recebimentos";
    }
    return () => document.body.classList.remove("receipt-forecast-active-v7");
  }, [active]);

  return <>{navTarget ? createPortal(<button type="button" data-forecast-nav-v7="true" className={active ? "active" : ""} onClick={() => { setActive(true); document.querySelector<HTMLButtonElement>(".mobile-close")?.click(); }}><CalendarClock size={19} />Previsão</button>, navTarget) : null}{active && contentTarget ? createPortal(<ForecastView data={data} />, contentTarget) : null}<style jsx global>{`
    .receipt-forecast-active-v7 .content-area>:not(.receipt-forecast-page-v7){display:none!important}.receipt-forecast-page-v7{display:grid;gap:20px}.forecast-heading-v7{display:flex;justify-content:space-between;gap:22px;align-items:flex-start}.forecast-heading-v7>div:first-child>span{display:block;color:#5d72f6;font-size:11px;font-weight:800;letter-spacing:.1em;margin-bottom:6px}.forecast-heading-v7 h2{margin:0;color:#20263a;font-size:clamp(24px,2.2vw,34px)}.forecast-heading-v7 p{max-width:820px;margin:7px 0 0;color:#788198;line-height:1.55}.forecast-method-v7{display:flex;min-width:250px;gap:10px;align-items:center;padding:14px 16px;border:1px solid #dfe4f1;border-radius:14px;background:#fff;color:#5d72f6}.forecast-method-v7 div{display:grid}.forecast-method-v7 strong{color:#27304b;font-size:13px}.forecast-method-v7 span{color:#8a92a5;font-size:11px}
    .forecast-filter-v7{display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap;padding:14px;border:1px solid #e3e7f0;border-radius:15px;background:#fff}.forecast-filter-title-v7{display:grid;min-width:170px;margin-right:auto}.forecast-filter-title-v7 span{font-size:12px;font-weight:800;color:#35405a}.forecast-filter-title-v7 small{font-size:10px;color:#929aac}.forecast-filter-v7 label{display:grid;gap:5px}.forecast-filter-v7 label>span{font-size:9px;font-weight:800;color:#8b94a8;text-transform:uppercase}.forecast-filter-v7 label>div{display:flex;height:38px;align-items:center;gap:7px;padding:0 10px;border:1px solid #dfe4ee;border-radius:9px}.forecast-filter-v7 select{min-width:155px;border:0;outline:0;background:transparent;color:#374158;font-size:11px}.forecast-filter-v7 button,.forecast-detail-v7 button{height:38px;padding:0 12px;border:1px solid #dfe4ee;border-radius:9px;background:#fff;color:#616b82;font-size:11px;font-weight:800;cursor:pointer}
    .forecast-kpis-v7{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.forecast-kpis-v7 article{display:grid;min-height:116px;align-content:space-between;padding:16px;border:1px solid #e4e8f1;border-radius:15px;background:#fff}.forecast-kpis-v7 span{color:#737d92;font-size:10px;font-weight:800}.forecast-kpis-v7 strong{color:#1e2842;font-size:clamp(20px,2vw,27px)}.forecast-kpis-v7 small{color:#9aa2b3;font-size:9px;line-height:1.4}
    .forecast-main-v7{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(350px,.9fr);gap:16px}.forecast-panel-v7{overflow:hidden;border:1px solid #e4e8f1;border-radius:16px;background:#fff}.forecast-panel-head-v7{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:17px 19px 13px}.forecast-panel-head-v7 h3{margin:0;color:#303a54;font-size:14px}.forecast-panel-head-v7 p{margin:4px 0 0;color:#9199aa;font-size:10px}.forecast-chart-v7{height:285px;padding:0 12px 12px}.forecast-weeks-v7{display:grid;max-height:310px;overflow:auto;border-top:1px solid #edf0f5}.forecast-weeks-v7 button{display:grid;gap:4px;padding:12px 15px;border:0;border-bottom:1px solid #edf0f5;background:#fff;text-align:left;cursor:pointer}.forecast-weeks-v7 button.active{background:#f3f5ff;box-shadow:inset 3px 0 #5d72f6}.forecast-weeks-v7 span{color:#657088;font-size:10px;font-weight:800}.forecast-weeks-v7 strong{color:#27324d;font-size:13px}.forecast-weeks-v7 em{color:#16866f;font-size:10px;font-style:normal;font-weight:800}.forecast-weeks-v7 small,.forecast-weeks-v7 i{color:#929aac;font-size:9px;font-style:normal}
    .forecast-table-v7{overflow-x:auto;border-top:1px solid #edf0f5}.forecast-table-v7 table{width:100%;min-width:920px;border-collapse:collapse}.forecast-table-v7 th,.forecast-table-v7 td{padding:12px 14px;border-bottom:1px solid #edf0f5;text-align:left;font-size:11px}.forecast-table-v7 th{background:#fafbfe;color:#7c869b;font-size:9px;text-transform:uppercase}.forecast-table-v7 th.number,.forecast-table-v7 td.number{text-align:right}.forecast-table-v7 tbody tr{cursor:pointer}.forecast-table-v7 tbody tr:hover{background:#f8f9ff}.forecast-table-v7 td.client{display:grid;min-width:250px;gap:3px}.forecast-table-v7 td.client strong{color:#2d3853}.forecast-table-v7 td.client span{color:#9aa2b3;font-size:9px}.status{display:grid;gap:2px;align-items:center}.status b{display:flex;align-items:center;gap:4px;font-size:10px}.status small{font-size:9px}.status.received b,.status.received small{color:#16866f}.status.forecast b{color:#5367df}.status.forecast small{color:#8992a7}.confidence{display:inline-flex;padding:5px 8px;border-radius:999px;font-size:9px;font-weight:800}.confidence.alta{background:#e8f8f3;color:#16866f}.confidence.media{background:#eef0ff;color:#5367df}.confidence.baixa{background:#fff4dd;color:#9b6c08}.confidence.insuficiente{background:#f1f2f5;color:#7c8392}.empty-row{padding:28px!important;text-align:center!important;color:#8d95a8!important}
    .forecast-basis-v7{display:grid;grid-template-columns:1fr 260px;gap:16px;padding:0 19px 18px}.forecast-basis-v7>div{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.forecast-basis-v7>div span,.forecast-basis-v7 aside{display:grid;gap:5px;padding:12px;border:1px solid #e6eaf2;border-radius:10px;background:#fbfcff}.forecast-basis-v7 small{color:#8f98aa;font-size:9px}.forecast-basis-v7 b,.forecast-basis-v7 strong{color:#303a54;font-size:12px}.forecast-note-v7{display:flex;gap:9px;align-items:flex-start;padding:13px 15px;border:1px solid #dfe4f1;border-radius:12px;background:#f8f9fd;color:#667087}.forecast-note-v7 span{font-size:10px;line-height:1.5}.forecast-empty-v7{display:grid;min-height:430px;place-items:center;align-content:center;gap:10px;border:1px dashed #cfd6e6;border-radius:18px;background:#fff;color:#5d72f6;text-align:center}.forecast-empty-v7 h2{margin:0;color:#27304b}.forecast-empty-v7 p{color:#7f889d}
    @media(max-width:1100px){.forecast-kpis-v7{grid-template-columns:repeat(2,1fr)}.forecast-main-v7{grid-template-columns:1fr}}@media(max-width:760px){.forecast-heading-v7{display:grid}.forecast-method-v7{min-width:0}.forecast-kpis-v7{grid-template-columns:1fr}.forecast-filter-v7 label{width:100%}.forecast-filter-v7 label>div,.forecast-filter-v7 select{width:100%}.forecast-basis-v7{grid-template-columns:1fr}.forecast-basis-v7>div{grid-template-columns:1fr}}
  `}</style></>;
}
