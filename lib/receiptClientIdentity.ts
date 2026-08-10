import { normalizeClientText } from "./clientNames";
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

function rawReceiptName(description: string, hint: string) {
  return canonicalReceiptClientName(description) || canonicalReceiptClientName(hint);
}

/**
 * Mantém a identidade dos recebimentos simples e previsível:
 * - sem comparação aproximada entre clientes;
 * - sem tentativa de cruzar automaticamente com emissões/contas a receber;
 * - vínculos manuais salvos têm prioridade;
 * - sem vínculo, usa apenas o nome básico extraído da própria planilha.
 */
export function normalizeReceiptClientIdentities(data: ImportState, links: ReceiptClientLink[] = []) {
  const manualByAlias = new Map(links.map((link) => [link.alias_key, link.canonical_name] as const));

  let changedReceipts = 0;
  let manualMatches = 0;

  const receipts = (data.receipts ?? []).map((receipt) => {
    const rawName = rawReceiptName(receipt.description, receipt.clientHint);
    if (!rawName) return receipt;

    const manualTarget = manualByAlias.get(receiptAliasKey(rawName));
    const target = manualTarget || rawName;
    if (manualTarget) manualMatches += 1;

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
      aliasGroups: 0,
      exactMasterMatches: 0,
      fuzzyMasterMatches: 0,
      ambiguousMatches: 0,
      manualMatches,
    } satisfies ReceiptIdentityStats,
  };
}
