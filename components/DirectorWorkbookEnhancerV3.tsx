"use client";

import { useEffect, useState } from "react";
import {
  createCompatibleInvoiceFile,
  parseDirectorWorkbook,
  replayFile,
  type DirectorSnapshot,
  type MarkedFile,
} from "@/lib/directorWorkbook";

const DIRECTOR_STORAGE_KEY = "financial-analytics-director-workbook-v1";
const MAIN_STORAGE_KEY = "financial-analytics-data-v1";

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
  setText(receiptCard.querySelector("p"), "Aceita a conciliação normal ou a planilha diária. A aba PREVISÃO não será exibida no dashboard.");

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

export default function DirectorWorkbookEnhancerV3() {
  const [snapshot, setSnapshot] = useState<DirectorSnapshot | null>(null);

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
          forecasts: [],
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
      document.querySelector(".director-forecast-mount")?.remove();
      document.querySelector(".director-forecast-kpi")?.remove();
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
    <style jsx global>{`
      .director-source-hidden { display: none !important; }
      .director-file-pill { margin-top: 10px; }
      .director-forecast-kpi,
      .director-forecast-mount { display: none !important; }
    `}</style>
  );
}
