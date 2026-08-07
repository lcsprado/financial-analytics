"use client";

import { useEffect, useRef, useState } from "react";
import { ANALYSIS_DATA_EVENT, loadAnalysisState, OFFLINE_DATA_CLEARED_EVENT } from "@/lib/offlineStorage";
import { canonicalReceiptClientName } from "@/lib/receiptClientNames";
import type { ImportState, Receipt } from "@/lib/types";

const EMPTY_STATE: ImportState = { invoices: [], receipts: [] };
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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

function addDays(date: Date, amount: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function buildWeeks(monthKey: string) {
  const month = parseIso(`${monthKey}-01`);
  if (!month) return [];
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  let monday = addDays(first, (8 - first.getDay()) % 7);
  const weeks: Array<{ id: string; start: Date; end: Date }> = [];
  while (monday.getMonth() === month.getMonth() && monday.getFullYear() === month.getFullYear()) {
    weeks.push({ id: toIso(monday), start: new Date(monday), end: addDays(monday, 4) });
    monday = addDays(monday, 7);
  }
  return weeks;
}

function isBetween(date: Date, start: Date, end: Date) {
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

function sourceReceipts(receipts: Receipt[]) {
  const real = receipts.filter((receipt) => !receipt.id.startsWith("demo-receipt-") && receipt.sourceSheet !== "DEMONSTRAÇÃO");
  return real.length ? real : receipts;
}

function dateFromBr(value: string) {
  const match = value.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return "";
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function numericCurrency(value: string) {
  const cleaned = value
    .replace(/R\$/gi, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function setText(element: Element | null, value: string) {
  if (element && element.textContent !== value) element.textContent = value;
}

function receivedStatus(cell: HTMLTableCellElement, dates: string[]) {
  cell.innerHTML = "";
  const wrapper = document.createElement("span");
  wrapper.className = "status received";
  const title = document.createElement("b");
  title.textContent = "✓ Recebido";
  const detail = document.createElement("small");
  detail.textContent = dates.map((date) => {
    const parsed = parseIso(date);
    return parsed ? parsed.toLocaleDateString("pt-BR") : date;
  }).join(", ");
  wrapper.append(title, detail);
  cell.append(wrapper);
}

function currentMonthKey() {
  const selects = document.querySelectorAll<HTMLSelectElement>(".forecast-filter-v13 select");
  return selects[1]?.value || "";
}

function currentWeekFilter() {
  const selects = document.querySelectorAll<HTMLSelectElement>(".forecast-filter-v13 select");
  return selects[2]?.value || "all";
}

type ActualInfo = { total: number; dates: string[] };

function actualsForPeriod(data: ImportState, monthKey: string) {
  const weeks = buildWeeks(monthKey);
  const byClientWeek = new Map<string, ActualInfo>();
  const clients = new Set<string>();
  if (!weeks.length) return { weeks, byClientWeek, clients };

  sourceReceipts(data.receipts).forEach((receipt) => {
    const date = parseIso(receipt.receiptDate);
    if (!date || !Number.isFinite(receipt.amount) || receipt.amount <= 0) return;
    const week = weeks.find((item) => isBetween(date, item.start, item.end));
    if (!week) return;
    const name = canonicalReceiptClientName(receipt.clientHint || receipt.description);
    const clientKey = normalizeKey(name);
    if (!clientKey) return;
    clients.add(clientKey);
    const key = `${clientKey}|${week.id}`;
    const current = byClientWeek.get(key) ?? { total: 0, dates: [] };
    current.total += receipt.amount;
    if (!current.dates.includes(receipt.receiptDate)) current.dates.push(receipt.receiptDate);
    current.dates.sort();
    byClientWeek.set(key, current);
  });

  return { weeks, byClientWeek, clients };
}

function readRow(row: HTMLTableRowElement) {
  const cells = row.querySelectorAll<HTMLTableCellElement>("td");
  if (cells.length < 7) return null;
  const clientName = cells[0].querySelector("strong")?.textContent?.trim() || "";
  const weekId = dateFromBr(cells[1].textContent || "");
  const value = numericCurrency(cells[2].textContent || "");
  const statusTitle = cells[3].querySelector(".status b")?.textContent?.trim() || "";
  const confidence = cells[5].textContent?.trim() || "";
  return { cells, clientName, clientKey: normalizeKey(clientName), weekId, value, statusTitle, confidence };
}

function refreshCardsAndWeeks() {
  const tableRows = [...document.querySelectorAll<HTMLTableRowElement>(".forecast-table-v13 tbody tr")]
    .filter((row) => row.style.display !== "none")
    .map(readRow)
    .filter((row): row is NonNullable<ReturnType<typeof readRow>> => Boolean(row));

  let pendingValue = 0;
  let receivedValue = 0;
  let highValue = 0;
  const pendingClients = new Set<string>();
  const receivedClients = new Set<string>();

  tableRows.forEach((row) => {
    const received = row.statusTitle.includes("Recebido");
    if (received) {
      receivedValue += row.value;
      receivedClients.add(row.clientKey);
    } else {
      pendingValue += row.value;
      pendingClients.add(row.clientKey);
      if (row.confidence === "Alta") highValue += row.value;
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

  const panelSubtitle = document.querySelectorAll<HTMLElement>(".forecast-panel-head-v13 p");
  const clientPanelSubtitle = [...panelSubtitle].find((item) => item.textContent?.includes("registros no filtro atual"));
  if (clientPanelSubtitle) clientPanelSubtitle.textContent = `${tableRows.length} registros no filtro atual`;

  const scopeAll = cards[0]?.classList.contains("active");
  if (!scopeAll) return;

  const weekFilter = currentWeekFilter();
  const weekButtons = document.querySelectorAll<HTMLButtonElement>(".forecast-weeks-v13 button");
  weekButtons.forEach((button) => {
    const label = button.querySelector("span")?.textContent || "";
    const weekId = dateFromBr(label);
    if (!weekId || (weekFilter !== "all" && weekFilter !== weekId)) return;
    const rows = tableRows.filter((row) => row.weekId === weekId);
    let pending = 0;
    let received = 0;
    const predictedClients = new Set<string>();
    const receivedClients = new Set<string>();
    const names: string[] = [];
    rows.forEach((row) => {
      if (row.statusTitle.includes("Recebido")) {
        received += row.value;
        receivedClients.add(row.clientKey);
      } else {
        pending += row.value;
        predictedClients.add(row.clientKey);
        if (row.clientName && !names.includes(row.clientName) && names.length < 4) names.push(row.clientName);
      }
    });
    setText(button.querySelector("strong"), `A receber: ${currency.format(pending)}`);
    setText(button.querySelector("em"), `Recebido: ${currency.format(received)}`);
    setText(button.querySelector("small"), `${predictedClients.size} previstos · ${receivedClients.size} recebidos`);
    setText(button.querySelector("i"), names.length ? names.join(" · ") : receivedClients.size ? "Sem previsão pendente · já recebido" : "Sem previsão recorrente");
  });
}

function applyBusinessRule(data: ImportState) {
  if (!document.body.classList.contains("receipt-forecast-active-v13")) return;
  const monthKey = currentMonthKey();
  if (!monthKey) return;
  const { byClientWeek, clients } = actualsForPeriod(data, monthKey);
  const rows = document.querySelectorAll<HTMLTableRowElement>(".forecast-table-v13 tbody tr");

  rows.forEach((row) => {
    const info = readRow(row);
    if (!info) return;
    const status = info.statusTitle;
    const isManual = status.includes("Adicionado manualmente") || status.includes("Valor confirmado");
    const isReceived = status.includes("Recebido") && !status.includes("Pagou a menor");
    const clientReceived = clients.has(info.clientKey);

    if (isManual || isReceived || !clientReceived) {
      if (row.dataset.receiptRuleHidden === "true") {
        row.style.display = "";
        delete row.dataset.receiptRuleHidden;
      }
      return;
    }

    const actual = byClientWeek.get(`${info.clientKey}|${info.weekId}`);
    if (status.includes("Pagou a menor") && actual) {
      row.style.display = "";
      delete row.dataset.receiptRuleHidden;
      setText(info.cells[2].querySelector("strong"), currency.format(actual.total));
      receivedStatus(info.cells[3], actual.dates);
      info.cells[6].innerHTML = '<span class="no-action">—</span>';
      row.dataset.receiptRuleReceived = "true";
      return;
    }

    row.style.display = "none";
    row.dataset.receiptRuleHidden = "true";
  });

  refreshCardsAndWeeks();
}

function sanitizeCurrencyInput(event: Event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.closest(".forecast-modal-v13")) return;
  const label = input.closest("label");
  const title = label?.querySelector("span")?.textContent?.trim().toUpperCase() || "";
  if (title !== "VALOR PREVISTO" && title !== "VALOR CONFIRMADO") return;

  const clean = input.value.replace(/R\$/gi, "").replace(/\s+/g, "").replace(/[^0-9.,-]/g, "");
  if (clean !== input.value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, clean);
  }
}

export default function ReceiptForecastReceivedRuleFix() {
  const [data, setData] = useState<ImportState>(EMPTY_STATE);
  const scheduled = useRef<number | null>(null);
  const applying = useRef(false);

  useEffect(() => {
    let active = true;
    void loadAnalysisState().then((stored) => {
      if (active && stored) setData(stored);
    });
    const onData = (event: Event) => {
      const detail = (event as CustomEvent<ImportState>).detail;
      if (detail) setData(detail);
    };
    const onClear = () => setData(EMPTY_STATE);
    window.addEventListener(ANALYSIS_DATA_EVENT, onData);
    window.addEventListener(OFFLINE_DATA_CLEARED_EVENT, onClear);
    return () => {
      active = false;
      window.removeEventListener(ANALYSIS_DATA_EVENT, onData);
      window.removeEventListener(OFFLINE_DATA_CLEARED_EVENT, onClear);
    };
  }, []);

  useEffect(() => {
    const schedule = () => {
      if (applying.current || scheduled.current !== null) return;
      scheduled.current = window.requestAnimationFrame(() => {
        scheduled.current = null;
        applying.current = true;
        try {
          applyBusinessRule(data);
        } finally {
          window.setTimeout(() => { applying.current = false; }, 0);
        }
      });
    };

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class"] });
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
