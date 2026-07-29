"use client";

import { useEffect } from "react";
import { filterReceipts } from "@/lib/analytics";
import type { ImportState, PeriodFilter } from "@/lib/types";

const MAIN_STORAGE_KEY = "financial-analytics-data-v1";
const CHANNEL_STORAGE_KEY = "financial-analytics-receipt-channels-v1";
const INCLUDE_STORAGE_KEY = "financial-analytics-include-receipt-channels-v1";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

type ChannelEntry = {
  receiptDate: string;
  amount: number;
};

type ChannelPayload = {
  entries?: ChannelEntry[];
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

  return {
    year: year === "all" ? "all" : Number(year),
    month: month === "all" ? "all" : Number(month),
    client: selects[2]?.value ?? "",
  };
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

export default function ReceiptChannelTotalSyncFix() {
  useEffect(() => {
    const apply = () => {
      const view = normalize(document.querySelector<HTMLElement>(".topbar-title h1")?.textContent);
      if (view !== "VISAO GERAL") return;

      const mainData = readJson<ImportState>(MAIN_STORAGE_KEY, { invoices: [], receipts: [] });
      const channelData = readJson<ChannelPayload>(CHANNEL_STORAGE_KEY, { entries: [] });
      const filter = readFilter();
      const includeRequested = window.localStorage.getItem(INCLUDE_STORAGE_KEY) === "true";
      const canInclude = !filter.client;

      const filteredReceipts = filterReceipts(mainData.receipts ?? [], filter);
      const baseReceived = filteredReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);
      const channelTotal = (channelData.entries ?? [])
        .filter((entry) => inPeriod(entry.receiptDate, filter))
        .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
      const adjustedReceived = baseReceived + (includeRequested && canInclude ? channelTotal : 0);

      const cards = Array.from(document.querySelectorAll<HTMLElement>(".kpi-card"));
      const receivedCard = cards.find((card) =>
        normalize(card.querySelector(".kpi-title")?.textContent) === "RECEBIDO"
      );
      if (!receivedCard) return;

      setText(receivedCard.querySelector<HTMLElement>(":scope > strong"), currency.format(adjustedReceived));
      setText(
        receivedCard.querySelector<HTMLElement>(".kpi-detail"),
        includeRequested && canInclude
          ? `${filteredReceipts.length.toLocaleString("pt-BR")} lançamentos + Cielo/PIX`
          : `${filteredReceipts.length.toLocaleString("pt-BR")} lançamentos`,
      );
      receivedCard.dataset.receiptChannelIncluded = String(includeRequested && canInclude);
    };

    const applySoon = () => {
      window.requestAnimationFrame(apply);
      window.setTimeout(apply, 40);
      window.setTimeout(apply, 180);
    };

    applySoon();
    const timer = window.setInterval(apply, 250);
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", applySoon, true);
    document.addEventListener("change", applySoon, true);
    window.addEventListener("storage", applySoon);

    return () => {
      window.clearInterval(timer);
      observer.disconnect();
      document.removeEventListener("click", applySoon, true);
      document.removeEventListener("change", applySoon, true);
      window.removeEventListener("storage", applySoon);
    };
  }, []);

  return null;
}
