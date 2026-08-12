"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { filterInvoices } from "@/lib/analytics";
import { compactCurrency, currency } from "@/lib/format";
import {
  ANALYSIS_DATA_EVENT,
  loadAnalysisState,
} from "@/lib/offlineStorage";
import type { ImportState, Invoice, PeriodFilter } from "@/lib/types";

type FilterSnapshot = PeriodFilter & {
  search: string;
  startDate: string;
  endDate: string;
};

type ChartPoint = {
  key: string;
  label: string;
  gross: number;
  net: number;
  grossVariation: number | null;
};

type AxisTickProps = {
  x?: number;
  y?: number;
  index?: number;
  payload?: {
    value?: string;
    index?: number;
  };
};

const MONTHS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

function isInvoiceView() {
  const title = document.querySelector<HTMLElement>(".topbar-title h1")?.textContent?.trim();
  return title === "Emissões";
}

function findInvoicePanel() {
  return Array.from(document.querySelectorAll<HTMLElement>(".panel"))
    .find((panel) => panel.querySelector("h2")?.textContent?.trim() === "Notas emitidas") ?? null;
}

function readFilters(panel: HTMLElement): FilterSnapshot {
  const selects = Array.from(document.querySelectorAll<HTMLSelectElement>(".filter-bar select"));
  const yearValue = selects[0]?.value ?? "all";
  const monthValue = selects[1]?.value ?? "all";

  return {
    year: yearValue === "all" ? "all" : Number(yearValue),
    month: monthValue === "all" ? "all" : Number(monthValue),
    client: selects[2]?.value ?? "",
    search: panel.querySelector<HTMLInputElement>(".search-box input")?.value ?? "",
    startDate: panel.querySelector<HTMLInputElement>('input[name="invoice-start-date"]')?.value ?? "",
    endDate: panel.querySelector<HTMLInputElement>('input[name="invoice-end-date"]')?.value ?? "",
  };
}

function activeInvoices(invoices: Invoice[]) {
  const real = invoices.filter((invoice) => !invoice.id.startsWith("demo-invoice-"));
  return real.length ? real : invoices;
}

function filteredRows(invoices: Invoice[], filters: FilterSnapshot) {
  // filterInvoices já normaliza a FINR020. Evita fazer a mesma etapa duas vezes.
  const periodFiltered = filterInvoices(activeInvoices(invoices), filters);
  const query = filters.search.trim().toLocaleLowerCase("pt-BR");

  return periodFiltered.filter((invoice) => {
    const afterStart = !filters.startDate || invoice.emissionDate >= filters.startDate;
    const beforeEnd = !filters.endDate || invoice.emissionDate <= filters.endDate;
    const matchesSearch = !query || `${invoice.invoiceNumber} ${invoice.clientName} ${invoice.clientCode}`
      .toLocaleLowerCase("pt-BR")
      .includes(query);
    return afterStart && beforeEnd && matchesSearch;
  });
}

function chartPoints(rows: Invoice[], filters: FilterSnapshot): ChartPoint[] {
  const groupByDay = filters.month !== "all" || Boolean(filters.startDate || filters.endDate);
  const grouped = new Map<string, Omit<ChartPoint, "grossVariation">>();

  rows.forEach((invoice) => {
    const date = new Date(`${invoice.emissionDate}T12:00:00`);
    if (Number.isNaN(date.getTime())) return;

    const key = groupByDay
      ? invoice.emissionDate
      : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const label = groupByDay
      ? `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`
      : filters.year === "all"
        ? `${MONTHS[date.getMonth()]}/${String(date.getFullYear()).slice(-2)}`
        : MONTHS[date.getMonth()];

    const current = grouped.get(key) ?? { key, label, gross: 0, net: 0 };
    current.gross += invoice.grossValue;
    current.net += invoice.netValue;
    grouped.set(key, current);
  });

  const sorted = [...grouped.values()].sort((a, b) => a.key.localeCompare(b.key));

  return sorted.map((point, index) => {
    const previous = sorted[index - 1];
    const grossVariation = previous && previous.gross !== 0
      ? (point.gross - previous.gross) / Math.abs(previous.gross)
      : null;

    return { ...point, grossVariation };
  });
}

function formatVariation(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  const percentage = Math.abs(value * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  if (value > 0) return `▲ ${percentage}%`;
  if (value < 0) return `▼ ${percentage}%`;
  return "● 0,0%";
}

function InvoiceXAxisTick({
  x = 0,
  y = 0,
  index,
  payload,
  points,
  showVariation,
}: AxisTickProps & {
  points: ChartPoint[];
  showVariation: boolean;
}) {
  const pointIndex = index ?? payload?.index ?? -1;
  const point = points[pointIndex];
  const variation = point?.grossVariation ?? null;
  const variationColor = variation === null
    ? "#a1a8b7"
    : variation > 0
      ? "#149b7e"
      : variation < 0
        ? "#d65469"
        : "#788198";

  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={12} textAnchor="middle" fill="#788198" fontSize={11}>
        {payload?.value}
      </text>
      {showVariation && (
        <text x={0} y={0} dy={29} textAnchor="middle" fill={variationColor} fontSize={10} fontWeight={800}>
          {formatVariation(variation)}
        </text>
      )}
    </g>
  );
}

function InvoiceChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; payload?: ChartPoint }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const variation = payload[0]?.payload?.grossVariation ?? null;

  return (
    <div className="invoice-chart-tooltip">
      <strong>{label}</strong>
      {payload.map((item) => (
        <span key={item.name}>{item.name}: <b>{currency.format(Number(item.value ?? 0))}</b></span>
      ))}
      <span>Variação do bruto: <b className={variation !== null && variation < 0 ? "negative" : "positive"}>{formatVariation(variation)}</b></span>
    </div>
  );
}

export default function InvoiceAnalyticsEnhancer() {
  const [data, setData] = useState<ImportState>({ invoices: [], receipts: [] });
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const [chartTarget, setChartTarget] = useState<HTMLElement | null>(null);
  const [summaryTarget, setSummaryTarget] = useState<HTMLElement | null>(null);
  const [filters, setFilters] = useState<FilterSnapshot>({
    year: "all",
    month: "all",
    client: "",
    search: "",
    startDate: "",
    endDate: "",
  });

  useEffect(() => {
    let active = true;
    void loadAnalysisState().then((stored) => {
      if (active && stored) setData(stored);
    });

    const handleData = (event: Event) => {
      const next = (event as CustomEvent<ImportState>).detail;
      if (next?.invoices) setData(next);
    };

    window.addEventListener(ANALYSIS_DATA_EVENT, handleData);
    return () => {
      active = false;
      window.removeEventListener(ANALYSIS_DATA_EVENT, handleData);
    };
  }, []);

  useEffect(() => {
    let lastSignature = "";
    let frame: number | null = null;
    let retryTimer: number | null = null;

    const sync = () => {
      frame = null;
      if (!isInvoiceView()) {
        setPanel(null);
        setChartTarget(null);
        setSummaryTarget(null);
        return;
      }

      const nextPanel = findInvoicePanel();
      if (!nextPanel) return;
      const toolbar = nextPanel.querySelector<HTMLElement>(".table-toolbar");
      if (!toolbar) return;

      let nextChartTarget = nextPanel.querySelector<HTMLElement>("[data-invoice-chart-slot]");
      if (!nextChartTarget) {
        nextChartTarget = document.createElement("div");
        nextChartTarget.dataset.invoiceChartSlot = "true";
      }
      if (nextChartTarget.nextSibling !== toolbar) {
        toolbar.parentElement?.insertBefore(nextChartTarget, toolbar);
      }

      let nextSummaryTarget = toolbar.querySelector<HTMLElement>("[data-invoice-summary-slot]");
      if (!nextSummaryTarget) {
        nextSummaryTarget = document.createElement("div");
        nextSummaryTarget.dataset.invoiceSummarySlot = "true";
        toolbar.appendChild(nextSummaryTarget);
      }

      Array.from(toolbar.children).forEach((child) => {
        if (!(child instanceof HTMLElement)) return;
        if (child === nextSummaryTarget || child.classList.contains("search-box")) return;
        if (child.textContent?.includes("Total bruto:") || child.textContent?.includes("Total líquido:")) {
          child.dataset.nativeInvoiceTotals = "true";
          child.style.display = "none";
        }
      });

      const nextFilters = readFilters(nextPanel);
      const signature = JSON.stringify(nextFilters);
      if (signature !== lastSignature) {
        lastSignature = signature;
        setFilters(nextFilters);
      }

      setPanel((current) => current === nextPanel ? current : nextPanel);
      setChartTarget((current) => current === nextChartTarget ? current : nextChartTarget);
      setSummaryTarget((current) => current === nextSummaryTarget ? current : nextSummaryTarget);
    };

    const scheduleSync = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(sync);
    };

    sync();
    scheduleSync();
    retryTimer = window.setTimeout(scheduleSync, 80);
    document.addEventListener("input", scheduleSync, true);
    document.addEventListener("change", scheduleSync, true);
    document.addEventListener("click", scheduleSync, true);
    window.addEventListener(ANALYSIS_DATA_EVENT, scheduleSync);

    return () => {
      document.removeEventListener("input", scheduleSync, true);
      document.removeEventListener("change", scheduleSync, true);
      document.removeEventListener("click", scheduleSync, true);
      window.removeEventListener(ANALYSIS_DATA_EVENT, scheduleSync);
      if (frame !== null) window.cancelAnimationFrame(frame);
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, []);

  const rows = useMemo(() => filteredRows(data.invoices, filters), [data.invoices, filters]);
  const points = useMemo(() => chartPoints(rows, filters), [rows, filters]);
  const gross = useMemo(() => rows.reduce((sum, item) => sum + item.grossValue, 0), [rows]);
  const net = useMemo(() => rows.reduce((sum, item) => sum + item.netValue, 0), [rows]);
  const ticket = rows.length ? gross / rows.length : 0;
  const showMonthlyVariation = filters.month === "all" && !filters.startDate && !filters.endDate;

  useEffect(() => {
    if (!panel) return;
    const subtitle = panel.querySelector<HTMLElement>(".panel-header p");
    if (subtitle) subtitle.textContent = `${rows.length.toLocaleString("pt-BR")} registros após os filtros`;
  }, [panel, rows.length]);

  if (!panel || !chartTarget || !summaryTarget) return null;

  return (
    <>
      {createPortal(
        <section className="invoice-emission-chart" aria-label="Gráfico das emissões da FINR020">
          <div className="invoice-chart-heading">
            <div>
              <strong>Evolução das emissões</strong>
              <span>{showMonthlyVariation
                ? "Valores bruto e líquido por mês • variação do bruto em relação ao período anterior"
                : "Valores bruto e líquido por dia"}</span>
            </div>
            <small>Fonte: FINR020 — relatório 1</small>
          </div>
          {points.length ? (
            <div className="invoice-chart-box">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={points} margin={{ top: 10, right: 8, left: 8, bottom: showMonthlyVariation ? 18 : 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8ebf2" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={18}
                    height={showMonthlyVariation ? 46 : 28}
                    tick={<InvoiceXAxisTick points={points} showVariation={showMonthlyVariation} />}
                  />
                  <YAxis
                    tickFormatter={(value) => compactCurrency.format(Number(value))}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#9aa2b3", fontSize: 10 }}
                    width={72}
                  />
                  <Tooltip content={<InvoiceChartTooltip />} cursor={{ fill: "rgba(93, 114, 246, 0.06)" }} />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: 10, fontSize: 11 }} />
                  <Bar name="Valor bruto" dataKey="gross" fill="#5d72f6" radius={[5, 5, 0, 0]} maxBarSize={28} />
                  <Bar name="Valor líquido" dataKey="net" fill="#22c7a9" radius={[5, 5, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="invoice-chart-empty">Sem emissões para os filtros selecionados.</div>
          )}
        </section>,
        chartTarget,
      )}

      {createPortal(
        <div className="invoice-summary-values">
          <span>Ticket médio: <strong>{currency.format(ticket)}</strong></span>
          <span>Total bruto: <strong>{currency.format(gross)}</strong></span>
          <span>Total líquido: <strong>{currency.format(net)}</strong></span>
        </div>,
        summaryTarget,
      )}

      <style jsx global>{`
        [data-invoice-chart-slot] { margin-bottom: 14px; }
        .invoice-emission-chart {
          padding: 14px 14px 8px;
          border: 1px solid #e6e9f1;
          border-radius: 11px;
          background: #fff;
        }
        .invoice-chart-heading {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          margin-bottom: 8px;
        }
        .invoice-chart-heading > div { display: grid; gap: 3px; }
        .invoice-chart-heading strong { color: #1f2738; font-size: 13px; }
        .invoice-chart-heading span { color: #7e879b; font-size: 10px; }
        .invoice-chart-heading small {
          padding: 5px 8px;
          border-radius: 999px;
          color: #5d72f6;
          background: #f1f3ff;
          font-size: 9px;
          font-weight: 800;
          white-space: nowrap;
        }
        .invoice-chart-box { width: 100%; height: 282px; }
        .invoice-chart-empty {
          min-height: 110px;
          display: grid;
          place-items: center;
          color: #9199aa;
          font-size: 11px;
        }
        .invoice-chart-tooltip {
          min-width: 170px;
          padding: 9px 10px;
          display: grid;
          gap: 5px;
          border: 1px solid #e1e5ed;
          border-radius: 8px;
          background: #fff;
          box-shadow: 0 10px 24px rgba(28, 37, 61, .14);
          font-size: 10px;
        }
        .invoice-chart-tooltip strong { color: #303849; }
        .invoice-chart-tooltip span { color: #727c91; }
        .invoice-chart-tooltip b { color: #303849; }
        .invoice-chart-tooltip b.positive { color: #149b7e; }
        .invoice-chart-tooltip b.negative { color: #d65469; }
        [data-invoice-summary-slot] { margin-left: auto; }
        .invoice-summary-values {
          display: grid;
          grid-template-columns: repeat(3, minmax(150px, auto));
          align-items: center;
          gap: 18px;
        }
        .invoice-summary-values span {
          color: #20283a;
          font-size: 12px;
          text-align: right;
          white-space: nowrap;
        }
        .invoice-summary-values strong { font-size: 14px; }
        @media (max-width: 980px) {
          .invoice-summary-values {
            grid-template-columns: 1fr;
            gap: 4px;
          }
          .invoice-summary-values span { text-align: left; }
          [data-invoice-summary-slot] { width: 100%; margin-left: 0; }
          .invoice-chart-heading { flex-direction: column; }
        }
        @media print {
          .invoice-emission-chart { break-inside: avoid; }
        }
      `}</style>
    </>
  );
}
