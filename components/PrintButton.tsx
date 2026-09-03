"use client";

import { Printer } from "lucide-react";
import { createPortal, flushSync } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import PrintReportHeader, { type PrintReportMeta } from "@/components/PrintReportHeader";

type ReportKey = "overview" | "invoices" | "receipts" | "clients" | "forecast" | "import";

const DEFAULT_META: PrintReportMeta = {
  title: "Relatório financeiro",
  filters: "Todos os dados disponíveis",
  generatedAt: "",
  source: "Bases locais importadas",
  scope: "",
  truncated: false,
};

function reportSource(key: ReportKey) {
  if (key === "invoices") return "FINR020 importada neste navegador";
  if (key === "receipts" || key === "forecast") return "Conciliação/Contas a Receber importada neste navegador";
  return "FINR020 e Conciliação importadas neste navegador";
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function reportKeyFromTitle(title: string, forecastActive: boolean): ReportKey {
  if (forecastActive) return "forecast";
  const normalized = normalize(title);
  if (normalized.includes("emisso")) return "invoices";
  if (normalized.includes("recebimento")) return "receipts";
  if (normalized.includes("cliente")) return "clients";
  if (normalized.includes("import")) return "import";
  return "overview";
}

function parseBrazilianDate(value: string) {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 12);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatBrazilianDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function forecastPeriodLabel(weekLabel: string) {
  const values = [...weekLabel.matchAll(/(\d{2}\/\d{2}\/\d{4})/g)].map((match) => match[1]);
  if (values.length < 2) return "";
  const start = parseBrazilianDate(values[0]);
  const end = parseBrazilianDate(values[1]);
  if (!start || !end) return `${values[0]} a ${values[1]}`;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const effectiveStart = today >= start && today <= end ? today : start;
  const startText = formatBrazilianDate(effectiveStart);
  const endText = formatBrazilianDate(end);
  return startText === endText ? startText : `${startText} a ${endText}`;
}

function standardFilters() {
  const globalFilters = Array.from(document.querySelectorAll(".filter-bar label"))
    .map((label) => {
      const name = label.querySelector(":scope > span")?.textContent?.trim();
      const select = label.querySelector("select") as HTMLSelectElement | null;
      const value = select?.selectedOptions[0]?.textContent?.trim();
      return name && value ? `${name}: ${value}` : null;
    })
    .filter(Boolean);
  const dateFilter = document.querySelector<HTMLElement>("[data-invoice-date-filter], [data-receipt-date-filter]");
  const [start, end] = Array.from(dateFilter?.querySelectorAll<HTMLInputElement>('input[type="date"]') ?? [])
    .map((input) => input.value);
  const period = start || end
    ? `Período: ${start ? formatBrazilianDate(new Date(`${start}T12:00:00`)) : "início"} a ${end ? formatBrazilianDate(new Date(`${end}T12:00:00`)) : "fim"}`
    : null;

  return [...globalFilters, period].filter(Boolean).join(" • ");
}

function forecastFilters() {
  const selects = document.querySelectorAll<HTMLSelectElement>(".forecast-filter-v13 select");
  const client = selects[0]?.selectedOptions[0]?.textContent?.trim() || "Todos os clientes";
  const month = selects[1]?.selectedOptions[0]?.textContent?.trim() || "";
  const selectedWeek = selects[2]?.selectedOptions[0]?.textContent?.trim() || "";
  const currentWeek = document.querySelector<HTMLElement>(".forecast-weeks-v13 button.week-current-v15 > span")?.textContent?.trim() || "";
  const confidence = selects[3]?.selectedOptions[0]?.textContent?.trim() || "Todas";
  const period = forecastPeriodLabel(selectedWeek.includes("/") ? selectedWeek : currentWeek);
  const onlyPending = document.body.classList.contains("forecast-only-pending-v16");

  return [
    period ? `Período previsto: ${period}` : null,
    month ? `Mês: ${month}` : null,
    `Cliente: ${client}`,
    `Confiança: ${confidence}`,
    `Visão: ${onlyPending ? "Somente a receber" : "Previsão semanal"}`,
  ].filter(Boolean).join(" • ");
}

function generatedAtLabel(date: Date) {
  const day = new Intl.DateTimeFormat("pt-BR").format(date);
  const time = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return `Gerado em ${day} às ${time}`;
}

export default function PrintButton() {
  const [meta, setMeta] = useState<PrintReportMeta>(DEFAULT_META);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const previousTitleRef = useRef<string | null>(null);

  useEffect(() => {
    setPortalTarget(document.querySelector<HTMLElement>(".topbar-actions"));
  }, []);

  const prepareReport = useCallback(() => {
    const forecastActive = document.body.classList.contains("receipt-forecast-active-v13");
    const currentTitle = forecastActive
      ? "Previsão de Recebimentos"
      : document.querySelector(".topbar-title h1")?.textContent?.trim() || "Painel financeiro";
    const reportKey = reportKeyFromTitle(currentTitle, forecastActive);
    const filters = forecastActive ? forecastFilters() : standardFilters();
    const pagination = document.querySelector<HTMLElement>(".panel:not([hidden]) .table-pagination");
    const scope = pagination?.dataset.printScope ?? "";
    const scopeValues = scope.match(/(\d+)\s+de\s+(\d+)/i);
    const truncated = Boolean(scopeValues && Number(scopeValues[1]) < Number(scopeValues[2]));

    flushSync(() => {
      setMeta({
        title: currentTitle,
        filters: filters || "Todos os dados disponíveis",
        generatedAt: generatedAtLabel(new Date()),
        source: reportSource(reportKey),
        scope: scope ? `${scope} registros` : "todos os dados dos filtros aplicados",
        truncated,
      });
    });

    if (previousTitleRef.current === null) previousTitleRef.current = document.title;
    document.title = `Financial Analytics - ${currentTitle}`;
    document.body.dataset.printReport = reportKey;
    document.body.classList.add("print-report-active");
  }, []);

  const restoreReport = useCallback(() => {
    if (previousTitleRef.current !== null) {
      document.title = previousTitleRef.current;
      previousTitleRef.current = null;
    }
    document.body.classList.remove("print-report-active");
    delete document.body.dataset.printReport;
  }, []);

  useEffect(() => {
    window.addEventListener("beforeprint", prepareReport);
    window.addEventListener("afterprint", restoreReport);
    return () => {
      window.removeEventListener("beforeprint", prepareReport);
      window.removeEventListener("afterprint", restoreReport);
      restoreReport();
    };
  }, [prepareReport, restoreReport]);

  function handlePrint() {
    prepareReport();

    window.print();
  }

  const printButton = (
    <button
      type="button"
      className="print-button-floating ghost-button compact"
      onClick={handlePrint}
      aria-label="Imprimir aba atual"
      title="Imprimir aba atual"
    >
      <Printer size={17} />
      <span>Imprimir</span>
    </button>
  );

  return (
    <>
      <PrintReportHeader meta={meta} />
      {portalTarget ? createPortal(printButton, portalTarget) : null}
      <style jsx global>{`
        .print-report-header { display: none; }
        .topbar-actions .print-button-floating {
          position: static;
          flex: 0 0 auto;
          z-index: auto;
          background: #ffffff;
          box-shadow: none;
        }
        @media (max-width: 980px) {
          .topbar-actions .print-button-floating span { display: none; }
        }
      `}</style>
    </>
  );
}
