import { normalizeClientText } from "./clientNames";

export type ReceiptClientLink = {
  id: string;
  group_id: string;
  canonical_name: string;
  alias_name: string;
  alias_key: string;
  created_at: string;
  updated_at: string;
};

export const RECEIPT_CLIENT_LINKS_EVENT = "financial-analytics-receipt-client-links-updated";

const SUPABASE_URL = "https://mnzzulllazckqinudgoc.supabase.co";
const SUPABASE_KEY = "sb_publishable_f8CrCRfwhhx1e3T9B7bp7Q_9p0zDBJL";
const TABLE = "receipt_client_links";

function headers(prefer?: string) {
  return {
    apikey: SUPABASE_KEY,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

async function parseError(response: Response) {
  const body = await response.text();
  throw new Error(body || `Supabase respondeu ${response.status}`);
}

export function receiptAliasKey(value: string) {
  return normalizeClientText(value);
}

export async function listReceiptClientLinks() {
  const query = new URLSearchParams({ select: "*", order: "canonical_name.asc,created_at.asc" });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?${query.toString()}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as ReceiptClientLink[];
}

export async function createReceiptClientGroup(canonicalName: string, aliases: string[]) {
  const uniqueAliases = [...new Map(
    [canonicalName, ...aliases]
      .map((name) => name.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .map((name) => [receiptAliasKey(name), name] as const),
  ).values()];
  if (uniqueAliases.length < 2) throw new Error("Selecione pelo menos dois nomes para criar um vínculo.");

  const groupId = crypto.randomUUID();
  const payload = uniqueAliases.map((aliasName) => ({
    group_id: groupId,
    canonical_name: canonicalName.replace(/\s+/g, " ").trim(),
    alias_name: aliasName,
    alias_key: receiptAliasKey(aliasName),
  }));

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?on_conflict=alias_key`, {
    method: "POST",
    headers: headers("resolution=merge-duplicates,return=representation"),
    body: JSON.stringify(payload),
  });
  if (!response.ok) await parseError(response);
  window.dispatchEvent(new Event(RECEIPT_CLIENT_LINKS_EVENT));
  return (await response.json()) as ReceiptClientLink[];
}

export async function deleteReceiptClientGroup(groupId: string) {
  const query = new URLSearchParams({ group_id: `eq.${groupId}` });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?${query.toString()}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!response.ok) await parseError(response);
  window.dispatchEvent(new Event(RECEIPT_CLIENT_LINKS_EVENT));
}
