"use client";

import { useEffect } from "react";
import { filterInvoices, filterReceipts } from "@/lib/analytics";
import { splitClientSelection } from "@/lib/clientSelection";
import type { ImportState, PeriodFilter } from "@/lib/types";

const MAIN_STORAGE_KEY = "financial-analytics-data-v1";
const CHANNEL_STORAGE_KEY = "financial-analytics-receipt-channels-v1";
const INCLUDE_STORAGE_KEY = "financial-analytics-include-receipt-channels-v1";
const CHANNEL_EVENT = "financial-analytics-receipt-channels-updated";
const INCLUDE_EVENT = "financial-analytics-receipt-channels-include-changed";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

type ChannelEntry = {
  receiptDate: string;
  amount: number;
  kind?: string;
  description?: string;
};

type ChannelPayload = {
  entries?: ChannelEntry[];
};

type IncludeEventDetail = {
  included?: boolean;
};

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function readFilter(): PeriodFilter {
  const selects = Array.from(document.querySelectorAll<HTMLSelectElement>(".filter-bar select"));
  const year = selects[0]?.value ?? "all";
  const month = selects[1]?.value ?? "all";
  const client = document.querySelector<HTMLSelectElement>(".client-filter select")?.value ?? "";

  return {
    year: year === "all" ? "all" : Number(year),
    month: month === "all" ? "all" : Number(month),
    client,
  };
}

function hasSelectedClient(value: string) {
  return splitClientSelection(value)
    .map(normalize)
    .filter((client) => client && client !== "TODOS OS CLIENTES")
    .length > 0;
}

function inPeriod(dateValue: string, filter: PeriodFilter) {
  const date = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(date.getTime())) return false;

  return (filter.year === "all" || date.getFullYear() === filter.year)
    && (filter.month === "all" || date.getMonth() === filter.month);
}

function setText(element: HTMLElement | null | undefined, value: string) {
  if (element && element.textContent !== value) element.textContent = value;
}

function findKpiCard(titles: string[]) {
  return Array.from(document.querySelectorAll<HTMLElement>(".kpi-card")).find((card) => {
    const title = normalize(card.querySelector(".kpi-title")?.textContent);
    return titles.some((candidate) => title === candidate || title.includes(candidate));
  }) ?? null;
}

export default function ReceiptChannelTotalSyncFix() {
  useEffect(() => {
    let eventIncluded: boolean | null = null;

    const apply = () => {
      const view = normalize(document.querySelector<HTMLElement>(".topbar-title h1")?.textContent);
      if (view !== "VISAO GERAL") return;

      const mainData = readJson<ImportState>(MAIN_STORAGE_KEY, { invoices: [], receipts: [] });
      const channelData = readJson<ChannelPayload>(CHANNEL_STORAGE_KEY, { entries: [] });
      const filter = readFilter();
      const storedIncluded = window.localStorage.getItem(INCLUDE_STORAGE_KEY) === "true";
      const includeRequested = eventIncluded ?? storedIncluded;
      const canInclude = !hasSelectedClient(filter.client);

      const filteredReceipts = filterReceipts(mainData.receipts ?? [], filter);
      const baseReceived = filteredReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);
      const periodEntries = (channelData.entries ?? []).filter((entry) => inPeriod(entry.receiptDate, filter));
      const channelTotal = periodEntries
        .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
      const includedChannelTotal = includeRequested && canInclude ? channelTotal : 0;
      const adjustedReceived = baseReceived + includedChannelTotal;

      const receivedCard = findKpiCard(["RECEBIDO"]);
      if (receivedCard) {
        setText(receivedCard.querySelector<HTMLElement>(":scope > strong"), currency.format(adjustedReceived));
        setText(
          receivedCard.querySelector<HTMLElement>(".kpi-detail"),
          includeRequested && canInclude
            ? `${filteredReceipts.length.toLocaleString("pt-BR")} lançamentos + Cielo/PIX`
            : `${filteredReceipts.length.toLocaleString("pt-BR")} lançamentos`,
        );
        receivedCard.dataset.receiptBaseTotal = String(baseReceived);
        receivedCard.dataset.receiptChannelTotal = String(includedChannelTotal);
        receivedCard.dataset.receiptChannelIncluded = String(includeRequested && canInclude);
      }

      const emitted = filterInvoices(mainData.invoices ?? [], filter)
        .reduce((sum, invoice) => sum + invoice.grossValue, 0);
      const balance = emitted - adjustedReceived;
      const balanceCard = findKpiCard([
        "DIFERENCA DO PERIODO",
        "A RECEBER",
        "SALDO A RECEBER",
        "SALDO",
      ]);

      if (balanceCard) {
        setText(balanceCard.querySelector<HTMLElement>(":scope > strong"), currency.format(balance));
        setText(
          balanceCard.querySelector<HTMLElement>(".kpi-detail"),
          balance >= 0 ? "Emitido acima do recebido" : "Recebido acima do emitido",
        );
      }

      const toggle = document.querySelector<HTMLButtonElement>(".receipt-channel-toggle");
      if (toggle) {
        toggle.dataset.receivedAdjustedTotal = currency.format(adjustedReceived);
        toggle.dataset.includeEffective = String(includeRequested && canInclude);
        toggle.setAttribute("aria-checked", String(includeRequested));
      }

      eventIncluded = null;
    };

    const applySoon = () => {
      window.requestAnimationFrame(apply);
      window.setTimeout(apply, 30);
      window.setTimeout(apply, 120);
      window.setTimeout(apply, 300);
    };

    const onIncludeChange = (event: Event) => {
      const detail = (event as CustomEvent<IncludeEventDetail>).detail;
      if (typeof detail?.included === "boolean") eventIncluded = detail.included;
      applySoon();
    };

    applySoon();
    const timer = window.setInterval(apply, 350);
    const observer = new MutationObserver(applySoon);
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener("click", applySoon, true);
    document.addEventListener("change", applySoon, true);
    window.addEventListener("storage", applySoon);
    window.addEventListener(CHANNEL_EVENT, applySoon);
    window.addEventListener(INCLUDE_EVENT, onIncludeChange);

    return () => {
      window.clearInterval(timer);
      observer.disconnect();
      document.removeEventListener("click", applySoon, true);
      document.removeEventListener("change", applySoon, true);
      window.removeEventListener("storage", applySoon);
      window.removeEventListener(CHANNEL_EVENT, applySoon);
      window.removeEventListener(INCLUDE_EVENT, onIncludeChange);
    };
  }, []);

  return null;
}
