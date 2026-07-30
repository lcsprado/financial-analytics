"use client";

import * as XLSX from "xlsx";
import { Building2, ChevronDown, ChevronUp, CreditCard, Landmark, Sigma } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { currency, monthLabels } from "@/lib/format";
import type { PeriodFilter } from "@/lib/types";

export const CHANNEL_STORAGE_KEY = "financial-analytics-receipt-channels-v1";
const INCLUDE_STORAGE_KEY = "financial-analytics-include-receipt-channels-v1";
export const CHANNEL_EVENT = "financial-analytics-receipt-channels-updated";
const INCLUDE_EVENT = "financial-analytics-receipt-channels-include-changed";

const MONTH_NAMES = [
  "JANEIRO", "FEVEREIRO", "MARÇO", "MARCO", "ABRIL", "MAIO", "JUNHO",
  "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO",
];

type ChannelKind = "CIELO" | "PIX_RECEBIDO_CLIENTE";
type SupportedBank = "BANCO DO BRASIL" | "BRADESCO";

type ChannelEntry = {
  id: string;
  receiptDate: string;
  description: string;
  amount: number;
  bank: SupportedBank;
  sourceSheet: string;
  kind: ChannelKind;
};

export type ChannelPayload = {
  fileName: string;
  entries: ChannelEntry[];
};

type FilterSnapshot = PeriodFilter & {
  view: string;
};

type BankBlock = {
  dateIndex: number;
  descriptionIndex: number;
  amountIndex: number;
  bank: SupportedBank;
};

const emptyPayload: ChannelPayload = { fileName: "", entries: [] };

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

function isMonthSheet(name: string) {
  const normalized = normalize(name);
  return MONTH_NAMES.some((month) => normalized.includes(normalize(month)));
}

function supportedBank(value: unknown): SupportedBank | null {
  const normalized = normalize(value);
  if (
    normalized.includes("BANCO DO BRASIL")
    || normalized.includes("BANCO BRASIL")
    || /\bB\.?\s*BRASIL\b/.test(normalized)
  ) return "BANCO DO BRASIL";
  if (normalized.includes("BRADESCO")) return "BRADESCO";
  return null;
}

function detectBankBlocks(rows: unknown[][]): { headerRowIndex: number; blocks: BankBlock[] } {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 30); rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const blocks = row
      .map((cell, columnIndex) => ({ columnIndex, bank: supportedBank(cell) }))
      .filter((item): item is { columnIndex: number; bank: SupportedBank } => Boolean(item.bank) && item.columnIndex > 0)
      .map((item) => ({
        dateIndex: item.columnIndex - 1,
        descriptionIndex: item.columnIndex,
        amountIndex: item.columnIndex + 1,
        bank: item.bank,
      }));

    if (blocks.length) return { headerRowIndex: rowIndex, blocks };
  }

  return { headerRowIndex: 0, blocks: [] };
}

function channelKind(description: string): ChannelKind | null {
  const normalized = normalize(description);
  if (normalized.includes("CIELO")) return "CIELO";
  if (normalized.includes("PIX RECEBIDO") && normalized.includes("CLIENTE")) {
    return "PIX_RECEBIDO_CLIENTE";
  }
  return null;
}

export async function parseChannelWorkbook(file: File): Promise<ChannelPayload> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  const entries: ChannelEntry[] = [];

  for (const sheetName of workbook.SheetNames.filter(isMonthSheet)) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1,
      defval: "",
      raw: true,
    });

    const { headerRowIndex, blocks } = detectBankBlocks(rows);
    if (!blocks.length) continue;

    const lastDates = new Map<number, string>();
    for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      for (const block of blocks) {
        const explicitDate = excelDateToISO(row?.[block.dateIndex]);
        if (explicitDate) lastDates.set(block.descriptionIndex, explicitDate);
        const receiptDate = explicitDate ?? lastDates.get(block.descriptionIndex) ?? null;
        const description = text(row?.[block.descriptionIndex]);
        const amount = numeric(row?.[block.amountIndex]);
        const kind = channelKind(description);

        if (!receiptDate || !description || !kind || !Number.isFinite(amount) || amount === 0) continue;

        entries.push({
          id: `channel-${sheetName}-${block.descriptionIndex}-${rowIndex}`,
          receiptDate,
          description,
          amount,
          bank: block.bank,
          sourceSheet: sheetName,
          kind,
        });
      }
    }
  }

  return { fileName: file.name, entries };
}

function readPayload(raw: string | null): ChannelPayload {
  try {
    const parsed = raw ? JSON.parse(raw) as ChannelPayload : emptyPayload;
    return Array.isArray(parsed.entries) ? parsed : emptyPayload;
  } catch {
    return emptyPayload;
  }
}

function readFilters(): FilterSnapshot {
  const selects = Array.from(document.querySelectorAll<HTMLSelectElement>(".filter-bar select"));
  const yearValue = selects[0]?.value ?? "all";
  const monthValue = selects[1]?.value ?? "all";
  const clientValue = document.querySelector<HTMLSelectElement>(".client-filter select")?.value ?? "";
  const view = document.querySelector<HTMLElement>(".topbar-title h1")?.textContent?.trim() ?? "";

  return {
    year: yearValue === "all" ? "all" : Number(yearValue),
    month: monthValue === "all" ? "all" : Number(monthValue),
    client: clientValue,
    view,
  };
}

function inPeriod(dateValue: string, filter: PeriodFilter) {
  const date = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  return (filter.year === "all" || date.getFullYear() === filter.year)
    && (filter.month === "all" || date.getMonth() === filter.month);
}

function findBankPanel() {
  return Array.from(document.querySelectorAll<HTMLElement>(".panel"))
    .find((panel) => panel.querySelector("h2")?.textContent?.trim() === "Recebimentos por banco") ?? null;
}

function periodLabel(filter: PeriodFilter) {
  const year = filter.year === "all" ? "todos os anos" : String(filter.year);
  if (filter.month === "all") return `Todos os meses de ${year}`;
  return `${monthLabels[filter.month]} de ${year}`;
}

function amountBy(entries: ChannelEntry[], bank?: SupportedBank, kind?: ChannelKind) {
  return entries
    .filter((entry) => (!bank || entry.bank === bank) && (!kind || entry.kind === kind))
    .reduce((sum, entry) => sum + entry.amount, 0);
}

function ChannelCard({
  title,
  total,
  cielo,
  pix,
  icon,
  featured = false,
}: {
  title: string;
  total: number;
  cielo: number;
  pix: number;
  icon: React.ReactNode;
  featured?: boolean;
}) {
  return (
    <article className={`receipt-channel-card ${featured ? "is-featured" : ""}`}>
      <div><span>{title}</span><i>{icon}</i></div>
      <strong>{currency.format(total)}</strong>
      <small><b>Cielo</b> {currency.format(cielo)} <em>•</em> <b>PIX</b> {currency.format(pix)}</small>
    </article>
  );
}

export default function ReceiptChannelSummary() {
  const [payload, setPayload] = useState<ChannelPayload>(emptyPayload);
  const [filter, setFilter] = useState<FilterSnapshot>({ year: "all", month: "all", client: "", view: "" });
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [includeInTotal, setIncludeInTotal] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const signatureRef = useRef("");

  useEffect(() => {
    const sync = () => {
      const channelRaw = window.localStorage.getItem(CHANNEL_STORAGE_KEY);
      const nextFilter = readFilters();
      const nextTarget = normalize(nextFilter.view) === "VISAO GERAL" ? findBankPanel() : null;
      const nextIncluded = window.localStorage.getItem(INCLUDE_STORAGE_KEY) === "true";
      const signature = [
        channelRaw ?? "",
        nextFilter.year,
        nextFilter.month,
        nextFilter.client,
        nextFilter.view,
        Boolean(nextTarget),
        nextIncluded,
      ].join("|");

      setTarget((current) => current === nextTarget ? current : nextTarget);
      if (signature === signatureRef.current) return;
      signatureRef.current = signature;
      setPayload(readPayload(channelRaw));
      setFilter(nextFilter);
      setIncludeInTotal(nextIncluded);
    };

    const run = () => {
      sync();
    };

    run();
    const observer = new MutationObserver(run);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(run, 500);
    window.addEventListener("storage", run);
    window.addEventListener(CHANNEL_EVENT, run);
    window.addEventListener(INCLUDE_EVENT, run);

    return () => {
      observer.disconnect();
      window.clearInterval(timer);
      window.removeEventListener("storage", run);
      window.removeEventListener(CHANNEL_EVENT, run);
      window.removeEventListener(INCLUDE_EVENT, run);
    };
  }, []);

  const periodFilter: PeriodFilter = useMemo(() => ({
    year: filter.year,
    month: filter.month,
    client: filter.client,
  }), [filter.year, filter.month, filter.client]);

  const periodEntries = useMemo(
    () => payload.entries.filter((entry) => inPeriod(entry.receiptDate, periodFilter)),
    [payload.entries, periodFilter],
  );

  const totals = useMemo(() => {
    const brasil = {
      cielo: amountBy(periodEntries, "BANCO DO BRASIL", "CIELO"),
      pix: amountBy(periodEntries, "BANCO DO BRASIL", "PIX_RECEBIDO_CLIENTE"),
    };
    const bradesco = {
      cielo: amountBy(periodEntries, "BRADESCO", "CIELO"),
      pix: amountBy(periodEntries, "BRADESCO", "PIX_RECEBIDO_CLIENTE"),
    };

    return {
      brasil: { ...brasil, total: brasil.cielo + brasil.pix },
      bradesco: { ...bradesco, total: bradesco.cielo + bradesco.pix },
      total: {
        cielo: brasil.cielo + bradesco.cielo,
        pix: brasil.pix + bradesco.pix,
        total: brasil.cielo + brasil.pix + bradesco.cielo + bradesco.pix,
      },
    };
  }, [periodEntries]);

  function toggleInclude() {
    if (!payload.entries.length) return;
    const next = !includeInTotal;
    window.localStorage.setItem(INCLUDE_STORAGE_KEY, String(next));
    setIncludeInTotal(next);
    window.dispatchEvent(new CustomEvent(INCLUDE_EVENT, { detail: { included: next } }));
  }

  if (!target) return null;

  return createPortal(
    <section className="receipt-channel-summary">
      <div className="receipt-channel-heading">
        <div>
          <span>OUTROS RECEBIMENTOS</span>
          <h3>Cielo e PIX recebido — cliente</h3>
          <p>{periodLabel(periodFilter)} · Banco do Brasil e Bradesco</p>
        </div>
        <div className="receipt-channel-actions">
          <button
            type="button"
            className={`receipt-channel-toggle ${includeInTotal ? "is-active" : ""}`}
            role="switch"
            aria-checked={includeInTotal}
            disabled={!payload.entries.length}
            onClick={toggleInclude}
            title={
              !payload.entries.length
                ? "Reimporte a planilha de Recebimentos para carregar estes valores"
                : periodFilter.client
                  ? "Limpe o filtro de cliente para incluir valores não atribuídos"
                  : "Incluir ou retirar estes valores do total recebido"
            }
          >
            <i><span /></i>
            <b>
              {!payload.entries.length
                ? "Reimporte para ativar"
                : includeInTotal
                  ? "Incluído no total recebido"
                  : "Fora do total recebido"}
            </b>
          </button>
          <button
            type="button"
            className="receipt-channel-details-toggle"
            aria-expanded={showDetails}
            onClick={() => setShowDetails((current) => !current)}
          >
            {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {showDetails ? "Ocultar composição" : "Ver composição"}
          </button>
        </div>
      </div>

      {showDetails && (
        payload.entries.length ? (
          <>
            <div className="receipt-channel-period-summary">
              <CreditCard size={17} />
              <span>
                Cielo no período: <strong>{currency.format(totals.total.cielo)}</strong>
                <em>•</em>
                Cielo + PIX recebido: <strong>{currency.format(totals.total.total)}</strong>
              </span>
            </div>
            <div className="receipt-channel-grid">
              <ChannelCard title="Banco do Brasil" total={totals.brasil.total} cielo={totals.brasil.cielo} pix={totals.brasil.pix} icon={<Landmark size={16} />} />
              <ChannelCard title="Bradesco" total={totals.bradesco.total} cielo={totals.bradesco.cielo} pix={totals.bradesco.pix} icon={<Building2 size={16} />} />
              <ChannelCard title="Total dos dois bancos" total={totals.total.total} cielo={totals.total.cielo} pix={totals.total.pix} icon={<Sigma size={16} />} featured />
            </div>
          </>
        ) : (
          <div className="receipt-channel-empty">
            <CreditCard size={18} />
            <span>
              Cielo no período: <strong>{currency.format(0)}</strong>. Reimporte a planilha de Recebimentos uma vez para carregar Cielo e PIX.
            </span>
          </div>
        )
      )}

      {periodFilter.client && includeInTotal && (
        <p className="receipt-channel-note">Cielo e PIX ficam fora do total enquanto houver um cliente selecionado, porque esses lançamentos não identificam o cliente.</p>
      )}

      <style jsx global>{`
        .receipt-channel-summary {
          margin: 18px 0 0;
          padding: 15px;
          border-top: 1px solid #edf0f5;
          background: linear-gradient(180deg, rgba(247,249,253,.2), #f8faff);
          border-radius: 0 0 12px 12px;
        }
        .receipt-channel-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; }
        .receipt-channel-heading > div > span { color: #8b94a7; font-size: 8px; font-weight: 900; letter-spacing: .12em; }
        .receipt-channel-heading h3 { margin: 3px 0 0; color: #202738; font-size: 13px; }
        .receipt-channel-heading p { margin: 3px 0 0; color: #858ea1; font-size: 9px; }
        .receipt-channel-actions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 7px; }
        .receipt-channel-toggle {
          min-width: 174px;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 7px;
          padding: 6px 8px;
          border: 1px solid #e3e7ef;
          border-radius: 9px;
          color: #747e92;
          background: #fff;
          font-size: 9px;
          font-weight: 800;
          cursor: pointer;
        }
        .receipt-channel-toggle i { width: 29px; height: 17px; padding: 2px; border-radius: 999px; background: #d9dee8; transition: .18s ease; }
        .receipt-channel-toggle i span { display: block; width: 13px; height: 13px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(30,40,65,.2); transition: .18s ease; }
        .receipt-channel-toggle.is-active { color: #4258db; border-color: #cfd6ff; background: #f5f6ff; }
        .receipt-channel-toggle.is-active i { background: #5d72f6; }
        .receipt-channel-toggle.is-active i span { transform: translateX(12px); }
        .receipt-channel-toggle:disabled { opacity: .58; cursor: not-allowed; }
        .receipt-channel-details-toggle {
          min-height: 31px;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 9px;
          border: 1px solid #e3e7ef;
          border-radius: 9px;
          color: #657087;
          background: #fff;
          font-size: 9px;
          font-weight: 800;
          cursor: pointer;
        }
        .receipt-channel-details-toggle:hover { color: #4258db; border-color: #cfd6ff; background: #f5f6ff; }
        .receipt-channel-period-summary {
          margin-top: 12px;
          min-height: 42px;
          padding: 10px;
          display: flex;
          align-items: center;
          gap: 8px;
          border: 1px solid #e4e8f0;
          border-radius: 9px;
          color: #68738a;
          background: #fff;
          font-size: 9px;
        }
        .receipt-channel-period-summary svg { flex: 0 0 auto; color: #00a1d8; }
        .receipt-channel-period-summary strong { color: #202738; }
        .receipt-channel-period-summary em { margin: 0 6px; color: #b3bac8; font-style: normal; }
        .receipt-channel-grid { margin-top: 12px; display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 8px; }
        .receipt-channel-card { min-width: 0; padding: 11px; border: 1px solid #e7eaf1; border-radius: 9px; background: #fff; }
        .receipt-channel-card.is-featured { border-color: #ccd4ff; background: #f2f4ff; }
        .receipt-channel-card > div { display: flex; justify-content: space-between; align-items: center; gap: 8px; color: #707a8f; }
        .receipt-channel-card > div span { overflow: hidden; font-size: 9px; font-weight: 850; text-overflow: ellipsis; white-space: nowrap; }
        .receipt-channel-card > div i { display: grid; place-items: center; color: #5d72f6; }
        .receipt-channel-card > strong { display: block; margin-top: 7px; color: #202738; font-size: 15px; }
        .receipt-channel-card > small { display: block; margin-top: 5px; overflow: hidden; color: #8a93a5; font-size: 8px; text-overflow: ellipsis; white-space: nowrap; }
        .receipt-channel-card > small b { color: #657087; }
        .receipt-channel-card > small em { margin: 0 3px; font-style: normal; }
        .receipt-channel-empty { margin-top: 12px; min-height: 48px; padding: 10px; display: flex; align-items: center; gap: 8px; border: 1px dashed #dce1ea; border-radius: 9px; color: #7d879a; font-size: 9px; }
        .receipt-channel-empty strong { color: #202738; }
        .receipt-channel-note { margin: 9px 0 0; color: #9b6b18; font-size: 8px; }
        @media (max-width: 900px) {
          .receipt-channel-heading { align-items: flex-start; flex-direction: column; }
          .receipt-channel-actions { width: 100%; justify-content: flex-start; }
          .receipt-channel-toggle { justify-content: flex-start; }
          .receipt-channel-grid { grid-template-columns: 1fr; }
        }
        @media print { .receipt-channel-actions { display: none; } }
      `}</style>
    </section>,
    target,
  );
}
