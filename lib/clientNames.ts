const GENERIC_CLIENT_TERMS = new Set([
  "LTDA",
  "SA",
  "EIRELI",
  "CNPJ",
  "MUNICIPIO",
  "PREFEITURA",
  "FUNDO",
  "FUNDACAO",
  "INSTITUTO",
  "ASSOCIACAO",
  "HOSPITAL",
  "DE",
  "DA",
  "DO",
  "DAS",
  "DOS",
]);

export const SAO_MATEUS_CANONICAL_NAME = "FUNDAÇÃO ABC | SÃO MATEUS";

export function normalizeClientText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSaoMateusAlias(value: string) {
  const tokens = new Set(normalizeClientText(value).split(" ").filter(Boolean));
  const isAmaOrUbs = tokens.has("AMA") || tokens.has("UBS");
  const mentionsMateus = tokens.has("MATEUS") || tokens.has("MATHEUS");
  return isAmaOrUbs || mentionsMateus;
}

export function canonicalClientName(value: string) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  if (isSaoMateusAlias(cleaned)) return SAO_MATEUS_CANONICAL_NAME;
  return cleaned;
}

export function clientKey(value: string) {
  const canonical = canonicalClientName(value);
  if (!canonical) return "";
  if (canonical === SAO_MATEUS_CANONICAL_NAME) return "FUNDACAO ABC SAO MATEUS";

  return normalizeClientText(canonical)
    .split(" ")
    .filter((token) => token && !GENERIC_CLIENT_TERMS.has(token))
    .join(" ")
    .trim();
}

export function sameClientName(client: string, candidate: string) {
  const a = clientKey(client);
  const b = clientKey(candidate);
  return Boolean(a && b && a === b);
}

export function likelySameClientName(client: string, candidate: string) {
  const a = clientKey(client);
  const b = clientKey(candidate);
  if (!a || !b) return false;
  if (a === b) return true;

  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  if (shorter.length >= 8 && longer.includes(shorter)) return true;

  const aTokens = new Set(a.split(" ").filter((token) => token.length > 2));
  const bTokens = new Set(b.split(" ").filter((token) => token.length > 2));
  const common = [...bTokens].filter((token) => aTokens.has(token)).length;
  const minimumSize = Math.min(aTokens.size, bTokens.size);

  return common >= 2 && minimumSize > 0 && common / minimumSize >= 0.6;
}
