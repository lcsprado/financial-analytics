import { canonicalClientName, normalizeClientText } from "./clientNames";
import {
  choosePreferredClientLabel,
  clientIdentityKey,
  clientIdentitySimilarity,
} from "./clientIdentity";
import { normalizeInvoiceClientsByCode } from "./invoiceClients";
import { canonicalReceiptClientName } from "./receiptClientNames";
import type { ImportState } from "./types";

export type ReceiptIdentityStats = {
  changedReceipts: number;
  aliasGroups: number;
  exactMasterMatches: number;
  fuzzyMasterMatches: number;
  ambiguousMatches: number;
};

type Reference = {
  key: string;
  name: string;
};

function buildMasterReferences(data: ImportState) {
  const normalizedInvoices = normalizeInvoiceClientsByCode(data.invoices ?? []);
  const names = [
    ...normalizedInvoices.map((invoice) => canonicalClientName(invoice.clientName) || invoice.clientName.trim()),
    ...(data.openReceivables ?? []).map((item) => canonicalClientName(item.clientName) || item.clientName.trim()),
  ].filter(Boolean);

  const grouped = new Map<string, string[]>();
  names.forEach((name) => {
    const key = clientIdentityKey(name);
    if (!key) return;
    const values = grouped.get(key) ?? [];
    values.push(name);
    grouped.set(key, values);
  });

  const references: Reference[] = [];
  grouped.forEach((values, key) => {
    const name = choosePreferredClientLabel(values);
    if (name) references.push({ key, name });
  });

  return references;
}

function bestMasterMatch(candidate: string, references: Reference[]) {
  const key = clientIdentityKey(candidate);
  if (!key) return { name: "", kind: "none" as const };

  const exact = references.find((reference) => reference.key === key);
  if (exact) return { name: exact.name, kind: "exact" as const };

  let bestName = "";
  let bestScore = 0;
  let secondScore = 0;

  for (const reference of references) {
    const score = clientIdentitySimilarity(candidate, reference.name);
    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      bestName = reference.name;
    } else if (score > secondScore) {
      secondScore = score;
    }
  }

  if (bestName && bestScore >= 0.9 && (secondScore < 0.82 || bestScore - secondScore >= 0.06)) {
    return { name: bestName, kind: "fuzzy" as const };
  }

  if (bestScore >= 0.82) return { name: "", kind: "ambiguous" as const };
  return { name: "", kind: "none" as const };
}

/**
 * Padroniza clientHint antes das análises de recebimentos/previsão.
 * A identidade ignora pontuação, acentos e ordem das palavras; quando existe
 * uma referência segura na FINR020/Contas a Receber, o nome oficial da base é
 * usado como rótulo. Casos fuzzy só são aceitos com margem alta e sem empate.
 */
export function normalizeReceiptClientIdentities(data: ImportState) {
  const references = buildMasterReferences(data);
  const parsed = (data.receipts ?? []).map((receipt) => ({
    receipt,
    name: canonicalReceiptClientName(receipt.clientHint || receipt.description),
  }));

  const receiptGroups = new Map<string, string[]>();
  parsed.forEach(({ name }) => {
    const key = clientIdentityKey(name);
    if (!key || !name) return;
    const values = receiptGroups.get(key) ?? [];
    values.push(name);
    receiptGroups.set(key, values);
  });

  const receiptPreferred = new Map<string, string>();
  let aliasGroups = 0;
  receiptGroups.forEach((values, key) => {
    const distinct = new Set(values.map(normalizeClientText).filter(Boolean));
    if (distinct.size > 1) aliasGroups += 1;
    const preferred = choosePreferredClientLabel(values);
    if (preferred) receiptPreferred.set(key, preferred);
  });

  let changedReceipts = 0;
  let exactMasterMatches = 0;
  let fuzzyMasterMatches = 0;
  let ambiguousMatches = 0;

  const receipts = parsed.map(({ receipt, name }) => {
    if (!name) return receipt;
    const key = clientIdentityKey(name);
    const match = bestMasterMatch(name, references);
    if (match.kind === "exact") exactMasterMatches += 1;
    if (match.kind === "fuzzy") fuzzyMasterMatches += 1;
    if (match.kind === "ambiguous") ambiguousMatches += 1;

    const target = match.name || receiptPreferred.get(key) || name;
    const current = canonicalReceiptClientName(receipt.clientHint || receipt.description);
    if (!target || normalizeClientText(current) === normalizeClientText(target)) return receipt;

    changedReceipts += 1;
    return { ...receipt, clientHint: target };
  });

  return {
    data: changedReceipts ? { ...data, receipts } : data,
    changed: changedReceipts > 0,
    stats: {
      changedReceipts,
      aliasGroups,
      exactMasterMatches,
      fuzzyMasterMatches,
      ambiguousMatches,
    } satisfies ReceiptIdentityStats,
  };
}
