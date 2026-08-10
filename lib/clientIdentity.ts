import { normalizeClientText } from "./clientNames";

const TOKEN_ALIASES: Record<string, string> = {
  ASSOC: "ASSOCIACAO",
  FUND: "FUNDACAO",
  HOSP: "HOSPITAL",
  PREF: "PREFEITURA",
  MUN: "MUNICIPIO",
  SERV: "SERVICOS",
  SERVICO: "SERVICOS",
  BENEF: "BENEFICENTE",
  BENEFIC: "BENEFICENTE",
  CIA: "COMPANHIA",
  LTD: "LTDA",
};

const IDENTITY_NOISE = new Set([
  "DE",
  "DA",
  "DO",
  "DAS",
  "DOS",
  "E",
  "LTDA",
  "EIRELI",
  "ME",
  "EPP",
  "CNPJ",
  "CPF",
]);

const FUZZY_GENERIC = new Set([
  "MUNICIPIO",
  "MUNICIPAL",
  "PREFEITURA",
  "FUNDO",
  "FUNDACAO",
  "INSTITUTO",
  "ASSOCIACAO",
  "HOSPITAL",
  "SERVICOS",
  "SOCIEDADE",
  "SAUDE",
  "BENEFICENTE",
  "COMPANHIA",
]);

function unique(values: string[]) {
  return [...new Set(values)];
}

export function clientIdentityTokens(value: string) {
  return unique(
    normalizeClientText(value)
      .split(" ")
      .map((token) => TOKEN_ALIASES[token] ?? token)
      .filter((token) => token && !IDENTITY_NOISE.has(token)),
  ).sort((a, b) => a.localeCompare(b));
}

/**
 * Chave sem dependência de acentos, pontuação ou ordem das palavras.
 * Mantém termos institucionais (hospital, município, fundação etc.) para
 * reduzir o risco de unir empresas diferentes que compartilham um nome curto.
 */
export function clientIdentityKey(value: string) {
  return clientIdentityTokens(value).join("|");
}

function overlap(left: Set<string>, right: Set<string>) {
  return [...left].filter((token) => right.has(token)).length;
}

export function clientIdentitySimilarity(left: string, right: string) {
  const leftTokens = clientIdentityTokens(left);
  const rightTokens = clientIdentityTokens(right);
  if (!leftTokens.length || !rightTokens.length) return 0;

  const leftKey = leftTokens.join("|");
  const rightKey = rightTokens.join("|");
  if (leftKey === rightKey) return 1;

  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);
  const common = overlap(leftSet, rightSet);
  const minimum = Math.min(leftSet.size, rightSet.size);
  const union = new Set([...leftSet, ...rightSet]).size;
  if (common < 2 || minimum === 0 || union === 0) return 0;

  const leftDistinctive = new Set(leftTokens.filter((token) => !FUZZY_GENERIC.has(token)));
  const rightDistinctive = new Set(rightTokens.filter((token) => !FUZZY_GENERIC.has(token)));
  const distinctiveMinimum = Math.min(leftDistinctive.size, rightDistinctive.size);
  const distinctiveCommon = overlap(leftDistinctive, rightDistinctive);

  if (distinctiveMinimum > 0 && distinctiveCommon === 0) return 0;

  const coverage = common / minimum;
  const jaccard = common / union;
  const distinctiveCoverage = distinctiveMinimum > 0 ? distinctiveCommon / distinctiveMinimum : coverage;

  return (coverage * 0.5) + (jaccard * 0.25) + (distinctiveCoverage * 0.25);
}

export function choosePreferredClientLabel(values: string[]) {
  const stats = new Map<string, { label: string; count: number; first: number }>();

  values.forEach((value, index) => {
    const label = String(value ?? "").replace(/\s+/g, " ").trim();
    if (!label) return;
    const key = normalizeClientText(label);
    const current = stats.get(key);
    if (current) current.count += 1;
    else stats.set(key, { label, count: 1, first: index });
  });

  return [...stats.values()].sort((a, b) =>
    b.count - a.count
    || normalizeClientText(b.label).length - normalizeClientText(a.label).length
    || a.first - b.first,
  )[0]?.label ?? "";
}
