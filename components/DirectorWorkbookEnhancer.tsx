"use client";

import { CalendarClock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";

type ForecastRow = {
  id: string;
  clientCode: string;
  clientName: string;
  forecastDate: string | null;
  notes: string;
  status: string;
  amount: number;
};

type DirectorSnapshot = {
  fileName: string;
  invoiceCount: number;
  importedAt: string;
  forecasts: ForecastRow[];
};

type MarkedFile = File & {
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

const DIRECTOR_STORAGE_KEY = "financial-analytics-director-workbook-v1";
const MAIN_STORAGE_KEY = "financial-analytics-data-v1";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const integer = new Intl.NumberFormat("pt-BR");

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/_x000D_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("pt-BR");
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function numeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = text(value);
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
  return null;
}

function normalizeInvoiceNumber(value: unknown) {
  const digits = text(value).replace(/\D/g, "");
  return digits.replace(/^0+/, "") || digits;
}

function isClientHeader(codeValue: unknown, nameValue: unknown) {
  const code = text(codeValue);
  const name = text(nameValue);
  if (!/^\d+(?:[.,]0+)?$/.test(code) || !/[A-Za-zÀ-ÿ]/.test(name)) return false;
  const normalizedName = normalize(name);
  return !["NOTA", "VALOR", "TOTAL", "EMISSAO", "VENCIMENTO", "COMPETENCIA", "OBS."].includes(normalizedName);
}

function parseReceivablesSheet(rows: unknown[][]) {
  const invoices: ParsedDirectorWorkbook["invoices"] = [];
  const blocks = [
    { emission: 1, invoice: 2, amount: 3, adjustment: 4 },
    { emission: 9, invoice: 10, amount: 11, adjustment: 12 },
  ];

  blocks.forEach((block, blockIndex) => {
    let clientCode = "";
    let clientName = "";
    let lastInvoiceIndex = -1;

    rows.forEach((row, rowIndex) => {
      const possibleCode = row?.[block.emission];
      const possibleName = row?.[block.invoice];

      if (isClientHeader(possibleCode, possibleName)) {
        clientCode = String(Math.trunc(numeric(possibleCode)) || text(possibleCode));
        clientName = text(possibleName);
        lastInvoiceIndex = -1;
        return;
      }

      const emissionDate = excelDateToISO(row?.[block.emission]);
      const invoiceNumber = normalizeInvoiceNumber(row?.[block.invoice]);
      const amount = numeric(row?.[block.amount]);
      const adjustmentNote = normalize(row?.[block.adjustment]);

      if (clientName && emissionDate && amount > 0) {
        invoices.push({
          emissionDate,
          invoiceNumber,
          amount,
          clientCode,
          clientName,
        });
        lastInvoiceIndex = invoices.length - 1;
        return;
      }

      const isPaymentAdjustment = amount < 0
        && /PAGO|PAGTO|PGTO|PAGAMENTO|RECEB/.test(adjustmentNote);

      if (clientName && isPaymentAdjustment && lastInvoiceIndex >= 0) {
        invoices[lastInvoiceIndex].amount = Math.max(0, invoices[lastInvoiceIndex].amount + amount);
      }

      if (rowIndex > rows.length) lastInvoiceIndex = blockIndex;
    });
  });

  return invoices.filter((invoice) => invoice.amount > 0);
}

function parseForecastSheet(rows: unknown[][]) {
  const headerIndex = rows.findIndex((row) => {
    const normalized = row.map(normalize);
    return normalized.some((cell) => cell === "CLIENTE")
      && normalized.some((cell) => cell.includes("PREVISAO"))
      && normalized.some((cell) => cell.includes("TOTAL A RECEBER"));
  });

  if (headerIndex < 0) return [];

  const headers = rows[headerIndex].map(normalize);
  const clientCodeIndex = 0;
  const clientNameIndex = headers.findIndex((header) => header === "CLIENTE") + 1;
  const dateIndex = headers.findIndex((header) => header.includes("PREVISAO"));
  const notesIndex = headers.findIndex((header) => header === "NOTAS" || header.includes("NOTA"));
  const statusIndex = headers.findIndex((header) => header === "OBS" || header.includes("OBS"));
  const amountIndex = headers.findIndex((header) => header.includes("TOTAL A RECEBER"));

  return rows
    .slice(headerIndex + 1)
    .map((row, index): ForecastRow | null => {
      const clientName = text(row?.[clientNameIndex]);
      const amount = numeric(row?.[amountIndex]);
      if (!clientName || amount <= 0) return null;
      return {
        id: `forecast-${index}-${normalizeInvoiceNumber(row?.[notesIndex])}-${clientName}`,
        clientCode: text(row?.[clientCodeIndex]),
        clientName,
        forecastDate: excelDateToISO(row?.[dateIndex]),
        notes: text(row?.[notesIndex]),
        status: text(row?.[statusIndex]),
        amount,
      };
    })
    .filter((item): item is ForecastRow => Boolean(item));
}

async function parseDirectorWorkbook(file: File): Promise<ParsedDirectorWorkbook | null> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  const receivablesSheetName = workbook.SheetNames.find((name) => normalize(name) === "CONTAS A RECEBER")
    ?? workbook.SheetNames.find((name) => normalize(name).includes("CONTAS A RECEBER"));

  if (!receivablesSheetName) return null;

  const receivablesRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[receivablesSheetName], {
    header: 1,
    defval: "",
    raw: true,
  });

  const invoices = parseReceivablesSheet(receivablesRows);
  if (!invoices.length) return null;

  const forecastSheetName = workbook.SheetNames.find((name) => normalize(name) === "PREVISAO")
    ?? workbook.SheetNames.find((name) => normalize(name).includes("PREVISAO"));

  const forecasts = forecastSheetName
    ? parseForecastSheet(XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[forecastSheetName], {
      header: 1,
      defval: "",
      raw: true,
    }))
    : [];

  return { invoices, forecasts };
}

function createCompatibleInvoiceFile(originalFile: File, parsed: ParsedDirectorWorkbook) {
  const rows = [
    ["Data da Emissão", "NF Eletr", "No. Título", "Valor", "Líquido", "Cliente", "Nome Cliente"],
    ...parsed.invoices.map((invoice) => [
      invoice.emissionDate,
      invoice.invoiceNumber,
      "",
      invoice.amount,
      invoice.amount,
      invoice.clientCode,
      invoice.clientName,
    ]),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Registros de duplicatas");
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  const compatibleFile = new File([bytes], originalFile.name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    lastModified: originalFile.lastModified,
  }) as MarkedFile;
  compatibleFile.__financialDashboardReplay = true;
  return compatibleFile;
}

function replayFile(input: HTMLInputElement, file: MarkedFile) {
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function readSnapshot(): DirectorSnapshot | null {
  try {
    const raw = window.localStorage.getItem(DIRECTOR_STORAGE_KEY);
    return raw ? JSON.parse(raw) as DirectorSnapshot : null;
  } catch {
    return null;
  }
}

function saveSnapshot(snapshot: DirectorSnapshot | null) {
  if (snapshot) window.localStorage.setItem(DIRECTOR_STORAGE_KEY, JSON.stringify(snapshot));
  else window.localStorage.removeItem(DIRECTOR_STORAGE_KEY);
}

function formatDate(value: string | null) {
  if (!value) return "A definir";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "A definir" : date.toLocaleDateString("pt-BR");
}

function updateImportCopy() {
  document.querySelectorAll<HTMLElement>(".upload-card").forEach((card) => {
    const heading = card.querySelector<HTMLElement>("h3");
    if (!heading || !normalize(heading.textContent).includes("FINR020")) return;
    heading.textContent = "1. FINR020 ou Contas a Receber";
    const description = card.querySelector<HTMLElement>("p");
    if (description) description.textContent = "Aceita a FINR020 ou a planilha diária com as abas CONTAS A RECEBER e PREVISÃO.";
  });
}

function applyDirectorLabels(active: boolean) {
  document.querySelectorAll<HTMLElement>(".kpi-card").forEach((card) => {
    const title = card.querySelector<HTMLElement>(".kpi-title");
    const detail = card.querySelector<HTMLElement>(".kpi-detail");
    if (!title) return;

    const normalizedTitle = normalize(title.dataset.originalTitle ?? title.textContent);
    if (normalizedTitle !== "RECEITA EMITIDA" && title.dataset.directorLabel !== "true") return;

    if (active) {
      title.dataset.originalTitle = "Receita emitida";
      title.dataset.directorLabel = "true";
      title.textContent = "Contas a receber";
      if (detail) detail.textContent = detail.textContent?.replace(/notas?/i, "títulos em aberto") ?? "";
    } else if (title.dataset.directorLabel === "true") {
      title.textContent = title.dataset.originalTitle ?? "Receita emitida";
      delete title.dataset.directorLabel;
    }
  });

  document.querySelectorAll<HTMLElement>(".alert.success").forEach((alert) => {
    if (!active || !/emissões importadas/i.test(alert.textContent ?? "")) return;
    Array.from(alert.childNodes).forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE && node.textContent) {
        node.textContent = node.textContent.replace(/emissões importadas/i, "títulos em aberto importados");
      }
    });
  });
}

function ForecastKpi({ snapshot }: { snapshot: DirectorSnapshot }) {
  const total = snapshot.forecasts.reduce((sum, item) => sum + item.amount, 0);
  const confirmed = snapshot.forecasts.filter((item) => normalize(item.status).includes("CONFIRMADO")).length;

  return (
    <article className="kpi-card director-forecast-kpi">
      <div className="kpi-topline">
        <span className="kpi-title">Previsão de recebimento</span>
        <span className="kpi-icon"><CalendarClock size={20} /></span>
      </div>
      <strong>{currency.format(total)}</strong>
      <span className="kpi-detail">{integer.format(snapshot.forecasts.length)} previsões • {integer.format(confirmed)} confirmadas</span>
    </article>
  );
}

function ForecastPanel({ snapshot }: { snapshot: DirectorSnapshot }) {
  const rows = useMemo(() => [...snapshot.forecasts].sort((a, b) => {
    if (a.forecastDate && b.forecastDate) return a.forecastDate.localeCompare(b.forecastDate);
    if (a.forecastDate) return -1;
    if (b.forecastDate) return 1;
    return b.amount - a.amount;
  }), [snapshot]);

  return (
    <section className="panel director-forecast-panel">
      <div className="panel-header">
        <div>
          <h2>Previsão de recebimento</h2>
          <p>Dados da aba PREVISÃO do arquivo diário da diretoria</p>
        </div>
        <strong className="director-forecast-total">{currency.format(rows.reduce((sum, item) => sum + item.amount, 0))}</strong>
      </div>
      <div className="director-forecast-table-wrap">
        <table>
          <thead>
            <tr><th>Data</th><th>Cliente</th><th>Notas</th><th>Status</th><th className="number">Valor previsto</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{formatDate(row.forecastDate)}</td>
                <td className="client-cell">{row.clientName}</td>
                <td>{row.notes || "—"}</td>
                <td><span className={`director-status ${normalize(row.status).includes("CONFIRMADO") ? "confirmed" : "planned"}`}>{row.status || "Previsão"}</span></td>
                <td className="number"><strong>{currency.format(row.amount)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function DirectorWorkbookEnhancer() {
  const [snapshot, setSnapshot] = useState<DirectorSnapshot | null>(null);
  const [kpiTarget, setKpiTarget] = useState<HTMLElement | null>(null);
  const [panelTarget, setPanelTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setSnapshot(readSnapshot());
  }, []);

  useEffect(() => {
    const attachedInputs = new WeakSet<HTMLInputElement>();
    const attachedCards = new WeakSet<HTMLElement>();

    const processFile = async (input: HTMLInputElement, file: File) => {
      const marked = file as MarkedFile;
      if (marked.__financialDashboardReplay) {
        replayFile(input, marked);
        return;
      }

      try {
        const parsed = await parseDirectorWorkbook(file);
        if (!parsed) {
          saveSnapshot(null);
          setSnapshot(null);
          marked.__financialDashboardReplay = true;
          replayFile(input, marked);
          return;
        }

        const nextSnapshot: DirectorSnapshot = {
          fileName: file.name,
          invoiceCount: parsed.invoices.length,
          importedAt: new Date().toISOString(),
          forecasts: parsed.forecasts,
        };
        saveSnapshot(nextSnapshot);
        setSnapshot(nextSnapshot);
        replayFile(input, createCompatibleInvoiceFile(file, parsed));
      } catch {
        marked.__financialDashboardReplay = true;
        replayFile(input, marked);
      }
    };

    const attach = () => {
      updateImportCopy();

      document.querySelectorAll<HTMLElement>(".upload-card").forEach((card) => {
        const heading = card.querySelector<HTMLElement>("h3");
        if (!heading || !normalize(heading.textContent).includes("FINR020")) return;
        const input = card.querySelector<HTMLInputElement>('input[type="file"]');
        if (!input) return;

        if (!attachedInputs.has(input)) {
          attachedInputs.add(input);
          input.addEventListener("change", (event) => {
            const currentInput = event.currentTarget as HTMLInputElement;
            const file = currentInput.files?.[0] as MarkedFile | undefined;
            if (!file || file.__financialDashboardReplay) return;
            event.stopImmediatePropagation();
            event.stopPropagation();
            void processFile(currentInput, file);
          }, true);
        }

        if (!attachedCards.has(card)) {
          attachedCards.add(card);
          card.addEventListener("drop", (event) => {
            const file = event.dataTransfer?.files?.[0];
            if (!file) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            event.stopPropagation();
            void processFile(input, file);
          }, true);
        }
      });
    };

    const handleClear = (event: MouseEvent) => {
      const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('button[title="Limpar dados"]');
      if (!button) return;
      saveSnapshot(null);
      setSnapshot(null);
      window.localStorage.removeItem(MAIN_STORAGE_KEY);
    };

    attach();
    document.addEventListener("click", handleClear, true);
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      document.removeEventListener("click", handleClear, true);
    };
  }, []);

  useEffect(() => {
    const syncTargets = () => {
      updateImportCopy();
      applyDirectorLabels(Boolean(snapshot));

      const grid = document.querySelector<HTMLElement>(".kpi-grid");
      if (grid && snapshot?.forecasts.length) grid.classList.add("kpi-grid-with-director-forecast");
      else grid?.classList.remove("kpi-grid-with-director-forecast");
      setKpiTarget((current) => current === grid ? current : grid);

      const chartGrid = document.querySelector<HTMLElement>(".chart-grid");
      if (!chartGrid?.parentElement) {
        setPanelTarget(null);
        return;
      }

      let mount = chartGrid.parentElement.querySelector<HTMLElement>(":scope > .director-forecast-mount");
      if (!mount) {
        mount = document.createElement("div");
        mount.className = "director-forecast-mount";
        chartGrid.insertAdjacentElement("afterend", mount);
      }
      setPanelTarget((current) => current === mount ? current : mount);
    };

    syncTargets();
    const observer = new MutationObserver(syncTargets);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(syncTargets, 500);

    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, [snapshot]);

  return (
    <>
      <style jsx global>{`
        @media (min-width: 1001px) {
          .kpi-grid.kpi-grid-with-director-forecast {
            grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
          }
        }

        .director-forecast-kpi .kpi-icon {
          color: #a65b00;
          background: #fff4df;
        }

        .director-forecast-kpi::after {
          background: #fff5e5;
        }

        .director-forecast-mount {
          margin-top: 16px;
          display: block;
        }

        .director-forecast-panel {
          width: 100%;
        }

        .director-forecast-total {
          color: #263043;
          font-size: 17px;
        }

        .director-forecast-table-wrap {
          max-height: 390px;
          overflow: auto;
          border: 1px solid #edf0f5;
          border-radius: 10px;
        }

        .director-forecast-table-wrap table {
          min-width: 850px;
        }

        .director-forecast-table-wrap thead {
          position: sticky;
          top: 0;
          z-index: 1;
        }

        .director-status {
          display: inline-flex;
          padding: 4px 7px;
          border-radius: 6px;
          font-size: 9px;
          font-weight: 800;
        }

        .director-status.confirmed {
          color: #187660;
          background: #e8f8f2;
        }

        .director-status.planned {
          color: #9b5d0b;
          background: #fff4df;
        }

        @media (max-width: 1000px) {
          .director-forecast-total {
            width: 100%;
            margin-top: 6px;
          }
        }

        @media print {
          .director-forecast-panel {
            break-inside: avoid;
          }
        }
      `}</style>
      {snapshot?.forecasts.length && kpiTarget ? createPortal(<ForecastKpi snapshot={snapshot} />, kpiTarget) : null}
      {snapshot?.forecasts.length && panelTarget ? createPortal(<ForecastPanel snapshot={snapshot} />, panelTarget) : null}
    </>
  );
}
