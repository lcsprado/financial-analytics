"use client";

import { useEffect } from "react";
import { filterInvoices } from "@/lib/analytics";
import { formatDate } from "@/lib/format";
import {
  ANALYSIS_DATA_EVENT,
  loadAnalysisState,
  readStoredFilter,
} from "@/lib/offlineStorage";
import type { ImportState, Invoice } from "@/lib/types";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function parseBrazilianDate(value: string) {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return "";
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function invoiceSignature(invoice: Invoice) {
  return [
    invoice.emissionDate,
    invoice.invoiceNumber.trim(),
    invoice.clientName.trim(),
    invoice.clientCode.trim(),
    currency.format(invoice.grossValue),
    currency.format(invoice.netValue),
  ].join("|");
}

function rowSignature(row: HTMLTableRowElement) {
  const cells = row.cells;
  return [
    parseBrazilianDate(cells[0]?.textContent ?? ""),
    cells[1]?.textContent?.trim() === "—" ? "" : cells[1]?.textContent?.trim() ?? "",
    cells[2]?.textContent?.trim() ?? "",
    cells[3]?.textContent?.trim() === "—" ? "" : cells[3]?.textContent?.trim() ?? "",
    cells[4]?.textContent?.trim() ?? "",
    cells[5]?.textContent?.trim() ?? "",
  ].join("|");
}

function createInvoiceRow(invoice: Invoice) {
  const row = document.createElement("tr");
  row.dataset.invoiceDateRangeExtra = "true";

  const dateCell = document.createElement("td");
  dateCell.textContent = formatDate(invoice.emissionDate);

  const invoiceCell = document.createElement("td");
  const invoicePill = document.createElement("span");
  invoicePill.className = "nf-pill";
  invoicePill.textContent = invoice.invoiceNumber || "—";
  invoiceCell.append(invoicePill);

  const clientCell = document.createElement("td");
  clientCell.className = "client-cell";
  clientCell.textContent = invoice.clientName;

  const codeCell = document.createElement("td");
  codeCell.textContent = invoice.clientCode || "—";

  const grossCell = document.createElement("td");
  grossCell.className = "number";
  const grossStrong = document.createElement("strong");
  grossStrong.textContent = currency.format(invoice.grossValue);
  grossCell.append(grossStrong);

  const netCell = document.createElement("td");
  netCell.className = "number";
  netCell.textContent = currency.format(invoice.netValue);

  row.append(dateCell, invoiceCell, clientCell, codeCell, grossCell, netCell);
  return row;
}

export default function InvoiceDateRangeTableFix() {
  useEffect(() => {
    let analysisState: ImportState | null = null;
    let timer: number | null = null;

    const apply = () => {
      const panel = Array.from(document.querySelectorAll<HTMLElement>(".panel"))
        .find((item) => item.querySelector("h2")?.textContent?.trim() === "Notas emitidas");
      if (!panel) return;

      const tbody = panel.querySelector<HTMLTableSectionElement>("tbody");
      const toolbar = panel.querySelector<HTMLElement>(".table-toolbar");
      if (!tbody || !toolbar) return;

      const start = panel.querySelector<HTMLInputElement>('input[name="invoice-start-date"]')?.value ?? "";
      const end = panel.querySelector<HTMLInputElement>('input[name="invoice-end-date"]')?.value ?? "";

      tbody.querySelectorAll<HTMLTableRowElement>('tr[data-invoice-date-range-extra="true"]')
        .forEach((row) => row.remove());

      const nativeRows = Array.from(tbody.querySelectorAll<HTMLTableRowElement>("tr"));

      if (!analysisState || (!start && !end)) {
        nativeRows.forEach((row) => { row.style.display = ""; });
        return;
      }

      const search = toolbar.querySelector<HTMLInputElement>(".search-box input")?.value.trim().toLocaleLowerCase("pt-BR") ?? "";
      const globalFilter = readStoredFilter();
      const realInvoices = analysisState.invoices.filter((invoice) => !invoice.id.startsWith("demo-invoice-"));
      const source = realInvoices.length ? realInvoices : analysisState.invoices;

      const filtered = filterInvoices(source, globalFilter)
        .filter((invoice) => {
          const afterStart = !start || invoice.emissionDate >= start;
          const beforeEnd = !end || invoice.emissionDate <= end;
          const matchesSearch = !search || `${invoice.invoiceNumber} ${invoice.clientName} ${invoice.clientCode}`
            .toLocaleLowerCase("pt-BR")
            .includes(search);
          return afterStart && beforeEnd && matchesSearch;
        })
        .sort((a, b) => b.emissionDate.localeCompare(a.emissionDate));

      nativeRows.forEach((row) => {
        const date = parseBrazilianDate(row.cells[0]?.textContent ?? "");
        const afterStart = !start || date >= start;
        const beforeEnd = !end || date <= end;
        const text = row.textContent?.toLocaleLowerCase("pt-BR") ?? "";
        const matchesSearch = !search || text.includes(search);
        row.style.display = date && afterStart && beforeEnd && matchesSearch ? "" : "none";
      });

      const existingCounts = new Map<string, number>();
      nativeRows.forEach((row) => {
        const signature = rowSignature(row);
        existingCounts.set(signature, (existingCounts.get(signature) ?? 0) + 1);
      });

      const extras: Invoice[] = [];
      filtered.forEach((invoice) => {
        const signature = invoiceSignature(invoice);
        const count = existingCounts.get(signature) ?? 0;
        if (count > 0) {
          existingCounts.set(signature, count - 1);
        } else {
          extras.push(invoice);
        }
      });

      const visibleNativeCount = nativeRows.filter((row) => row.style.display !== "none").length;
      const remainingSlots = Math.max(0, 500 - visibleNativeCount);
      extras.slice(0, remainingSlots).forEach((invoice) => tbody.append(createInvoiceRow(invoice)));

      const note = panel.querySelector<HTMLElement>(".table-note");
      if (note) note.style.display = filtered.length > 500 ? "" : "none";
    };

    const schedule = (delay = 0) => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(apply, delay);
    };

    const handleData = (event: Event) => {
      analysisState = (event as CustomEvent<ImportState>).detail;
      schedule();
    };

    const handleInteraction = (event: Event) => {
      const target = event.target as Element | null;
      if (!target) return;
      if (
        target.closest('[data-invoice-date-filter]')
        || target.closest(".filter-bar")
        || target.closest(".table-toolbar")
      ) {
        schedule(50);
      }
    };

    void loadAnalysisState().then((stored) => {
      analysisState = stored;
      schedule();
    });

    const observer = new MutationObserver(() => schedule(20));
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener(ANALYSIS_DATA_EVENT, handleData);
    document.addEventListener("change", handleInteraction, true);
    document.addEventListener("input", handleInteraction, true);
    document.addEventListener("click", handleInteraction, true);

    return () => {
      observer.disconnect();
      window.removeEventListener(ANALYSIS_DATA_EVENT, handleData);
      document.removeEventListener("change", handleInteraction, true);
      document.removeEventListener("input", handleInteraction, true);
      document.removeEventListener("click", handleInteraction, true);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  return null;
}
