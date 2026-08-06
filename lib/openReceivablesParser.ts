import * as XLSX from "xlsx";
import type { OpenReceivable } from "./types";

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/_x000D_/g, " ")
    .replace(/[^A-Z0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function text(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function numeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const cleaned = raw
    .replace(/R\$/gi, "")
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function excelDateToISO(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return "";
    return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const raw = text(value);
  if (!raw) return "";
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (br) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${year}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  }
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function invoiceNumber(value: unknown) {
  const raw = text(value);
  const digits = raw.replace(/\D/g, "");
  return digits.replace(/^0+/, "") || digits || raw;
}

function indexByPriority(headers: unknown[], candidates: string[]) {
  const normalized = headers.map(normalize);
  for (const candidate of candidates) {
    const exact = normalized.findIndex((header) => header === candidate);
    if (exact >= 0) return exact;
  }
  for (const candidate of candidates) {
    const partial = normalized.findIndex((header) => header.includes(candidate));
    if (partial >= 0) return partial;
  }
  return -1;
}

function isReceivableSheet(name: string) {
  const normalized = normalize(name);
  return normalized.includes("CONTAS A RECEBER")
    || normalized.includes("TITULOS A RECEBER")
    || normalized.includes("TITULOS RECEBER")
    || normalized === "RECEBER";
}

function headerScore(row: unknown[]) {
  const values = row.map(normalize);
  const hasClient = values.some((value) => value.includes("NOME CLIENTE") || value === "CLIENTE" || value.includes("RAZAO SOCIAL"));
  const hasDue = values.some((value) => value.includes("VENCIMENTO") || value.includes("VENCTO"));
  const hasValue = values.some((value) => value === "VALOR" || value.includes("SALDO") || value.includes("VALOR EM ABERTO"));
  return Number(hasClient) + Number(hasDue) + Number(hasValue);
}

export async function parseOpenReceivablesWorkbook(file: File): Promise<OpenReceivable[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  const sheetNames = workbook.SheetNames.filter(isReceivableSheet);
  const receivables: OpenReceivable[] = [];

  for (const sheetName of sheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1,
      defval: "",
      raw: true,
    });
    const headerRowIndex = rows
      .slice(0, 60)
      .map((row, index) => ({ index, score: headerScore(row) }))
      .sort((left, right) => right.score - left.score || left.index - right.index)[0];

    if (!headerRowIndex || headerRowIndex.score < 2) continue;
    const headers = rows[headerRowIndex.index];
    const clientNameIndex = indexByPriority(headers, ["NOME CLIENTE", "RAZAO SOCIAL", "NOME DO CLIENTE", "CLIENTE"]);
    const clientCodeIndex = indexByPriority(headers, ["COD CLIENTE", "CODIGO CLIENTE", "CLIENTE CODIGO", "CODIGO"]);
    const invoiceIndex = indexByPriority(headers, ["NF ELETR", "NOTA FISCAL", "NUMERO NF", "NF", "NOTA", "DOCUMENTO"]);
    const titleIndex = indexByPriority(headers, ["NO TITULO", "N TITULO", "NUMERO TITULO", "TITULO"]);
    const emissionIndex = indexByPriority(headers, ["DATA DA EMISSAO", "DATA EMISSAO", "EMISSAO"]);
    const dueIndex = indexByPriority(headers, ["DATA DE VENCIMENTO", "DATA VENCIMENTO", "DT VENCIMENTO", "VENCIMENTO", "VENCTO"]);
    const originalValueIndex = indexByPriority(headers, ["VALOR ORIGINAL", "VALOR TITULO", "VLR TITULO", "VALOR"]);
    const openValueIndex = indexByPriority(headers, ["SALDO EM ABERTO", "VALOR EM ABERTO", "VLR EM ABERTO", "SALDO ATUAL", "SALDO", "ABERTO"]);
    const statusIndex = indexByPriority(headers, ["STATUS", "SITUACAO"]);

    for (let rowIndex = headerRowIndex.index + 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      const clientName = clientNameIndex >= 0 ? text(row[clientNameIndex]) : "";
      const dueDate = dueIndex >= 0 ? excelDateToISO(row[dueIndex]) : "";
      const originalValue = originalValueIndex >= 0 ? numeric(row[originalValueIndex]) : 0;
      const openValue = openValueIndex >= 0 ? numeric(row[openValueIndex]) : originalValue;
      const status = statusIndex >= 0 ? text(row[statusIndex]) : "";
      const normalizedStatus = normalize(status);

      if (!clientName || (!dueDate && !openValue && !originalValue)) continue;
      if (normalizedStatus.includes("BAIXAD") || normalizedStatus.includes("PAGO") || normalizedStatus.includes("CANCEL")) continue;
      if (!Number.isFinite(openValue) || openValue <= 0) continue;

      const currentInvoice = invoiceIndex >= 0 ? invoiceNumber(row[invoiceIndex]) : "";
      const currentTitle = titleIndex >= 0 ? text(row[titleIndex]) : "";
      receivables.push({
        id: `open-${sheetName}-${rowIndex}-${currentInvoice || currentTitle || clientName}`,
        clientCode: clientCodeIndex >= 0 ? text(row[clientCodeIndex]) : "",
        clientName,
        invoiceNumber: currentInvoice,
        titleNumber: currentTitle,
        emissionDate: emissionIndex >= 0 ? excelDateToISO(row[emissionIndex]) : "",
        dueDate,
        originalValue: originalValue || openValue,
        openValue,
        status,
        sourceSheet: sheetName,
      });
    }
  }

  const unique = new Map<string, OpenReceivable>();
  receivables.forEach((item) => {
    const key = [normalize(item.clientName), item.invoiceNumber, item.titleNumber, item.dueDate, item.openValue.toFixed(2)].join("|");
    if (!unique.has(key)) unique.set(key, item);
  });
  return [...unique.values()].sort((left, right) => left.dueDate.localeCompare(right.dueDate) || left.clientName.localeCompare(right.clientName, "pt-BR"));
}
