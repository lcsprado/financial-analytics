"use client";

import { useEffect, useRef, useState } from "react";
import { ANALYSIS_DATA_EVENT, loadAnalysisState } from "@/lib/offlineStorage";
import { canonicalReceiptClientName } from "@/lib/receiptClientNames";
import type { ImportState, Receipt } from "@/lib/types";

const HISTORY_MONTHS = 3;
const MIN_RECURRING_MONTHS = 2;
const CLUSTER_TOLERANCE_DAYS = 4;
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type DayAggregate = { date: Date; amount: number; day: number; endDistance: number };
type ClusterSample = { monthIndex: number; amount: number; day: number; endDistance: number };
type PaymentSlot = {
  clientKey: string;
  clientName: string;
  monthEnd: boolean;
  expected: number;
  nominalDay: number;
  endDistance: number;
  activeMonths: number;
  confidence: "Alta" | "Média";
};
type ForecastWeek = { id: string; start: Date; end: Date };
type SpillRow = PaymentSlot & { estimatedDate: Date; week: ForecastWeek };

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
function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function parseIsoDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return Number.isNaN(date.getTime()) ? null : date;
}
function formatDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR").format(date);
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
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}
function sourceReceipts(receipts: Receipt[]) {
  const real = receipts.filter((receipt) => !receipt.id.startsWith("demo-receipt-") && receipt.sourceSheet !== "DEMONSTRAÇÃO");
  return real.length ? real : receipts;
}
function nextBusinessDay(date: Date) {
  let result = new Date(date);
  while (result.getDay() === 0 || result.getDay() === 6) result = addDays(result, 1);
  return result;
}
function buildWeeks(month: Date): ForecastWeek[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  let monday = addDays(first, (8 - first.getDay()) % 7);
  const weeks: ForecastWeek[] = [];
  while (monday.getMonth() === month.getMonth() && monday.getFullYear() === month.getFullYear()) {
    weeks.push({ id: toIsoDate(monday), start: monday, end: addDays(monday, 4) });
    monday = addDays(monday, 7);
  }
  return weeks;
}
function aggregateByDate(entries: Array<{ date: Date; amount: number }>) {
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
function buildHistory(receipts: Receipt[]) {
  const now = new Date();
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1, 12);
  const start = addMonths(currentMonth, -HISTORY_MONTHS);
  const months = Array.from({ length: HISTORY_MONTHS }, (_, index) => addMonths(start, index));
  const clients = new Map<string, { clientName: string; months: Array<Array<{ date: Date; amount: number }>> }>();

  sourceReceipts(receipts).forEach((receipt) => {
    const date = parseIsoDate(receipt.receiptDate);
    const clientName = canonicalReceiptClientName(receipt.clientHint || receipt.description);
    if (!date || !clientName || !Number.isFinite(receipt.amount) || receipt.amount <= 0) return;
    const monthIndex = months.findIndex((month) => monthKey(month) === monthKey(date));
    if (monthIndex < 0) return;
    const clientKey = normalizeKey(clientName);
    const client = clients.get(clientKey) ?? { clientName, months: Array.from({ length: HISTORY_MONTHS }, () => []) };
    client.months[monthIndex].push({ date, amount: receipt.amount });
    clients.set(clientKey, client);
  });

  const slots: PaymentSlot[] = [];
  clients.forEach((client, clientKey) => {
    const monthlyDays = client.months.map(aggregateByDate);
    clusterClientSamples(monthlyDays).forEach((cluster) => {
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
      slots.push({
        clientKey,
        clientName: client.clientName,
        monthEnd: cluster.monthEnd,
        expected: median(samples.map((sample) => sample.amount)),
        nominalDay: Math.round(median(samples.map((sample) => sample.day))),
        endDistance: Math.round(median(samples.map((sample) => sample.endDistance))),
        activeMonths: samples.length,
        confidence: samples.length === 3 && spread <= 3 ? "Alta" : "Média",
      });
    });
  });
  return slots;
}
function projectedDate(slot: PaymentSlot, targetMonth: Date) {
  const nominal = slot.monthEnd
    ? addDays(endOfMonth(targetMonth), -slot.endDistance)
    : new Date(targetMonth.getFullYear(), targetMonth.getMonth(), Math.min(daysInMonth(targetMonth), Math.max(1, slot.nominalDay)), 12);
  return nextBusinessDay(nominal);
}
function spillRows(receipts: Receipt[], selectedMonthKey: string) {
  const match = selectedMonthKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) return [] as SpillRow[];
  const targetMonth = new Date(Number(match[1]), Number(match[2]) - 1, 1, 12);
  const weeks = buildWeeks(targetMonth);
  const lastWeek = weeks[weeks.length - 1];
  if (!lastWeek || monthKey(lastWeek.end) === monthKey(targetMonth)) return [] as SpillRow[];

  const actualClients = new Set<string>();
  sourceReceipts(receipts).forEach((receipt) => {
    const date = parseIsoDate(receipt.receiptDate);
    const clientName = canonicalReceiptClientName(receipt.clientHint || receipt.description);
    if (date && clientName && receipt.amount > 0 && isBetween(date, lastWeek.start, lastWeek.end)) {
      actualClients.add(normalizeKey(clientName));
    }
  });

  const nextMonth = addMonths(targetMonth, 1);
  return buildHistory(receipts)
    .map((slot) => ({ ...slot, estimatedDate: projectedDate(slot, nextMonth), week: lastWeek }))
    .filter((row) => isBetween(row.estimatedDate, lastWeek.start, lastWeek.end))
    .filter((row) => !actualClients.has(row.clientKey));
}
function findFilterSelect(label: string) {
  const wanted = normalizeKey(label);
  return [...document.querySelectorAll<HTMLLabelElement>(".forecast-filter-v13 label")]
    .find((item) => normalizeKey(item.querySelector(":scope > span")?.textContent ?? "") === wanted)
    ?.querySelector<HTMLSelectElement>("select") ?? null;
}
function parseCurrency(value: string) {
  const match = value.match(/R\$\s*-?[\d.]+,\d{2}/);
  if (!match) return 0;
  const number = Number(match[0].replace(/R\$/g, "").replace(/\s/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(number) ? number : 0;
}
function patchMoney(element: HTMLElement | null, delta: number, prefix = "") {
  if (!element) return;
  const current = element.textContent?.trim() ?? "";
  if (!element.dataset.fullWeekPatchedV24 || current !== element.dataset.fullWeekPatchedV24) {
    element.dataset.fullWeekBaseV24 = current;
    element.dataset.fullWeekBaseValueV24 = String(parseCurrency(current));
  }
  const base = Number(element.dataset.fullWeekBaseValueV24 || 0);
  const patched = `${prefix}${BRL.format(base + delta)}`;
  element.textContent = patched;
  element.dataset.fullWeekPatchedV24 = patched;
}
function patchCountText(element: HTMLElement | null, delta: number) {
  if (!element) return;
  const current = element.textContent?.trim() ?? "";
  if (!element.dataset.fullWeekCountPatchedV24 || current !== element.dataset.fullWeekCountPatchedV24) {
    element.dataset.fullWeekCountBaseV24 = current;
    element.dataset.fullWeekCountBaseNumberV24 = String(Number(current.match(/\d+/)?.[0] || 0));
  }
  const base = Number(element.dataset.fullWeekCountBaseNumberV24 || 0);
  const patched = current.includes("registros") ? `${base + delta} registros no filtro atual` : current;
  if (patched !== current) element.textContent = patched;
  element.dataset.fullWeekCountPatchedV24 = patched;
}
function restorePatchedText() {
  document.querySelectorAll<HTMLElement>("[data-full-week-base-v24]").forEach((element) => {
    if (element.dataset.fullWeekBaseV24 !== undefined) element.textContent = element.dataset.fullWeekBaseV24;
    delete element.dataset.fullWeekBaseV24;
    delete element.dataset.fullWeekBaseValueV24;
    delete element.dataset.fullWeekPatchedV24;
  });
  document.querySelectorAll<HTMLElement>("[data-full-week-count-base-v24]").forEach((element) => {
    if (element.dataset.fullWeekCountBaseV24 !== undefined) element.textContent = element.dataset.fullWeekCountBaseV24;
    delete element.dataset.fullWeekCountBaseV24;
    delete element.dataset.fullWeekCountBaseNumberV24;
    delete element.dataset.fullWeekCountPatchedV24;
  });
  document.querySelectorAll("tr[data-full-week-spillover-v24='true']").forEach((row) => row.remove());
}
function addCell(row: HTMLTableRowElement, className = "") {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  row.append(cell);
  return cell;
}

export default function ReceiptForecastFullWeekSpilloverV24() {
  const [data, setData] = useState<ImportState>({ invoices: [], receipts: [] });
  const frame = useRef<number | null>(null);
  const applying = useRef(false);

  useEffect(() => {
    let active = true;
    void loadAnalysisState().then((stored) => { if (active && stored) setData(stored); });
    const onData = (event: Event) => {
      const detail = (event as CustomEvent<ImportState>).detail;
      if (detail) setData(detail);
    };
    window.addEventListener(ANALYSIS_DATA_EVENT, onData);
    return () => {
      active = false;
      window.removeEventListener(ANALYSIS_DATA_EVENT, onData);
    };
  }, []);

  useEffect(() => {
    const apply = () => {
      if (applying.current || !document.body.classList.contains("receipt-forecast-active-v13")) return;
      applying.current = true;
      try {
        document.querySelectorAll("tr[data-full-week-spillover-v24='true']").forEach((row) => row.remove());

        const monthSelect = findFilterSelect("Mês previsto");
        const weekSelect = findFilterSelect("Semana");
        const clientSelect = findFilterSelect("Cliente");
        const confidenceSelect = findFilterSelect("Confiança");
        if (!monthSelect || !weekSelect || !clientSelect || !confidenceSelect) return;

        const allSpill = spillRows(data.receipts, monthSelect.value);
        const monthMatch = monthSelect.value.match(/^(\d{4})-(\d{2})$/);
        if (!monthMatch) return;
        const targetMonth = new Date(Number(monthMatch[1]), Number(monthMatch[2]) - 1, 1, 12);
        const weeks = buildWeeks(targetMonth);
        const lastWeek = weeks[weeks.length - 1];
        if (!lastWeek) return;

        const selectedClient = clientSelect.value;
        const selectedConfidence = confidenceSelect.value;
        const selectedWeek = weekSelect.value;
        const kpis = [...document.querySelectorAll<HTMLElement>(".forecast-kpis-v13 article")];
        const activeKpi = kpis.findIndex((item) => item.classList.contains("active"));
        const receivedScope = activeKpi === 1;
        const highScope = activeKpi === 2;

        const byClientAndConfidence = allSpill.filter((row) =>
          (selectedClient === "all" || row.clientKey === selectedClient)
          && (selectedConfidence === "Todas" || row.confidence === selectedConfidence),
        );
        const weekApplicable = selectedWeek === "all" || selectedWeek === lastWeek.id;
        const tableSpill = weekApplicable && !receivedScope
          ? byClientAndConfidence.filter((row) => !highScope || row.confidence === "Alta")
          : [];
        const weekCardSpill = byClientAndConfidence;
        const periodDelta = tableSpill.reduce((sum, row) => sum + row.expected, 0);
        const highDelta = tableSpill.filter((row) => row.confidence === "Alta").reduce((sum, row) => sum + row.expected, 0);
        const weekDelta = weekCardSpill.reduce((sum, row) => sum + row.expected, 0);

        patchMoney(kpis[0]?.querySelector<HTMLElement>("strong") ?? null, periodDelta);
        patchMoney(kpis[2]?.querySelector<HTMLElement>("strong") ?? null, highDelta);

        const weekButton = [...document.querySelectorAll<HTMLButtonElement>(".forecast-weeks-v13 button")]
          .find((button) => button.querySelector("span")?.textContent?.includes(formatDate(lastWeek.start)));
        patchMoney(weekButton?.querySelector<HTMLElement>("strong") ?? null, weekDelta, "A receber: ");

        const table = document.querySelector<HTMLTableElement>(".forecast-table-v13 table");
        const tbody = table?.querySelector("tbody");
        if (tbody) {
          tableSpill.sort((a, b) => b.expected - a.expected || a.clientName.localeCompare(b.clientName, "pt-BR")).forEach((item) => {
            const row = document.createElement("tr");
            row.dataset.fullWeekSpilloverV24 = "true";
            row.dataset.fullWeekClientKeyV24 = item.clientKey;

            const client = addCell(row, "client");
            const strong = document.createElement("strong");
            strong.textContent = item.clientName;
            const detail = document.createElement("span");
            detail.textContent = "Padrão projetado para o início do mês seguinte";
            client.append(strong, detail);

            const windowCell = addCell(row);
            const windowStrong = document.createElement("strong");
            windowStrong.textContent = `${formatDate(item.week.start)} a ${formatDate(item.week.end)}`;
            windowCell.append(windowStrong);

            const value = addCell(row, "number");
            const valueStrong = document.createElement("strong");
            valueStrong.textContent = BRL.format(item.expected);
            value.append(valueStrong);

            const statusCell = addCell(row);
            const status = document.createElement("span");
            status.className = "status forecast";
            const statusTitle = document.createElement("b");
            statusTitle.textContent = "Previsto";
            const statusDetail = document.createElement("small");
            statusDetail.textContent = `Data provável: ${formatDate(item.estimatedDate)}`;
            status.append(statusTitle, statusDetail);
            statusCell.append(status);

            addCell(row).textContent = `${item.activeMonths}/3 meses`;
            const confidence = addCell(row);
            const badge = document.createElement("span");
            badge.className = `confidence ${item.confidence === "Alta" ? "alta" : "media"}`;
            badge.textContent = item.confidence;
            confidence.append(badge);
            addCell(row).innerHTML = '<span class="no-action">—</span>';
            tbody.append(row);
          });
        }

        const clientsPanel = [...document.querySelectorAll<HTMLElement>(".forecast-panel-v13")]
          .find((panel) => normalizeKey(panel.querySelector("h3")?.textContent ?? "") === "CLIENTES DO PERIODO");
        patchCountText(clientsPanel?.querySelector<HTMLElement>(".forecast-panel-head-v13 p") ?? null, tableSpill.length);
      } finally {
        window.setTimeout(() => { applying.current = false; }, 0);
      }
    };

    const schedule = () => {
      if (frame.current !== null) return;
      frame.current = window.requestAnimationFrame(() => {
        frame.current = null;
        apply();
      });
    };

    schedule();
    const target = document.querySelector<HTMLElement>(".content-area") || document.body;
    const observer = new MutationObserver(schedule);
    observer.observe(target, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class"] });
    document.addEventListener("change", schedule, true);
    document.addEventListener("click", schedule, true);

    return () => {
      observer.disconnect();
      document.removeEventListener("change", schedule, true);
      document.removeEventListener("click", schedule, true);
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
      restorePatchedText();
    };
  }, [data]);

  return null;
}
