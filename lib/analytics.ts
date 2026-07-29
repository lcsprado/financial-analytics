import type { Invoice, PeriodFilter, Receipt } from "./types";
import { monthLabels } from "./format";
import { canonicalClientName, likelySameClientName, sameClientName } from "./clientNames";
import { canonicalReceiptClientName, sameReceiptClientName } from "./receiptClientNames";
import { splitClientSelection } from "./clientSelection";

function inPeriod(dateValue: string, filter: PeriodFilter) {
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

function isDemoInvoice(invoice: Invoice) {
  return invoice.id.startsWith("demo-invoice-");
}

function isDemoReceipt(receipt: Receipt) {
  return receipt.id.startsWith("demo-receipt-") || receipt.sourceSheet === "DEMONSTRAÇÃO";
}

function resolveActiveData(invoices: Invoice[], receipts: Receipt[]) {
  const realInvoices = invoices.filter((invoice) => !isDemoInvoice(invoice));
  const realReceipts = receipts.filter((receipt) => !isDemoReceipt(receipt));
  const hasRealInvoices = realInvoices.length > 0;
  const hasRealReceipts = realReceipts.length > 0;

  if (!hasRealInvoices && !hasRealReceipts) {
    return { invoices, receipts };
  }

  return {
    invoices: hasRealInvoices ? realInvoices : [],
    receipts: hasRealReceipts ? realReceipts : [],
  };
}

export function getAvailableYears(invoices: Invoice[], receipts: Receipt[]) {
  const active = resolveActiveData(invoices, receipts);
  return [...new Set([
    ...active.invoices.map((item) => Number(item.emissionDate.slice(0, 4))),
    ...active.receipts.map((item) => Number(item.receiptDate.slice(0, 4))),
  ].filter(Number.isFinite))].sort((a, b) => b - a);
}

export function filterInvoices(invoices: Invoice[], filter: PeriodFilter) {
  return invoices.filter((invoice) => inPeriod(invoice.emissionDate, filter)
    && matchesInvoiceSelection(filter.client, invoice.clientName));
}

export function filterReceipts(receipts: Receipt[], filter: PeriodFilter) {
  return receipts.filter((receipt) => inPeriod(receipt.receiptDate, filter)
    && matchesReceiptSelection(filter.client, receipt.clientHint || receipt.description));
}

export function calculateDashboard(invoices: Invoice[], receipts: Receipt[], filter: PeriodFilter) {
  const active = resolveActiveData(invoices, receipts);
  const filteredInvoices = filterInvoices(active.invoices, filter);
  const filteredReceipts = filterReceipts(active.receipts, filter);
  const emitted = filteredInvoices.reduce((sum, item) => sum + item.grossValue, 0);
  const received = filteredReceipts.reduce((sum, item) => sum + item.amount, 0);
  const ticket = filteredInvoices.length ? emitted / filteredInvoices.length : 0;

  const byClient = new Map<string, number>();
  filteredInvoices.forEach((item) => {
    const client = canonicalClientName(item.clientName) || item.clientName;
    byClient.set(client, (byClient.get(client) ?? 0) + item.grossValue);
  });
  const topClients = [...byClient.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const byBank = new Map<string, number>();
  filteredReceipts.forEach((item) => byBank.set(item.bank, (byBank.get(item.bank) ?? 0) + item.amount));
  const banks = [...byBank.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const monthly = monthLabels.map((month, monthIndex) => {
    const emittedMonth = active.invoices
      .filter((item) => {
        const date = new Date(`${item.emissionDate}T12:00:00`);
        return (filter.year === "all" || date.getFullYear() === filter.year)
          && date.getMonth() === monthIndex
          && matchesInvoiceSelection(filter.client, item.clientName);
      })
      .reduce((sum, item) => sum + item.grossValue, 0);
    const receivedMonth = active.receipts
      .filter((item) => {
        const date = new Date(`${item.receiptDate}T12:00:00`);
        return (filter.year === "all" || date.getFullYear() === filter.year)
          && date.getMonth() === monthIndex
          && matchesReceiptSelection(filter.client, item.clientHint || item.description);
      })
      .reduce((sum, item) => sum + item.amount, 0);
    return { month, monthIndex, emitted: emittedMonth, received: receivedMonth };
  });

  const invoiceByNumber = new Map<string, Invoice[]>();
  active.invoices.forEach((invoice) => {
    if (!invoice.invoiceNumber) return;
    const list = invoiceByNumber.get(invoice.invoiceNumber) ?? [];
    list.push(invoice);
    invoiceByNumber.set(invoice.invoiceNumber, list);
  });
  const matchedReceipts = active.receipts.filter((receipt) => receipt.invoiceNumbers.some((number) => {
    const candidates = invoiceByNumber.get(number) ?? [];
    const receiptClient = canonicalReceiptClientName(receipt.clientHint || receipt.description);
    return candidates.some((invoice) => likelySameClientName(invoice.clientName, receiptClient));
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
    matchRate: active.receipts.length ? matchedReceipts / active.receipts.length : 0,
  };
}
