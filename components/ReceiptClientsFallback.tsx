"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ImportState, Receipt } from "@/lib/types";
import { currency, percent } from "@/lib/format";
import { clientKey, sameClientName } from "@/lib/clientNames";
import { splitClientSelection } from "@/lib/clientSelection";
import {
  canonicalReceiptClientName,
  receiptClientKey,
  sameReceiptClientName,
} from "@/lib/receiptClientNames";

const STORAGE_KEY = "financial-analytics-data-v1";

type FilterSnapshot = {
  year: number | "all";
  month: number | "all";
  client: string;
};

type ClientRow = {
  name: string;
  value: number;
};

function displayClient(receipt: Receipt) {
  return canonicalReceiptClientName(
    receipt.clientHint || receipt.description || "Cliente não identificado",
  ) || "Cliente não identificado";
}

function parseData(raw: string | null): ImportState {
  try {
    return raw ? JSON.parse(raw) as ImportState : { invoices: [], receipts: [] };
  } catch {
    return { invoices: [], receipts: [] };
  }
}

function readFilters(): FilterSnapshot {
  const selects = Array.from(document.querySelectorAll<HTMLSelectElement>(".filter-bar select"));
  const yearValue = selects[0]?.value ?? "all";
  const monthValue = selects[1]?.value ?? "all";
  return {
    year: yearValue === "all" ? "all" : Number(yearValue),
    month: monthValue === "all" ? "all" : Number(monthValue),
    client: selects[2]?.value ?? "",
  };
}

function inPeriod(dateValue: string, filter: FilterSnapshot) {
  const date = new Date(`${dateValue}T12:00:00`);
  return (filter.year === "all" || date.getFullYear() === filter.year)
    && (filter.month === "all" || date.getMonth() === filter.month);
}

function matchesInvoiceSelection(selection: string, candidate: string) {
  const clients = splitClientSelection(selection);
  return !clients.length || clients.some((client) => sameClientName(client, candidate));
}

function matchesReceiptSelection(selection: string, candidate: string) {
  const clients = splitClientSelection(selection);
  return !clients.length || clients.some((client) => sameReceiptClientName(client, candidate));
}

function setNativeSelect(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  if (setter) setter.call(select, value);
  else select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function addReceiptClientOptions(data: ImportState) {
  const select = document.querySelector<HTMLSelectElement>(".client-filter select");
  if (!select) return;

  const existing = new Set(
    Array.from(select.options)
      .filter((option) => option.dataset.multiClient !== "true")
      .map((option) => receiptClientKey(option.textContent?.trim() || option.value))
      .filter(Boolean),
  );

  const clients = [...new Map(data.receipts.map((receipt) => {
    const name = displayClient(receipt);
    return [receiptClientKey(name), name] as const;
  })).values()]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));

  clients.forEach((client) => {
    const key = receiptClientKey(client);
    if (!key || existing.has(key)) return;
    const option = document.createElement("option");
    option.value = client;
    option.textContent = client;
    option.dataset.receiptClient = "true";
    select.appendChild(option);
    existing.add(key);
  });
}

export default function ReceiptClientsFallback() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [data, setData] = useState<ImportState>({ invoices: [], receipts: [] });
  const [filters, setFilters] = useState<FilterSnapshot>({ year: "all", month: "all", client: "" });
  const dataSignature = useRef("");
  const filterSignature = useRef("");

  useEffect(() => {
    const sync = () => {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const nextData = parseData(raw);
      const nextFilters = readFilters();
      const nextFilterSignature = `${nextFilters.year}|${nextFilters.month}|${nextFilters.client}`;
      const nextTarget = document.querySelector<HTMLElement>(".clients-page");

      addReceiptClientOptions(nextData);

      if ((raw ?? "") !== dataSignature.current) {
        dataSignature.current = raw ?? "";
        setData(nextData);
      }
      if (nextFilterSignature !== filterSignature.current) {
        filterSignature.current = nextFilterSignature;
        setFilters(nextFilters);
      }
      setTarget((current) => current === nextTarget ? current : nextTarget);
    };

    sync();
    document.addEventListener("change", sync, true);
    window.addEventListener("storage", sync);
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(sync, 700);

    return () => {
      document.removeEventListener("change", sync, true);
      window.removeEventListener("storage", sync);
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, []);

  const filteredInvoiceCount = useMemo(() => data.invoices.filter((invoice) =>
    inPeriod(invoice.emissionDate, filters)
    && matchesInvoiceSelection(filters.client, invoice.clientName),
  ).length, [data.invoices, filters]);

  const rows = useMemo(() => {
    const grouped = new Map<string, ClientRow>();
    data.receipts
      .filter((receipt) => inPeriod(receipt.receiptDate, filters))
      .filter((receipt) => matchesReceiptSelection(filters.client, displayClient(receipt)))
      .forEach((receipt) => {
        const name = displayClient(receipt);
        const key = receiptClientKey(name) || name;
        const current = grouped.get(key) ?? { name, value: 0 };
        current.value += receipt.amount;
        grouped.set(key, current);
      });
    return [...grouped.values()]
      .filter((item) => item.value !== 0)
      .sort((a, b) => b.value - a.value);
  }, [data.receipts, filters]);

  const active = Boolean(target && filteredInvoiceCount === 0 && rows.length > 0);
  const total = rows.reduce((sum, item) => sum + item.value, 0);
  const leader = rows[0];

  useEffect(() => {
    if (!target) return;
    target.classList.toggle("receipt-clients-fallback-active", active);
    return () => target.classList.remove("receipt-clients-fallback-active");
  }, [target, active]);

  if (!target || !active) return null;

  return createPortal(
    <section className="receipt-clients-fallback">
      <div className="client-summary-card">
        <span>Maior cliente recebido no período</span>
        <h2>{leader?.name ?? "—"}</h2>
        <strong>{currency.format(leader?.value ?? 0)}</strong>
        <small>{percent.format(total ? (leader?.value ?? 0) / total : 0)} do total recebido</small>
      </div>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Recebimentos por cliente</h2>
            <p>Dados identificados na planilha de conciliação</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>#</th><th>Cliente</th><th className="number">Valor recebido</th><th className="number">Participação</th><th>Representação</th></tr>
            </thead>
            <tbody>
              {rows.map((item, index) => {
                const participation = total ? item.value / total : 0;
                return (
                  <tr
                    key={`${receiptClientKey(item.name)}-${index}`}
                    className="clickable-row"
                    onClick={() => {
                      const select = document.querySelector<HTMLSelectElement>(".client-filter select");
                      if (select) {
                        addReceiptClientOptions(data);
                        const matchingOption = Array.from(select.options).find((option) =>
                          option.dataset.multiClient !== "true"
                          && sameReceiptClientName(option.textContent?.trim() || option.value, item.name),
                        );
                        setNativeSelect(select, matchingOption?.value || item.name);
                      }
                      const overviewButton = Array.from(document.querySelectorAll<HTMLButtonElement>(".sidebar nav button"))
                        .find((button) => (button.textContent ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim() === "VISAO GERAL");
                      overviewButton?.click();
                    }}
                  >
                    <td>{index + 1}</td>
                    <td className="client-cell">{item.name}</td>
                    <td className="number"><strong>{currency.format(item.value)}</strong></td>
                    <td className="number">{percent.format(participation)}</td>
                    <td><div className="table-progress"><i style={{ width: `${Math.max(0, participation * 100)}%` }} /></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <style jsx global>{`
        .clients-page.receipt-clients-fallback-active > .client-summary-card,
        .clients-page.receipt-clients-fallback-active > .panel {
          display: none !important;
        }
        .receipt-clients-fallback {
          display: grid;
          gap: 16px;
        }
      `}</style>
    </section>,
    target,
  );
}
