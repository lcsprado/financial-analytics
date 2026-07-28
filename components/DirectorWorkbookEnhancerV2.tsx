"use client";

import { CalendarClock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  createCompatibleInvoiceFile,
  parseDirectorWorkbook,
  replayFile,
  type DirectorSnapshot,
  type MarkedFile,
} from "@/lib/directorWorkbook";

const DIRECTOR_STORAGE_KEY = "financial-analytics-director-workbook-v1";
const MAIN_STORAGE_KEY = "financial-analytics-data-v1";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const integer = new Intl.NumberFormat("pt-BR");

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
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

function setText(element: HTMLElement | null, value: string) {
  if (element && element.textContent !== value) element.textContent = value;
}

function findCards() {
  const cards = Array.from(document.querySelectorAll<HTMLElement>(".upload-card"));
  const invoiceCard = cards.find((card) => normalize(card.querySelector("h3")?.textContent).includes("FINR020")) ?? null;
  const receiptCard = cards.find((card) => {
    const title = normalize(card.querySelector("h3")?.textContent);
    return title.includes("CONCILIACAO") || title.includes("RECEBIMENTOS");
  }) ?? null;
  return {
    invoiceCard,
    receiptCard,
    invoiceInput: invoiceCard?.querySelector<HTMLInputElement>('input[type="file"]') ?? null,
    receiptInput: receiptCard?.querySelector<HTMLInputElement>('input[type="file"]') ?? null,
  };
}

function syncImportCards(snapshot: DirectorSnapshot | null) {
  const { invoiceCard, receiptCard } = findCards();

  if (invoiceCard) {
    setText(invoiceCard.querySelector("h3"), "1. FINR020 — Emissões");
    setText(invoiceCard.querySelector("p"), "Colunas esperadas: Data da Emissão, NF Eletr, Valor, Líquido e Nome Cliente.");
    invoiceCard.querySelectorAll<HTMLElement>(".file-pill:not(.director-file-pill)").forEach((pill) => {
      pill.classList.toggle("director-source-hidden", Boolean(snapshot?.fileName && pill.textContent?.includes(snapshot.fileName)));
    });
  }

  if (!receiptCard) return;
  setText(receiptCard.querySelector("h3"), "2. Conciliação — Recebimentos ou Contas a Receber");
  setText(receiptCard.querySelector("p"), "Aceita a conciliação com recebimentos ou a planilha diária com as abas CONTAS A RECEBER e PREVISÃO.");

  let pill = receiptCard.querySelector<HTMLElement>(".director-file-pill");
  if (!snapshot) {
    pill?.remove();
    return;
  }
  if (!pill) {
    pill = document.createElement("span");
    pill.className = "file-pill director-file-pill";
    receiptCard.querySelector("h3")?.parentElement?.appendChild(pill);
  }
  setText(pill, `✓ ${snapshot.fileName}`);
}

function syncDirectorLabels(active: boolean) {
  document.querySelectorAll<HTMLElement>(".kpi-card").forEach((card) => {
    const title = card.querySelector<HTMLElement>(".kpi-title");
    const detail = card.querySelector<HTMLElement>(".kpi-detail");
    if (!title) return;
    const original = title.dataset.originalTitle ?? title.textContent ?? "";
    if (normalize(original) !== "RECEITA EMITIDA" && title.dataset.directorLabel !== "true") return;

    if (active) {
      title.dataset.originalTitle = "Receita emitida";
      title.dataset.directorLabel = "true";
      setText(title, "Contas a receber");
      if (detail && /notas?/i.test(detail.textContent ?? "")) {
        detail.textContent = (detail.textContent ?? "").replace(/notas?/i, "títulos em aberto");
      }
    } else if (title.dataset.directorLabel === "true") {
      setText(title, title.dataset.originalTitle ?? "Receita emitida");
      delete title.dataset.directorLabel;
    }
  });
}

function formatDate(value: string | null) {
  if (!value) return "A definir";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "A definir" : date.toLocaleDateString("pt-BR");
}

function ForecastKpi({ snapshot }: { snapshot: DirectorSnapshot }) {
  const total = snapshot.forecasts.reduce((sum, item) => sum + item.amount, 0);
  return (
    <article className="kpi-card director-forecast-kpi">
      <div className="kpi-topline">
        <span className="kpi-title">Previsão de recebimento</span>
        <span className="kpi-icon"><CalendarClock size={20} /></span>
      </div>
      <strong>{currency.format(total)}</strong>
      <span className="kpi-detail">{integer.format(snapshot.forecasts.length)} previsões cadastradas</span>
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
        <div><h2>Previsão de recebimento</h2><p>Dados da aba PREVISÃO</p></div>
        <strong className="director-forecast-total">{currency.format(rows.reduce((sum, item) => sum + item.amount, 0))}</strong>
      </div>
      <div className="director-forecast-table-wrap">
        <table>
          <thead><tr><th>Data</th><th>Cliente</th><th>Notas</th><th>Status</th><th className="number">Valor previsto</th></tr></thead>
          <tbody>{rows.map((row) => (
            <tr key={row.id}>
              <td>{formatDate(row.forecastDate)}</td>
              <td className="client-cell">{row.clientName}</td>
              <td>{row.notes || "—"}</td>
              <td>{row.status || "Previsão"}</td>
              <td className="number"><strong>{currency.format(row.amount)}</strong></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}

export default function DirectorWorkbookEnhancerV2() {
  const [snapshot, setSnapshot] = useState<DirectorSnapshot | null>(null);
  const [kpiTarget, setKpiTarget] = useState<HTMLElement | null>(null);
  const [panelTarget, setPanelTarget] = useState<HTMLElement | null>(null);

  useEffect(() => setSnapshot(readSnapshot()), []);

  useEffect(() => {
    const attachedInputs = new WeakSet<HTMLInputElement>();
    const attachedCards = new WeakSet<HTMLElement>();

    const processSecondField = async (receiptInput: HTMLInputElement, file: File) => {
      const marked = file as MarkedFile;
      if (marked.__financialDashboardReplay) return;
      try {
        const parsed = await parseDirectorWorkbook(file);
        if (!parsed) {
          saveSnapshot(null);
          setSnapshot(null);
          marked.__financialDashboardReplay = true;
          replayFile(receiptInput, marked);
          return;
        }

        const { invoiceInput } = findCards();
        if (!invoiceInput) throw new Error("Campo FINR020 não localizado");
        const next: DirectorSnapshot = {
          fileName: file.name,
          invoiceCount: parsed.invoices.length,
          importedAt: new Date().toISOString(),
          forecasts: parsed.forecasts,
        };
        saveSnapshot(next);
        setSnapshot(next);
        replayFile(invoiceInput, createCompatibleInvoiceFile(file, parsed));
        receiptInput.value = "";
      } catch {
        saveSnapshot(null);
        setSnapshot(null);
        marked.__financialDashboardReplay = true;
        replayFile(receiptInput, marked);
      }
    };

    const attach = () => {
      const { invoiceInput, receiptInput, receiptCard } = findCards();
      if (invoiceInput && !attachedInputs.has(invoiceInput)) {
        attachedInputs.add(invoiceInput);
        invoiceInput.addEventListener("change", (event) => {
          const file = (event.currentTarget as HTMLInputElement).files?.[0] as MarkedFile | undefined;
          if (!file || file.__financialDashboardReplay) return;
          saveSnapshot(null);
          setSnapshot(null);
        }, true);
      }
      if (receiptInput && !attachedInputs.has(receiptInput)) {
        attachedInputs.add(receiptInput);
        receiptInput.addEventListener("change", (event) => {
          const input = event.currentTarget as HTMLInputElement;
          const file = input.files?.[0] as MarkedFile | undefined;
          if (!file || file.__financialDashboardReplay) return;
          event.stopImmediatePropagation();
          event.stopPropagation();
          void processSecondField(input, file);
        }, true);
      }
      if (receiptCard && receiptInput && !attachedCards.has(receiptCard)) {
        attachedCards.add(receiptCard);
        receiptCard.addEventListener("drop", (event) => {
          const file = event.dataTransfer?.files?.[0];
          if (!file) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          event.stopPropagation();
          void processSecondField(receiptInput, file);
        }, true);
      }
    };

    const clear = (event: MouseEvent) => {
      if (!(event.target as HTMLElement | null)?.closest('button[title="Limpar dados"]')) return;
      saveSnapshot(null);
      setSnapshot(null);
      window.localStorage.removeItem(MAIN_STORAGE_KEY);
    };

    attach();
    document.addEventListener("click", clear, true);
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      document.removeEventListener("click", clear, true);
    };
  }, []);

  useEffect(() => {
    const sync = () => {
      syncImportCards(snapshot);
      syncDirectorLabels(Boolean(snapshot));
      const grid = document.querySelector<HTMLElement>(".kpi-grid");
      grid?.classList.toggle("kpi-grid-with-director-forecast", Boolean(snapshot?.forecasts.length));
      setKpiTarget((current) => current === grid ? current : grid);

      const currentMount = document.querySelector<HTMLElement>(".director-forecast-mount");
      if (!snapshot?.forecasts.length) {
        currentMount?.remove();
        setPanelTarget(null);
        return;
      }
      const chartGrid = document.querySelector<HTMLElement>(".chart-grid");
      if (!chartGrid) return;
      let mount = currentMount;
      if (!mount) {
        mount = document.createElement("div");
        mount.className = "director-forecast-mount";
        chartGrid.insertAdjacentElement("afterend", mount);
      }
      setPanelTarget((current) => current === mount ? current : mount);
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(sync, 800);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, [snapshot]);

  return (
    <>
      <style jsx global>{`
        .director-source-hidden { display: none !important; }
        .director-file-pill { margin-top: 10px; }
        @media (min-width: 1001px) { .kpi-grid.kpi-grid-with-director-forecast { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; } }
        .director-forecast-kpi .kpi-icon { color: #a65b00; background: #fff4df; }
        .director-forecast-kpi::after { background: #fff5e5; }
        .director-forecast-mount { margin-top: 16px; }
        .director-forecast-total { color: #263043; font-size: 17px; }
        .director-forecast-table-wrap { max-height: 390px; overflow: auto; border: 1px solid #edf0f5; border-radius: 10px; }
        .director-forecast-table-wrap table { min-width: 850px; }
        .director-forecast-table-wrap thead { position: sticky; top: 0; z-index: 1; }
        @media print { .director-forecast-table-wrap { max-height: none; overflow: visible; } }
      `}</style>
      {snapshot?.forecasts.length && kpiTarget ? createPortal(<ForecastKpi snapshot={snapshot} />, kpiTarget) : null}
      {snapshot?.forecasts.length && panelTarget ? createPortal(<ForecastPanel snapshot={snapshot} />, panelTarget) : null}
    </>
  );
}
