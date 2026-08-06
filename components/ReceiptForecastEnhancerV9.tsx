"use client";

import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  FileQuestion,
  ReceiptText,
} from "lucide-react";
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
import { loadForecastReceiptFile } from "@/lib/forecastStoredFile";
import { parseOpenReceivablesWorkbook } from "@/lib/openReceivablesParser";
import {
  ANALYSIS_DATA_EVENT,
  loadAnalysisState,
  OFFLINE_DATA_CLEARED_EVENT,
} from "@/lib/offlineStorage";
import { canonicalReceiptClientName, receiptClientKey } from "@/lib/receiptClientNames";
import type { ImportState, OpenReceivable, Receipt } from "@/lib/types";

type Confidence = "Alta" | "Média" | "Baixa";
type Origin = "Nota em aberto + histórico" | "Somente nota em aberto" | "Somente histórico" | "Recebimento realizado";
type PatternKind = "Fim do mês" | "Faixa de dias" | "Irregular";
type RowStatus = "Previsto" | "Recebido";

type ForecastWeek = {
  id: string;
  index: number;
  label: string;
  start: Date;
  end: Date;
};

type MonthSample = {
  monthKey: string;
  monthIndex: number;
  total: number;
  representativeDate: Date;
  representativeDay: number;
  endDistance: number;
  weekday: number;
  entries: number;
};

type ClientPattern = {
  key: string;
  clientName: string;
  samples: MonthSample[];
  activeMonths: number;
  recentMonths: number;
  kind: PatternKind;
  confidence: Confidence;
  valueMedian: number;
  center: number;
  low: number;
  high: number;
  preferNextBusinessDay: boolean;
  historicalRange: string;
  observation: string;
};

type ActualSummary = {
  total: number;
  dates: string[];
  entries: number;
  weekId: string;
};

type ForecastRow = {
  id: string;
  clientKey: string;
  clientName: string;
  status: RowStatus;
  value: number;
  predictedDate: string;
  rangeStart: string;
  rangeEnd: string;
  weekId: string;
  weekLabel: string;
  notes: OpenReceivable[];
  dueDates: string[];
  historicalRange: string;
  monthsUsed: number;
  averageDueDifference: number | null;
  confidence: Confidence;
  origin: Origin;
  observation: string;
  actualDates: string[];
};

const EMPTY_STATE: ImportState = { invoices: [], receipts: [] };
const HISTORY_MONTHS = 6;
const RECENT_ACTIVITY_MONTHS = 3;
const MONTH_FORMATTER = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
const SHORT_MONTH_FORMATTER = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" });
const CONFIDENCE_ORDER: Record<Confidence, number> = { Alta: 0, Média: 1, Baixa: 2 };

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

function addDays(date: Date, amount: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1, 12, 0, 0, 0);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 12, 0, 0, 0);
}

function daysInMonth(date: Date) {
  return endOfMonth(date).getDate();
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
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
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

function differenceInDays(left: Date, right: Date) {
  return Math.round((left.getTime() - right.getTime()) / 86_400_000);
}

function easterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function nationalHolidayKeys(year: number) {
  const easter = easterSunday(year);
  const movable = [addDays(easter, -48), addDays(easter, -47), addDays(easter, -2), addDays(easter, 60)];
  const fixed = [
    new Date(year, 0, 1, 12),
    new Date(year, 3, 21, 12),
    new Date(year, 4, 1, 12),
    new Date(year, 8, 7, 12),
    new Date(year, 9, 12, 12),
    new Date(year, 10, 2, 12),
    new Date(year, 10, 15, 12),
    new Date(year, 10, 20, 12),
    new Date(year, 11, 25, 12),
  ];
  return new Set([...fixed, ...movable].map(toIsoDate));
}

function isBusinessDay(date: Date) {
  const weekday = date.getDay();
  if (weekday === 0 || weekday === 6) return false;
  return !nationalHolidayKeys(date.getFullYear()).has(toIsoDate(date));
}

function adjustBusinessDay(date: Date, direction: "previous" | "next") {
  let adjusted = new Date(date);
  let guard = 0;
  while (!isBusinessDay(adjusted) && guard < 10) {
    adjusted = addDays(adjusted, direction === "next" ? 1 : -1);
    guard += 1;
  }
  return adjusted;
}

function isBetween(date: Date, start: Date, end: Date) {
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

function isDemoReceipt(receipt: Receipt) {
  return receipt.id.startsWith("demo-receipt-") || receipt.sourceSheet === "DEMONSTRAÇÃO";
}

function receiptSource(receipts: Receipt[]) {
  const real = receipts.filter((receipt) => !isDemoReceipt(receipt));
  return real.length ? real : receipts;
}

function weightedRepresentativeDate(entries: Array<{ date: Date; amount: number; count: number }>) {
  const sorted = [...entries].sort((left, right) => left.date.getTime() - right.date.getTime());
  const total = sorted.reduce((sum, item) => sum + item.amount, 0);
  let accumulated = 0;
  for (const entry of sorted) {
    accumulated += entry.amount;
    if (accumulated >= total / 2) return entry.date;
  }
  return sorted[sorted.length - 1]?.date ?? new Date();
}

function confidenceFor(activeMonths: number, spread: number): Confidence {
  if (activeMonths >= 4 && spread <= 7) return "Alta";
  if ((activeMonths >= 2 && spread <= 12) || activeMonths >= 4) return "Média";
  return "Baixa";
}

function patternObservation(kind: PatternKind, center: number, confidence: Confidence) {
  if (confidence === "Baixa") return "Histórico irregular; previsão apresentada como faixa provável.";
  if (kind === "Fim do mês") return "Cliente costuma pagar no final do mês.";
  if (center <= 7) return "Cliente costuma pagar no início do mês.";
  if (center <= 14) return "Cliente costuma pagar na segunda semana do mês.";
  if (center <= 21) return `Cliente costuma pagar próximo ao dia ${Math.round(center)}.`;
  return "Cliente costuma pagar na última semana do mês.";
}

function buildPatterns(receipts: Receipt[], now = new Date()) {
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0, 0);
  const historyStart = addMonths(currentMonth, -HISTORY_MONTHS);
  const monthKeys = Array.from({ length: HISTORY_MONTHS }, (_, index) => monthKey(addMonths(historyStart, index)));
  const byClient = new Map<string, {
    clientName: string;
    months: Map<string, Map<string, { date: Date; amount: number; count: number }>>;
  }>();

  receiptSource(receipts).forEach((receipt) => {
    const date = parseIsoDate(receipt.receiptDate);
    if (!date || date < historyStart || date >= currentMonth || receipt.amount <= 0) return;
    const clientName = canonicalReceiptClientName(receipt.clientHint || receipt.description);
    const key = receiptClientKey(clientName);
    if (!key) return;
    const client = byClient.get(key) ?? { clientName, months: new Map() };
    const currentMonthKey = monthKey(date);
    const month = client.months.get(currentMonthKey) ?? new Map();
    const dayKey = toIsoDate(date);
    const day = month.get(dayKey) ?? { date, amount: 0, count: 0 };
    day.amount += receipt.amount;
    day.count += 1;
    month.set(dayKey, day);
    client.months.set(currentMonthKey, month);
    byClient.set(key, client);
  });

  const patterns = new Map<string, ClientPattern>();
  byClient.forEach((client, key) => {
    const samples: MonthSample[] = [];
    monthKeys.forEach((currentMonthKey, monthIndex) => {
      const daily = [...(client.months.get(currentMonthKey)?.values() ?? [])];
      if (!daily.length) return;
      const representativeDate = weightedRepresentativeDate(daily);
      samples.push({
        monthKey: currentMonthKey,
        monthIndex,
        total: daily.reduce((sum, item) => sum + item.amount, 0),
        representativeDate,
        representativeDay: representativeDate.getDate(),
        endDistance: daysInMonth(representativeDate) - representativeDate.getDate(),
        weekday: representativeDate.getDay(),
        entries: daily.reduce((sum, item) => sum + item.count, 0),
      });
    });
    if (!samples.length) return;

    const monthEndVotes = samples.filter((sample) => sample.representativeDay >= 24 || sample.endDistance <= 7).length;
    const spilloverVotes = samples.filter((sample) => sample.representativeDay <= 3).length;
    const monthEnd = monthEndVotes >= Math.max(2, Math.ceil(samples.length / 2));
    const positions = monthEnd
      ? samples.map((sample) => sample.endDistance)
      : samples.map((sample) => sample.representativeDay);
    const low = Math.floor(quantile(positions, 0.25));
    const center = Math.round(median(positions));
    const high = Math.ceil(quantile(positions, 0.75));
    const spread = Math.max(...positions) - Math.min(...positions);
    const confidence = confidenceFor(samples.length, spread);
    const recentMonths = samples.filter((sample) => sample.monthIndex >= HISTORY_MONTHS - RECENT_ACTIVITY_MONTHS).length;
    const kind: PatternKind = monthEnd ? "Fim do mês" : confidence === "Baixa" ? "Irregular" : "Faixa de dias";
    const historicalRange = monthEnd
      ? `Final do mês, normalmente entre ${Math.max(0, high)} e ${Math.max(0, low)} dias antes do fechamento`
      : `Entre os dias ${Math.max(1, low)} e ${Math.max(1, high)}`;

    patterns.set(key, {
      key,
      clientName: client.clientName,
      samples,
      activeMonths: samples.length,
      recentMonths,
      kind,
      confidence,
      valueMedian: median(samples.map((sample) => sample.total)),
      center,
      low,
      high,
      preferNextBusinessDay: spilloverVotes > monthEndVotes,
      historicalRange,
      observation: patternObservation(kind, monthEnd ? daysInMonth(currentMonth) - center : center, confidence),
    });
  });

  return {
    patterns,
    periodLabel: `${MONTH_FORMATTER.format(historyStart)} a ${MONTH_FORMATTER.format(addMonths(currentMonth, -1))}`,
    monthKeys,
  };
}

function projectPattern(pattern: ClientPattern, targetMonth: Date) {
  const direction = pattern.preferNextBusinessDay ? "next" : "previous";
  if (pattern.kind === "Fim do mês") {
    const monthEnd = endOfMonth(targetMonth);
    const center = adjustBusinessDay(addDays(monthEnd, -pattern.center), direction);
    const start = adjustBusinessDay(addDays(monthEnd, -Math.max(pattern.high, pattern.low)), direction);
    const end = adjustBusinessDay(addDays(monthEnd, -Math.min(pattern.high, pattern.low)), direction);
    return { center, start, end };
  }

  const limit = daysInMonth(targetMonth);
  const center = adjustBusinessDay(new Date(targetMonth.getFullYear(), targetMonth.getMonth(), Math.min(limit, Math.max(1, pattern.center)), 12), "next");
  const start = adjustBusinessDay(new Date(targetMonth.getFullYear(), targetMonth.getMonth(), Math.min(limit, Math.max(1, pattern.low)), 12), "next");
  const end = adjustBusinessDay(new Date(targetMonth.getFullYear(), targetMonth.getMonth(), Math.min(limit, Math.max(1, pattern.high)), 12), "next");
  return { center, start, end };
}

function weekForDate(date: Date, weeks: ForecastWeek[], monthEndPattern = false) {
  const direct = weeks.find((week) => isBetween(date, week.start, week.end));
  if (direct) return direct;
  if (monthEndPattern && weeks.length) return weeks[weeks.length - 1];
  if (!weeks.length) return null;
  return [...weeks].sort((left, right) => {
    const leftDistance = Math.min(Math.abs(date.getTime() - left.start.getTime()), Math.abs(date.getTime() - left.end.getTime()));
    const rightDistance = Math.min(Math.abs(date.getTime() - right.start.getTime()), Math.abs(date.getTime() - right.end.getTime()));
    return leftDistance - rightDistance;
  })[0];
}

function notesForTargetMonth(notes: OpenReceivable[], targetMonth: Date, now = new Date()) {
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1, 12);
  const targetKey = monthKey(targetMonth);
  return notes.filter((note) => {
    const due = parseIsoDate(note.dueDate);
    if (!due) return monthKey(targetMonth) === monthKey(currentMonth);
    if (targetKey === monthKey(currentMonth)) return due <= endOfMonth(targetMonth);
    return monthKey(due) === targetKey;
  });
}

function averageDueDifference(receipts: Receipt[], notes: OpenReceivable[]) {
  const dueByInvoice = new Map<string, Date>();
  notes.forEach((note) => {
    const due = parseIsoDate(note.dueDate);
    if (note.invoiceNumber && due) dueByInvoice.set(note.invoiceNumber.replace(/^0+/, ""), due);
  });
  const differences: number[] = [];
  receiptSource(receipts).forEach((receipt) => {
    const paid = parseIsoDate(receipt.receiptDate);
    if (!paid) return;
    receipt.invoiceNumbers.forEach((number) => {
      const due = dueByInvoice.get(number.replace(/^0+/, ""));
      if (due) differences.push(differenceInDays(paid, due));
    });
  });
  return differences.length ? Math.round(differences.reduce((sum, value) => sum + value, 0) / differences.length) : null;
}

function buildActuals(receipts: Receipt[], weeks: ForecastWeek[]) {
  const actuals = new Map<string, ActualSummary>();
  receiptSource(receipts).forEach((receipt) => {
    const date = parseIsoDate(receipt.receiptDate);
    if (!date || receipt.amount <= 0) return;
    const week = weeks.find((item) => isBetween(date, item.start, item.end));
    if (!week) return;
    const clientName = canonicalReceiptClientName(receipt.clientHint || receipt.description);
    const clientKey = receiptClientKey(clientName);
    if (!clientKey) return;
    const key = `${clientKey}|${week.id}`;
    const current = actuals.get(key) ?? { total: 0, dates: [], entries: 0, weekId: week.id };
    current.total += receipt.amount;
    current.entries += 1;
    if (!current.dates.includes(receipt.receiptDate)) current.dates.push(receipt.receiptDate);
    current.dates.sort();
    actuals.set(key, current);
  });
  return actuals;
}

function buildForecastRows(
  receipts: Receipt[],
  openReceivables: OpenReceivable[],
  patternsResult: ReturnType<typeof buildPatterns>,
  targetMonth: Date,
  weeks: ForecastWeek[],
) {
  const actuals = buildActuals(receipts, weeks);
  const notesByClient = new Map<string, OpenReceivable[]>();
  notesForTargetMonth(openReceivables, targetMonth).forEach((note) => {
    const canonical = canonicalReceiptClientName(note.clientName);
    const key = receiptClientKey(canonical);
    if (!key) return;
    const current = notesByClient.get(key) ?? [];
    current.push({ ...note, clientName: canonical });
    notesByClient.set(key, current);
  });

  const actualClientKeys = new Set([...actuals.keys()].map((key) => key.split("|")[0]));
  const clientKeys = new Set<string>([
    ...patternsResult.patterns.keys(),
    ...notesByClient.keys(),
    ...actualClientKeys,
  ]);
  const rows: ForecastRow[] = [];

  actuals.forEach((actual, compositeKey) => {
    const [clientKey, weekId] = compositeKey.split("|");
    const pattern = patternsResult.patterns.get(clientKey);
    const notes = notesByClient.get(clientKey) ?? [];
    const week = weeks.find((item) => item.id === weekId);
    if (!week) return;
    rows.push({
      id: `actual-${compositeKey}`,
      clientKey,
      clientName: pattern?.clientName ?? notes[0]?.clientName ?? clientKey,
      status: "Recebido",
      value: actual.total,
      predictedDate: actual.dates[0] ?? week.id,
      rangeStart: actual.dates[0] ?? week.id,
      rangeEnd: actual.dates[actual.dates.length - 1] ?? week.id,
      weekId,
      weekLabel: week.label,
      notes: [],
      dueDates: [],
      historicalRange: pattern?.historicalRange ?? "Sem padrão histórico identificado",
      monthsUsed: pattern?.activeMonths ?? 0,
      averageDueDifference: null,
      confidence: pattern?.confidence ?? "Baixa",
      origin: "Recebimento realizado",
      observation: `Recebido em ${actual.dates.map(formatDate).join(", ")}.`,
      actualDates: actual.dates,
    });
  });

  clientKeys.forEach((clientKey) => {
    const pattern = patternsResult.patterns.get(clientKey);
    const notes = notesByClient.get(clientKey) ?? [];
    const hasCurrentActual = actualClientKeys.has(clientKey);
    const hasHistoryForecast = Boolean(pattern && pattern.recentMonths > 0 && pattern.confidence !== "Baixa");
    if (!notes.length && (!hasHistoryForecast || hasCurrentActual)) return;

    let center: Date;
    let start: Date;
    let end: Date;
    let confidence: Confidence;
    let historicalRange: string;
    let observation: string;
    let origin: Origin;

    if (pattern && pattern.activeMonths >= 2) {
      ({ center, start, end } = projectPattern(pattern, targetMonth));
      confidence = pattern.confidence;
      historicalRange = pattern.historicalRange;
      observation = pattern.observation;
      origin = notes.length ? "Nota em aberto + histórico" : "Somente histórico";
    } else {
      const dueDates = notes.map((note) => parseIsoDate(note.dueDate)).filter((date): date is Date => Boolean(date));
      const due = dueDates.length
        ? [...dueDates].sort((left, right) => left.getTime() - right.getTime())[Math.floor((dueDates.length - 1) / 2)]
        : new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 15, 12);
      center = adjustBusinessDay(due, "next");
      start = center;
      end = center;
      confidence = "Baixa";
      historicalRange = "Histórico insuficiente";
      observation = "Sem padrão histórico suficiente; vencimento usado apenas como referência complementar.";
      origin = "Somente nota em aberto";
    }

    const week = weekForDate(center, weeks, pattern?.kind === "Fim do mês");
    if (!week) return;
    const value = notes.length
      ? notes.reduce((sum, note) => sum + note.openValue, 0)
      : pattern?.valueMedian ?? 0;
    if (value <= 0) return;
    const dueDates = [...new Set(notes.map((note) => note.dueDate).filter(Boolean))].sort();
    const averageDifference = averageDueDifference(receipts, notes);
    const noteObservation = notes.length
      ? observation
      : `${observation} Previsão baseada no histórico — nota ainda não localizada.`;

    rows.push({
      id: `forecast-${clientKey}-${week.id}`,
      clientKey,
      clientName: pattern?.clientName ?? notes[0]?.clientName ?? clientKey,
      status: "Previsto",
      value,
      predictedDate: toIsoDate(center),
      rangeStart: toIsoDate(start),
      rangeEnd: toIsoDate(end),
      weekId: week.id,
      weekLabel: week.label,
      notes,
      dueDates,
      historicalRange,
      monthsUsed: pattern?.activeMonths ?? 0,
      averageDueDifference: averageDifference,
      confidence,
      origin,
      observation: noteObservation,
      actualDates: [],
    });
  });

  return rows.sort((left, right) =>
    left.weekId.localeCompare(right.weekId)
    || Number(left.status === "Recebido") - Number(right.status === "Recebido")
    || CONFIDENCE_ORDER[left.confidence] - CONFIDENCE_ORDER[right.confidence]
    || right.value - left.value
    || left.clientName.localeCompare(right.clientName, "pt-BR"),
  );
}

function confidenceClass(confidence: Confidence) {
  return confidence.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function originClass(origin: Origin) {
  if (origin === "Nota em aberto + histórico") return "both";
  if (origin === "Somente nota em aberto") return "note";
  if (origin === "Somente histórico") return "history";
  return "actual";
}

function averageDifferenceLabel(value: number | null) {
  if (value === null) return "Não disponível";
  if (value === 0) return "No vencimento";
  if (value > 0) return `${value} dias após`;
  return `${Math.abs(value)} dias antes`;
}

function notesLabel(notes: OpenReceivable[]) {
  if (!notes.length) return "Nota ainda não localizada";
  return notes.map((note) => note.invoiceNumber || note.titleNumber || "Sem número").join(", ");
}

function ForecastView({ data }: { data: ImportState }) {
  const [parsedOpenReceivables, setParsedOpenReceivables] = useState<OpenReceivable[]>(data.openReceivables ?? []);
  const [openSheetState, setOpenSheetState] = useState<"loading" | "found" | "missing">("loading");
  const [selectedMonthKey, setSelectedMonthKey] = useState(() => monthKey(new Date()));
  const [selectedWeek, setSelectedWeek] = useState("all");
  const [selectedClient, setSelectedClient] = useState("all");
  const [selectedConfidence, setSelectedConfidence] = useState<Confidence | "Todas">("Todas");
  const [selectedOrigin, setSelectedOrigin] = useState<Origin | "Todas">("Todas");
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (data.openReceivables?.length) {
      setParsedOpenReceivables(data.openReceivables);
      setOpenSheetState("found");
      return () => { cancelled = true; };
    }
    setOpenSheetState("loading");
    void loadForecastReceiptFile()
      .then(async (file) => file ? parseOpenReceivablesWorkbook(file) : [])
      .then((items) => {
        if (cancelled) return;
        setParsedOpenReceivables(items);
        setOpenSheetState(items.length ? "found" : "missing");
      })
      .catch(() => {
        if (!cancelled) setOpenSheetState("missing");
      });
    return () => { cancelled = true; };
  }, [data.openReceivables, data.receiptFileName]);

  const patternsResult = useMemo(() => buildPatterns(data.receipts), [data.receipts]);
  const monthOptions = useMemo(() => {
    const now = new Date();
    const current = new Date(now.getFullYear(), now.getMonth(), 1, 12);
    return Array.from({ length: 12 }, (_, index) => addMonths(current, index));
  }, []);
  const selectedMonth = monthOptions.find((month) => monthKey(month) === selectedMonthKey) ?? monthOptions[0];
  const weeks = useMemo(() => buildWeeks(selectedMonth), [selectedMonthKey, selectedMonth]);
  const rows = useMemo(
    () => buildForecastRows(data.receipts, parsedOpenReceivables, patternsResult, selectedMonth, weeks),
    [data.receipts, parsedOpenReceivables, patternsResult, selectedMonth, weeks],
  );

  const scopedRows = useMemo(() => rows.filter((row) =>
    (selectedWeek === "all" || row.weekId === selectedWeek)
    && (selectedConfidence === "Todas" || row.confidence === selectedConfidence)
    && (selectedOrigin === "Todas" || row.origin === selectedOrigin),
  ), [rows, selectedWeek, selectedConfidence, selectedOrigin]);

  const clientOptions = useMemo(() => {
    const clients = new Map<string, string>();
    scopedRows.forEach((row) => clients.set(row.clientKey, row.clientName));
    return [...clients.entries()]
      .map(([key, name]) => ({ key, name }))
      .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
  }, [scopedRows]);

  useEffect(() => {
    if (selectedClient !== "all" && !clientOptions.some((client) => client.key === selectedClient)) setSelectedClient("all");
  }, [clientOptions, selectedClient]);

  const filteredRows = useMemo(
    () => scopedRows.filter((row) => selectedClient === "all" || row.clientKey === selectedClient),
    [scopedRows, selectedClient],
  );
  const predictedRows = filteredRows.filter((row) => row.status === "Previsto");
  const receivedRows = filteredRows.filter((row) => row.status === "Recebido");
  const predictedValue = predictedRows.reduce((sum, row) => sum + row.value, 0);
  const receivedValue = receivedRows.reduce((sum, row) => sum + row.value, 0);
  const openNoteValue = predictedRows
    .filter((row) => row.notes.length)
    .reduce((sum, row) => sum + row.value, 0);
  const predictedClients = new Set(predictedRows.map((row) => row.clientKey)).size;
  const selectedDetail = rows.find((row) => row.id === selectedDetailId) ?? null;

  const weeklySummary = useMemo(() => weeks.map((week) => {
    const weekRows = rows
      .filter((row) => row.weekId === week.id)
      .filter((row) => selectedConfidence === "Todas" || row.confidence === selectedConfidence)
      .filter((row) => selectedOrigin === "Todas" || row.origin === selectedOrigin)
      .filter((row) => selectedClient === "all" || row.clientKey === selectedClient);
    const forecasts = weekRows.filter((row) => row.status === "Previsto");
    const actuals = weekRows.filter((row) => row.status === "Recebido");
    return {
      ...week,
      forecast: forecasts.reduce((sum, row) => sum + row.value, 0),
      received: actuals.reduce((sum, row) => sum + row.value, 0),
      forecastClients: new Set(forecasts.map((row) => row.clientKey)).size,
      receivedClients: new Set(actuals.map((row) => row.clientKey)).size,
      names: [...new Set(forecasts.map((row) => row.clientName))].slice(0, 4),
    };
  }), [rows, selectedClient, selectedConfidence, selectedOrigin, weeks]);

  const historyChart = useMemo(() => {
    const selectedKeys = new Set(filteredRows.map((row) => row.clientKey));
    return patternsResult.monthKeys.map((key) => ({
      month: SHORT_MONTH_FORMATTER.format(parseIsoDate(`${key}-01`) ?? new Date()).replace(" de ", "/"),
      amount: [...patternsResult.patterns.values()]
        .filter((pattern) => selectedKeys.has(pattern.key))
        .reduce((sum, pattern) => sum + (pattern.samples.find((sample) => sample.monthKey === key)?.total ?? 0), 0),
    }));
  }, [filteredRows, patternsResult]);

  if (!data.receipts.length) {
    return (
      <section className="receipt-forecast-page-v9">
        <div className="forecast-empty-v9">
          <CalendarClock size={44} />
          <span>PREVISÃO DE RECEBIMENTOS</span>
          <h2>Importe a planilha de Recebimentos.</h2>
          <p>A mesma importação será usada para ler o histórico e a aba CONTAS A RECEBER, sem segundo upload.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="receipt-forecast-page-v9">
      <div className="forecast-heading-v9">
        <div>
          <span>HISTÓRICO REAL + CONTAS A RECEBER</span>
          <h2>Previsão de Recebimentos</h2>
          <p>
            Padrão calculado com até seis meses ({patternsResult.periodLabel}), exigindo atividade recente para previsões sem nota. O vencimento é apenas complementar.
          </p>
        </div>
        <div className="forecast-method-v9">
          <CalendarClock size={20} />
          <div><strong>Recalculado a cada importação</strong><span>Sem alterar as demais abas</span></div>
        </div>
      </div>

      {openSheetState === "missing" ? (
        <div className="forecast-warning-v9">
          <FileQuestion size={20} />
          <div>
            <strong>A aba CONTAS A RECEBER não foi localizada ou não possui linhas abertas reconhecíveis.</strong>
            <span>As previsões históricas continuam disponíveis, mas notas, valores em aberto e vencimentos não poderão ser vinculados.</span>
          </div>
        </div>
      ) : null}
      {openSheetState === "loading" ? (
        <div className="forecast-warning-v9 neutral"><ReceiptText size={20} /><span>Lendo a aba CONTAS A RECEBER da planilha importada…</span></div>
      ) : null}

      <section className="forecast-filters-v9">
        <div className="filter-title"><span>Filtros</span><small>Cards, semanas e tabela usam o mesmo escopo</small></div>
        <label><span>Cliente</span><div><select value={selectedClient} onChange={(event: ChangeEvent<HTMLSelectElement>) => setSelectedClient(event.target.value)}><option value="all">Todos os clientes ({clientOptions.length})</option>{clientOptions.map((client) => <option key={client.key} value={client.key}>{client.name}</option>)}</select><ChevronDown size={15} /></div></label>
        <label><span>Mês previsto</span><div><select value={selectedMonthKey} onChange={(event: ChangeEvent<HTMLSelectElement>) => { setSelectedMonthKey(event.target.value); setSelectedWeek("all"); setSelectedClient("all"); }}>${""}</select><ChevronDown size={15} /></div></label>
        <label className="month-select-clone"><span>Mês previsto</span><div><select value={selectedMonthKey} onChange={(event: ChangeEvent<HTMLSelectElement>) => { setSelectedMonthKey(event.target.value); setSelectedWeek("all"); setSelectedClient("all"); }}>{monthOptions.map((month) => <option key={monthKey(month)} value={monthKey(month)}>{MONTH_FORMATTER.format(month)}</option>)}</select><ChevronDown size={15} /></div></label>
        <label><span>Semana econômica</span><div><select value={selectedWeek} onChange={(event: ChangeEvent<HTMLSelectElement>) => { setSelectedWeek(event.target.value); setSelectedClient("all"); }}><option value="all">Todas as semanas</option>{weeks.map((week) => <option key={week.id} value={week.id}>{week.label}</option>)}</select><ChevronDown size={15} /></div></label>
        <label><span>Confiança</span><div><select value={selectedConfidence} onChange={(event: ChangeEvent<HTMLSelectElement>) => { setSelectedConfidence(event.target.value as Confidence | "Todas"); setSelectedClient("all"); }}><option value="Todas">Todas</option><option value="Alta">Alta</option><option value="Média">Média</option><option value="Baixa">Baixa</option></select><ChevronDown size={15} /></div></label>
        <label><span>Origem</span><div><select value={selectedOrigin} onChange={(event: ChangeEvent<HTMLSelectElement>) => { setSelectedOrigin(event.target.value as Origin | "Todas"); setSelectedClient("all"); }}><option value="Todas">Todas</option><option value="Nota em aberto + histórico">Nota + histórico</option><option value="Somente nota em aberto">Somente nota</option><option value="Somente histórico">Somente histórico</option><option value="Recebimento realizado">Recebido</option></select><ChevronDown size={15} /></div></label>
        {(selectedClient !== "all" || selectedWeek !== "all" || selectedConfidence !== "Todas" || selectedOrigin !== "Todas") ? <button type="button" onClick={() => { setSelectedClient("all"); setSelectedWeek("all"); setSelectedConfidence("Todas"); setSelectedOrigin("Todas"); }}>Limpar</button> : null}
      </section>

      <section className="forecast-kpis-v9">
        <article><span>Previsão a receber</span><strong>{currency.format(predictedValue)}</strong><small>{predictedClients} clientes ainda previstos</small></article>
        <article><span>Recebido no período</span><strong>{currency.format(receivedValue)}</strong><small>{new Set(receivedRows.map((row) => row.clientKey)).size} clientes com valor real lançado</small></article>
        <article><span>Notas abertas vinculadas</span><strong>{currency.format(openNoteValue)}</strong><small>{predictedRows.reduce((sum, row) => sum + row.notes.length, 0)} notas relacionadas</small></article>
        <article><span>Previsões históricas sem nota</span><strong>{integer.format(predictedRows.filter((row) => row.origin === "Somente histórico").length)}</strong><small>Somente clientes com padrão e atividade recente</small></article>
      </section>

      <section className="forecast-main-v9">
        <article className="forecast-panel-v9">
          <div className="forecast-panel-head-v9"><div><h3>Histórico real dos clientes filtrados</h3><p>Valores efetivamente recebidos nos seis meses analisados</p></div></div>
          <div className="forecast-chart-v9"><ResponsiveContainer width="100%" height="100%"><BarChart data={historyChart} margin={{ top: 12, right: 8, left: 4, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#e8ebf2" vertical={false} /><XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "#788198", fontSize: 12 }} /><YAxis tickFormatter={(value: number | string) => compactCurrency.format(Number(value))} tickLine={false} axisLine={false} tick={{ fill: "#9aa2b3", fontSize: 11 }} width={72} /><Tooltip formatter={(value: number | string) => currency.format(Number(value))} /><Bar dataKey="amount" name="Recebido" fill="#5d72f6" radius={[6, 6, 0, 0]} maxBarSize={54} /></BarChart></ResponsiveContainer></div>
        </article>
        <article className="forecast-panel-v9">
          <div className="forecast-panel-head-v9"><div><h3>Semanas econômicas de {MONTH_FORMATTER.format(selectedMonth)}</h3><p>A última semana continua no mês seguinte quando necessário</p></div></div>
          <div className="forecast-weeks-v9">{weeklySummary.map((week) => <button key={week.id} type="button" className={selectedWeek === week.id ? "active" : ""} onClick={() => { setSelectedWeek((current) => current === week.id ? "all" : week.id); setSelectedClient("all"); }}><span>{week.label}</span><strong>A receber: {currency.format(week.forecast)}</strong><em>Recebido: {currency.format(week.received)}</em><small>{week.forecastClients} previstos · {week.receivedClients} recebidos</small><i>{week.names.length ? week.names.join(" · ") : "Sem previsão pendente"}</i></button>)}</div>
        </article>
      </section>

      <article className="forecast-panel-v9">
        <div className="forecast-panel-head-v9"><div><h3>Análise individual por cliente</h3><p>{filteredRows.length} registros no filtro atual</p></div></div>
        <div className="forecast-table-v9"><table><thead><tr><th>Cliente</th><th className="number">Valor</th><th>Data ou semana provável</th><th>Notas em aberto</th><th>Vencimentos</th><th>Faixa histórica</th><th>Meses</th><th>Dif. vencimento</th><th>Confiança</th><th>Origem</th><th>Observação</th></tr></thead><tbody>{filteredRows.map((row) => <tr key={row.id} onClick={() => setSelectedDetailId((current) => current === row.id ? null : row.id)}><td className="client"><strong>{row.clientName}</strong><span>{row.status === "Recebido" ? <><CheckCircle2 size={12} /> Recebido</> : "Previsão pendente"}</span></td><td className="number"><strong>{currency.format(row.value)}</strong></td><td><strong>{row.status === "Recebido" ? row.actualDates.map(formatDate).join(", ") : `${formatDate(row.rangeStart)} a ${formatDate(row.rangeEnd)}`}</strong><span>{row.weekLabel}</span></td><td><span>{notesLabel(row.notes)}</span></td><td><span>{row.dueDates.length ? row.dueDates.map(formatDate).join(", ") : "—"}</span></td><td><span>{row.historicalRange}</span></td><td>{row.monthsUsed}/6</td><td>{averageDifferenceLabel(row.averageDueDifference)}</td><td><span className={`confidence ${confidenceClass(row.confidence)}`}>{row.confidence}</span></td><td><span className={`origin ${originClass(row.origin)}`}>{row.origin}</span></td><td className="observation">{row.observation}</td></tr>)}{!filteredRows.length ? <tr><td colSpan={11} className="empty-row">Nenhuma previsão encontrada para os filtros selecionados.</td></tr> : null}</tbody></table></div>
      </article>

      {selectedDetail ? <article className="forecast-panel-v9 forecast-detail-v9"><div className="forecast-panel-head-v9"><div><h3>{selectedDetail.clientName}</h3><p>Memória de cálculo da previsão selecionada</p></div><button type="button" onClick={() => setSelectedDetailId(null)}>Fechar</button></div><div className="detail-grid"><div><span>Origem</span><strong>{selectedDetail.origin}</strong></div><div><span>Valor considerado</span><strong>{currency.format(selectedDetail.value)}</strong></div><div><span>Janela</span><strong>{formatDate(selectedDetail.rangeStart)} a {formatDate(selectedDetail.rangeEnd)}</strong></div><div><span>Histórico</span><strong>{selectedDetail.historicalRange}</strong></div><div><span>Notas relacionadas</span><strong>{notesLabel(selectedDetail.notes)}</strong></div><div><span>Observação</span><strong>{selectedDetail.observation}</strong></div></div></article> : null}

      <div className="forecast-note-v9"><CircleAlert size={17} /><span>A data prevista é determinada pelo comportamento real do cliente. O vencimento só assume a previsão quando não existe histórico suficiente. Feriados nacionais e finais de semana são ajustados para dia útil; feriados municipais dependem da informação existente na própria base.</span></div>

      <style jsx global>{`
        .receipt-forecast-active .content-area > :not(.receipt-forecast-page-v9) { display: none !important; }
        .receipt-forecast-page-v9 { display: grid; gap: 20px; color: #20263a; animation: forecastV9In .18s ease-out; }
        @keyframes forecastV9In { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
        .forecast-heading-v9 { display: flex; justify-content: space-between; gap: 22px; align-items: flex-start; }
        .forecast-heading-v9 > div:first-child > span { color: #5d72f6; font-size: 10px; font-weight: 800; letter-spacing: .11em; }
        .forecast-heading-v9 h2 { margin: 5px 0 0; font-size: clamp(25px, 2.4vw, 34px); }
        .forecast-heading-v9 p { max-width: 820px; margin: 7px 0 0; color: #788198; line-height: 1.55; font-size: 13px; }
        .forecast-method-v9 { min-width: 280px; display: flex; gap: 10px; align-items: center; padding: 14px 16px; border: 1px solid #dfe4f1; border-radius: 14px; background: #fff; color: #5d72f6; }
        .forecast-method-v9 div { display: grid; gap: 2px; }.forecast-method-v9 strong { color: #27304b; font-size: 12px; }.forecast-method-v9 span { color: #8790a4; font-size: 10px; }
        .forecast-warning-v9,.forecast-note-v9 { display: flex; gap: 10px; align-items: flex-start; padding: 13px 15px; border: 1px solid #f0dcae; border-radius: 12px; background: #fffaf0; color: #805f18; font-size: 12px; line-height: 1.5; }
        .forecast-warning-v9 div { display: grid; gap: 3px; }.forecast-warning-v9.neutral { border-color: #dfe4f1; background: #f8f9fd; color: #59647b; align-items: center; }
        .forecast-filters-v9 { display: flex; gap: 10px; align-items: end; flex-wrap: wrap; padding: 15px; border: 1px solid #e2e6ef; border-radius: 15px; background: #fff; }
        .forecast-filters-v9 .filter-title { display: grid; min-width: 150px; margin-right: auto; }.forecast-filters-v9 .filter-title span { font-weight: 800; font-size: 12px; }.forecast-filters-v9 .filter-title small { color: #929aac; font-size: 9px; }
        .forecast-filters-v9 label { display: grid; gap: 5px; }.forecast-filters-v9 label > span { color: #7d869a; font-size: 9px; font-weight: 800; text-transform: uppercase; }.forecast-filters-v9 label > div { display: flex; align-items: center; gap: 5px; height: 37px; padding: 0 9px; border: 1px solid #dfe4ee; border-radius: 9px; }.forecast-filters-v9 select { min-width: 145px; border: 0; outline: 0; appearance: none; background: transparent; color: #374057; font: inherit; font-size: 11px; }.forecast-filters-v9 button,.forecast-detail-v9 button { height: 37px; padding: 0 12px; border: 1px solid #dfe4ee; border-radius: 9px; background: #fff; color: #626c83; font-size: 11px; font-weight: 800; cursor: pointer; }
        .forecast-filters-v9 > label:nth-of-type(2) { display: none; }.month-select-clone { display: grid !important; }
        .forecast-kpis-v9 { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 13px; }.forecast-kpis-v9 article { display: grid; min-height: 118px; align-content: space-between; padding: 17px; border: 1px solid #e4e8f1; border-radius: 15px; background: #fff; }.forecast-kpis-v9 span { color: #707a91; font-size: 10px; font-weight: 800; }.forecast-kpis-v9 strong { font-size: clamp(19px,2vw,27px); }.forecast-kpis-v9 small { color: #929aac; font-size: 9px; }
        .forecast-main-v9 { display: grid; grid-template-columns: minmax(0,1.4fr) minmax(350px,.8fr); gap: 15px; }.forecast-panel-v9 { overflow: hidden; border: 1px solid #e4e8f1; border-radius: 15px; background: #fff; }.forecast-panel-head-v9 { display: flex; justify-content: space-between; gap: 12px; align-items: center; padding: 17px 19px 13px; }.forecast-panel-head-v9 h3 { margin: 0; font-size: 14px; }.forecast-panel-head-v9 p { margin: 4px 0 0; color: #8d95a8; font-size: 10px; }.forecast-chart-v9 { height: 285px; padding: 4px 12px 14px; }
        .forecast-weeks-v9 { display: grid; max-height: 310px; overflow: auto; }.forecast-weeks-v9 button { display: grid; gap: 3px; padding: 12px 14px; border: 0; border-bottom: 1px solid #edf0f5; background: #fff; text-align: left; cursor: pointer; }.forecast-weeks-v9 button.active { background: #f1f3ff; box-shadow: inset 3px 0 #5d72f6; }.forecast-weeks-v9 span { color: #677188; font-size: 10px; font-weight: 800; }.forecast-weeks-v9 strong { font-size: 12px; }.forecast-weeks-v9 em { color: #16866f; font-size: 10px; font-style: normal; font-weight: 700; }.forecast-weeks-v9 small { color: #8a93a7; font-size: 9px; }.forecast-weeks-v9 i { overflow: hidden; color: #9aa2b3; font-size: 8px; font-style: normal; text-overflow: ellipsis; white-space: nowrap; }
        .forecast-table-v9 { overflow-x: auto; border-top: 1px solid #edf0f5; }.forecast-table-v9 table { width: 100%; min-width: 1780px; border-collapse: collapse; }.forecast-table-v9 th,.forecast-table-v9 td { padding: 12px 13px; border-bottom: 1px solid #edf0f5; text-align: left; vertical-align: top; font-size: 10px; }.forecast-table-v9 th { background: #fafbfe; color: #7d869a; font-size: 9px; text-transform: uppercase; }.forecast-table-v9 th.number,.forecast-table-v9 td.number { text-align: right; }.forecast-table-v9 tbody tr { cursor: pointer; }.forecast-table-v9 tbody tr:hover { background: #f8f9ff; }.forecast-table-v9 td.client { display: grid; min-width: 235px; gap: 4px; }.forecast-table-v9 td.client strong { font-size: 11px; }.forecast-table-v9 td.client span { display: flex; gap: 4px; align-items: center; color: #8d95a8; font-size: 9px; }.forecast-table-v9 td > span { display: block; max-width: 210px; color: #626c83; line-height: 1.4; }.forecast-table-v9 td:nth-child(3) { min-width: 190px; }.forecast-table-v9 td:nth-child(3) span { margin-top: 3px; color: #929aac; font-size: 8px; }.forecast-table-v9 .observation { min-width: 245px; line-height: 1.45; }.confidence,.origin { display: inline-flex !important; width: fit-content; padding: 5px 8px; border-radius: 999px; font-size: 8px !important; font-weight: 800; white-space: nowrap; }.confidence.alta { background: #e8f8f3; color: #16866f !important; }.confidence.media { background: #eef0ff; color: #5367df !important; }.confidence.baixa { background: #fff4dd; color: #9b6c08 !important; }.origin.both { background: #e8f8f3; color: #16866f !important; }.origin.note { background: #fff4dd; color: #956604 !important; }.origin.history { background: #eef0ff; color: #5367df !important; }.origin.actual { background: #e9f5ff; color: #2878a9 !important; }.empty-row { padding: 28px !important; text-align: center !important; color: #8d95a8; }
        .forecast-detail-v9 { padding-bottom: 16px; }.detail-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 10px; padding: 0 19px; }.detail-grid div { display: grid; gap: 5px; padding: 12px; border: 1px solid #e7eaf2; border-radius: 10px; background: #fbfcff; }.detail-grid span { color: #8790a4; font-size: 9px; text-transform: uppercase; }.detail-grid strong { color: #3e475e; font-size: 11px; line-height: 1.4; }
        .forecast-empty-v9 { display: grid; min-height: 450px; place-items: center; align-content: center; gap: 9px; padding: 35px; border: 1px dashed #cfd6e6; border-radius: 18px; background: #fff; color: #5d72f6; text-align: center; }.forecast-empty-v9 span { font-size: 10px; font-weight: 800; letter-spacing: .11em; }.forecast-empty-v9 h2 { margin: 0; color: #27304b; }.forecast-empty-v9 p { max-width: 610px; margin: 0; color: #7f889d; }
        @media (max-width: 1150px) { .forecast-kpis-v9 { grid-template-columns: repeat(2,minmax(0,1fr)); }.forecast-main-v9 { grid-template-columns: 1fr; } }
        @media (max-width: 760px) { .forecast-heading-v9 { display: grid; }.forecast-method-v9 { min-width: 0; }.forecast-kpis-v9 { grid-template-columns: 1fr; }.forecast-filters-v9 .filter-title { flex: 1 1 100%; }.forecast-filters-v9 label { flex: 1 1 100%; }.forecast-filters-v9 select { width: 100%; }.detail-grid { grid-template-columns: 1fr; } }
      `}</style>
    </section>
  );
}

export default function ReceiptForecastEnhancerV9() {
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
    void loadAnalysisState().then((stored) => { if (mounted && stored) setData(stored); });
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
          const receiptButton = [...nav.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === "Recebimentos");
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
      if (target.closest("aside.sidebar nav") || target.textContent?.includes("Atualizar bases")) setActive(false);
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
        <button type="button" data-forecast-nav="true" className={active ? "active" : ""} aria-pressed={active} onClick={() => { setActive(true); document.querySelector<HTMLButtonElement>(".mobile-close")?.click(); }}><CalendarClock size={19} />Previsão</button>,
        navTarget,
      ) : null}
      {active && contentTarget ? createPortal(<ForecastView data={data} />, contentTarget) : null}
    </>
  );
}
