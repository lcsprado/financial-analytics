"use client";

import { useEffect } from "react";
import ReceiptForecastEnhancerV7 from "@/components/ReceiptForecastEnhancerV7";

function setText(element: Element | null | undefined, value: string) {
  if (element && element.textContent !== value) element.textContent = value;
}

function clientName(row: HTMLTableRowElement) {
  return row.querySelector<HTMLElement>("td.client strong")?.textContent?.trim() ?? "";
}

function rowRange(row: HTMLTableRowElement) {
  return row.querySelector<HTMLElement>("td:nth-child(2) strong")?.textContent?.trim() ?? "";
}

function uniqueClients(rows: HTMLTableRowElement[]) {
  return new Set(rows.map(clientName).filter(Boolean));
}

function clarifyForecastPanel() {
  const page = document.querySelector<HTMLElement>(".receipt-forecast-page-v7");
  if (!page) return;

  const rows = [...page.querySelectorAll<HTMLTableRowElement>(".forecast-table-v7 tbody tr")]
    .filter((row) => !row.querySelector(".empty-row"));
  const forecastRows = rows.filter((row) => row.querySelector(".status.forecast"));
  const receivedRows = rows.filter((row) => row.querySelector(".status.received"));
  const highConfidenceRows = forecastRows.filter((row) =>
    row.querySelector<HTMLElement>(".confidence")?.textContent?.trim() === "Alta",
  );

  const forecastClients = uniqueClients(forecastRows);
  const receivedClients = uniqueClients(receivedRows);
  const highConfidenceClients = uniqueClients(highConfidenceRows);

  const cards = [...page.querySelectorAll<HTMLElement>(".forecast-kpis-v7 article")];
  if (cards.length >= 4) {
    setText(cards[0].querySelector(":scope > span"), "Previsão a receber");
    setText(
      cards[0].querySelector(":scope > small"),
      `${forecastClients.size} clientes previstos · soma das medianas semanais`,
    );

    setText(
      cards[1].querySelector(":scope > small"),
      `${receivedClients.size} clientes recebidos · somente valores reais lançados`,
    );

    setText(
      cards[2].querySelector(":scope > small"),
      `${highConfidenceClients.size} clientes pendentes de alta confiança`,
    );

    setText(cards[3].querySelector(":scope > span"), "Clientes previstos");
    setText(cards[3].querySelector(":scope > strong"), String(forecastClients.size));
    setText(cards[3].querySelector(":scope > small"), "Somente clientes ainda previstos no período");
  }

  const clientSelect = page.querySelector<HTMLSelectElement>(".forecast-filter-v7 label select");
  const allClientsOption = clientSelect?.querySelector<HTMLOptionElement>('option[value="all"]');
  if (allClientsOption) {
    setText(
      allClientsOption,
      `Todos: ${forecastClients.size} previstos + ${receivedClients.size} recebidos`,
    );
  }

  const tableSubtitle = page.querySelector<HTMLElement>(
    ".forecast-panel-v7:has(.forecast-table-v7) .forecast-panel-head-v7 p",
  );
  setText(
    tableSubtitle,
    `${forecastRows.length} previsões pendentes e ${receivedRows.length} recebimentos no filtro atual`,
  );

  const weekButtons = [...page.querySelectorAll<HTMLButtonElement>(".forecast-weeks-v7 button")];
  const hasSelectedWeek = weekButtons.some((button) => button.classList.contains("active"));

  weekButtons.forEach((button) => {
    if (hasSelectedWeek && !button.classList.contains("active")) return;

    const label = button.querySelector<HTMLElement>(":scope > span")?.textContent ?? "";
    const range = label.includes("·") ? label.split("·").slice(1).join("·").trim() : label.trim();
    const matchingRows = rows.filter((row) => rowRange(row) === range);
    const matchingForecastRows = matchingRows.filter((row) => row.querySelector(".status.forecast"));
    const matchingReceivedRows = matchingRows.filter((row) => row.querySelector(".status.received"));
    const matchingForecastClients = uniqueClients(matchingForecastRows);
    const matchingReceivedClients = uniqueClients(matchingReceivedRows);

    setText(
      button.querySelector(":scope > small"),
      `${matchingForecastClients.size} previstos · ${matchingReceivedClients.size} recebidos`,
    );

    const forecastNames = [...matchingForecastClients].slice(0, 4);
    const description = forecastNames.length
      ? forecastNames.join(" · ")
      : matchingReceivedClients.size
        ? "Sem previsão pendente · recebimentos já lançados"
        : "Sem movimentação nesta semana";
    setText(button.querySelector(":scope > i"), description);
  });
}

export default function ReceiptForecastEnhancerV8() {
  useEffect(() => {
    let animationFrame = 0;
    const schedule = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(clarifyForecastPanel);
    };

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener("resize", schedule);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return <ReceiptForecastEnhancerV7 />;
}
