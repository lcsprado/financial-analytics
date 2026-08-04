import {
  canonicalClientName,
  normalizeClientText,
  SAO_MATEUS_CANONICAL_NAME,
} from "./clientNames";

export const HOSPITALIS_BARUERI_CANONICAL_NAME = "HOSPITALIS NUCLEO HOSPITALAR DE BARUERI";
export const CARAPICUIBA_CANONICAL_NAME = "MUNICIPIO DE CARAPICUIBA";
export const REAL_SOCIEDADE_PORTUGUESA_CANONICAL_NAME = "REAL SOCIEDADE PORTUGUESA DE BENEFICÊNCIA";
export const REGISTRO_CANONICAL_NAME = "MUNICIPIO DE REGISTRO";
export const SANTA_ANA_PARNAIBA_CANONICAL_NAME = "HOSPITAL MATERNIDADE SANTA ANNA - SANTANA DE PARNAÍBA";

export function cleanReceiptClientName(value: string) {
  return value
    .replace(/\s*[-–—]?\s*NFS?[\s.:-].*$/i, "")
    .replace(/\s*[-–—]?\s*NOTAS?[\s.:-].*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isSantaAnaParnaibaAlias(normalized: string) {
  const mentionsHospital = normalized.includes("HOSP");
  const mentionsMaternity = normalized.includes(" MAT ")
    || normalized.includes("MATERNIDADE");
  const mentionsSantaAnna = normalized.includes("SANTA ANNA")
    || normalized.includes("STA ANNA")
    || normalized.includes("SANTA ANA")
    || normalized.includes("STA ANA");
  const mentionsSantanaParnaiba = normalized.includes("SANTANA PARNAIBA")
    || normalized.includes("SANTANA DE PARNAIBA");

  return mentionsHospital
    && mentionsMaternity
    && mentionsSantaAnna
    && mentionsSantanaParnaiba;
}

export function canonicalReceiptClientName(value: string) {
  const cleaned = cleanReceiptClientName(value);
  const normalized = ` ${normalizeClientText(cleaned)} `;
  if (!normalized.trim()) return "";

  if (normalized.includes("FUNDACAO DO ABC") && normalized.includes("COLETA ESPECIAL")) {
    return SAO_MATEUS_CANONICAL_NAME;
  }

  if (normalized.startsWith(" HOSPITALIS")
    && normalized.includes("NUCLEO HOSPITALAR DE BARUERI")
    && normalized.includes("MARIA HELENA")) {
    return HOSPITALIS_BARUERI_CANONICAL_NAME;
  }

  if (normalized.includes("FMS MUNICIPIO DE CARAPICUIBA")
    || normalized.includes(" SP 351060 MUNICIPIO DE CARAPICUIBA")) {
    return CARAPICUIBA_CANONICAL_NAME;
  }

  if (normalized.startsWith(" REAL SOCIEDADE PORTUGUESA DE BENEFIC")) {
    return REAL_SOCIEDADE_PORTUGUESA_CANONICAL_NAME;
  }

  if (normalized.includes("POP PRIVADA DE LIBERDADE")
    && normalized.includes("MUNICIPIO DE REGISTRO")) {
    return REGISTRO_CANONICAL_NAME;
  }

  if (isSantaAnaParnaibaAlias(normalized)) {
    return SANTA_ANA_PARNAIBA_CANONICAL_NAME;
  }

  return canonicalClientName(cleaned);
}

export function receiptClientKey(value: string) {
  return normalizeClientText(canonicalReceiptClientName(value));
}

export function sameReceiptClientName(client: string, candidate: string) {
  const left = receiptClientKey(client);
  const right = receiptClientKey(candidate);
  return Boolean(left && right && left === right);
}
