import type { ImportState } from "./types";

export function dataFingerprint(data: ImportState) {
  let hash = 2166136261;
  const add = (value: unknown) => {
    const text = JSON.stringify(value);
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  };
  add([data.invoiceFileName ?? null, data.receiptFileName ?? null]);
  data.invoices.forEach((item) => add([
    item.id, item.emissionDate, item.invoiceNumber, item.titleNumber,
    item.grossValue, item.netValue, item.clientCode, item.clientName,
  ]));
  data.receipts.forEach((item) => add([
    item.id, item.receiptDate, item.amount, item.bank, item.description,
    item.sourceSheet, item.invoiceNumbers, item.clientHint,
  ]));
  return `${data.invoices.length}:${data.receipts.length}:${hash >>> 0}`;
}
