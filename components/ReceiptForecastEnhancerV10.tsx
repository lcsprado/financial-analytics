"use client";

import { useEffect } from "react";
import ReceiptForecastEnhancerV9 from "@/components/ReceiptForecastEnhancerV9";

type CardScope = "all" | "forecast" | "received" | "open" | "history";

const CARD_SCOPES: CardScope[] = ["forecast", "received", "open", "history"];

function rowIsReceived(row: HTMLTableRowElement) {
  return row.querySelector<HTMLElement>("td.client span")?.textContent?.includes("Recebido") ?? false;
}

function rowOrigin(row: HTMLTableRowElement) {
  return row.querySelector<HTMLElement>(".origin")?.textContent?.trim() ?? "";
}

function rowHasOpenNote(row: HTMLTableRowElement) {
  const noteText = row.querySelector<HTMLElement>("td:nth-child(4)")?.textContent?.trim() ?? "";
  return Boolean(noteText && !noteText.includes("Nota ainda não localizada"));
}

function rowMatchesScope(row: HTMLTableRowElement, scope: CardScope) {
  const received = rowIsReceived(row);
  if (scope === "all") return true;
  if (scope === "received") return received;
  if (scope === "forecast") return !received;
  if (scope === "open") return !received && rowHasOpenNote(row);
  return !received && rowOrigin(row) === "Somente histórico";
}

function setOriginFilter(page: HTMLElement, value: string) {
  const labels = [...page.querySelectorAll<HTMLLabelElement>(".forecast-filters-v9 label")];
  const originLabel = labels.find((label) => label.querySelector(":scope > span")?.textContent?.trim() === "Origem");
  const select = originLabel?.querySelector<HTMLSelectElement>("select");
  if (!select || select.value === value) return;
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function applyCardScope(page: HTMLElement, scope: CardScope) {
  const cards = [...page.querySelectorAll<HTMLElement>(".forecast-kpis-v9 article")];
  cards.forEach((card, index) => {
    const cardScope = CARD_SCOPES[index];
    card.dataset.cardScope = cardScope ?? "";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-pressed", String(scope === cardScope));
    card.classList.toggle("forecast-card-active-v10", scope === cardScope);
  });

  const rows = [...page.querySelectorAll<HTMLTableRowElement>(".forecast-table-v9 tbody tr")]
    .filter((row) => !row.querySelector(".empty-row") && !row.classList.contains("forecast-card-empty-v10"));
  const visibleRows = rows.filter((row) => rowMatchesScope(row, scope));

  rows.forEach((row) => {
    const display = rowMatchesScope(row, scope) ? "" : "none";
    if (row.style.display !== display) row.style.display = display;
  });

  const tbody = page.querySelector<HTMLTableSectionElement>(".forecast-table-v9 tbody");
  const oldEmpty = tbody?.querySelector<HTMLTableRowElement>(".forecast-card-empty-v10");
  if (visibleRows.length || scope === "all") oldEmpty?.remove();
  else if (tbody && !oldEmpty) {
    const empty = document.createElement("tr");
    empty.className = "forecast-card-empty-v10";
    const cell = document.createElement("td");
    cell.colSpan = 11;
    cell.className = "empty-row";
    cell.textContent = "Nenhum cliente encontrado para o card e os filtros selecionados.";
    empty.append(cell);
    tbody.append(empty);
  }

  const forecastCount = visibleRows.filter((row) => !rowIsReceived(row)).length;
  const receivedCount = visibleRows.filter(rowIsReceived).length;
  const subtitle = page.querySelector<HTMLElement>(
    ".forecast-panel-v9:has(.forecast-table-v9) .forecast-panel-head-v9 p",
  );
  if (subtitle) {
    const label = scope === "forecast"
      ? `${forecastCount} previsões pendentes no filtro atual`
      : scope === "received"
        ? `${receivedCount} recebimentos realizados no filtro atual`
        : scope === "open"
          ? `${forecastCount} previsões vinculadas a notas em aberto`
          : scope === "history"
            ? `${forecastCount} previsões baseadas somente no histórico`
            : `${forecastCount} previsões pendentes e ${receivedCount} recebimentos no filtro atual`;
    if (subtitle.textContent !== label) subtitle.textContent = label;
  }
}

export default function ReceiptForecastEnhancerV10() {
  useEffect(() => {
    let activeScope: CardScope = "all";
    let animationFrame = 0;

    const schedule = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const page = document.querySelector<HTMLElement>(".receipt-forecast-page-v9");
        if (page) applyCardScope(page, activeScope);
      });
    };

    const activateCard = (card: HTMLElement) => {
      const page = card.closest<HTMLElement>(".receipt-forecast-page-v9");
      if (!page) return;
      const cards = [...page.querySelectorAll<HTMLElement>(".forecast-kpis-v9 article")];
      const index = cards.indexOf(card);
      const requestedScope = CARD_SCOPES[index];
      if (!requestedScope) return;

      activeScope = activeScope === requestedScope ? "all" : requestedScope;
      if (activeScope === "received") setOriginFilter(page, "Recebimento realizado");
      else if (activeScope === "history") setOriginFilter(page, "Somente histórico");
      else setOriginFilter(page, "Todas");

      schedule();
      window.setTimeout(() => {
        page.querySelector<HTMLElement>(".forecast-table-v9")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 30);
    };

    const handleClick = (event: MouseEvent) => {
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>(".forecast-kpis-v9 article")
        : null;
      if (target) activateCard(target);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>(".forecast-kpis-v9 article")
        : null;
      if (!target) return;
      event.preventDefault();
      activateCard(target);
    };

    document.addEventListener("click", handleClick, true);
    document.addEventListener("keydown", handleKeyDown, true);
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    schedule();

    return () => {
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      observer.disconnect();
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return (
    <>
      <ReceiptForecastEnhancerV9 />
      <style jsx global>{`
        .forecast-kpis-v9 article {
          cursor: pointer;
          transition: border-color 150ms ease, box-shadow 150ms ease, transform 150ms ease;
        }
        .forecast-kpis-v9 article:hover,
        .forecast-kpis-v9 article:focus-visible {
          border-color: #aeb9ff;
          box-shadow: 0 12px 30px rgba(71, 88, 190, .12);
          outline: none;
          transform: translateY(-1px);
        }
        .forecast-kpis-v9 article.forecast-card-active-v10 {
          border-color: #5d72f6;
          box-shadow: 0 0 0 2px rgba(93, 114, 246, .13), 0 12px 30px rgba(71, 88, 190, .12);
          background: #f7f8ff;
        }
      `}</style>
    </>
  );
}
