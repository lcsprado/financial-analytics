"use client";

import { useEffect, useState } from "react";
import ReceiptForecastEnhancerV4 from "@/components/ReceiptForecastEnhancerV4";
import { currency, formatDate } from "@/lib/format";
import {
  ANALYSIS_DATA_EVENT,
  loadAnalysisState,
  OFFLINE_DATA_CLEARED_EVENT,
} from "@/lib/offlineStorage";
import { canonicalReceiptClientName } from "@/lib/receiptClientNames";
import type { ImportState, Receipt } from "@/lib/types";

const EMPTY_STATE: ImportState = { invoices: [], receipts: [] };
const HISTORY_MONTHS = 3;
const MONTH_FORMATTER = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

type ActualReceiptSummary = {
  total: number;
  dates: string[];
  entries: number;
};

type MonthActuals = {
  byClient: Map<string, ActualReceiptSummary>;
  byWeek: Map<string, Map<string, ActualReceiptSummary>>;
};

type HistoryBasis = {
  clientName: string;
  months: Array<{ key: string; label: string; total: number }>;
  estimate: number;
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

function weekKey(date: Date) {
  const monday = new Date(date);
  monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return toIsoDate(monday);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1, 12, 0, 0, 0);
}

function normalizeClientKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function isDemoReceipt(receipt: Receipt) {
  return receipt.id.startsWith("demo-receipt-") || receipt.sourceSheet === "DEMONSTRAÇÃO";
}

function getSourceReceipts(receipts: Receipt[]) {
  const realReceipts = receipts.filter((receipt) => !isDemoReceipt(receipt));
  return realReceipts.length ? realReceipts : receipts;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function addToSummary(
  target: Map<string, ActualReceiptSummary>,
  clientKey: string,
  receipt: Receipt,
) {
  const current = target.get(clientKey) ?? { total: 0, dates: [], entries: 0 };
  current.total += receipt.amount;
  current.entries += 1;
  if (!current.dates.includes(receipt.receiptDate)) current.dates.push(receipt.receiptDate);
  current.dates.sort();
  target.set(clientKey, current);
}

function buildActuals(receipts: Receipt[]) {
  const result = new Map<string, MonthActuals>();

  getSourceReceipts(receipts).forEach((receipt) => {
    const date = parseIsoDate(receipt.receiptDate);
    const clientName = canonicalReceiptClientName(receipt.clientHint || receipt.description);
    if (!date || !clientName || !Number.isFinite(receipt.amount) || receipt.amount <= 0) return;

    const receiptMonthKey = monthKey(date);
    const receiptWeekKey = weekKey(date);
    const clientKey = normalizeClientKey(clientName);
    const monthActuals = result.get(receiptMonthKey) ?? {
      byClient: new Map<string, ActualReceiptSummary>(),
      byWeek: new Map<string, Map<string, ActualReceiptSummary>>(),
    };
    const weekActuals = monthActuals.byWeek.get(receiptWeekKey) ?? new Map<string, ActualReceiptSummary>();

    addToSummary(monthActuals.byClient, clientKey, receipt);
    addToSummary(weekActuals, clientKey, receipt);
    monthActuals.byWeek.set(receiptWeekKey, weekActuals);
    result.set(receiptMonthKey, monthActuals);
  });

  return result;
}

function buildHistoryBasis(receipts: Receipt[], now = new Date()) {
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0, 0);
  const months = Array.from({ length: HISTORY_MONTHS }, (_, index) => {
    const start = addMonths(currentMonth, index - HISTORY_MONTHS);
    return { key: monthKey(start), label: MONTH_FORMATTER.format(start) };
  });
  const monthIndex = new Map(months.map((month, index) => [month.key, index]));
  const totals = new Map<string, { clientName: string; values: number[] }>();

  getSourceReceipts(receipts).forEach((receipt) => {
    const date = parseIsoDate(receipt.receiptDate);
    const clientName = canonicalReceiptClientName(receipt.clientHint || receipt.description);
    if (!date || !clientName || !Number.isFinite(receipt.amount) || receipt.amount <= 0) return;
    const index = monthIndex.get(monthKey(date));
    if (index === undefined) return;

    const clientKey = normalizeClientKey(clientName);
    const current = totals.get(clientKey) ?? {
      clientName,
      values: Array(HISTORY_MONTHS).fill(0) as number[],
    };
    current.values[index] += receipt.amount;
    totals.set(clientKey, current);
  });

  const result = new Map<string, HistoryBasis>();
  totals.forEach((value, clientKey) => {
    const activeValues = value.values.filter((amount) => amount > 0);
    result.set(clientKey, {
      clientName: value.clientName,
      months: months.map((month, index) => ({ ...month, total: value.values[index] })),
      estimate: median(activeValues),
    });
  });
  return result;
}

function receiptDateDescription(summary: ActualReceiptSummary) {
  if (!summary.dates.length) return `${summary.entries} lançamentos`;
  if (summary.dates.length === 1) {
    return `${formatDate(summary.dates[0])} · ${summary.entries} lançamento${summary.entries === 1 ? "" : "s"}`;
  }
  return `${formatDate(summary.dates[0])} a ${formatDate(summary.dates[summary.dates.length - 1])} · ${summary.entries} lançamentos`;
}

function setText(element: Element | null, text: string) {
  if (element && element.textContent !== text) element.textContent = text;
}

function ForecastActualReceiptsSync({ data }: { data: ImportState }) {
  useEffect(() => {
    let frame = 0;
    const actuals = buildActuals(data.receipts);
    const historyBasis = buildHistoryBasis(data.receipts);

    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const root = document.querySelector<HTMLElement>(".receipt-forecast-page-v3");
        if (!root) return;

        const selects = root.querySelectorAll<HTMLSelectElement>(".forecast-filter-bar-v3 select");
        const clientSelect = selects.item(0);
        const monthSelect = selects.item(1);
        const weekSelect = selects.item(2);
        if (!monthSelect || !weekSelect) return;

        const selectedMonthKey = monthSelect.value;
        const selectedWeekKey = weekSelect.value;
        const selectedClientKey = clientSelect?.value ?? "all";
        const monthActuals = actuals.get(selectedMonthKey) ?? {
          byClient: new Map<string, ActualReceiptSummary>(),
          byWeek: new Map<string, Map<string, ActualReceiptSummary>>(),
        };
        const weekOptions = [...weekSelect.options].filter((option) => option.value !== "all");
        const weekIdByLabel = new Map(weekOptions.map((option) => [option.textContent?.trim() ?? "", option.value]));

        const headerRow = root.querySelector<HTMLTableRowElement>(".forecast-table-wrap-v3 thead tr");
        if (headerRow && !headerRow.querySelector(".forecast-status-header-v5")) {
          const header = document.createElement("th");
          header.className = "forecast-status-header-v5";
          header.textContent = "Situação na semana";
          const valueHeader = headerRow.children.item(4);
          if (valueHeader) valueHeader.after(header);
          else headerRow.append(header);
        }

        root.querySelectorAll<HTMLTableRowElement>(".forecast-table-wrap-v3 tbody tr").forEach((row) => {
          const clientName = row.querySelector<HTMLElement>(".forecast-client-v3 strong")?.textContent?.trim();
          if (!clientName) {
            const emptyCell = row.querySelector<HTMLTableCellElement>(".forecast-empty-row-v3");
            if (emptyCell && emptyCell.colSpan !== 9) emptyCell.colSpan = 9;
            return;
          }

          const clientKey = normalizeClientKey(clientName);
          const predictedWeekLabel = row.children.item(1)?.textContent?.trim() ?? "";
          const predictedWeekKey = weekIdByLabel.get(predictedWeekLabel) ?? "outside";
          const relevantWeekKey = selectedWeekKey === "all" ? predictedWeekKey : selectedWeekKey;
          const actualInRelevantWeek = monthActuals.byWeek.get(relevantWeekKey)?.get(clientKey);
          const actualInMonth = monthActuals.byClient.get(clientKey);

          let statusCell = row.querySelector<HTMLTableCellElement>(".forecast-status-cell-v5");
          if (!statusCell) {
            statusCell = document.createElement("td");
            statusCell.className = "forecast-status-cell-v5";
            const valueCell = row.children.item(4);
            if (valueCell) valueCell.after(statusCell);
            else row.append(statusCell);
          }

          const signature = actualInRelevantWeek
            ? `received:${relevantWeekKey}:${actualInRelevantWeek.total}:${actualInRelevantWeek.dates.join(",")}`
            : actualInMonth
              ? `other-week:${relevantWeekKey}:${actualInMonth.total}:${actualInMonth.dates.join(",")}`
              : `forecast:${relevantWeekKey}`;

          if (statusCell.dataset.signature !== signature) {
            statusCell.dataset.signature = signature;
            statusCell.replaceChildren();
            const badge = document.createElement("strong");
            const detail = document.createElement("small");

            if (actualInRelevantWeek) {
              badge.className = "forecast-status-badge-v5 received";
              badge.textContent = "Recebido nesta semana";
              detail.textContent = `${currency.format(actualInRelevantWeek.total)} · ${receiptDateDescription(actualInRelevantWeek)}`;
              row.classList.add("forecast-row-received-v5");
            } else {
              badge.className = "forecast-status-badge-v5 forecast";
              badge.textContent = "Previsto";
              detail.textContent = actualInMonth
                ? `Sem recebimento nesta semana. Há ${currency.format(actualInMonth.total)} recebido em outra semana do mês.`
                : "Sem recebimento lançado nesta semana.";
              row.classList.remove("forecast-row-received-v5");
            }
            statusCell.append(badge, detail);
          }
        });

        const weekCards = root.querySelectorAll<HTMLButtonElement>(".forecast-weeks-v3 button");
        weekCards.forEach((card, index) => {
          const cardWeekKey = weekOptions[index]?.value;
          const weekActuals = cardWeekKey ? monthActuals.byWeek.get(cardWeekKey) : undefined;
          const summaries = weekActuals
            ? [...weekActuals.entries()].filter(([clientKey]) => selectedClientKey === "all" || clientKey === selectedClientKey)
            : [];
          const total = summaries.reduce((sum, [, summary]) => sum + summary.total, 0);

          let receivedLine = card.querySelector<HTMLElement>(".forecast-week-received-v5");
          if (!receivedLine) {
            receivedLine = document.createElement("em");
            receivedLine.className = "forecast-week-received-v5";
            card.append(receivedLine);
          }
          setText(
            receivedLine,
            summaries.length
              ? `${summaries.length} cliente${summaries.length === 1 ? "" : "s"} recebido${summaries.length === 1 ? "" : "s"} · ${currency.format(total)}`
              : "Nenhum recebimento lançado nesta semana",
          );
        });

        const mainGridTitle = root.querySelector<HTMLElement>(".forecast-main-grid-v3 article:nth-child(2) h3");
        setText(mainGridTitle, "Previsão e recebidos por semana");

        const kpiCards = root.querySelectorAll<HTMLElement>(".forecast-kpis-v3 article");
        const selectedActualEntries = selectedWeekKey === "all"
          ? [...monthActuals.byClient.entries()]
          : [...(monthActuals.byWeek.get(selectedWeekKey)?.entries() ?? [])];
        const filteredActualEntries = selectedActualEntries.filter(([clientKey]) =>
          selectedClientKey === "all" || clientKey === selectedClientKey,
        );
        const receivedTotal = filteredActualEntries.reduce((sum, [, summary]) => sum + summary.total, 0);

        if (kpiCards.item(1)) {
          let actualLine = kpiCards.item(1).querySelector<HTMLElement>(".forecast-kpi-actual-v5");
          if (!actualLine) {
            actualLine = document.createElement("em");
            actualLine.className = "forecast-kpi-actual-v5";
            kpiCards.item(1).append(actualLine);
          }
          setText(
            actualLine,
            selectedWeekKey === "all"
              ? `Recebido no mês selecionado: ${currency.format(receivedTotal)}`
              : `Recebido nesta semana: ${currency.format(receivedTotal)}`,
          );
        }

        const detail = root.querySelector<HTMLElement>(".forecast-detail-v3");
        if (detail) {
          const clientName = detail.querySelector<HTMLElement>(".forecast-panel-header-v3 h3")?.textContent?.trim();
          const basis = clientName ? historyBasis.get(normalizeClientKey(clientName)) : undefined;
          let basisBox = detail.querySelector<HTMLElement>(".forecast-basis-v5");
          if (!basisBox) {
            basisBox = document.createElement("div");
            basisBox.className = "forecast-basis-v5";
            detail.querySelector(".forecast-panel-header-v3")?.after(basisBox);
          }
          if (basisBox && basis) {
            const signature = `${basis.clientName}:${basis.months.map((month) => month.total).join(",")}:${basis.estimate}`;
            if (basisBox.dataset.signature !== signature) {
              basisBox.dataset.signature = signature;
              basisBox.replaceChildren();

              const heading = document.createElement("div");
              const title = document.createElement("strong");
              const subtitle = document.createElement("span");
              title.textContent = "Base usada no valor estimado";
              subtitle.textContent = "Mediana dos totais mensais recebidos nos três meses completos";
              heading.append(title, subtitle);

              const monthList = document.createElement("div");
              monthList.className = "forecast-basis-months-v5";
              basis.months.forEach((month) => {
                const item = document.createElement("span");
                const label = document.createElement("small");
                const value = document.createElement("b");
                label.textContent = month.label;
                value.textContent = currency.format(month.total);
                item.append(label, value);
                monthList.append(item);
              });

              const result = document.createElement("div");
              result.className = "forecast-basis-result-v5";
              const resultLabel = document.createElement("span");
              const resultValue = document.createElement("strong");
              resultLabel.textContent = "Valor estimado pela mediana";
              resultValue.textContent = currency.format(basis.estimate);
              result.append(resultLabel, resultValue);
              basisBox.append(heading, monthList, result);
            }
          }
        }
      });
    };

    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("change", sync, true);
    document.addEventListener("click", sync, true);
    sync();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("change", sync, true);
      document.removeEventListener("click", sync, true);
    };
  }, [data]);

  return null;
}

export default function ReceiptForecastEnhancerV5() {
  const [data, setData] = useState<ImportState>(EMPTY_STATE);

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

  return (
    <>
      <ReceiptForecastEnhancerV4 />
      <ForecastActualReceiptsSync data={data} />
      <style jsx global>{`
        .forecast-status-header-v5,
        .forecast-status-cell-v5 { min-width: 210px; }
        .forecast-status-cell-v5 small {
          display: block;
          max-width: 240px;
          margin-top: 5px;
          color: #8992a7;
          font-size: 9px;
          line-height: 1.45;
        }
        .forecast-status-badge-v5 {
          display: inline-flex;
          align-items: center;
          padding: 5px 8px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 800;
          white-space: nowrap;
        }
        .forecast-status-badge-v5.received { background: #e7f8f1; color: #137a66; }
        .forecast-status-badge-v5.forecast { background: #eef0ff; color: #5266da; }
        .forecast-row-received-v5 td { background: #fbfffd; }
        .forecast-week-received-v5 {
          display: block;
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid #edf0f5;
          color: #16866f;
          font-size: 9px;
          font-style: normal;
          font-weight: 800;
          line-height: 1.4;
        }
        .forecast-kpi-actual-v5 {
          display: block;
          margin-top: 4px;
          color: #16866f;
          font-size: 10px;
          font-style: normal;
          font-weight: 700;
          line-height: 1.35;
        }
        .forecast-basis-v5 {
          display: grid;
          grid-template-columns: minmax(220px, .8fr) minmax(420px, 1.4fr) minmax(210px, .7fr);
          gap: 14px;
          align-items: stretch;
          margin: 16px 20px 0;
          padding: 14px;
          border: 1px solid #dfe5f1;
          border-radius: 13px;
          background: #f9faff;
        }
        .forecast-basis-v5 > div:first-child { display: grid; align-content: center; gap: 4px; }
        .forecast-basis-v5 > div:first-child strong { color: #303a54; font-size: 12px; }
        .forecast-basis-v5 > div:first-child span { color: #858ea3; font-size: 9px; line-height: 1.45; }
        .forecast-basis-months-v5 {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }
        .forecast-basis-months-v5 > span {
          display: grid;
          gap: 4px;
          padding: 9px;
          border: 1px solid #e4e8f1;
          border-radius: 9px;
          background: #fff;
        }
        .forecast-basis-months-v5 small { color: #8992a7; font-size: 8px; text-transform: capitalize; }
        .forecast-basis-months-v5 b { color: #3a445e; font-size: 11px; }
        .forecast-basis-result-v5 {
          display: grid;
          align-content: center;
          gap: 4px;
          padding: 10px 12px;
          border-radius: 10px;
          background: #5d72f6;
          color: #fff;
        }
        .forecast-basis-result-v5 span { font-size: 9px; opacity: .85; }
        .forecast-basis-result-v5 strong { font-size: 15px; }
        @media (max-width: 980px) {
          .forecast-basis-v5 { grid-template-columns: 1fr; }
        }
        @media (max-width: 620px) {
          .forecast-basis-months-v5 { grid-template-columns: 1fr; }
        }
      `}</style>
    </>
  );
}
