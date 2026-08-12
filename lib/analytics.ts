import type { Invoice, PeriodFilter, Receipt } from "./types";
import { monthLabels } from "./format";
import {
  canonicalClientName,
  clientKey,
  likelySameClientName,
  normalizeClientText,
} from "./clientNames";
import { canonicalReceiptClientName } from "./receiptClientNames";
import { splitClientSelection } from "./clientSelection";
import {
  invoiceClientGroupKey,
  normalizeInvoiceClientCode,
  normalizeInvoiceClientsByCode,
} from "./invoiceClients";

type ReceiptAliasLink = {
  alias_key: string;
  canonical_name: string;
};

let receiptAliasMap = new Map<string, string>();

export function setReceiptClientAliasLinks(links: ReceiptAliasLink[]) {
  receiptAliasMap = new Map(
    links
      .filter((link) => link.alias_key && link.canonical_name)
      .map((link) => [normalizeClientText(link.alias_key), link.canonical_name] as const),
  );
}

function resolveReceiptClientName(value: string) {
  const canonical = canonicalReceiptClientName(value);
  if (!canonical) return "";
  return receiptAliasMap.get(normalizeClientText(canonical)) || canonical;
}

function readYearMonth(dateValue: string) {
  const year = Number(dateValue.slice(0, 4));
  const month = Number(dateValue.slice(5, 7)) - 1;
  if (!Number.isFinite(year) || month < 0 || month > 11) return null;
  return { year, month };
}

function inPeriod(dateValue: string, filter: PeriodFilter) {
  const parts = readYearMonth(dateValue);
  if (!parts) return false;
  return (filter.year === "all" || parts.year === filter.year)
    && (filter.month === "all" || parts.month === filter.month);
}

type PreparedInvoiceSelection = {
  clientKeys: Set<string>;
  clientCodes: Set<string>;
};

function prepareInvoiceSelection(invoices: Invoice[], selection: string): PreparedInvoiceSelection {
  const clients = splitClientSelection(selection);
  if (!clients.length) return { clientKeys: new Set(), clientCodes: new Set() };

  const clientKeys = new Set(clients.map((client) => clientKey(client)).filter(Boolean));
  const availableCodes = new Set(
    invoices.map((invoice) => normalizeInvoiceClientCode(invoice.clientCode)).filter(Boolean),
  );
  const clientCodes = new Set<string>();

  clients.forEach((selectedClient) => {
    const explicitCode = normalizeInvoiceClientCode(selectedClient);
    if (explicitCode && availableCodes.has(explicitCode)) clientCodes.add(explicitCode);
  });

  invoices.forEach((invoice) => {
    const code = normalizeInvoiceClientCode(invoice.clientCode);
    if (!code) return;
    const key = clientKey(invoice.clientName);
    if (key && clientKeys.has(key)) clientCodes.add(code);
  });

  return { clientKeys, clientCodes };
}

function matchesPreparedInvoiceSelection(selection: PreparedInvoiceSelection, invoice: Invoice) {
  if (!selection.clientKeys.size && !selection.clientCodes.size) return true;

  const code = normalizeInvoiceClientCode(invoice.clientCode);
  if (code && selection.clientCodes.has(code)) return true;

  const key = clientKey(invoice.clientName);
  return Boolean(key && selection.clientKeys.has(key));
}

type PreparedReceiptSelection = {
  clientKeys: Set<string>;
};

function prepareReceiptSelection(selection: string): PreparedReceiptSelection {
  const clients = splitClientSelection(selection);
  return {
    clientKeys: new Set(
      clients
        .map((client) => normalizeClientText(resolveReceiptClientName(client)))
        .filter(Boolean),
    ),
  };
}

function matchesPreparedReceiptSelection(selection: PreparedReceiptSelection, candidate: string) {
  if (!selection.clientKeys.size) return true;
  const key = normalizeClientText(resolveReceiptClientName(candidate));
  return Boolean(key && selection.clientKeys.has(key));
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

function filterPreparedInvoices(
  invoices: Invoice[],
  filter: PeriodFilter,
  selection: PreparedInvoiceSelection,
) {
  return invoices.filter((invoice) =>
    inPeriod(invoice.emissionDate, filter)
    && matchesPreparedInvoiceSelection(selection, invoice),
  );
}

function filterPreparedReceipts(
  receipts: Receipt[],
  filter: PeriodFilter,
  selection: PreparedReceiptSelection,
) {
  return receipts.filter((receipt) =>
    inPeriod(receipt.receiptDate, filter)
    && matchesPreparedReceiptSelection(selection, receipt.clientHint || receipt.description),
  );
}

export function filterInvoices(invoices: Invoice[], filter: PeriodFilter) {
  const normalizedInvoices = normalizeInvoiceClientsByCode(invoices);
  const selection = prepareInvoiceSelection(normalizedInvoices, filter.client);
  return filterPreparedInvoices(normalizedInvoices, filter, selection);
}

export function filterReceipts(receipts: Receipt[], filter: PeriodFilter) {
  const selection = prepareReceiptSelection(filter.client);
  return filterPreparedReceipts(receipts, filter, selection);
}

export function calculateDashboard(invoices: Invoice[], receipts: Receipt[], filter: PeriodFilter) {
  const active = resolveActiveData(invoices, receipts);

  // A normalização da FINR020 é a etapa mais custosa. Ela deve acontecer uma única
  // vez por cálculo do painel, e não novamente para cada um dos 12 meses.
  const normalizedActiveInvoices = normalizeInvoiceClientsByCode(active.invoices);
  const invoiceSelection = prepareInvoiceSelection(normalizedActiveInvoices, filter.client);
  const receiptSelection = prepareReceiptSelection(filter.client);

  const filteredInvoices = filterPreparedInvoices(normalizedActiveInvoices, filter, invoiceSelection);
  const filteredReceipts = filterPreparedReceipts(active.receipts, filter, receiptSelection);
  const emitted = filteredInvoices.reduce((sum, item) => sum + item.grossValue, 0);
  const received = filteredReceipts.reduce((sum, item) => sum + item.amount, 0);
  const ticket = filteredInvoices.length ? emitted / filteredInvoices.length : 0;

  const byClient = new Map<string, { name: string; value: number }>();
  filteredInvoices.forEach((item) => {
    const key = invoiceClientGroupKey(item);
    const name = canonicalClientName(item.clientName) || item.clientName;
    const current = byClient.get(key);
    if (current) current.value += item.grossValue;
    else byClient.set(key, { name, value: item.grossValue });
  });
  const topClients = [...byClient.values()]
    .sort((a, b) => b.value - a.value || clientKey(a.name).localeCompare(clientKey(b.name), "pt-BR"));

  const byBank = new Map<string, number>();
  filteredReceipts.forEach((item) => byBank.set(item.bank, (byBank.get(item.bank) ?? 0) + item.amount));
  const banks = [...byBank.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Agrega os 12 meses em uma única passada, evitando 12 novas normalizações e filtros completos.
  const emittedByMonth = Array<number>(12).fill(0);
  normalizedActiveInvoices.forEach((invoice) => {
    const parts = readYearMonth(invoice.emissionDate);
    if (!parts) return;
    if (filter.year !== "all" && parts.year !== filter.year) return;
    if (!matchesPreparedInvoiceSelection(invoiceSelection, invoice)) return;
    emittedByMonth[parts.month] += invoice.grossValue;
  });

  const receivedByMonth = Array<number>(12).fill(0);
  active.receipts.forEach((receipt) => {
    const parts = readYearMonth(receipt.receiptDate);
    if (!parts) return;
    if (filter.year !== "all" && parts.year !== filter.year) return;
    if (!matchesPreparedReceiptSelection(receiptSelection, receipt.clientHint || receipt.description)) return;
    receivedByMonth[parts.month] += receipt.amount;
  });

  const monthly = monthLabels.map((month, monthIndex) => ({
    month,
    monthIndex,
    emitted: emittedByMonth[monthIndex],
    received: receivedByMonth[monthIndex],
  }));

  const invoiceByNumber = new Map<string, Invoice[]>();
  normalizedActiveInvoices.forEach((invoice) => {
    if (!invoice.invoiceNumber) return;
    const list = invoiceByNumber.get(invoice.invoiceNumber) ?? [];
    list.push(invoice);
    invoiceByNumber.set(invoice.invoiceNumber, list);
  });

  const matchedReceipts = active.receipts.filter((receipt) => receipt.invoiceNumbers.some((number) => {
    const candidates = invoiceByNumber.get(number) ?? [];
    if (!candidates.length) return false;
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
