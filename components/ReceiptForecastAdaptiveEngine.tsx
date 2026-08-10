"use client";

import { useEffect, useRef, useState } from "react";
import {
  listForecastPredictionHistory,
  syncForecastPredictionHistory,
  type ForecastPredictionHistoryRow,
  type ForecastPredictionOutcome,
  type ForecastPredictionSnapshot,
} from "@/lib/forecastPredictionHistory";
import { ANALYSIS_DATA_EVENT, OFFLINE_DATA_CLEARED_EVENT } from "@/lib/offlineStorage";
import type { ImportState } from "@/lib/types";

const EMPTY_STATE: ImportState = { invoices: [], receipts: [] };
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const percent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });
const MATCH_WINDOW_DAYS = 14;
const PAID_TOLERANCE_RATIO = 0.05;

function normalizeKey(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
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
  return [...value.matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)].map((match) => `${match[3]}-${match[2]}-${match[1]}`);
}

function numericCurrency(value: string) {
  const match = value.match(/R\$\s*-?[\d.]+,\d{2}/i);
  if (!match) return 0;
  const parsed = Number(match[0].replace(/R\$/gi, "").replace(/\s/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function receivedAmountFromStatus(value: string) {
  const match = value.match(/Recebido\s+(R\$\s*[\d.]+,\d{2})/i);
  return match ? numericCurrency(match[1]) : 0;
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

function setText(element: Element | null, value: string) {
  if (element && element.textContent !== value) element.textContent = value;
}

type RowInfo = {
  row: HTMLTableRowElement;
  cells: NodeListOf<HTMLTableCellElement>;
  clientName: string;
  clientKey: string;
  weekStart: string;
  weekEnd: string;
  predictedDate: string;
  value: number;
  expected: number;
  statusTitle: string;
  confidence: string;
  activeMonths: number;
  presence: string;
  actualDates: string[];
  actualValue: number;
  remaining: number;
  standaloneActual: boolean;
  manual: boolean;
};

function readRow(row: HTMLTableRowElement): RowInfo | null {
  const cells = row.querySelectorAll<HTMLTableCellElement>("td");
  if (cells.length < 7) return null;
  const clientName = cells[0].querySelector("strong")?.textContent?.trim() || "";
  const clientKey = normalizeKey(clientName);
  if (!clientKey) return null;
  const windowDates = brDates(cells[1].textContent || "");
  const weekStart = windowDates[0] || "";
  const weekEnd = windowDates[1] || weekStart;
  if (!weekStart) return null;
  const statusText = cells[3].textContent || "";
  const statusTitle = cells[3].querySelector(".status b")?.textContent?.trim() || "";
  const statusDates = brDates(statusText);
  const displayedValue = numericCurrency(cells[2].textContent || "");
  const partialReceived = receivedAmountFromStatus(statusText);
  const storedExpected = Number(row.dataset.adaptiveExpected || 0);
  const expected = storedExpected || (statusTitle.includes("Pagou a menor") ? displayedValue + partialReceived : displayedValue);
  const storedActual = Number(row.dataset.adaptiveActualValue || 0);
  const actualValue = storedActual || (statusTitle.includes("Recebido") ? displayedValue : partialReceived);
  const storedRemaining = Number(row.dataset.adaptiveRemaining || "NaN");
  const remaining = Number.isFinite(storedRemaining)
    ? storedRemaining
    : statusTitle.includes("Pagou a menor") ? displayedValue : statusTitle.includes("Recebido") ? 0 : displayedValue;
  const likelyDateText = statusText.includes("Data provável") ? statusText : "";
  const predictedDate = row.dataset.adaptivePredictedDate || brDates(likelyDateText)[0] || weekStart;
  const presence = cells[4].textContent?.trim() || "";
  const standaloneActual = statusTitle.includes("Recebido") && presence.includes("Recebimento real");
  const manual = statusTitle.includes("Adicionado manualmente");
  const monthsMatch = presence.match(/(\d+)\/3/);

  return {
    row,
    cells,
    clientName,
    clientKey,
    weekStart,
    weekEnd,
    predictedDate,
    value: displayedValue,
    expected,
    statusTitle,
    confidence: cells[5].textContent?.trim() || "—",
    activeMonths: monthsMatch ? Number(monthsMatch[1]) : 0,
    presence,
    actualDates: row.dataset.adaptiveActualDates?.split(",").filter(Boolean) || statusDates,
    actualValue,
    remaining,
    standaloneActual,
    manual,
  };
}

function outcomeFor(info: RowInfo, actualDates: string[], partial: boolean): ForecastPredictionOutcome {
  if (!actualDates.length) return "pending";
  const firstActual = parseIso(actualDates[0]);
  const start = parseIso(info.weekStart);
  const end = parseIso(info.weekEnd);
  if (!firstActual || !start || !end) return partial ? "partial_on_time" : "received_on_time";
  if (firstActual < start) return partial ? "partial_early" : "received_early";
  if (firstActual > end) return partial ? "partial_late" : "received_late";
  return partial ? "partial_on_time" : "received_on_time";
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

function renderAdaptiveStatus(info: RowInfo, actual: RowInfo) {
  const actualDates = actual.actualDates.length ? actual.actualDates : [actual.weekStart];
  const actualValue = actual.value;
  const tolerance = Math.max(1000, info.expected * PAID_TOLERANCE_RATIO);
  const remaining = Math.max(0, info.expected - actualValue);
  const partial = remaining > tolerance;
  const outcome = outcomeFor(info, actualDates, partial);
  const title = outcome.includes("early")
    ? partial ? "Parcial antecipado" : "Recebido antecipadamente"
    : outcome.includes("late")
      ? partial ? "Parcial com atraso" : "Recebido com atraso"
      : partial ? "Parcial" : "Recebido";

  info.row.dataset.adaptiveExpected = String(info.expected);
  info.row.dataset.adaptiveActualValue = String(actualValue);
  info.row.dataset.adaptiveRemaining = String(partial ? remaining : 0);
  info.row.dataset.adaptiveActualDates = actualDates.join(",");
  info.row.dataset.adaptiveActualWeek = actualWeekId(actualDates[0]);
  info.row.dataset.adaptivePredictedDate = info.predictedDate;
  info.row.dataset.adaptiveOutcome = outcome;
  info.row.dataset.adaptiveMatched = "true";

  const valueStrong = info.cells[2].querySelector("strong");
  if (valueStrong) valueStrong.textContent = currency.format(partial ? remaining : actualValue);

  info.cells[3].innerHTML = "";
  const wrapper = document.createElement("span");
  wrapper.className = partial ? "status partial" : "status received";
  const bold = document.createElement("b");
  bold.textContent = title;
  const detail = document.createElement("small");
  detail.textContent = `${currency.format(actualValue)} em ${actualDates.map((date) => parseIso(date)?.toLocaleDateString("pt-BR") || date).join(", ")}`;
  wrapper.append(bold, detail);
  if (partial) {
    const rest = document.createElement("small");
    rest.textContent = `Ainda previsto: ${currency.format(remaining)}`;
    wrapper.append(rest);
  }
  info.cells[3].append(wrapper);
  if (!partial) info.cells[6].innerHTML = '<span class="no-action">—</span>';

  actual.row.style.display = "none";
  actual.row.dataset.adaptiveConsumed = "true";
}

function matchCrossWeekReceipts(rows: RowInfo[]) {
  const byClient = new Map<string, RowInfo[]>();
  rows.forEach((info) => {
    const list = byClient.get(info.clientKey) || [];
    list.push(info);
    byClient.set(info.clientKey, list);
  });

  byClient.forEach((clientRows) => {
    const actuals = clientRows
      .filter((row) => row.standaloneActual && row.row.dataset.adaptiveConsumed !== "true")
      .sort((a, b) => (a.actualDates[0] || a.weekStart).localeCompare(b.actualDates[0] || b.weekStart));
    const predictions = clientRows.filter((row) =>
      !row.manual
      && !row.standaloneActual
      && !row.statusTitle.includes("Recebido")
      && !row.statusTitle.includes("Pagou a menor")
      && row.row.dataset.adaptiveMatched !== "true",
    );
    const used = new Set<HTMLTableRowElement>();

    actuals.forEach((actual) => {
      const actualDate = parseIso(actual.actualDates[0] || actual.weekStart);
      if (!actualDate) return;
      let best: RowInfo | undefined;
      let bestScore = Infinity;
      for (const prediction of predictions) {
        if (used.has(prediction.row)) continue;
        const predicted = parseIso(prediction.predictedDate || prediction.weekStart);
        if (!predicted) continue;
        const dayDistance = Math.abs(daysBetween(actualDate, predicted));
        if (dayDistance > MATCH_WINDOW_DAYS) continue;
        const valueDistance = prediction.expected > 0
          ? Math.abs(actual.value - prediction.expected) / prediction.expected
          : 0;
        const score = dayDistance + Math.min(12, valueDistance * 7);
        if (score < bestScore) {
          best = prediction;
          bestScore = score;
        }
      }
      if (!best) return;
      used.add(best.row);
      renderAdaptiveStatus(best, actual);
    });
  });
}

function snapshotFromRow(info: RowInfo, monthKey: string): ForecastPredictionSnapshot | null {
  if (info.manual || info.standaloneActual || info.row.dataset.adaptiveConsumed === "true") return null;
  const actualDates = info.row.dataset.adaptiveActualDates?.split(",").filter(Boolean) || info.actualDates;
  const actualValue = Number(info.row.dataset.adaptiveActualValue || info.actualValue || 0);
  const remaining = Number(info.row.dataset.adaptiveRemaining || info.remaining || 0);
  const partial = actualValue > 0 && remaining > Math.max(1000, info.expected * PAID_TOLERANCE_RATIO);
  const outcome = (info.row.dataset.adaptiveOutcome as ForecastPredictionOutcome | undefined)
    || outcomeFor(info, actualDates, partial);
  const predictedDate = info.row.dataset.adaptivePredictedDate || info.predictedDate || info.weekStart;
  const firstActual = actualDates.length ? parseIso(actualDates[0]) : null;
  const predicted = parseIso(predictedDate);

  return {
    month_key: monthKey,
    source_key: `${info.clientKey}|${info.weekStart}`,
    client_key: info.clientKey,
    client_name: info.clientName,
    predicted_week_id: info.weekStart,
    predicted_date: predictedDate,
    predicted_value: Math.max(0, info.expected),
    confidence: info.confidence || "—",
    active_months: info.activeMonths,
    actual_value: Math.max(0, actualValue),
    actual_dates: actualDates,
    outcome,
    date_error_days: firstActual && predicted ? daysBetween(firstActual, predicted) : null,
    value_error_ratio: actualValue > 0 && info.expected > 0 ? Math.abs(actualValue - info.expected) / info.expected : null,
    current_predicted_week_id: info.weekStart,
    current_predicted_date: predictedDate,
    current_predicted_value: Math.max(0, remaining),
  };
}

function refreshCardsAndWeeks() {
  const infos = [...document.querySelectorAll<HTMLTableRowElement>(".forecast-table-v13 tbody tr")]
    .filter((row) => row.style.display !== "none")
    .map(readRow)
    .filter((row): row is RowInfo => Boolean(row));

  let pendingValue = 0;
  let receivedValue = 0;
  let highValue = 0;
  const pendingClients = new Set<string>();
  const receivedClients = new Set<string>();

  infos.forEach((info) => {
    const adaptiveActual = Number(info.row.dataset.adaptiveActualValue || 0);
    const adaptiveRemaining = Number(info.row.dataset.adaptiveRemaining || "NaN");
    if (adaptiveActual > 0) {
      receivedValue += adaptiveActual;
      receivedClients.add(info.clientKey);
      const remaining = Number.isFinite(adaptiveRemaining) ? adaptiveRemaining : 0;
      if (remaining > 0) {
        pendingValue += remaining;
        pendingClients.add(info.clientKey);
        if (info.confidence === "Alta") highValue += remaining;
      }
      return;
    }
    if (info.statusTitle.includes("Recebido")) {
      receivedValue += info.value;
      receivedClients.add(info.clientKey);
    } else if (info.statusTitle.includes("Pagou a menor")) {
      const received = receivedAmountFromStatus(info.cells[3].textContent || "");
      receivedValue += received;
      if (received > 0) receivedClients.add(info.clientKey);
      pendingValue += info.value;
      pendingClients.add(info.clientKey);
      if (info.confidence === "Alta") highValue += info.value;
    } else {
      pendingValue += info.value;
      pendingClients.add(info.clientKey);
      if (info.confidence === "Alta") highValue += info.value;
    }
  });

  const cards = document.querySelectorAll<HTMLElement>(".forecast-kpis-v13 article");
  if (cards[0]) {
    setText(cards[0].querySelector("strong"), currency.format(pendingValue));
    setText(cards[0].querySelector("small"), `${pendingClients.size} clientes ainda previstos`);
  }
  if (cards[1]) {
    setText(cards[1].querySelector("strong"), currency.format(receivedValue));
    setText(cards[1].querySelector("small"), `${receivedClients.size} clientes com recebimento real`);
  }
  if (cards[2]) setText(cards[2].querySelector("strong"), currency.format(highValue));
  if (cards[3]) setText(cards[3].querySelector("strong"), String(pendingClients.size));

  const weekFilter = currentWeekFilter();
  document.querySelectorAll<HTMLButtonElement>(".forecast-weeks-v13 button").forEach((button) => {
    const weekId = brDates(button.querySelector("span")?.textContent || "")[0];
    if (!weekId || (weekFilter !== "all" && weekFilter !== weekId)) return;
    let pending = 0;
    let received = 0;
    const predicted = new Set<string>();
    const receivedSet = new Set<string>();
    const names: string[] = [];

    infos.forEach((info) => {
      const adaptiveActual = Number(info.row.dataset.adaptiveActualValue || 0);
      const adaptiveRemaining = Number(info.row.dataset.adaptiveRemaining || "NaN");
      const adaptiveActualWeek = info.row.dataset.adaptiveActualWeek || info.weekStart;
      if (adaptiveActual > 0 && adaptiveActualWeek === weekId) {
        received += adaptiveActual;
        receivedSet.add(info.clientKey);
      } else if (!adaptiveActual && info.statusTitle.includes("Recebido") && info.weekStart === weekId) {
        received += info.value;
        receivedSet.add(info.clientKey);
      }
      const remaining = adaptiveActual > 0 && Number.isFinite(adaptiveRemaining)
        ? adaptiveRemaining
        : (!info.statusTitle.includes("Recebido") ? info.value : 0);
      if (remaining > 0 && info.weekStart === weekId) {
        pending += remaining;
        predicted.add(info.clientKey);
        if (!names.includes(info.clientName) && names.length < 4) names.push(info.clientName);
      }
    });

    setText(button.querySelector("strong"), `A receber: ${currency.format(pending)}`);
    setText(button.querySelector("em"), `Recebido: ${currency.format(received)}`);
    setText(button.querySelector("small"), `${predicted.size} previstos · ${receivedSet.size} recebidos`);
    setText(button.querySelector("i"), names.length ? names.join(" · ") : receivedSet.size ? "Sem previsão pendente · já recebido" : "Sem previsão recorrente");
  });
}

function renderAccuracyPanel(history: ForecastPredictionHistoryRow[]) {
  const anchor = document.querySelector<HTMLElement>(".forecast-kpis-v13");
  if (!anchor) return;
  let panel = document.getElementById("forecast-accuracy-v14") as HTMLElement | null;
  if (!panel) {
    panel = document.createElement("section");
    panel.id = "forecast-accuracy-v14";
    panel.className = "forecast-accuracy-v14";
    anchor.insertAdjacentElement("afterend", panel);
  }

  const evaluated = history.filter((row) => row.outcome !== "pending" && Number(row.actual_value) > 0 && Number(row.predicted_value) > 0);
  const predictedTotal = evaluated.reduce((sum, row) => sum + Number(row.predicted_value || 0), 0);
  const absoluteError = evaluated.reduce((sum, row) => sum + Math.abs(Number(row.actual_value || 0) - Number(row.predicted_value || 0)), 0);
  const financialAccuracy = predictedTotal ? Math.max(0, 1 - absoluteError / predictedTotal) : 0;
  const onTime = evaluated.filter((row) => row.outcome.endsWith("on_time")).length;
  const calendarAccuracy = evaluated.length ? onTime / evaluated.length : 0;
  const early = evaluated.filter((row) => row.outcome.endsWith("early")).length;
  const late = evaluated.filter((row) => row.outcome.endsWith("late")).length;
  const first = history.length
    ? [...history].sort((a, b) => a.first_predicted_at.localeCompare(b.first_predicted_at))[0]?.first_predicted_at
    : "";
  const since = first ? new Date(first).toLocaleDateString("pt-BR") : "hoje";

  panel.innerHTML = `
    <div><span>MEMÓRIA DA PREVISÃO</span><strong>${evaluated.length ? percent.format(financialAccuracy) : "Em formação"}</strong><small>Precisão financeira${evaluated.length ? ` · ${evaluated.length} ciclos avaliados` : " · começa a medir a partir das previsões salvas"}</small></div>
    <div><span>Precisão de calendário</span><strong>${evaluated.length ? percent.format(calendarAccuracy) : "—"}</strong><small>Entradas na semana prevista</small></div>
    <div><span>Antecipados</span><strong>${early}</strong><small>Recebimentos antes da janela</small></div>
    <div><span>Com atraso</span><strong>${late}</strong><small>Recebimentos depois da janela · memória desde ${since}</small></div>
  `;

  if (!document.getElementById("forecast-accuracy-style-v14")) {
    const style = document.createElement("style");
    style.id = "forecast-accuracy-style-v14";
    style.textContent = `
      .forecast-accuracy-v14{display:grid;grid-template-columns:1.25fr repeat(3,1fr);gap:10px;padding:12px;border:1px solid #e3e7f0;border-radius:14px;background:linear-gradient(135deg,#f8f9ff,#fff)}
      .forecast-accuracy-v14>div{min-width:0;padding:5px 10px;border-right:1px solid #eaedf4}.forecast-accuracy-v14>div:last-child{border-right:0}
      .forecast-accuracy-v14 span{display:block;color:#707a91;font-size:9px;font-weight:850;letter-spacing:.06em}.forecast-accuracy-v14 strong{display:block;margin:4px 0 2px;color:#252c40;font-size:18px}.forecast-accuracy-v14 small{display:block;color:#8a93a5;font-size:9px;line-height:1.35}
      @media(max-width:760px){.forecast-accuracy-v14{grid-template-columns:1fr 1fr}.forecast-accuracy-v14>div{border-right:0;border-bottom:1px solid #eaedf4}.forecast-accuracy-v14>div:nth-last-child(-n+2){border-bottom:0}}
      @media print{.forecast-accuracy-v14{break-inside:avoid}}
    `;
    document.head.appendChild(style);
  }
}

function sanitizeCurrencyInput(event: Event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.closest(".forecast-modal-v13")) return;
  const title = input.closest("label")?.querySelector("span")?.textContent?.trim().toUpperCase() || "";
  if (title !== "VALOR PREVISTO" && title !== "VALOR CONFIRMADO") return;
  const clean = input.value.replace(/R\$/gi, "").replace(/\s+/g, "").replace(/[^0-9.,-]/g, "");
  if (clean !== input.value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, clean);
  }
}

export default function ReceiptForecastAdaptiveEngine() {
  const [data, setData] = useState<ImportState>(EMPTY_STATE);
  const scheduled = useRef<number | null>(null);
  const applying = useRef(false);
  const lastHistorySignature = useRef("");

  useEffect(() => {
    const onData = (event: Event) => {
      const detail = (event as CustomEvent<ImportState>).detail;
      if (detail) setData(detail);
      lastHistorySignature.current = "";
    };
    const onClear = () => {
      setData(EMPTY_STATE);
      lastHistorySignature.current = "";
    };
    window.addEventListener(ANALYSIS_DATA_EVENT, onData);
    window.addEventListener(OFFLINE_DATA_CLEARED_EVENT, onClear);
    return () => {
      window.removeEventListener(ANALYSIS_DATA_EVENT, onData);
      window.removeEventListener(OFFLINE_DATA_CLEARED_EVENT, onClear);
    };
  }, []);

  useEffect(() => {
    const schedule = () => {
      if (applying.current || scheduled.current !== null) return;
      scheduled.current = window.requestAnimationFrame(() => {
        scheduled.current = null;
        if (!document.body.classList.contains("receipt-forecast-active-v13")) return;
        applying.current = true;
        try {
          const monthKey = currentMonthKey();
          if (!monthKey) return;
          const infos = [...document.querySelectorAll<HTMLTableRowElement>(".forecast-table-v13 tbody tr")]
            .map(readRow)
            .filter((row): row is RowInfo => Boolean(row));
          if (!infos.length) return;

          matchCrossWeekReceipts(infos);
          refreshCardsAndWeeks();

          const refreshed = [...document.querySelectorAll<HTMLTableRowElement>(".forecast-table-v13 tbody tr")]
            .map(readRow)
            .filter((row): row is RowInfo => Boolean(row));
          const snapshots = refreshed
            .map((row) => snapshotFromRow(row, monthKey))
            .filter((row): row is ForecastPredictionSnapshot => Boolean(row));
          const signature = JSON.stringify(snapshots.map((row) => [
            row.source_key, row.current_predicted_value, row.actual_value, row.outcome, row.actual_dates.join("|"),
          ]));

          if (signature !== lastHistorySignature.current) {
            lastHistorySignature.current = signature;
            void syncForecastPredictionHistory(snapshots)
              .then(() => listForecastPredictionHistory())
              .then(renderAccuracyPanel)
              .catch(() => {
                lastHistorySignature.current = "";
              });
          } else if (!document.getElementById("forecast-accuracy-v14")) {
            void listForecastPredictionHistory().then(renderAccuracyPanel).catch(() => undefined);
          }
        } finally {
          window.setTimeout(() => { applying.current = false; }, 0);
        }
      });
    };

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class", "style"] });
    document.addEventListener("input", sanitizeCurrencyInput, true);
    document.addEventListener("change", schedule, true);
    document.addEventListener("click", schedule, true);

    return () => {
      observer.disconnect();
      document.removeEventListener("input", sanitizeCurrencyInput, true);
      document.removeEventListener("change", schedule, true);
      document.removeEventListener("click", schedule, true);
      if (scheduled.current !== null) window.cancelAnimationFrame(scheduled.current);
    };
  }, [data]);

  return null;
}
