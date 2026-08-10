import { canonicalClientName, normalizeClientText } from "./clientNames";
import {
  choosePreferredClientLabel,
  clientIdentityKey,
  clientIdentitySimilarity,
} from "./clientIdentity";
import { normalizeInvoiceClientsByCode } from "./invoiceClients";
import { canonicalReceiptClientName } from "./receiptClientNames";
import { receiptAliasKey, type ReceiptClientLink } from "./receiptClientLinks";
import type { ImportState } from "./types";

export type ReceiptIdentityStats = {
  changedReceipts: number;
  aliasGroups: number;
  exactMasterMatches: number;
  fuzzyMasterMatches: number;
  ambiguousMatches: number;
  manualMatches: number;
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

function rawReceiptName(description: string, hint: string) {
  return canonicalReceiptClientName(description) || canonicalReceiptClientName(hint);
}

/**
 * Padroniza clientHint antes das análises de recebimentos/previsão.
 * Vínculos manuais são a regra de maior prioridade e usam o nome encontrado
 * na própria planilha de recebimentos. Depois vêm as correspondências automáticas.
 */
export function normalizeReceiptClientIdentities(data: ImportState, links: ReceiptClientLink[] = []) {
  const references = buildMasterReferences(data);
  const manualByAlias = new Map(links.map((link) => [link.alias_key, link.canonical_name] as const));
  const parsed = (data.receipts ?? []).map((receipt) => ({
    receipt,
    name: canonicalReceiptClientName(receipt.clientHint || receipt.description),
    rawName: rawReceiptName(receipt.description, receipt.clientHint),
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
  let manualMatches = 0;

  const receipts = parsed.map(({ receipt, name, rawName }) => {
    if (!name) return receipt;

    const manualTarget = manualByAlias.get(receiptAliasKey(rawName));
    let target = manualTarget || "";

    if (manualTarget) {
      manualMatches += 1;
    } else {
      const key = clientIdentityKey(name);
      const match = bestMasterMatch(name, references);
      if (match.kind === "exact") exactMasterMatches += 1;
      if (match.kind === "fuzzy") fuzzyMasterMatches += 1;
      if (match.kind === "ambiguous") ambiguousMatches += 1;
      target = match.name || receiptPreferred.get(key) || name;
    }

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
      manualMatches,
    } satisfies ReceiptIdentityStats,
  };
}
