"use client";

import {
  BadgeCheck,
  CalendarClock,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Flag,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { compactCurrency, currency, formatDate } from "@/lib/format";
import { ANALYSIS_DATA_EVENT, loadAnalysisState, OFFLINE_DATA_CLEARED_EVENT } from "@/lib/offlineStorage";
import { canonicalReceiptClientName } from "@/lib/receiptClientNames";
import {
  createForecastAdjustment,
  listForecastAdjustments,
  restoreForecastAdjustment,
  type ForecastManualAdjustment,
  type NewForecastManualAdjustment,
} from "@/lib/forecastManualAdjustments";
import type { ImportState, Receipt } from "@/lib/types";

type Confidence = "Alta" | "Média" | "—";
type RowStatus = "Previsto" | "Parcial" | "Recebido" | "Confirmado" | "Manual";
export type ForecastWeek = { id: string; index: number; label: string; start: Date; end: Date; ownerMonth: string };
type HistoryMonth = { key: string; label: string; shortLabel: string; start: Date };
type DayAggregate = { date: Date; amount: number; day: number; endDistance: number };
type ClusterSample = { monthIndex: number; amount: number; day: number; endDistance: number };
type PaymentSlot = {
  id: string;
  clientKey: string;
  clientName: string;
  monthEnd: boolean;
  expected: number;
  nominalDay: number;
  endDistance: number;
  activeMonths: number;
  confidence: Exclude<Confidence, "—">;
  monthValues: number[];
  monthDays: number[];
};
type ActualSummary = { key: string; clientKey: string; clientName: string; weekId: string; total: number; dates: string[] };
export type ForecastRow = {
  key: string;
  sourceKey: string;
  clientKey: string;
  clientName: string;
  weekId: string;
  weekLabel: string;
  weekStart: string;
  weekEnd: string;
  estimatedDate: string;
  displayValue: number;
  expected: number;
  remaining: number;
  status: RowStatus;
  activeMonths: number;
  confidence: Confidence;
  historicalValues: number[];
  historicalDays: number[];
  actual?: ActualSummary;
  manualNote?: string;
  adjustmentId?: string;
};
export type ForecastFilters = {
  selectedWeek: string;
  selectedClient: string;
  selectedConfidence: "Todas" | "Alta" | "Média";
  onlyPending: boolean;
};
type ModalState =
  | { type: "move"; row: ForecastRow }
  | { type: "confirm"; row: ForecastRow }
  | { type: "add" }
  | { type: "manage" }
  | null;

const EMPTY_STATE: ImportState = { invoices: [], receipts: [] };
const HISTORY_MONTHS = 3;
const MIN_RECURRING_MONTHS = 2;
const CLUSTER_TOLERANCE_DAYS = 4;
const MONTH_FORMATTER = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
const SHORT_MONTH_FORMATTER = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" });

function parseIsoDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
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
  return new Date(date.getFullYear(), date.getMonth() + amount, 1, 12);
}
function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 12);
}
function daysInMonth(date: Date) {
  return endOfMonth(date).getDate();
}
function isBetween(date: Date, start: Date, end: Date) {
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}
function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function normalizeKey(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
}
function sourceReceipts(receipts: Receipt[]) {
  const real = receipts.filter((receipt) => !receipt.id.startsWith("demo-receipt-") && receipt.sourceSheet !== "DEMONSTRAÇÃO");
  return real.length ? real : receipts;
}
export function buildWeeks(month: Date): ForecastWeek[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  let monday = addDays(first, (8 - first.getDay()) % 7);
  const weeks: ForecastWeek[] = [];
  let index = 0;
  while (monday.getMonth() === month.getMonth() && monday.getFullYear() === month.getFullYear()) {
    const friday = addDays(monday, 4);
    weeks.push({
      id: toIsoDate(monday),
      index,
      label: `Semana ${index + 1} · ${formatDate(toIsoDate(monday))} a ${formatDate(toIsoDate(friday))}`,
      start: monday,
      end: friday,
      ownerMonth: monthKey(monday),
    });
    monday = addDays(monday, 7);
    index += 1;
  }
  return weeks;
}
function nextBusinessDay(date: Date) {
  let result = new Date(date);
  while (result.getDay() === 0 || result.getDay() === 6) result = addDays(result, 1);
  return result;
}
function aggregateByDate(entries: Array<{ date: Date; amount: number }>): DayAggregate[] {
  const map = new Map<string, DayAggregate>();
  entries.forEach((entry) => {
    const key = toIsoDate(entry.date);
    const current = map.get(key) ?? {
      date: entry.date,
      amount: 0,
      day: entry.date.getDate(),
      endDistance: daysInMonth(entry.date) - entry.date.getDate(),
    };
    current.amount += entry.amount;
    map.set(key, current);
  });
  return [...map.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}
function clusterClientSamples(monthlyDays: DayAggregate[][]) {
  const samples = monthlyDays.flatMap((days, monthIndex) => days.map((day) => ({ monthIndex, ...day })));
  const clusters: Array<{ monthEnd: boolean; items: typeof samples }> = [];
  function cluster(items: typeof samples, monthEnd: boolean) {
    const sorted = [...items].sort((a, b) => (monthEnd ? a.endDistance : a.day) - (monthEnd ? b.endDistance : b.day));
    sorted.forEach((item) => {
      const position = monthEnd ? item.endDistance : item.day;
      let best: (typeof clusters)[number] | undefined;
      let bestDistance = Infinity;
      clusters.filter((candidate) => candidate.monthEnd === monthEnd).forEach((candidate) => {
        const center = median(candidate.items.map((value) => (monthEnd ? value.endDistance : value.day)));
        const distance = Math.abs(position - center);
        if (distance <= CLUSTER_TOLERANCE_DAYS && distance < bestDistance) {
          best = candidate;
          bestDistance = distance;
        }
      });
      if (best) best.items.push(item);
      else clusters.push({ monthEnd, items: [item] });
    });
  }
  cluster(samples.filter((sample) => !(sample.day >= 25 || sample.endDistance <= 6)), false);
  cluster(samples.filter((sample) => sample.day >= 25 || sample.endDistance <= 6), true);
  return clusters;
}
export function buildHistory(receipts: Receipt[], now = new Date()) {
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1, 12);
  const start = addMonths(currentMonth, -HISTORY_MONTHS);
  const months: HistoryMonth[] = Array.from({ length: HISTORY_MONTHS }, (_, index) => {
    const month = addMonths(start, index);
    return {
      key: monthKey(month),
      label: MONTH_FORMATTER.format(month),
      shortLabel: SHORT_MONTH_FORMATTER.format(month).replace(" de ", "/"),
      start: month,
    };
  });
  const clients = new Map<string, { clientName: string; months: Array<Array<{ date: Date; amount: number }>> }>();
  sourceReceipts(receipts).forEach((receipt) => {
    const date = parseIsoDate(receipt.receiptDate);
    const clientName = canonicalReceiptClientName(receipt.clientHint || receipt.description);
    if (!date || !clientName || !Number.isFinite(receipt.amount) || receipt.amount <= 0) return;
    const monthIndex = months.findIndex((month) => month.key === monthKey(date));
    if (monthIndex < 0) return;
    const key = normalizeKey(clientName);
    const client = clients.get(key) ?? { clientName, months: Array.from({ length: HISTORY_MONTHS }, () => []) };
    client.months[monthIndex].push({ date, amount: receipt.amount });
    clients.set(key, client);
  });
  const slots: PaymentSlot[] = [];
  clients.forEach((client, clientKey) => {
    const monthlyDays = client.months.map(aggregateByDate);
    clusterClientSamples(monthlyDays).forEach((cluster, clusterIndex) => {
      const byMonth = new Map<number, ClusterSample>();
      cluster.items.forEach((item) => {
        const current = byMonth.get(item.monthIndex) ?? {
          monthIndex: item.monthIndex,
          amount: 0,
          day: item.day,
          endDistance: item.endDistance,
        };
        current.amount += item.amount;
        current.day = Math.round(median([current.day, item.day]));
        current.endDistance = Math.round(median([current.endDistance, item.endDistance]));
        byMonth.set(item.monthIndex, current);
      });
      const samples = [...byMonth.values()].sort((a, b) => a.monthIndex - b.monthIndex);
      if (samples.length < MIN_RECURRING_MONTHS) return;
      const positions = samples.map((sample) => (cluster.monthEnd ? sample.endDistance : sample.day));
      const spread = Math.max(...positions) - Math.min(...positions);
      if (spread > 7) return;
      const monthValues = Array(HISTORY_MONTHS).fill(0) as number[];
      const monthDays = Array(HISTORY_MONTHS).fill(0) as number[];
      samples.forEach((sample) => {
        monthValues[sample.monthIndex] = sample.amount;
        monthDays[sample.monthIndex] = sample.day;
      });
      slots.push({
        id: `${clientKey}|${cluster.monthEnd ? "end" : "day"}|${clusterIndex}`,
        clientKey,
        clientName: client.clientName,
        monthEnd: cluster.monthEnd,
        expected: median(samples.map((sample) => sample.amount)),
        nominalDay: Math.round(median(samples.map((sample) => sample.day))),
        endDistance: Math.round(median(samples.map((sample) => sample.endDistance))),
        activeMonths: samples.length,
        confidence: samples.length === 3 && spread <= 3 ? "Alta" : "Média",
        monthValues,
        monthDays,
      });
    });
  });
  return {
    months,
    slots,
    periodLabel: `${MONTH_FORMATTER.format(months[0].start)} a ${MONTH_FORMATTER.format(months[months.length - 1].start)}`,
  };
}
function projectedDate(slot: PaymentSlot, targetMonth: Date) {
  const nominal = slot.monthEnd
    ? addDays(endOfMonth(targetMonth), -slot.endDistance)
    : new Date(targetMonth.getFullYear(), targetMonth.getMonth(), Math.min(daysInMonth(targetMonth), Math.max(1, slot.nominalDay)), 12);
  return nextBusinessDay(nominal);
}
function buildActuals(receipts: Receipt[], weeks: ForecastWeek[]) {
  const byClientWeek = new Map<string, ActualSummary>();
  const first = weeks[0]?.start;
  const last = weeks[weeks.length - 1]?.end;
  if (!first || !last) return [];
  sourceReceipts(receipts).forEach((receipt) => {
    const date = parseIsoDate(receipt.receiptDate);
    const clientName = canonicalReceiptClientName(receipt.clientHint || receipt.description);
    if (!date || !clientName || receipt.amount <= 0 || date < first || date > last) return;
    const week = weeks.find((item) => isBetween(date, item.start, item.end));
    if (!week) return;
    const key = `${normalizeKey(clientName)}|${week.id}`;
    const current = byClientWeek.get(key) ?? {
      key,
      clientKey: normalizeKey(clientName),
      clientName,
      weekId: week.id,
      total: 0,
      dates: [],
    };
    current.total += receipt.amount;
    if (!current.dates.includes(receipt.receiptDate)) current.dates.push(receipt.receiptDate);
    current.dates.sort();
    byClientWeek.set(key, current);
  });
  return [...byClientWeek.values()].sort((left, right) =>
    (left.dates[0] ?? left.weekId).localeCompare(right.dates[0] ?? right.weekId),
  );
}
type ForecastCandidate = { slot: PaymentSlot; estimatedDate: Date; week: ForecastWeek };

function monthsCoveredByWeeks(weeks: ForecastWeek[]) {
  const first = weeks[0]?.start;
  const last = weeks[weeks.length - 1]?.end;
  if (!first || !last) return [];
  const result: Date[] = [];
  let cursor = new Date(first.getFullYear(), first.getMonth(), 1, 12);
  const finalMonth = monthKey(last);
  while (monthKey(cursor) <= finalMonth) {
    result.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  return result;
}

function buildForecastCandidates(history: ReturnType<typeof buildHistory>, weeks: ForecastWeek[]) {
  const projectionMonths = monthsCoveredByWeeks(weeks);
  return history.slots.flatMap((slot) => projectionMonths.flatMap((projectionMonth) => {
    const estimatedDate = projectedDate(slot, projectionMonth);
    const week = weeks.find((item) => isBetween(estimatedDate, item.start, item.end));
    return week ? [{ slot, estimatedDate, week }] : [];
  }));
}

function daysBetween(left: Date, right: Date) {
  return Math.round((left.getTime() - right.getTime()) / 86_400_000);
}

function candidateScore(candidate: ForecastCandidate, actual: ActualSummary) {
  const actualDate = parseIsoDate(actual.dates[0] ?? "");
  if (!actualDate) return Infinity;
  const dayDistance = Math.abs(daysBetween(actualDate, candidate.estimatedDate));
  if (dayDistance > 14) return Infinity;
  const valueDistance = candidate.slot.expected > 0
    ? Math.abs(actual.total - candidate.slot.expected) / candidate.slot.expected
    : 0;
  return dayDistance + Math.min(12, valueDistance * 7) - (candidate.week.id === actual.weekId ? 20 : 0);
}

export function buildRows(receipts: Receipt[], history: ReturnType<typeof buildHistory>, weeks: ForecastWeek[]) {
  const actuals = buildActuals(receipts, weeks);
  const candidates = buildForecastCandidates(history, weeks);
  const matchedCandidateIndexes = new Set<number>();
  const matchedActualKeys = new Set<string>();
  const rows: ForecastRow[] = [];

  actuals.forEach((actual) => {
    let bestIndex = -1;
    let bestScore = Infinity;
    candidates.forEach((candidate, index) => {
      if (matchedCandidateIndexes.has(index) || candidate.slot.clientKey !== actual.clientKey) return;
      const score = candidateScore(candidate, actual);
      if (score < bestScore) {
        bestIndex = index;
        bestScore = score;
      }
    });
    if (bestIndex < 0 || !Number.isFinite(bestScore)) return;

    const candidate = candidates[bestIndex];
    const actualWeek = weeks.find((week) => week.id === actual.weekId);
    if (!actualWeek) return;
    matchedCandidateIndexes.add(bestIndex);
    matchedActualKeys.add(actual.key);
    const sourceKey = `${candidate.slot.clientKey}|${candidate.week.id}`;
    rows.push({
      key: `${candidate.slot.id}|${candidate.week.id}|actual:${actual.key}`,
      sourceKey,
      clientKey: candidate.slot.clientKey,
      clientName: candidate.slot.clientName,
      weekId: actualWeek.id,
      weekLabel: actualWeek.label,
      weekStart: toIsoDate(actualWeek.start),
      weekEnd: toIsoDate(actualWeek.end),
      estimatedDate: toIsoDate(candidate.estimatedDate),
      displayValue: actual.total,
      expected: candidate.slot.expected,
      remaining: 0,
      status: "Recebido",
      activeMonths: candidate.slot.activeMonths,
      confidence: candidate.slot.confidence,
      historicalValues: candidate.slot.monthValues,
      historicalDays: candidate.slot.monthDays,
      actual,
    });
  });

  candidates.forEach((candidate, index) => {
    if (matchedCandidateIndexes.has(index)) return;
    const { slot, estimatedDate, week } = candidate;
    rows.push({
      key: `${slot.id}|${week.id}|${toIsoDate(estimatedDate)}`,
      sourceKey: `${slot.clientKey}|${week.id}`,
      clientKey: slot.clientKey,
      clientName: slot.clientName,
      weekId: week.id,
      weekLabel: week.label,
      weekStart: toIsoDate(week.start),
      weekEnd: toIsoDate(week.end),
      estimatedDate: toIsoDate(estimatedDate),
      displayValue: slot.expected,
      expected: slot.expected,
      remaining: slot.expected,
      status: "Previsto",
      activeMonths: slot.activeMonths,
      confidence: slot.confidence,
      historicalValues: slot.monthValues,
      historicalDays: slot.monthDays,
    });
  });

  actuals.forEach((actual) => {
    if (matchedActualKeys.has(actual.key)) return;
    const week = weeks.find((item) => item.id === actual.weekId);
    if (!week) return;
    rows.push({
      key: `actual|${actual.key}`,
      sourceKey: `actual|${actual.key}`,
      clientKey: actual.clientKey,
      clientName: actual.clientName,
      weekId: week.id,
      weekLabel: week.label,
      weekStart: toIsoDate(week.start),
      weekEnd: toIsoDate(week.end),
      estimatedDate: actual.dates[0] ?? week.id,
      displayValue: actual.total,
      expected: 0,
      remaining: 0,
      status: "Recebido",
      activeMonths: 0,
      confidence: "—",
      historicalValues: Array(HISTORY_MONTHS).fill(0) as number[],
      historicalDays: Array(HISTORY_MONTHS).fill(0) as number[],
      actual,
    });
  });
  return rows;
}

export function filterForecastRows(rows: ForecastRow[], filters: ForecastFilters) {
  return rows.filter((row) =>
    (filters.selectedWeek === "all" || row.weekId === filters.selectedWeek)
    && (filters.selectedClient === "all" || row.clientKey === filters.selectedClient)
    && (filters.selectedConfidence === "Todas" || row.confidence === filters.selectedConfidence)
    && (!filters.onlyPending || row.status !== "Recebido"),
  );
}

function applyAdjustments(rows: ForecastRow[], adjustments: ForecastManualAdjustment[], weeks: ForecastWeek[]) {
  const active = adjustments.filter((adjustment) => adjustment.active);
  const result: ForecastRow[] = [];
  rows.forEach((row) => {
    if (row.status === "Recebido") {
      result.push(row);
      return;
    }
    const rowAdjustments = active.filter((adjustment) => adjustment.source_key === row.sourceKey && adjustment.adjustment_type !== "manual_add");
    if (rowAdjustments.some((adjustment) => adjustment.adjustment_type === "exclude")) return;
    let adjusted = { ...row };
    rowAdjustments.forEach((adjustment) => {
      if (adjustment.adjustment_type === "move" && adjustment.target_week_id) {
        const week = weeks.find((item) => item.id === adjustment.target_week_id);
        if (week) {
          const originalDate = parseIsoDate(adjusted.estimatedDate);
          const weekdayOffset = originalDate ? Math.min(4, Math.max(0, (originalDate.getDay() + 6) % 7)) : 0;
          adjusted = {
            ...adjusted,
            key: `${adjusted.key}|move:${adjustment.id}`,
            weekId: week.id,
            weekLabel: week.label,
            weekStart: toIsoDate(week.start),
            weekEnd: toIsoDate(week.end),
            estimatedDate: toIsoDate(addDays(week.start, weekdayOffset)),
            manualNote: adjustment.note || "Adiado manualmente para outra semana.",
          };
        }
      }
      if (adjustment.adjustment_type === "confirm" && Number.isFinite(Number(adjustment.confirmed_value))) {
        const confirmed = Number(adjustment.confirmed_value ?? 0);
        adjusted = {
          ...adjusted,
          key: `${adjusted.key}|confirm:${adjustment.id}`,
          status: "Confirmado",
          displayValue: confirmed,
          remaining: confirmed,
          manualNote: adjustment.note || "Valor confirmado manualmente.",
        };
      }
    });
    result.push(adjusted);
  });

  active.filter((adjustment) => adjustment.adjustment_type === "manual_add").forEach((adjustment) => {
    const week = weeks.find((item) => item.id === adjustment.target_week_id);
    const value = Number(adjustment.manual_value ?? 0);
    if (!week || value <= 0) return;
    result.push({
      key: `manual|${adjustment.id}`,
      sourceKey: adjustment.source_key,
      clientKey: adjustment.client_key,
      clientName: adjustment.client_name,
      weekId: week.id,
      weekLabel: week.label,
      weekStart: toIsoDate(week.start),
      weekEnd: toIsoDate(week.end),
      estimatedDate: adjustment.manual_date || week.id,
      displayValue: value,
      expected: value,
      remaining: value,
      status: "Manual",
      activeMonths: 0,
      confidence: "—",
      historicalValues: Array(HISTORY_MONTHS).fill(0) as number[],
      historicalDays: Array(HISTORY_MONTHS).fill(0) as number[],
      manualNote: adjustment.note || "Previsão adicionada manualmente.",
      adjustmentId: adjustment.id,
    });
  });

  return result.sort((a, b) =>
    a.weekStart.localeCompare(b.weekStart)
    || Number(a.status === "Recebido") - Number(b.status === "Recebido")
    || b.displayValue - a.displayValue
    || a.clientName.localeCompare(b.clientName, "pt-BR"),
  );
}

function adjustmentLabel(adjustment: ForecastManualAdjustment) {
  if (adjustment.adjustment_type === "exclude") return "Removido da previsão";
  if (adjustment.adjustment_type === "move") return `Adiado para ${adjustment.target_week_id ? formatDate(adjustment.target_week_id) : "outra semana"}`;
  if (adjustment.adjustment_type === "confirm") return `Valor confirmado: ${currency.format(Number(adjustment.confirmed_value ?? 0))}`;
  return `Adicionado manualmente: ${currency.format(Number(adjustment.manual_value ?? 0))}`;
}

function ForecastView({ data }: { data: ImportState }) {
  const history = useMemo(() => buildHistory(data.receipts), [data.receipts]);
  const monthOptions = useMemo(() => {
    const now = new Date();
    const current = new Date(now.getFullYear(), now.getMonth(), 1, 12);
    return Array.from({ length: 12 }, (_, index) => addMonths(current, index));
  }, []);
  const [selectedMonthKey, setSelectedMonthKey] = useState(() => monthKey(monthOptions[0]));
  const [selectedWeek, setSelectedWeek] = useState("all");
  const [selectedClient, setSelectedClient] = useState("all");
  const [selectedConfidence, setSelectedConfidence] = useState<"Todas" | "Alta" | "Média">("Todas");
  const [onlyPending, setOnlyPending] = useState(false);
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [adjustments, setAdjustments] = useState<ForecastManualAdjustment[]>([]);
  const [adjustmentBusy, setAdjustmentBusy] = useState(false);
  const [adjustmentError, setAdjustmentError] = useState("");
  const [refreshAdjustments, setRefreshAdjustments] = useState(0);
  const [moveWeek, setMoveWeek] = useState("");
  const [confirmValue, setConfirmValue] = useState("");
  const [manualClient, setManualClient] = useState("");
  const [manualValue, setManualValue] = useState("");
  const [manualWeek, setManualWeek] = useState("");
  const [manualDate, setManualDate] = useState("");
  const [manualNote, setManualNote] = useState("");

  const targetMonth = monthOptions.find((month) => monthKey(month) === selectedMonthKey) ?? monthOptions[0];
  const weeks = useMemo(() => buildWeeks(targetMonth), [selectedMonthKey, targetMonth]);

  useEffect(() => {
    let cancelled = false;
    setAdjustmentError("");
    void listForecastAdjustments(selectedMonthKey)
      .then((items) => { if (!cancelled) setAdjustments(items); })
      .catch(() => { if (!cancelled) setAdjustmentError("Não foi possível carregar os ajustes compartilhados."); });
    return () => { cancelled = true; };
  }, [selectedMonthKey, refreshAdjustments]);

  const baseRows = useMemo(() => buildRows(data.receipts, history, weeks), [data.receipts, history, weeks]);
  const rows = useMemo(() => applyAdjustments(baseRows, adjustments, weeks), [baseRows, adjustments, weeks]);
  const preClientRows = useMemo(() => filterForecastRows(rows, {
    selectedWeek,
    selectedClient: "all",
    selectedConfidence,
    onlyPending,
  }), [rows, selectedWeek, selectedConfidence, onlyPending]);
  const clients = useMemo(() => {
    const map = new Map<string, string>();
    preClientRows.forEach((row) => map.set(row.clientKey, row.clientName));
    return [...map.entries()].map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [preClientRows]);
  const knownClients = useMemo(() => {
    const map = new Map<string, string>();
    sourceReceipts(data.receipts).forEach((receipt) => {
      const clientName = canonicalReceiptClientName(receipt.clientHint || receipt.description);
      if (clientName) map.set(normalizeKey(clientName), clientName);
    });
    history.slots.forEach((slot) => map.set(slot.clientKey, slot.clientName));
    rows.forEach((row) => map.set(row.clientKey, row.clientName));
    return [...map.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [data.receipts, history.slots, rows]);

  useEffect(() => {
    if (selectedClient !== "all" && !clients.some((client) => client.key === selectedClient)) setSelectedClient("all");
  }, [clients, selectedClient]);

  useEffect(() => {
    document.body.classList.toggle("forecast-only-pending-v16", onlyPending);
    return () => document.body.classList.remove("forecast-only-pending-v16");
  }, [onlyPending]);

  const filteredRows = useMemo(() => filterForecastRows(preClientRows, {
    selectedWeek: "all",
    selectedClient,
    selectedConfidence: "Todas",
    onlyPending: false,
  }), [preClientRows, selectedClient]);
  const pendingRows = filteredRows.filter((row) => row.status !== "Recebido");
  const receivedRows = filteredRows.filter((row) => row.actual);
  const pendingValue = pendingRows.reduce((sum, row) => sum + row.remaining, 0);
  const receivedValue = receivedRows.reduce((sum, row) => sum + (row.actual?.total ?? 0), 0);
  const predictedClients = new Set(pendingRows.map((row) => row.clientKey)).size;
  const weekly = weeks.map((week) => {
    const scoped = filterForecastRows(rows, {
      selectedWeek: week.id,
      selectedClient,
      selectedConfidence,
      onlyPending,
    });
    const pending = scoped.filter((row) => row.status !== "Recebido");
    const actual = scoped.filter((row) => row.actual);
    return {
      ...week,
      pending: pending.reduce((sum, row) => sum + row.remaining, 0),
      received: actual.reduce((sum, row) => sum + (row.actual?.total ?? 0), 0),
      predictedClients: new Set(pending.map((row) => row.clientKey)).size,
      receivedClients: new Set(actual.map((row) => row.clientKey)).size,
      names: [...new Set(pending.map((row) => row.clientName))].slice(0, 4),
    };
  });
  const selectedKeys = new Set(filteredRows.map((row) => row.clientKey));
  const chart = history.months.map((month, index) => ({
    month: month.shortLabel,
    amount: history.slots.filter((slot) => selectedKeys.has(slot.clientKey)).reduce((sum, slot) => sum + (slot.monthValues[index] ?? 0), 0),
  }));
  const detail = rows.find((row) => row.key === detailKey) ?? null;
  const activeAdjustmentCount = adjustments.filter((adjustment) => adjustment.active).length;

  async function saveAdjustment(adjustment: NewForecastManualAdjustment) {
    setAdjustmentBusy(true);
    setAdjustmentError("");
    try {
      await createForecastAdjustment(adjustment);
      setModal(null);
      setManualNote("");
      setRefreshAdjustments((value) => value + 1);
    } catch {
      setAdjustmentError("Não foi possível salvar o ajuste. Tente novamente.");
    } finally {
      setAdjustmentBusy(false);
    }
  }

  async function removeForecast(row: ForecastRow) {
    if (row.status === "Manual" && row.adjustmentId) {
      if (!window.confirm(`Remover a previsão manual de ${row.clientName}?`)) return;
      setAdjustmentBusy(true);
      try {
        await restoreForecastAdjustment(row.adjustmentId);
        setRefreshAdjustments((value) => value + 1);
      } finally {
        setAdjustmentBusy(false);
      }
      return;
    }
    if (!window.confirm(`Remover ${row.clientName} da previsão de ${MONTH_FORMATTER.format(targetMonth)}?`)) return;
    await saveAdjustment({
      month_key: selectedMonthKey,
      source_key: row.sourceKey,
      client_key: row.clientKey,
      client_name: row.clientName,
      adjustment_type: "exclude",
      original_week_id: row.weekId,
      target_week_id: null,
      confirmed_value: null,
      manual_value: null,
      manual_date: null,
      note: "Removido manualmente da previsão.",
    });
  }

  function openMove(row: ForecastRow) {
    setMoveWeek(row.weekId);
    setManualNote("");
    setModal({ type: "move", row });
  }
  function openConfirm(row: ForecastRow) {
    setConfirmValue(String(Math.round(row.remaining * 100) / 100).replace(".", ","));
    setManualNote("");
    setModal({ type: "confirm", row });
  }
  function openAdd() {
    setManualClient("");
    setManualValue("");
    setManualWeek(weeks[0]?.id ?? "");
    setManualDate(weeks[0]?.id ?? "");
    setManualNote("");
    setModal({ type: "add" });
  }
  function brazilianNumber(value: string) {
    const clean = value.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
    return Number(clean);
  }
  async function submitModal(event: FormEvent) {
    event.preventDefault();
    if (!modal) return;
    if (modal.type === "move") {
      if (!moveWeek || moveWeek === modal.row.weekId) {
        setAdjustmentError("Escolha uma semana diferente.");
        return;
      }
      await saveAdjustment({
        month_key: selectedMonthKey,
        source_key: modal.row.sourceKey,
        client_key: modal.row.clientKey,
        client_name: modal.row.clientName,
        adjustment_type: "move",
        original_week_id: modal.row.weekId,
        target_week_id: moveWeek,
        confirmed_value: null,
        manual_value: null,
        manual_date: null,
        note: manualNote || "Adiado manualmente para outra semana.",
      });
      return;
    }
    if (modal.type === "confirm") {
      const value = brazilianNumber(confirmValue);
      if (!Number.isFinite(value) || value <= 0) {
        setAdjustmentError("Informe um valor confirmado válido.");
        return;
      }
      await saveAdjustment({
        month_key: selectedMonthKey,
        source_key: modal.row.sourceKey,
        client_key: modal.row.clientKey,
        client_name: modal.row.clientName,
        adjustment_type: "confirm",
        original_week_id: modal.row.weekId,
        target_week_id: null,
        confirmed_value: value,
        manual_value: null,
        manual_date: null,
        note: manualNote || "Valor confirmado manualmente.",
      });
      return;
    }
    if (modal.type === "add") {
      const value = brazilianNumber(manualValue);
      if (!manualClient.trim() || !manualWeek || !Number.isFinite(value) || value <= 0) {
        setAdjustmentError("Informe cliente, semana e valor.");
        return;
      }
      const clientName = manualClient.trim();
      const clientKey = normalizeKey(clientName);
      await saveAdjustment({
        month_key: selectedMonthKey,
        source_key: `manual|${clientKey}|${Date.now()}`,
        client_key: clientKey,
        client_name: clientName,
        adjustment_type: "manual_add",
        original_week_id: null,
        target_week_id: manualWeek,
        confirmed_value: null,
        manual_value: value,
        manual_date: manualDate || manualWeek,
        note: manualNote || "Previsão adicionada manualmente.",
      });
    }
  }

  async function restore(adjustment: ForecastManualAdjustment) {
    setAdjustmentBusy(true);
    setAdjustmentError("");
    try {
      await restoreForecastAdjustment(adjustment.id);
      setRefreshAdjustments((value) => value + 1);
    } catch {
      setAdjustmentError("Não foi possível restaurar o ajuste.");
    } finally {
      setAdjustmentBusy(false);
    }
  }

  if (!data.receipts.length) {
    return <section className="receipt-forecast-page-v13"><div className="forecast-empty-v13"><CalendarClock size={42} /><span>PREVISÃO DE RECEBIMENTOS</span><h2>Importe a mesma planilha usada em Recebimentos.</h2></div></section>;
  }

  return (
    <section className="receipt-forecast-page-v13">
      <div className="forecast-heading-v13">
        <div><span>PREVISÃO SEMANAL</span><h2>Previsão de Recebimentos</h2><p>Histórico dos três meses completos de {history.periodLabel}. Os ajustes manuais são compartilhados e reaplicados automaticamente após cada nova importação.</p></div>
        <div className="forecast-heading-actions-v13">
          <button type="button" onClick={openAdd}><Plus size={16} />Adicionar previsão</button>
          <button type="button" onClick={() => setModal({ type: "manage" })}><SlidersHorizontal size={16} />Ajustes manuais <b>{activeAdjustmentCount}</b></button>
        </div>
      </div>

      {adjustmentError ? <div className="forecast-error-v13"><CircleAlert size={16} />{adjustmentError}</div> : null}

      <section className="forecast-filter-v13">
        <div className="forecast-filter-title-v13"><span>Filtros</span><small>Todo o painel usa o mesmo escopo</small></div>
        <label><span>Cliente</span><div><select value={selectedClient} onChange={(event: ChangeEvent<HTMLSelectElement>) => setSelectedClient(event.target.value)}><option value="all">Todos ({clients.length})</option>{clients.map((client) => <option key={client.key} value={client.key}>{client.name}</option>)}</select><ChevronDown size={15} /></div></label>
        <label><span>Mês previsto</span><div><select value={selectedMonthKey} onChange={(event: ChangeEvent<HTMLSelectElement>) => { setSelectedMonthKey(event.target.value); setSelectedWeek("all"); setSelectedClient("all"); }}>{monthOptions.map((month) => <option key={monthKey(month)} value={monthKey(month)}>{MONTH_FORMATTER.format(month)}</option>)}</select><ChevronDown size={15} /></div></label>
        <label><span>Semana</span><div><select value={selectedWeek} onChange={(event: ChangeEvent<HTMLSelectElement>) => { setSelectedWeek(event.target.value); setSelectedClient("all"); }}><option value="all">Todas as semanas</option>{weeks.map((week) => <option key={week.id} value={week.id}>{week.label}</option>)}</select><ChevronDown size={15} /></div></label>
        <label><span>Confiança</span><div><select value={selectedConfidence} onChange={(event: ChangeEvent<HTMLSelectElement>) => { setSelectedConfidence(event.target.value as "Todas" | "Alta" | "Média"); setSelectedClient("all"); }}><option value="Todas">Todas</option><option value="Alta">Alta</option><option value="Média">Média</option></select><ChevronDown size={15} /></div></label>
        <button type="button" className={`forecast-only-pending-button-v16${onlyPending ? " active" : ""}`} aria-pressed={onlyPending} onClick={() => setOnlyPending((value) => !value)}><Flag size={15} />Somente a receber</button>
        {(selectedClient !== "all" || selectedWeek !== "all" || selectedConfidence !== "Todas" || onlyPending) ? <button type="button" onClick={() => { setSelectedClient("all"); setSelectedWeek("all"); setSelectedConfidence("Todas"); setOnlyPending(false); }}>Limpar</button> : null}
      </section>

      <section className="forecast-kpis-v13">
        <article><span>A receber no período</span><strong>{currency.format(pendingValue)}</strong><small>{predictedClients} clientes ainda previstos</small></article>
        <article><span>Recebido no período</span><strong>{currency.format(receivedValue)}</strong><small>{new Set(receivedRows.map((row) => row.clientKey)).size} clientes com recebimento real</small></article>
      </section>

      <section className="forecast-main-v13">
        <article className="forecast-panel-v13"><div className="forecast-panel-head-v13"><div><h3>Comparativo dos últimos três meses</h3><p>Recebimentos reais dos clientes filtrados</p></div></div><div className="forecast-chart-v13"><ResponsiveContainer width="100%" height="100%"><BarChart data={chart} margin={{ top: 12, right: 8, left: 4, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#e8ebf2" vertical={false} /><XAxis dataKey="month" tickLine={false} axisLine={false} /><YAxis tickFormatter={(value: number | string) => compactCurrency.format(Number(value))} tickLine={false} axisLine={false} width={72} /><Tooltip formatter={(value: number | string) => currency.format(Number(value))} /><Bar dataKey="amount" name="Recebido" fill="#5d72f6" radius={[6, 6, 0, 0]} maxBarSize={56} /></BarChart></ResponsiveContainer></div></article>
        <article className="forecast-panel-v13"><div className="forecast-panel-head-v13"><div><h3>Semanas de {MONTH_FORMATTER.format(targetMonth)}</h3><p>A última semana continua no mês seguinte</p></div></div><div className="forecast-weeks-v13">{weekly.map((week) => <button key={week.id} type="button" className={selectedWeek === week.id ? "active" : ""} onClick={() => { setSelectedWeek(selectedWeek === week.id ? "all" : week.id); setSelectedClient("all"); }}><span>{week.label}</span><strong>A receber: {currency.format(week.pending)}</strong><em>Recebido: {currency.format(week.received)}</em><small>{week.predictedClients} previstos · {week.receivedClients} recebidos</small><i>{week.names.length ? week.names.join(" · ") : week.receivedClients ? "Sem previsão pendente · já recebido" : "Sem previsão recorrente"}</i></button>)}</div></article>
      </section>

      <article className="forecast-panel-v13">
        <div className="forecast-panel-head-v13"><div><h3>Clientes do período</h3><p>{filteredRows.length} registros no filtro atual</p></div></div>
        <div className="forecast-table-v13"><table><thead><tr><th>Cliente</th><th>Janela</th><th className="number">Valor</th><th>Situação</th><th>Presença histórica</th><th>Confiança</th><th>Ajustar</th></tr></thead><tbody>
          {filteredRows.map((row) => <tr key={row.key} onClick={() => setDetailKey(detailKey === row.key ? null : row.key)}>
            <td className="client"><strong>{row.clientName}</strong><span>{row.manualNote || (row.status === "Recebido" ? "Valor real lançado" : "Padrão de pagamento pelos últimos 3 meses")}</span></td>
            <td><strong>{formatDate(row.weekStart)} a {formatDate(row.weekEnd)}</strong></td>
            <td className="number"><strong>{currency.format(row.displayValue)}</strong></td>
            <td>{row.status === "Recebido" ? <span className="status received"><b><CheckCircle2 size={13} />Recebido</b><small>{row.actual?.dates.map(formatDate).join(", ")}</small></span> : row.status === "Parcial" ? <span className="status partial"><b>Pagou a menor</b><small>Recebido {currency.format(row.actual?.total ?? 0)} em {row.actual?.dates.map(formatDate).join(", ")}</small><small>Falta aproximadamente {currency.format(row.remaining)}</small></span> : row.status === "Confirmado" ? <span className="status confirmed"><b><BadgeCheck size={13} />Valor confirmado</b><small>{row.actual ? `Já recebido ${currency.format(row.actual.total)}` : "Aguardando recebimento"}</small></span> : row.status === "Manual" ? <span className="status manual"><b><Plus size={13} />Adicionado manualmente</b><small>Data: {formatDate(row.estimatedDate)}</small></span> : <span className="status forecast"><b>Previsto</b><small>Data provável: {formatDate(row.estimatedDate)}</small></span>}</td>
            <td>{row.activeMonths ? `${row.activeMonths}/3 meses` : row.status === "Manual" ? "Manual" : "Recebimento real"}</td>
            <td><span className={`confidence ${row.confidence === "Alta" ? "alta" : row.confidence === "Média" ? "media" : "neutral"}`}>{row.confidence}</span></td>
            <td onClick={(event) => event.stopPropagation()}>{row.status === "Recebido" ? <span className="no-action">—</span> : <div className="row-actions-v13">{row.status !== "Manual" ? <><button type="button" title="Adiar para outra semana" onClick={() => openMove(row)}><CalendarRange size={14} /></button><button type="button" title="Confirmar valor" onClick={() => openConfirm(row)}><BadgeCheck size={14} /></button></> : null}<button type="button" className="danger" title="Remover da previsão" onClick={() => void removeForecast(row)}><X size={14} /></button></div>}</td>
          </tr>)}
          {!filteredRows.length ? <tr><td colSpan={7} className="empty-row">Nenhum registro encontrado no período selecionado.</td></tr> : null}
        </tbody></table></div>
      </article>

      {detail ? <article className="forecast-panel-v13 forecast-detail-v13"><div className="forecast-panel-head-v13"><div><h3>{detail.clientName}</h3><p>Memória do padrão de pagamento.</p></div><button type="button" onClick={() => setDetailKey(null)}>Fechar</button></div><div className="forecast-basis-v13"><div>{history.months.map((month, index) => <span key={month.key}><small>{month.label}</small><b>{detail.historicalValues[index] ? currency.format(detail.historicalValues[index]) : "Sem recebimento neste padrão"}</b><em>{detail.historicalDays[index] ? `Dia ${detail.historicalDays[index]}` : "—"}</em></span>)}</div><aside><span>Valor histórico esperado</span><strong>{detail.expected ? currency.format(detail.expected) : detail.status === "Manual" ? currency.format(detail.displayValue) : "Recebimento real"}</strong><small>{detail.manualNote || (detail.expected ? `Data projetada: ${formatDate(detail.estimatedDate)}` : `Recebido em ${detail.actual?.dates.map(formatDate).join(", ")}`)}</small></aside></div></article> : null}

      <div className="forecast-note-v13"><CircleAlert size={17} /><span>Os ajustes manuais são compartilhados pelo Supabase e permanecem após novas importações. Eles valem somente para o mês selecionado e não alteram o histórico automático.</span></div>

      {modal ? createPortal(
        <div className="forecast-modal-backdrop-v13" onMouseDown={(event) => { if (event.currentTarget === event.target && !adjustmentBusy) setModal(null); }}>
          <div className="forecast-modal-v13">
            <div className="modal-head-v13"><div><span>AJUSTE MANUAL · {MONTH_FORMATTER.format(targetMonth)}</span><h3>{modal.type === "move" ? "Adiar para outra semana" : modal.type === "confirm" ? "Confirmar valor" : modal.type === "add" ? "Adicionar previsão" : "Ajustes manuais"}</h3></div><button type="button" onClick={() => setModal(null)}><X size={18} /></button></div>
            {modal.type === "manage" ? <div className="adjustments-list-v13">{adjustments.length ? adjustments.map((adjustment) => <article key={adjustment.id} className={!adjustment.active ? "inactive" : ""}><div><strong>{adjustment.client_name}</strong><span>{adjustmentLabel(adjustment)}</span>{adjustment.note ? <small>{adjustment.note}</small> : null}</div><div>{adjustment.active ? <button type="button" disabled={adjustmentBusy} onClick={() => void restore(adjustment)}><RotateCcw size={14} />Restaurar</button> : <span className="restored">Restaurado</span>}</div></article>) : <div className="modal-empty-v13">Nenhum ajuste manual neste mês.</div>}</div> : <form onSubmit={submitModal} className="modal-form-v13">
              {modal.type === "move" ? <><p><strong>{modal.row.clientName}</strong><br />Atual: {modal.row.weekLabel}</p><label><span>Nova semana</span><select value={moveWeek} onChange={(event) => setMoveWeek(event.target.value)}>{weeks.map((week) => <option key={week.id} value={week.id}>{week.label}</option>)}</select></label></> : null}
              {modal.type === "confirm" ? <><p><strong>{modal.row.clientName}</strong><br />Previsão automática: {currency.format(modal.row.remaining)}</p><label><span>Valor confirmado</span><input value={confirmValue} onChange={(event) => setConfirmValue(event.target.value)} placeholder="Ex.: 350.000,00" /></label></> : null}
              {modal.type === "add" ? <><label><span>Cliente</span><input list="forecast-client-list-v13" value={manualClient} onChange={(event) => setManualClient(event.target.value)} placeholder="Digite ou selecione o cliente" /><datalist id="forecast-client-list-v13">{knownClients.map((name) => <option key={name} value={name} />)}</datalist></label><label><span>Valor previsto</span><input value={manualValue} onChange={(event) => setManualValue(event.target.value)} placeholder="Ex.: 250.000,00" /></label><label><span>Semana</span><select value={manualWeek} onChange={(event) => { setManualWeek(event.target.value); if (!manualDate) setManualDate(event.target.value); }}>{weeks.map((week) => <option key={week.id} value={week.id}>{week.label}</option>)}</select></label><label><span>Data provável</span><input type="date" value={manualDate} onChange={(event) => setManualDate(event.target.value)} /></label></> : null}
              <label><span>Observação</span><textarea value={manualNote} onChange={(event) => setManualNote(event.target.value)} placeholder="Opcional" rows={3} /></label>
              <div className="modal-actions-v13"><button type="button" onClick={() => setModal(null)} disabled={adjustmentBusy}>Cancelar</button><button type="submit" className="primary" disabled={adjustmentBusy}>{adjustmentBusy ? "Salvando..." : "Salvar ajuste"}</button></div>
            </form>}
          </div>
        </div>, document.body,
      ) : null}

      <style jsx global>{`
        .receipt-forecast-active-v13 .content-area>:not(.receipt-forecast-page-v13){display:none!important}.receipt-forecast-page-v13{display:grid;gap:20px;color:#20263a}.forecast-heading-v13{display:flex;justify-content:space-between;gap:22px;align-items:flex-start}.forecast-heading-v13>div:first-child>span{display:block;color:#5d72f6;font-size:11px;font-weight:800;letter-spacing:.1em;margin-bottom:6px}.forecast-heading-v13 h2{margin:0;font-size:clamp(24px,2.2vw,34px)}.forecast-heading-v13 p{max-width:820px;margin:7px 0 0;color:#788198;line-height:1.55}.forecast-heading-actions-v13{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.forecast-heading-actions-v13 button{display:flex;align-items:center;gap:7px;height:40px;padding:0 13px;border:1px solid #dfe4ee;border-radius:10px;background:#fff;color:#46516a;font-size:11px;font-weight:800;cursor:pointer}.forecast-heading-actions-v13 button:first-child{border-color:#5d72f6;background:#5d72f6;color:#fff}.forecast-heading-actions-v13 b{display:inline-grid;min-width:18px;height:18px;place-items:center;border-radius:999px;background:#eef0ff;color:#5367df;font-size:9px}.forecast-error-v13{display:flex;gap:8px;align-items:center;padding:10px 13px;border:1px solid #f1c7c7;border-radius:10px;background:#fff5f5;color:#9e3535;font-size:11px}.forecast-filter-v13{display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap;padding:14px;border:1px solid #e3e7f0;border-radius:15px;background:#fff}.forecast-filter-title-v13{display:grid;min-width:170px;margin-right:auto}.forecast-filter-title-v13 span{font-size:12px;font-weight:800}.forecast-filter-title-v13 small{font-size:10px;color:#929aac}.forecast-filter-v13 label{display:grid;gap:5px}.forecast-filter-v13 label>span{font-size:9px;font-weight:800;color:#8b94a8;text-transform:uppercase}.forecast-filter-v13 label>div{display:flex;height:38px;align-items:center;gap:7px;padding:0 10px;border:1px solid #dfe4ee;border-radius:9px}.forecast-filter-v13 select{min-width:155px;border:0;outline:0;background:transparent;color:#374158;font-size:11px}.forecast-filter-v13>button,.forecast-detail-v13 button{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:38px;padding:0 12px;border:1px solid #dfe4ee;border-radius:9px;background:#fff;color:#616b82;font-size:11px;font-weight:800;cursor:pointer}.forecast-only-pending-button-v16.active{border-color:rgba(93,114,246,.52);background:#eef1ff;color:#5367df}.forecast-kpis-v13{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.forecast-kpis-v13 article{display:grid;min-height:116px;align-content:space-between;padding:16px;border:1px solid #e4e8f1;border-radius:15px;background:#fff}.forecast-kpis-v13 span{color:#737d92;font-size:10px;font-weight:800}.forecast-kpis-v13 strong{font-size:clamp(20px,2vw,27px)}.forecast-kpis-v13 small{color:#9aa2b3;font-size:9px}.forecast-main-v13{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(350px,.9fr);gap:16px}.forecast-panel-v13{overflow:hidden;border:1px solid #e4e8f1;border-radius:16px;background:#fff}.forecast-panel-head-v13{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:17px 19px 13px}.forecast-panel-head-v13 h3{margin:0;font-size:14px}.forecast-panel-head-v13 p{margin:4px 0 0;color:#9199aa;font-size:10px}.forecast-chart-v13{height:285px;padding:0 12px 12px}.forecast-weeks-v13{display:grid;max-height:310px;overflow:auto;border-top:1px solid #edf0f5}.forecast-weeks-v13 button{display:grid;gap:4px;padding:12px 15px;border:0;border-bottom:1px solid #edf0f5;background:#fff;text-align:left;cursor:pointer}.forecast-weeks-v13 button.active{background:#f3f5ff;box-shadow:inset 3px 0 #5d72f6}.forecast-weeks-v13 span{font-size:10px;font-weight:800}.forecast-weeks-v13 strong{font-size:13px}.forecast-weeks-v13 em{color:#16866f;font-size:10px;font-style:normal;font-weight:800}.forecast-weeks-v13 small,.forecast-weeks-v13 i{color:#929aac;font-size:9px;font-style:normal}.forecast-table-v13{overflow-x:auto;border-top:1px solid #edf0f5}.forecast-table-v13 table{width:100%;min-width:1120px;border-collapse:collapse}.forecast-table-v13 th,.forecast-table-v13 td{padding:12px 14px;border-bottom:1px solid #edf0f5;text-align:left;font-size:11px;vertical-align:top}.forecast-table-v13 th{background:#fafbfe;color:#7c869b;font-size:9px;text-transform:uppercase}.forecast-table-v13 th.number,.forecast-table-v13 td.number{text-align:right}.forecast-table-v13 tbody tr{cursor:pointer}.forecast-table-v13 tbody tr:hover{background:#f8f9ff}.forecast-table-v13 td.client{display:grid;min-width:250px;gap:3px}.forecast-table-v13 td.client span{color:#9aa2b3;font-size:9px}.status{display:grid;gap:2px}.status b{display:flex;align-items:center;gap:4px;font-size:10px}.status small{font-size:9px}.status.received b,.status.received small{color:#16866f}.status.partial b,.status.partial small{color:#9b6c08}.status.forecast b{color:#5367df}.status.forecast small{color:#8992a7}.status.confirmed b,.status.confirmed small{color:#2b6f65}.status.manual b,.status.manual small{color:#7a57b5}.confidence{display:inline-flex;padding:5px 8px;border-radius:999px;font-size:9px;font-weight:800}.confidence.alta{background:#e8f8f3;color:#16866f}.confidence.media{background:#eef0ff;color:#5367df}.confidence.neutral{background:#f1f2f5;color:#7c8392}.row-actions-v13{display:flex;gap:5px}.row-actions-v13 button{display:grid;width:30px;height:30px;place-items:center;border:1px solid #dfe4ee;border-radius:8px;background:#fff;color:#647089;cursor:pointer}.row-actions-v13 button:hover{border-color:#98a6f5;color:#5367df}.row-actions-v13 button.danger:hover{border-color:#e6a7a7;color:#b13c3c}.no-action{color:#b4bac8}.empty-row{padding:28px!important;text-align:center!important;color:#8d95a8!important}.forecast-basis-v13{display:grid;grid-template-columns:1fr 260px;gap:16px;padding:0 19px 18px}.forecast-basis-v13>div{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.forecast-basis-v13>div span,.forecast-basis-v13 aside{display:grid;gap:5px;padding:12px;border:1px solid #e6eaf2;border-radius:10px;background:#fbfcff}.forecast-basis-v13 small,.forecast-basis-v13 em{color:#8f98aa;font-size:9px;font-style:normal}.forecast-basis-v13 b,.forecast-basis-v13 strong{font-size:12px}.forecast-note-v13{display:flex;gap:9px;align-items:flex-start;padding:13px 15px;border:1px solid #dfe4f1;border-radius:12px;background:#f8f9fd;color:#667087}.forecast-note-v13 span{font-size:10px;line-height:1.5}.forecast-empty-v13{display:grid;min-height:430px;place-items:center;align-content:center;gap:10px;border:1px dashed #cfd6e6;border-radius:18px;background:#fff;color:#5d72f6;text-align:center}.forecast-modal-backdrop-v13{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:20px;background:rgba(24,31,49,.38);backdrop-filter:blur(2px)}.forecast-modal-v13{width:min(620px,100%);max-height:min(760px,90vh);overflow:auto;border:1px solid #dfe4ee;border-radius:18px;background:#fff;box-shadow:0 24px 70px rgba(27,35,58,.22)}.modal-head-v13{display:flex;justify-content:space-between;gap:15px;align-items:flex-start;padding:20px;border-bottom:1px solid #edf0f5}.modal-head-v13 span{color:#6879e7;font-size:9px;font-weight:800;letter-spacing:.08em}.modal-head-v13 h3{margin:5px 0 0;font-size:19px}.modal-head-v13>button{display:grid;width:34px;height:34px;place-items:center;border:1px solid #e2e6ef;border-radius:9px;background:#fff;color:#717b91;cursor:pointer}.modal-form-v13{display:grid;gap:14px;padding:20px}.modal-form-v13 p{margin:0;padding:12px;border-radius:10px;background:#f7f8fc;color:#5e687d;font-size:11px;line-height:1.5}.modal-form-v13 label{display:grid;gap:6px}.modal-form-v13 label>span{color:#747e93;font-size:9px;font-weight:800;text-transform:uppercase}.modal-form-v13 input,.modal-form-v13 select,.modal-form-v13 textarea{width:100%;border:1px solid #dfe4ee;border-radius:9px;padding:10px 11px;background:#fff;color:#35405a;font:inherit;font-size:12px;outline:none}.modal-form-v13 input:focus,.modal-form-v13 select:focus,.modal-form-v13 textarea{border-color:#8291ef;box-shadow:0 0 0 3px rgba(93,114,246,.09)}.modal-actions-v13{display:flex;justify-content:flex-end;gap:8px;padding-top:4px}.modal-actions-v13 button{height:39px;padding:0 14px;border:1px solid #dfe4ee;border-radius:9px;background:#fff;color:#5f6980;font-size:11px;font-weight:800;cursor:pointer}.modal-actions-v13 button.primary{border-color:#5d72f6;background:#5d72f6;color:#fff}.adjustments-list-v13{display:grid;padding:10px 20px 20px}.adjustments-list-v13 article{display:flex;justify-content:space-between;gap:15px;align-items:center;padding:13px 0;border-bottom:1px solid #edf0f5}.adjustments-list-v13 article.inactive{opacity:.48}.adjustments-list-v13 article>div:first-child{display:grid;gap:3px}.adjustments-list-v13 strong{font-size:11px}.adjustments-list-v13 span{color:#59647b;font-size:10px}.adjustments-list-v13 small{color:#939aac;font-size:9px}.adjustments-list-v13 button{display:flex;align-items:center;gap:5px;height:32px;padding:0 9px;border:1px solid #dfe4ee;border-radius:8px;background:#fff;color:#59647b;font-size:9px;font-weight:800;cursor:pointer}.adjustments-list-v13 .restored{color:#8f97a7;font-size:9px}.modal-empty-v13{padding:32px 0;text-align:center;color:#8b94a7;font-size:11px}@media(max-width:1100px){.forecast-main-v13{grid-template-columns:1fr}}@media(max-width:760px){.forecast-heading-v13{display:grid}.forecast-heading-actions-v13{justify-content:flex-start}.forecast-kpis-v13{grid-template-columns:1fr}.forecast-filter-v13 label{width:100%}.forecast-filter-v13 label>div,.forecast-filter-v13 select{width:100%}.forecast-basis-v13{grid-template-columns:1fr}.forecast-basis-v13>div{grid-template-columns:1fr}}
      `}</style>
    </section>
  );
}

export default function ReceiptForecastEnhancerV13() {
  const [data, setData] = useState<ImportState>(EMPTY_STATE);
  const [active, setActive] = useState(false);
  const [navTarget, setNavTarget] = useState<HTMLElement | null>(null);
  const [contentTarget, setContentTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let mounted = true;
    const onData = (event: Event) => {
      const detail = (event as CustomEvent<ImportState>).detail;
      if (detail) setData(detail);
    };
    const onClear = () => setData(EMPTY_STATE);
    void loadAnalysisState().then((stored) => { if (mounted && stored) setData(stored); });
    window.addEventListener(ANALYSIS_DATA_EVENT, onData);
    window.addEventListener(OFFLINE_DATA_CLEARED_EVENT, onClear);
    return () => {
      mounted = false;
      window.removeEventListener(ANALYSIS_DATA_EVENT, onData);
      window.removeEventListener(OFFLINE_DATA_CLEARED_EVENT, onClear);
    };
  }, []);

  useEffect(() => {
    const sync = () => {
      const nav = document.querySelector<HTMLElement>("aside.sidebar nav");
      if (nav) {
        let mount = document.getElementById("receipt-forecast-nav-v13");
        if (!mount) {
          mount = document.createElement("span");
          mount.id = "receipt-forecast-nav-v13";
          mount.style.display = "contents";
          const receiptButton = [...nav.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === "Recebimentos");
          if (receiptButton) receiptButton.after(mount);
          else nav.append(mount);
        }
        setNavTarget(mount);
      }
      setContentTarget(document.querySelector<HTMLElement>(".content-area"));
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      document.getElementById("receipt-forecast-nav-v13")?.remove();
    };
  }, []);

  useEffect(() => {
    const handle = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button") : null;
      if (!target || target.dataset.forecastNavV13 === "true") return;
      if (target.closest("aside.sidebar nav") || target.textContent?.includes("Atualizar bases")) setActive(false);
    };
    document.addEventListener("click", handle, true);
    return () => document.removeEventListener("click", handle, true);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("receipt-forecast-active-v13", active);
    if (active) {
      const title = document.querySelector<HTMLElement>(".topbar-title h1");
      if (title) title.textContent = "Previsão de Recebimentos";
    }
    return () => document.body.classList.remove("receipt-forecast-active-v13");
  }, [active]);

  return <>{navTarget ? createPortal(<button type="button" data-forecast-nav-v13="true" className={active ? "active" : ""} onClick={() => { setActive(true); document.querySelector<HTMLButtonElement>(".mobile-close")?.click(); }}><CalendarClock size={19} />Previsão</button>, navTarget) : null}{active && contentTarget ? createPortal(<ForecastView data={data} />, contentTarget) : null}</>;
}
