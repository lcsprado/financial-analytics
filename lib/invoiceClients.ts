import { canonicalClientName, clientKey, normalizeClientText } from "./clientNames";
import type { Invoice } from "./types";

export function normalizeInvoiceClientCode(value: string) {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .trim()
    .toUpperCase();
}

type NameStat = {
  name: string;
  count: number;
  firstIndex: number;
};

function preferredNamesByCode(invoices: Invoice[]) {
  const grouped = new Map<string, Map<string, NameStat>>();

  invoices.forEach((invoice, index) => {
    const code = normalizeInvoiceClientCode(invoice.clientCode);
    if (!code) return;

    const displayName = canonicalClientName(invoice.clientName) || invoice.clientName.trim();
    const nameKey = normalizeClientText(displayName);
    if (!nameKey) return;

    const names = grouped.get(code) ?? new Map<string, NameStat>();
    const current = names.get(nameKey);
    if (current) current.count += 1;
    else names.set(nameKey, { name: displayName, count: 1, firstIndex: index });
    grouped.set(code, names);
  });

  const preferred = new Map<string, string>();
  grouped.forEach((names, code) => {
    const winner = [...names.values()].sort((a, b) =>
      b.count - a.count
      || normalizeClientText(b.name).length - normalizeClientText(a.name).length
      || a.firstIndex - b.firstIndex,
    )[0];
    if (winner?.name) preferred.set(code, winner.name);
  });

  return preferred;
}

/**
 * Padroniza o nome exibido dos registros da FINR020 usando o código do cliente
 * como identidade. O nome mais recorrente do código é usado como representante.
 */
export function normalizeInvoiceClientsByCode(invoices: Invoice[]) {
  const preferred = preferredNamesByCode(invoices);

  return invoices.map((invoice) => {
    const code = normalizeInvoiceClientCode(invoice.clientCode);
    const representative = code ? preferred.get(code) : "";
    if (!representative || representative === invoice.clientName) return invoice;
    return { ...invoice, clientName: representative };
  });
}

export function invoiceClientGroupKey(invoice: Invoice) {
  const code = normalizeInvoiceClientCode(invoice.clientCode);
  if (code) return `CODE:${code}`;

  const name = canonicalClientName(invoice.clientName) || invoice.clientName;
  return `NAME:${clientKey(name) || normalizeClientText(name)}`;
}
