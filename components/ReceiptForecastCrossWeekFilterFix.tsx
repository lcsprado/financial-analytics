"use client";

import { useEffect, useRef, useState } from "react";
import { normalizeReceiptClientIdentities } from "@/lib/receiptClientIdentity";
import {
  listReceiptClientLinks,
  RECEIPT_CLIENT_LINKS_EVENT,
} from "@/lib/receiptClientLinks";
import { canonicalReceiptClientName } from "@/lib/receiptClientNames";
import {
  ANALYSIS_DATA_EVENT,
  loadAnalysisState,
  OFFLINE_DATA_CLEARED_EVENT,
} from "@/lib/offlineStorage";
import type { ImportState } from "@/lib/types";

const EMPTY_STATE: ImportState = { invoices: [], receipts: [] };
const MATCH_WINDOW_DAYS = 14;
const PAID_TOLERANCE_RATIO = 0.05;
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type VisiblePrediction = {
  row: HTMLTableRowElement;
  cells: NodeListOf<HTMLTableCellElement>;
  clientKey: string;
  weekStart: string;
  predictedDate: string;
  expected: number;
};

type ActualCandidate = {
  key: string;
  clientKey: string;
  weekId: string;
  total: number;
  dates: string[];
};

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function parseIso(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function brDates(value: string) {
  return [...value.matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)]
    .map((match) => `${match[3]}-${match[2]}-${match[1]}`);
}

function numericCurrency(value: string) {
  const match = value.match(/R\$\s*-?[\d.]+,\d{2}/i);
  if (!match) return 0;
  const parsed = Number(
    match[0]
      .replace(/R\$/gi, "")
      .replace(/\s/g, "")
      .replace(/\./g, "")
      .replace(",", "."),
  );
  return Number.isFinite(parsed) ? parsed : 0;
}

function daysBetween(left: Date, right: Date) {
  return Math.round((left.getTime() - right.getTime()) / 86_400_000);
}

function currentMonthKey() {
  const selects = document.querySelectorAll<HTMLSelectElement>(".forecast-filter-v13 select");
  return selects[1]?.value || "";
}

function currentWeekFilter() {
  const selects = document.querySelectorAll<HTMLSelectElement>(".forecast-filter-v13 select");
  return selects[2]?.value || "all";
}

function actualWeekId(actualDate: string) {
  const date = parseIso(actualDate);
  if (!date) return "";
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + mondayOffset);
  return toIso(monday);
}

function readPrediction(row: HTMLTableRowElement): VisiblePrediction | null {
  if (row.style.display === "none") return null;
  const cells = row.querySelectorAll<HTMLTableCellElement>("td");
  if (cells.length < 7) return null;

  const clientName = cells[0].querySelector("strong")?.textContent?.trim() || "";
  const clientKey = normalizeKey(clientName);
  if (!clientKey) return null;

  const statusText = cells[3].textContent || "";
  const statusTitle = cells[3].querySelector(".status b")?.textContent?.trim() || "";
  if (!statusTitle.includes("Previsto")) return null;
  if (statusTitle.includes("Adicionado manualmente") || statusTitle.includes("Confirmado")) return null;
  if (row.dataset.adaptiveMatched === "true") return null;

  const weekDates = brDates(cells[1].textContent || "");
  const weekStart = weekDates[0] || "";
  if (!weekStart) return null;

  const probableDates = statusText.includes("Data provável") ? brDates(statusText) : [];
  const predictedDate = probableDates[0] || weekStart;
  const expected = Number(row.dataset.adaptiveExpected || 0) || numericCurrency(cells[2].textContent || "");
  if (!expected) return null;

  return { row, cells, clientKey, weekStart, predictedDate, expected };
}

function buildActualCandidates(data: ImportState, monthKey: string) {
  const monthStart = parseIso(`${monthKey}-01`);
  if (!monthStart) return [] as ActualCandidate[];
  const rangeEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 7, 12);
  const byClientWeek = new Map<string, ActualCandidate>();

  data.receipts.forEach((receipt) => {
    const date = parseIso(receipt.receiptDate);
    if (!date || date < monthStart || date > rangeEnd || !Number.isFinite(receipt.amount) || receipt.amount <= 0) return;

    const clientName = canonicalReceiptClientName(receipt.clientHint || receipt.description);
    const clientKey = normalizeKey(clientName);
    if (!clientKey) return;

    const weekId = actualWeekId(receipt.receiptDate);
    if (!weekId) return;
    const key = `${clientKey}|${weekId}`;
    const current = byClientWeek.get(key) ?? {
      key,
      clientKey,
      weekId,
      total: 0,
      dates: [],
    };
    current.total += receipt.amount;
    if (!current.dates.includes(receipt.receiptDate)) current.dates.push(receipt.receiptDate);
    current.dates.sort();
    byClientWeek.set(key, current);
  });

  return [...byClientWeek.values()];
}

function renderPartial(prediction: VisiblePrediction, actual: ActualCandidate, remaining: number) {
  const actualDate = actual.dates[0];
  const predicted = parseIso(prediction.predictedDate);
  const received = parseIso(actualDate);
  const early = Boolean(predicted && received && received < predicted);
  const late = Boolean(predicted && received && received > predicted);
  const title = early ? "Parcial antecipado" : late ? "Parcial com atraso" : "Parcial";

  prediction.row.dataset.adaptiveExpected = String(prediction.expected);
  prediction.row.dataset.adaptiveActualValue = String(actual.total);
  prediction.row.dataset.adaptiveRemaining = String(remaining);
  prediction.row.dataset.adaptiveActualDates = actual.dates.join(",");
  prediction.row.dataset.adaptiveActualWeek = actual.weekId;
  prediction.row.dataset.adaptivePredictedDate = prediction.predictedDate;
  prediction.row.dataset.adaptiveOutcome = early ? "partial_early" : late ? "partial_late" : "partial_on_time";
  prediction.row.dataset.adaptiveMatched = "true";
  prediction.row.dataset.crossWeekFilterFix = actual.key;

  const value = prediction.cells[2].querySelector("strong");
  if (value) value.textContent = currency.format(remaining);

  prediction.cells[3].innerHTML = "";
  const wrapper = document.createElement("span");
  wrapper.className = "status partial";
  const bold = document.createElement("b");
  bold.textContent = title;
  const detail = document.createElement("small");
  detail.textContent = `${currency.format(actual.total)} em ${actual.dates.map((date) => parseIso(date)?.toLocaleDateString("pt-BR") || date).join(", ")}`;
  const rest = document.createElement("small");
  rest.textContent = `Ainda previsto: ${currency.format(remaining)}`;
  wrapper.append(bold, detail, rest);
  prediction.cells[3].append(wrapper);
}

function consumeFullCrossWeekPayment(prediction: VisiblePrediction, actual: ActualCandidate) {
  const actualDate = actual.dates[0];
  const predicted = parseIso(prediction.predictedDate);
  const received = parseIso(actualDate);
  const outcome = predicted && received && received < predicted
    ? "received_early"
    : predicted && received && received > predicted
      ? "received_late"
      : "received_on_time";

  prediction.row.dataset.adaptiveExpected = String(prediction.expected);
  prediction.row.dataset.adaptiveActualValue = String(actual.total);
  prediction.row.dataset.adaptiveRemaining = "0";
  prediction.row.dataset.adaptiveActualDates = actual.dates.join(",");
  prediction.row.dataset.adaptiveActualWeek = actual.weekId;
  prediction.row.dataset.adaptivePredictedDate = prediction.predictedDate;
  prediction.row.dataset.adaptiveOutcome = outcome;
  prediction.row.dataset.adaptiveMatched = "true";
  prediction.row.dataset.crossWeekFilterFix = actual.key;

  // O recebimento pertence à semana real. Ao filtrar outra semana, a previsão já consumida não deve reaparecer.
  prediction.row.style.display = "none";
}

function refreshVisibleRowCount() {
  const rows = [...document.querySelectorAll<HTMLTableRowElement>(".forecast-table-v13 tbody tr")]
    .filter((row) => row.style.display !== "none");
  const subtitles = [...document.querySelectorAll<HTMLElement>(".forecast-panel-head-v13 p")];
  const target = subtitles.find((item) => item.textContent?.includes("registros no filtro atual"));
  if (target) target.textContent = `${rows.length} registros no filtro atual`;
}

function applyCrossWeekFilterFix(data: ImportState) {
  if (!document.body.classList.contains("receipt-forecast-active-v13")) return;
  const monthKey = currentMonthKey();
  const weekFilter = currentWeekFilter();
  if (!/^\d{4}-\d{2}$/.test(monthKey) || !weekFilter || weekFilter === "all") return;

  const predictions = [...document.querySelectorAll<HTMLTableRowElement>(".forecast-table-v13 tbody tr")]
    .map(readPrediction)
    .filter((row): row is VisiblePrediction => Boolean(row));
  if (!predictions.length) return;

  const actuals = buildActualCandidates(data, monthKey);
  const used = new Set<string>();
  let changed = false;

  predictions.forEach((prediction) => {
    const predictedDate = parseIso(prediction.predictedDate);
    if (!predictedDate) return;

    let best: ActualCandidate | undefined;
    let bestScore = Infinity;
    actuals.forEach((actual) => {
      if (used.has(actual.key) || actual.clientKey !== prediction.clientKey || actual.weekId === prediction.weekStart) return;
      const actualDate = parseIso(actual.dates[0] || "");
      if (!actualDate) return;
      const dayDistance = Math.abs(daysBetween(actualDate, predictedDate));
      if (dayDistance > MATCH_WINDOW_DAYS) return;
      const valueDistance = Math.abs(actual.total - prediction.expected) / prediction.expected;
      const score = dayDistance + Math.min(12, valueDistance * 7);
      if (score < bestScore) {
        best = actual;
        bestScore = score;
      }
    });

    if (!best) return;
    used.add(best.key);
    const tolerance = Math.max(1000, prediction.expected * PAID_TOLERANCE_RATIO);
    const remaining = Math.max(0, prediction.expected - best.total);
    if (remaining <= tolerance) consumeFullCrossWeekPayment(prediction, best);
    else renderPartial(prediction, best, remaining);
    changed = true;
  });

  if (changed) refreshVisibleRowCount();
}

export default function ReceiptForecastCrossWeekFilterFix() {
  const [data, setData] = useState<ImportState>(EMPTY_STATE);
  const scheduled = useRef<number | null>(null);
  const secondFrame = useRef<number | null>(null);

  useEffect(() => {
    let active = true;

    const hydrate = async () => {
      try {
        const [stored, links] = await Promise.all([
          loadAnalysisState(),
          listReceiptClientLinks(),
        ]);
        if (!active || !stored) return;
        setData(normalizeReceiptClientIdentities(stored, links).data);
      } catch {
        // Mantém a previsão funcional mesmo se o cadastro de vínculos estiver temporariamente indisponível.
      }
    };

    void hydrate();
    const onData = (event: Event) => {
      const detail = (event as CustomEvent<ImportState>).detail;
      if (detail) setData(detail);
    };
    const onClear = () => setData(EMPTY_STATE);
    const onLinks = () => { void hydrate(); };

    window.addEventListener(ANALYSIS_DATA_EVENT, onData);
    window.addEventListener(OFFLINE_DATA_CLEARED_EVENT, onClear);
    window.addEventListener(RECEIPT_CLIENT_LINKS_EVENT, onLinks);
    return () => {
      active = false;
      window.removeEventListener(ANALYSIS_DATA_EVENT, onData);
      window.removeEventListener(OFFLINE_DATA_CLEARED_EVENT, onClear);
      window.removeEventListener(RECEIPT_CLIENT_LINKS_EVENT, onLinks);
    };
  }, []);

  useEffect(() => {
    const schedule = () => {
      if (scheduled.current !== null || secondFrame.current !== null) return;
      scheduled.current = window.requestAnimationFrame(() => {
        scheduled.current = null;
        secondFrame.current = window.requestAnimationFrame(() => {
          secondFrame.current = null;
          applyCrossWeekFilterFix(data);
        });
      });
    };

    schedule();
    document.addEventListener("change", schedule, true);
    document.addEventListener("click", schedule, true);

    return () => {
      document.removeEventListener("change", schedule, true);
      document.removeEventListener("click", schedule, true);
      if (scheduled.current !== null) window.cancelAnimationFrame(scheduled.current);
      if (secondFrame.current !== null) window.cancelAnimationFrame(secondFrame.current);
    };
  }, [data]);

  return null;
}
