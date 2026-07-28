import * as XLSX from "xlsx";
import type { Invoice, Receipt } from "./types";

const MONTH_NAMES = [
  "JANEIRO", "FEVEREIRO", "MARÇO", "MARCO", "ABRIL", "MAIO", "JUNHO",
  "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO",
];

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/_x000D_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function text(value: unknown) {
  return String(value ?? "").trim();
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

function excelDateToISO(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const raw = text(value);
  if (!raw) return null;
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function normalizeInvoiceNumber(value: unknown) {
  const digits = text(value).replace(/\D/g, "");
  return digits.replace(/^0+/, "") || digits;
}

function findHeaderIndex(headers: unknown[], candidates: string[]) {
  const normalized = headers.map(normalizeHeader);
  return normalized.findIndex((header) => candidates.some((candidate) => header.includes(candidate)));
}

export async function parseInvoiceWorkbook(file: File): Promise<Invoice[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  const sheetName = workbook.SheetNames.find((name) => normalizeHeader(name).includes("REGISTROS DE DUPLICATAS"))
    ?? workbook.SheetNames.find((name) => normalizeHeader(name).includes("DUPLICAT"))
    ?? workbook.SheetNames[0];

  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    defval: "",
    raw: true,
  });

  const headerRowIndex = rows.findIndex((row) => {
    const normalized = row.map(normalizeHeader);
    return normalized.some((cell) => cell.includes("NF ELETR"))
      && normalized.some((cell) => cell === "VALOR" || cell.includes("VALOR"))
      && normalized.some((cell) => cell.includes("NOME CLIENTE"));
  });

  if (headerRowIndex < 0) {
    throw new Error("Não encontrei os cabeçalhos da FINR020. Use a exportação com NF Eletr, Valor e Nome Cliente.");
  }

  const headers = rows[headerRowIndex];
  const emissionIndex = findHeaderIndex(headers, ["DATA DA EMISSAO", "EMISSAO"]);
  const invoiceIndex = findHeaderIndex(headers, ["NF ELETR", "NOTA"]);
  const titleIndex = findHeaderIndex(headers, ["NO. TITULO", "N TITULO", "TITULO"]);
  const grossIndex = findHeaderIndex(headers, ["VALOR"]);
  const netIndex = findHeaderIndex(headers, ["LIQUIDO"]);
  const clientCodeIndex = findHeaderIndex(headers, ["CLIENTE"]);
  const clientNameIndex = findHeaderIndex(headers, ["NOME CLIENTE"]);

  return rows
    .slice(headerRowIndex + 1)
    .map((row, index): Invoice | null => {
      const emissionDate = excelDateToISO(row[emissionIndex]);
      const clientName = text(row[clientNameIndex]);
      const grossValue = numeric(row[grossIndex]);
      const invoiceNumber = normalizeInvoiceNumber(row[invoiceIndex]);
      if (!emissionDate || !clientName || (!grossValue && !invoiceNumber)) return null;
      return {
        id: `invoice-${index}-${invoiceNumber}-${emissionDate}`,
        emissionDate,
        invoiceNumber,
        titleNumber: text(row[titleIndex]),
        grossValue,
        netValue: netIndex >= 0 ? numeric(row[netIndex]) : grossValue,
        clientCode: text(row[clientCodeIndex]),
        clientName,
      };
    })
    .filter((item): item is Invoice => Boolean(item));
}

const NF_MARKER = String.raw`N\.?\s*F\.?\s*(?:E|S)?`;

function extractInvoiceNumbers(description: string) {
  const upper = description.toUpperCase();
  const numbers: string[] = [];
  const patterns = [
    new RegExp(`${NF_MARKER}[\\s.:-]*([0-9][0-9\\s/.,E-]*)`, "g"),
    /NOTAS?[\s.:-]*([0-9][0-9\s/.,E-]*)/g,
  ];
  for (const pattern of patterns) {
    for (const match of upper.matchAll(pattern)) {
      const fragment = match[1].split(/PARCIAL|FINAL|PARTE|DESC|RETEVE|\(|\)/)[0];
      for (const token of fragment.split(/\s*(?:\/|,|\bE\b)\s*/)) {
        const normalized = normalizeInvoiceNumber(token);
        if (normalized && normalized.length <= 12) numbers.push(normalized);
      }
    }
  }
  return [...new Set(numbers)];
}

function clientHint(description: string) {
  const beforeMarker = description
    .split(new RegExp(`\\s*[-–—]?\\s*(?:${NF_MARKER}|NOTAS?)[\\s.:-]*`, "i"))[0]
    .replace(/\s+/g, " ")
    .trim();

  if (beforeMarker) return beforeMarker;

  return description
    .replace(new RegExp(`(?:${NF_MARKER}|NOTAS?)[\\s.:-]*[0-9][0-9\\s/.,E-]*`, "gi"), " ")
    .replace(/\s+/g, " ")
    .trim();
}

const GENERIC_CLIENT_TERMS = new Set([
  "RECEBIMENTO",
  "RECEBIMENTOS",
  "CLIENTE",
  "PAGAMENTO",
  "PAGTO",
  "CREDITO",
  "PIX",
  "TED",
  "DOC",
  "DEPOSITO",
  "VALOR",
  "BANCO",
]);

function hasClientName(description: string) {
  const normalized = normalizeHeader(clientHint(description));
  if (!normalized || !/[A-Z]/.test(normalized)) return false;

  return normalized
    .split(" ")
    .filter(Boolean)
    .some((token) => token.length >= 2 && !GENERIC_CLIENT_TERMS.has(token) && !/^\d+$/.test(token));
}

function isMonthSheet(name: string) {
  const normalized = normalizeHeader(name);
  return MONTH_NAMES.some((month) => normalized.includes(normalizeHeader(month))) && /20\d{2}/.test(normalized);
}

type BankBlock = {
  dateIndex: number;
  descriptionIndex: number;
  amountIndex: number;
  bank: string;
};

function detectBankBlocks(rows: unknown[][]): { headerRowIndex: number; blocks: BankBlock[] } {
  const bankPattern = /BANCO DO BRASIL|BANCO SANTANDER|BANCO BRADESCO|BANCO ITAU|BRADESCO|SANTANDER|ITAU/;

  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 12); rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const descriptionColumns = row
      .map((cell, columnIndex) => ({ columnIndex, value: normalizeHeader(cell) }))
      .filter((item) => bankPattern.test(item.value))
      .map((item) => item.columnIndex);

    if (descriptionColumns.length >= 2) {
      return {
        headerRowIndex: rowIndex,
        blocks: descriptionColumns
          .filter((columnIndex) => columnIndex > 0)
          .map((columnIndex) => ({
            dateIndex: columnIndex - 1,
            descriptionIndex: columnIndex,
            amountIndex: columnIndex + 1,
            bank: text(row[columnIndex]) || `Banco ${columnIndex}`,
          })),
      };
    }
  }

  return { headerRowIndex: 0, blocks: [] };
}

const NON_RECEIPT_TERMS = [
  "TRANSFERENCIA",
  "TRANSFERENCIAS",
  "APLICACAO",
  "RESGATE",
  "PAGAMENTO ONLINE",
  "PAGTOS. ON LINE",
  "DESPESAS BANC",
  "EMPRESTIMO",
  "FINANC",
  "CARTAO",
  "CIELO",
  "SALDO",
  "JUROS",
  "IOF",
  "AMORTIZA",
  "CONTA GARANT",
  "BLOQUEIO",
  "RENDIMENTOS",
  "TARIFA",
  "CAMBIO",
];

function looksLikeClientReceipt(description: string) {
  const normalized = normalizeHeader(description);
  return Boolean(normalized) && !NON_RECEIPT_TERMS.some((term) => normalized.includes(term));
}

function identifiedReceipt(description: string) {
  const invoiceNumbers = extractInvoiceNumbers(description);
  const identifiedClient = clientHint(description);

  return {
    invoiceNumbers,
    identifiedClient,
    isValid: looksLikeClientReceipt(description)
      && invoiceNumbers.length > 0
      && hasClientName(description),
  };
}

export async function parseReceiptWorkbook(file: File): Promise<Receipt[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  const receipts: Receipt[] = [];

  for (const sheetName of workbook.SheetNames.filter(isMonthSheet)) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      raw: true,
    });

    const { headerRowIndex, blocks } = detectBankBlocks(rows);
    if (!blocks.length) continue;

    const explicitReceiptHeader = rows.findIndex((row) =>
      blocks.some((block) => normalizeHeader(row?.[block.descriptionIndex]) === "RECEBIMENTOS"),
    );

    const searchStart = Math.max(headerRowIndex + 3, 15);
    let footerRow = rows.length;
    for (let rowIndex = searchStart; rowIndex < rows.length; rowIndex += 1) {
      const isFooter = blocks.some((block) => {
        const description = normalizeHeader(rows[rowIndex]?.[block.descriptionIndex]);
        return description.includes("PAGAMENTO ONLINE") || description.includes("PAGTOS. ON LINE");
      });
      if (isFooter) {
        footerRow = rowIndex;
        break;
      }
    }

    let firstReceiptRow = explicitReceiptHeader >= 0 ? explicitReceiptHeader + 1 : -1;
    if (firstReceiptRow < 0) {
      for (let rowIndex = searchStart; rowIndex < footerRow; rowIndex += 1) {
        const found = blocks.some((block) => {
          const date = excelDateToISO(rows[rowIndex]?.[block.dateIndex]);
          const description = text(rows[rowIndex]?.[block.descriptionIndex]);
          const amount = numeric(rows[rowIndex]?.[block.amountIndex]);
          return Boolean(date && description && amount !== 0 && identifiedReceipt(description).isValid);
        });
        if (found) {
          firstReceiptRow = rowIndex;
          break;
        }
      }
    }

    if (firstReceiptRow < 0) continue;

    for (let rowIndex = firstReceiptRow; rowIndex < footerRow; rowIndex += 1) {
      const row = rows[rowIndex];
      for (const block of blocks) {
        const date = excelDateToISO(row?.[block.dateIndex]);
        const description = text(row?.[block.descriptionIndex]);
        const amount = numeric(row?.[block.amountIndex]);
        if (!date || !description || !Number.isFinite(amount) || amount === 0) continue;

        const { invoiceNumbers, identifiedClient, isValid } = identifiedReceipt(description);
        if (!isValid) continue;

        receipts.push({
          id: `receipt-${sheetName}-${block.descriptionIndex}-${rowIndex}`,
          receiptDate: date,
          description,
          amount,
          bank: block.bank,
          sourceSheet: sheetName,
          invoiceNumbers,
          clientHint: identifiedClient,
        });
      }
    }
  }

  if (!receipts.length) {
    throw new Error("Não encontrei recebimentos com NF e nome do cliente nas abas mensais da planilha de conciliação.");
  }

  return receipts.sort((a, b) => a.receiptDate.localeCompare(b.receiptDate));
}
