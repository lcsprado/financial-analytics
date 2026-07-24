import type { Invoice, PeriodFilter, Receipt } from "./types";
import { monthLabels } from "./format";

function inPeriod(dateValue: string, filter: PeriodFilter) {
  const date = new Date(`${dateValue}T12:00:00`);
  return (filter.year === "all" || date.getFullYear() === filter.year)
    && (filter.month === "all" || date.getMonth() === filter.month);
}

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\b(LTDA|S A|SA|EIRELI|CNPJ|MUNICIPIO|PREFEITURA|FUNDO|FUNDACAO|INSTITUTO|ASSOCIACAO|HOSPITAL)\b/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameMatches(client: string, hint: string) {
  const a = normalizeName(client);
  const b = normalizeName(hint);
  if (!a || !b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const aTokens = new Set(a.split(" ").filter((token) => token.length > 2));
  const bTokens = b.split(" ").filter((token) => token.length > 2);
  const common = bTokens.filter((token) => aTokens.has(token)).length;
  return common >= Math.min(2, Math.max(1, Math.floor(bTokens.length * 0.45)));
}

export function getAvailableYears(invoices: Invoice[], receipts: Receipt[]) {
  return [...new Set([
    ...invoices.map((item) => Number(item.emissionDate.slice(0, 4))),
    ...receipts.map((item) => Number(item.receiptDate.slice(0, 4))),
  ].filter(Number.isFinite))].sort((a, b) => b - a);
}

export function filterInvoices(invoices: Invoice[], filter: PeriodFilter) {
  return invoices.filter((invoice) => inPeriod(invoice.emissionDate, filter)
    && (!filter.client || invoice.clientName === filter.client));
}

export function filterReceipts(receipts: Receipt[], filter: PeriodFilter) {
  return receipts.filter((receipt) => inPeriod(receipt.receiptDate, filter)
    && (!filter.client || nameMatches(filter.client, receipt.clientHint)));
}

export function calculateDashboard(invoices: Invoice[], receipts: Receipt[], filter: PeriodFilter) {
  const filteredInvoices = filterInvoices(invoices, filter);
  const filteredReceipts = filterReceipts(receipts, filter);
  const emitted = filteredInvoices.reduce((sum, item) => sum + item.grossValue, 0);
  const received = filteredReceipts.reduce((sum, item) => sum + item.amount, 0);
  const ticket = filteredInvoices.length ? emitted / filteredInvoices.length : 0;

  const byClient = new Map<string, number>();
  filteredInvoices.forEach((item) => byClient.set(item.clientName, (byClient.get(item.clientName) ?? 0) + item.grossValue));
  const topClients = [...byClient.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const byBank = new Map<string, number>();
  filteredReceipts.forEach((item) => byBank.set(item.bank, (byBank.get(item.bank) ?? 0) + item.amount));
  const banks = [...byBank.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const monthly = monthLabels.map((month, monthIndex) => {
    const emittedMonth = invoices
      .filter((item) => {
        const date = new Date(`${item.emissionDate}T12:00:00`);
        return (filter.year === "all" || date.getFullYear() === filter.year)
          && date.getMonth() === monthIndex
          && (!filter.client || item.clientName === filter.client);
      })
      .reduce((sum, item) => sum + item.grossValue, 0);
    const receivedMonth = receipts
      .filter((item) => {
        const date = new Date(`${item.receiptDate}T12:00:00`);
        return (filter.year === "all" || date.getFullYear() === filter.year)
          && date.getMonth() === monthIndex
          && (!filter.client || nameMatches(filter.client, item.clientHint));
      })
      .reduce((sum, item) => sum + item.amount, 0);
    return { month, monthIndex, emitted: emittedMonth, received: receivedMonth };
  });

  const invoiceByNumber = new Map<string, Invoice[]>();
  invoices.forEach((invoice) => {
    if (!invoice.invoiceNumber) return;
    const list = invoiceByNumber.get(invoice.invoiceNumber) ?? [];
    list.push(invoice);
    invoiceByNumber.set(invoice.invoiceNumber, list);
  });
  const matchedReceipts = receipts.filter((receipt) => receipt.invoiceNumbers.some((number) => {
    const candidates = invoiceByNumber.get(number) ?? [];
    return candidates.some((invoice) => nameMatches(invoice.clientName, receipt.clientHint));
  })).length;

  return {
    filteredInvoices,
    filteredReceipts,
    emitted,
    received,
    difference: emitted - received,
    ticket,
    invoiceCount: filteredInvoices.length,
    receiptCount: filteredReceipts.length,
    topClients,
    banks,
    monthly,
    largestClient: topClients[0]?.name ?? "—",
    matchRate: receipts.length ? matchedReceipts / receipts.length : 0,
  };
}
