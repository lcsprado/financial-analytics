import * as XLSX from "xlsx";

export type ForecastRow = {
  id: string;
  clientCode: string;
  clientName: string;
  forecastDate: string | null;
  notes: string;
  status: string;
  amount: number;
};

export type DirectorSnapshot = {
  fileName: string;
  invoiceCount: number;
  importedAt: string;
  forecasts: ForecastRow[];
};

export type MarkedFile = File & {
  __financialDashboardReplay?: boolean;
};

type ParsedDirectorWorkbook = {
  invoices: Array<{
    emissionDate: string;
    invoiceNumber: string;
    amount: number;
    clientCode: string;
    clientName: string;
  }>;
  forecasts: ForecastRow[];
};

function normalize(value: unknown) {
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
  const raw = text(value);
  if (!raw) return 0;
  const parsed = Number(raw
    .replace(/R\$/gi, "")
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function excelDateToISO(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const raw = text(value);
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return iso ? `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}` : null;
}

function invoiceNumber(value: unknown) {
  const digits = text(value).replace(/\D/g, "");
  return digits.replace(/^0+/, "") || digits;
}

function isClientHeader(codeValue: unknown, nameValue: unknown) {
  const code = text(codeValue);
  const name = text(nameValue);
  if (!/^\d+(?:[.,]0+)?$/.test(code) || !/[A-Za-zÀ-ÿ]/.test(name)) return false;
  return !["NOTA", "VALOR", "TOTAL", "EMISSAO", "VENCIMENTO", "COMPETENCIA", "OBS."].includes(normalize(name));
}

function parseReceivables(rows: unknown[][]) {
  const invoices: ParsedDirectorWorkbook["invoices"] = [];
  const blocks = [
    { emission: 1, invoice: 2, amount: 3, adjustment: 4 },
    { emission: 9, invoice: 10, amount: 11, adjustment: 12 },
  ];

  blocks.forEach((block) => {
    let clientCode = "";
    let clientName = "";
    let lastInvoice = -1;

    rows.forEach((row) => {
      if (isClientHeader(row?.[block.emission], row?.[block.invoice])) {
        clientCode = String(Math.trunc(numeric(row?.[block.emission])) || text(row?.[block.emission]));
        clientName = text(row?.[block.invoice]);
        lastInvoice = -1;
        return;
      }

      const emissionDate = excelDateToISO(row?.[block.emission]);
      const amount = numeric(row?.[block.amount]);
      if (clientName && emissionDate && amount > 0) {
        invoices.push({
          emissionDate,
          invoiceNumber: invoiceNumber(row?.[block.invoice]),
          amount,
          clientCode,
          clientName,
        });
        lastInvoice = invoices.length - 1;
        return;
      }

      const adjustment = normalize(row?.[block.adjustment]);
      if (amount < 0 && lastInvoice >= 0 && /PAGO|PAGTO|PGTO|PAGAMENTO|RECEB/.test(adjustment)) {
        invoices[lastInvoice].amount = Math.max(0, invoices[lastInvoice].amount + amount);
      }
    });
  });

  return invoices.filter((item) => item.amount > 0);
}

function parseForecast(rows: unknown[][]): ForecastRow[] {
  const headerIndex = rows.findIndex((row) => {
    const cells = row.map(normalize);
    return cells.some((cell) => cell === "CLIENTE")
      && cells.some((cell) => cell.includes("PREVISAO"))
      && cells.some((cell) => cell.includes("TOTAL A RECEBER"));
  });
  if (headerIndex < 0) return [];

  const headers = rows[headerIndex].map(normalize);
  const clientHeader = headers.findIndex((header) => header === "CLIENTE");
  const clientIndex = clientHeader >= 0 ? clientHeader + 1 : 1;
  const dateIndex = headers.findIndex((header) => header.includes("PREVISAO"));
  const notesIndex = headers.findIndex((header) => header.includes("NOTA"));
  const statusIndex = headers.findIndex((header) => header.includes("OBS"));
  const amountIndex = headers.findIndex((header) => header.includes("TOTAL A RECEBER"));

  return rows.slice(headerIndex + 1).map((row, index): ForecastRow | null => {
    const clientName = text(row?.[clientIndex]);
    const amount = numeric(row?.[amountIndex]);
    if (!clientName || amount <= 0) return null;
    return {
      id: `forecast-${index}-${clientName}`,
      clientCode: text(row?.[0]),
      clientName,
      forecastDate: excelDateToISO(row?.[dateIndex]),
      notes: text(row?.[notesIndex]),
      status: text(row?.[statusIndex]),
      amount,
    };
  }).filter((item): item is ForecastRow => Boolean(item));
}

export async function parseDirectorWorkbook(file: File): Promise<ParsedDirectorWorkbook | null> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
  const receivablesSheet = workbook.SheetNames.find((name) => normalize(name).includes("CONTAS A RECEBER"));
  if (!receivablesSheet) return null;

  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[receivablesSheet], {
    header: 1,
    defval: "",
    raw: true,
  });
  const invoices = parseReceivables(rows);
  if (!invoices.length) return null;

  const forecastSheet = workbook.SheetNames.find((name) => normalize(name).includes("PREVISAO"));
  const forecasts = forecastSheet
    ? parseForecast(XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[forecastSheet], { header: 1, defval: "", raw: true }))
    : [];
  return { invoices, forecasts };
}

export function createCompatibleInvoiceFile(original: File, parsed: ParsedDirectorWorkbook) {
  const rows = [
    ["Data da Emissão", "NF Eletr", "No. Título", "Valor", "Líquido", "Cliente", "Nome Cliente"],
    ...parsed.invoices.map((item) => [
      item.emissionDate,
      item.invoiceNumber,
      "",
      item.amount,
      item.amount,
      item.clientCode,
      item.clientName,
    ]),
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Registros de duplicatas");
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  const file = new File([bytes], original.name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    lastModified: original.lastModified,
  }) as MarkedFile;
  file.__financialDashboardReplay = true;
  return file;
}

export function replayFile(input: HTMLInputElement, file: MarkedFile) {
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}
