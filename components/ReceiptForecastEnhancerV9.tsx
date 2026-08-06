"use client";

import { useEffect, useState } from "react";
import ReceiptForecastEnhancerV7 from "@/components/ReceiptForecastEnhancerV7";
import { currency, formatDate } from "@/lib/format";
import {
  ANALYSIS_DATA_EVENT,
  loadAnalysisState,
  OFFLINE_DATA_CLEARED_EVENT,
} from "@/lib/offlineStorage";
import { canonicalReceiptClientName } from "@/lib/receiptClientNames";
import type { ImportState, Receipt } from "@/lib/types";

type Scope = "all" | "partial" | "high";
type Confidence = "Alta" | "Média";

type ForecastWeek = { id: string; index: number; start: Date; end: Date };
type ClientHistory = {
  key: string;
  clientName: string;
  weekTotals: number[][];
  weekDays: number[][];
};
type ActualSummary = { total: number; dates: string[] };
type ForecastModel = {
  key: string;
  clientKey: string;
  clientName: string;
  weekId: string;
  expected: number;
  remaining: number;
  activeMonths: number;
  confidence: Confidence;
  estimatedDate: string;
  actual?: ActualSummary;
};

const EMPTY_STATE: ImportState = { invoices: [], receipts: [] };
const HISTORY_MONTHS = 3;
const MIN_RECURRING_MONTHS = 2;

function parseIsoDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseBrazilianDate(value: string) {
  const match = value.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

function toIsoDate(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function addDays(date: Date, amount: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1, 12, 0, 0, 0);
}

function buildWeeks(month: Date): ForecastWeek[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12, 0, 0, 0);
  let monday = addDays(first, (8 - first.getDay()) % 7);
  const weeks: ForecastWeek[] = [];
  let index = 0;
  while (monday.getMonth() === month.getMonth() && monday.getFullYear() === month.getFullYear()) {
    weeks.push({ id: toIsoDate(monday), index, start: monday, end: addDays(monday, 4) });
    monday = addDays(monday, 7);
    index += 1;
  }
  return weeks;
}

function isBetween(date: Date, start: Date, end: Date) {
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
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

function setText(element: Element | null | undefined, value: string) {
  if (element && element.textContent !== value) element.textContent = value;
}

function modelMatchesScope(model: ForecastModel, scope: Scope) {
  if (scope === "partial") return Boolean(model.actual);
  if (scope === "high") return model.confidence === "Alta";
  return true;
}

function buildForecastModels(receipts: Receipt[], targetMonthKey: string) {
  const now = new Date();
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0, 0);
  const historyMonths = Array.from({ length: HISTORY_MONTHS }, (_, index) => addMonths(currentMonth, index - HISTORY_MONTHS));
  const clients = new Map<string, ClientHistory>();

  sourceReceipts(receipts).forEach((receipt) => {
    const date = parseIsoDate(receipt.receiptDate);
    const clientName = canonicalReceiptClientName(receipt.clientHint || receipt.description);
    if (!date || !clientName || !Number.isFinite(receipt.amount) || receipt.amount <= 0) return;
    const monthIndex = historyMonths.findIndex((month) => buildWeeks(month).some((week) => isBetween(date, week.start, week.end)));
    if (monthIndex < 0) return;
    const week = buildWeeks(historyMonths[monthIndex]).find((item) => isBetween(date, item.start, item.end));
    if (!week) return;

    const key = normalizeKey(clientName);
    const client = clients.get(key) ?? {
      key,
      clientName,
      weekTotals: Array.from({ length: HISTORY_MONTHS }, () => Array(6).fill(0) as number[]),
      weekDays: Array.from({ length: HISTORY_MONTHS }, () => Array(6).fill(0) as number[]),
    };
    client.weekTotals[monthIndex][week.index] += receipt.amount;
    if (!client.weekDays[monthIndex][week.index]) client.weekDays[monthIndex][week.index] = date.getDay();
    clients.set(key, client);
  });

  const targetMatch = targetMonthKey.match(/^(\d{4})-(\d{2})$/);
  const targetMonth = targetMatch
    ? new Date(Number(targetMatch[1]), Number(targetMatch[2]) - 1, 1, 12, 0, 0, 0)
    : currentMonth;
  const targetWeeks = buildWeeks(targetMonth);
  const actuals = new Map<string, ActualSummary>();

  sourceReceipts(receipts).forEach((receipt) => {
    const date = parseIsoDate(receipt.receiptDate);
    const clientName = canonicalReceiptClientName(receipt.clientHint || receipt.description);
    if (!date || !clientName || !Number.isFinite(receipt.amount) || receipt.amount <= 0) return;
    const week = targetWeeks.find((item) => isBetween(date, item.start, item.end));
    if (!week) return;
    const key = `${normalizeKey(clientName)}|${week.id}`;
    const current = actuals.get(key) ?? { total: 0, dates: [] };
    current.total += receipt.amount;
    if (!current.dates.includes(receipt.receiptDate)) current.dates.push(receipt.receiptDate);
    current.dates.sort();
    actuals.set(key, current);
  });

  const models: ForecastModel[] = [];
  clients.forEach((client) => {
    targetWeeks.forEach((week) => {
      const historicalValues = client.weekTotals.map((month) => month[week.index] ?? 0);
      const positiveValues = historicalValues.filter((value) => value > 0);
      const activeMonths = positiveValues.length;
      if (activeMonths < MIN_RECURRING_MONTHS) return;

      const weekdays = client.weekDays.map((month) => month[week.index] ?? 0).filter((day) => day > 0);
      const expected = median(positiveValues);
      const actual = actuals.get(`${client.key}|${week.id}`);
      const remaining = Math.max(0, expected - (actual?.total ?? 0));
      const tolerance = Math.max(1_000, expected * 0.05);
      if (actual && remaining <= tolerance) return;

      const weekday = weekdays.length ? Math.round(median(weekdays)) : 1;
      const spread = weekdays.length ? Math.max(...weekdays) - Math.min(...weekdays) : 4;
      models.push({
        key: `${client.key}|${week.id}`,
        clientKey: client.key,
        clientName: client.clientName,
        weekId: week.id,
        expected,
        remaining: actual ? remaining : expected,
        activeMonths,
        confidence: activeMonths === 3 && spread <= 2 ? "Alta" : "Média",
        estimatedDate: toIsoDate(addDays(week.start, Math.min(5, Math.max(1, weekday)) - 1)),
        actual,
      });
    });
  });
  return models;
}

function applyForecastPanel(data: ImportState, scope: Scope, setScope: (scope: Scope) => void) {
  const page = document.querySelector<HTMLElement>(".receipt-forecast-page-v7");
  if (!page) return;

  const selects = [...page.querySelectorAll<HTMLSelectElement>(".forecast-filter-v7 select")];
  const clientSelect = selects[0];
  const monthSelect = selects[1];
  const weekSelect = selects[2];
  const confidenceSelect = selects[3];
  if (!monthSelect) return;

  if (confidenceSelect?.value === "Insuficiente" || confidenceSelect?.value === "Baixa") {
    confidenceSelect.value = "Todas";
    confidenceSelect.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  const insufficient = confidenceSelect?.querySelector<HTMLOptionElement>('option[value="Insuficiente"]');
  const low = confidenceSelect?.querySelector<HTMLOptionElement>('option[value="Baixa"]');
  if (insufficient && !insufficient.hidden) insufficient.hidden = true;
  if (low && !low.hidden) low.hidden = true;

  const models = buildForecastModels(data.receipts, monthSelect.value);
  const modelByKey = new Map(models.map((model) => [model.key, model]));
  const selectedWeek = weekSelect?.value ?? "all";
  const selectedClient = clientSelect?.value ?? "all";
  const selectedConfidence = confidenceSelect?.value ?? "Todas";
  const currentModels = models.filter((model) =>
    (selectedWeek === "all" || model.weekId === selectedWeek)
    && (selectedClient === "all" || model.clientKey === selectedClient)
    && (selectedConfidence === "Todas" || model.confidence === selectedConfidence)
    && modelMatchesScope(model, scope),
  );

  const rows = [...page.querySelectorAll<HTMLTableRowElement>(".forecast-table-v7 tbody tr")].filter((row) => !row.querySelector(".empty-row"));
  rows.forEach((row) => {
    const clientName = row.querySelector<HTMLElement>("td.client strong")?.textContent?.trim() ?? "";
    const weekId = parseBrazilianDate(row.querySelector<HTMLElement>("td:nth-child(2) strong")?.textContent ?? "");
    const model = weekId ? modelByKey.get(`${normalizeKey(clientName)}|${weekId}`) : undefined;
    const visible = Boolean(model)
      && (selectedWeek === "all" || model?.weekId === selectedWeek)
      && (selectedClient === "all" || model?.clientKey === selectedClient)
      && (selectedConfidence === "Todas" || model?.confidence === selectedConfidence)
      && Boolean(model && modelMatchesScope(model, scope));
    const display = visible ? "" : "none";
    if (row.style.display !== display) row.style.display = display;
    if (!visible || !model) return;

    setText(row.querySelector("td:nth-child(3) strong"), currency.format(model.remaining));
    setText(row.querySelector("td.client span"), model.actual ? `Padrão esperado: ${currency.format(model.expected)}` : "Mediana da mesma semana nos últimos 3 meses");
    setText(row.querySelector("td:nth-child(5)"), `${model.activeMonths}/3 meses`);
    const confidence = row.querySelector<HTMLElement>("td:nth-child(6) .confidence");
    setText(confidence, model.confidence);
    confidence?.classList.remove("alta", "media", "baixa", "insuficiente");
    confidence?.classList.add(model.confidence === "Alta" ? "alta" : "media");

    const statusCell = row.querySelector<HTMLElement>("td:nth-child(4)");
    if (statusCell) {
      const html = model.actual
        ? `<span class="status partial"><b>Pagou a menor</b><small>Recebido ${currency.format(model.actual.total)} em ${model.actual.dates.map(formatDate).join(", ")}</small><small>Falta aproximadamente ${currency.format(model.remaining)}</small></span>`
        : `<span class="status forecast"><b>Previsto</b><small>Data provável: ${formatDate(model.estimatedDate)}</small></span>`;
      if (statusCell.innerHTML !== html) statusCell.innerHTML = html;
    }
  });

  const visibleClients = new Set(currentModels.map((model) => model.clientKey));
  if (clientSelect) {
    [...clientSelect.options].forEach((option) => {
      if (option.value === "all") {
        setText(option, selectedWeek === "all" ? `Todos os previstos (${visibleClients.size})` : `Todos da semana (${visibleClients.size})`);
        if (option.hidden) option.hidden = false;
      } else {
        const hidden = !models.some((model) => model.clientKey === option.value
          && (selectedWeek === "all" || model.weekId === selectedWeek)
          && (selectedConfidence === "Todas" || model.confidence === selectedConfidence)
          && modelMatchesScope(model, scope));
        if (option.hidden !== hidden) option.hidden = hidden;
      }
    });
  }

  const totalRemaining = currentModels.reduce((sum, model) => sum + model.remaining, 0);
  const partials = currentModels.filter((model) => model.actual);
  const partialReceived = partials.reduce((sum, model) => sum + (model.actual?.total ?? 0), 0);
  const highRemaining = currentModels.filter((model) => model.confidence === "Alta").reduce((sum, model) => sum + model.remaining, 0);
  const cards = [...page.querySelectorAll<HTMLElement>(".forecast-kpis-v7 article")];
  const configureCard = (index: number, cardScope: Scope, title: string, value: string, subtitle: string) => {
    const card = cards[index];
    if (!card) return;
    setText(card.querySelector(":scope > span"), title);
    setText(card.querySelector(":scope > strong"), value);
    setText(card.querySelector(":scope > small"), subtitle);
    card.classList.toggle("forecast-card-active-v9", scope === cardScope);
    if (card.style.cursor !== "pointer") card.style.cursor = "pointer";
    card.onclick = () => setScope(scope === cardScope && cardScope !== "all" ? "all" : cardScope);
  };
  configureCard(0, "all", "A receber no período", currency.format(totalRemaining), `${visibleClients.size} clientes recorrentes ainda previstos`);
  configureCard(1, "partial", "Pagamentos parciais", String(partials.length), `${currency.format(partialReceived)} já recebidos abaixo do padrão`);
  configureCard(2, "high", "Alta confiança a receber", currency.format(highRemaining), "Recorrência nos 3 meses e dias estáveis");
  configureCard(3, "all", "Clientes previstos", String(visibleClients.size), "Não inclui clientes já pagos dentro da margem esperada");

  [...page.querySelectorAll<HTMLButtonElement>(".forecast-weeks-v7 button")].forEach((button) => {
    const weekId = parseBrazilianDate(button.querySelector<HTMLElement>(":scope > span")?.textContent ?? "");
    if (!weekId) return;
    const weekModels = models.filter((model) => model.weekId === weekId
      && (selectedClient === "all" || model.clientKey === selectedClient)
      && (selectedConfidence === "Todas" || model.confidence === selectedConfidence)
      && modelMatchesScope(model, scope));
    const weekPartials = weekModels.filter((model) => model.actual);
    setText(button.querySelector(":scope > strong"), `A receber: ${currency.format(weekModels.reduce((sum, model) => sum + model.remaining, 0))}`);
    setText(button.querySelector(":scope > em"), weekPartials.length ? `Parcial recebido: ${currency.format(weekPartials.reduce((sum, model) => sum + (model.actual?.total ?? 0), 0))}` : "Sem pagamento parcial");
    setText(button.querySelector(":scope > small"), `${new Set(weekModels.map((model) => model.clientKey)).size} previstos · ${weekPartials.length} pagaram a menor`);
    setText(button.querySelector(":scope > i"), weekModels.length ? weekModels.slice(0, 4).map((model) => model.clientName).join(" · ") : "Sem previsão pendente nesta semana");
  });

  setText(page.querySelector(".forecast-panel-v7:has(.forecast-table-v7) .forecast-panel-head-v7 h3"), "Clientes previstos no período");
  setText(page.querySelector(".forecast-panel-v7:has(.forecast-table-v7) .forecast-panel-head-v7 p"), `${currentModels.length} registros recorrentes no filtro atual`);
  setText(page.querySelector(".forecast-note-v7 span"), "Um cliente só entra quando recebeu na mesma semana em pelo menos 2 dos últimos 3 meses. Quando o valor já recebido atinge pelo menos 95% da mediana histórica, ele sai da previsão; abaixo disso, aparece somente a diferença aproximada.");
}

export default function ReceiptForecastEnhancerV9() {
  const [data, setData] = useState<ImportState>(EMPTY_STATE);
  const [scope, setScope] = useState<Scope>("all");

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
    let frame = 0;
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => applyForecastPanel(data, scope, setScope));
    };
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener("resize", schedule);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.cancelAnimationFrame(frame);
    };
  }, [data, scope]);

  return (
    <>
      <ReceiptForecastEnhancerV7 />
      <style jsx global>{`
        .forecast-kpis-v7 article.forecast-card-active-v9{border-color:#8797ff!important;background:#f6f7ff!important;box-shadow:0 8px 24px rgba(70,88,190,.12)}
        .status.partial b{color:#a36a08!important}.status.partial small{color:#8c7447!important}.forecast-table-v7 tbody tr[style*="display: none"]{display:none!important}
      `}</style>
    </>
  );
}
