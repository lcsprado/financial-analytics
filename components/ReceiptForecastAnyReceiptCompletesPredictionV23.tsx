"use client";

import { useEffect, useRef } from "react";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function parseIso(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return Number.isNaN(date.getTime()) ? null : date;
}

function brDates(value: string) {
  return [...value.matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)].map((match) => `${match[3]}-${match[2]}-${match[1]}`);
}

function numericCurrency(value: string) {
  const match = value.match(/R\$\s*-?[\d.]+,\d{2}/i);
  if (!match) return 0;
  const parsed = Number(
    match[0]
      .replace(/R\$/gi, "")
      .replace(/\s/g, "")
      .replace(/\./g, "")
      .replace(",", "."),
  );
  return Number.isFinite(parsed) ? parsed : 0;
}

function receivedFromPartialStatus(value: string) {
  const match = value.match(/Recebido\s+(R\$\s*[\d.]+,\d{2})/i);
  return match ? numericCurrency(match[1]) : 0;
}

function actualWeekId(actualDate: string) {
  const date = parseIso(actualDate);
  if (!date) return "";
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + mondayOffset);
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
}

function outcomeFor(actualDate: string, weekStart: string, weekEnd: string) {
  const actual = parseIso(actualDate);
  const start = parseIso(weekStart);
  const end = parseIso(weekEnd);
  if (!actual || !start || !end) return "received_on_time";
  if (actual < start) return "received_early";
  if (actual > end) return "received_late";
  return "received_on_time";
}

function completeAutomaticReceiptRows() {
  if (!document.body.classList.contains("receipt-forecast-active-v13")) return;

  document.querySelectorAll<HTMLTableRowElement>(".forecast-table-v13 tbody tr").forEach((row) => {
    const cells = row.querySelectorAll<HTMLTableCellElement>("td");
    if (cells.length < 7) return;

    const statusTitle = cells[3].querySelector<HTMLElement>(".status b")?.textContent?.trim() || "";
    const presence = cells[4].textContent?.trim() || "";

    const manual = statusTitle.includes("Adicionado manualmente") || statusTitle.includes("Valor confirmado");
    const standaloneActual = statusTitle.includes("Recebido") && presence.includes("Recebimento real");
    if (manual || standaloneActual) return;

    const statusText = cells[3].textContent || "";
    const matchedAcrossWeek = Number(row.dataset.weeklyMatchedActualValue || 0);
    const adaptiveActual = Number(row.dataset.adaptiveActualValue || 0);
    const partialActual = receivedFromPartialStatus(statusText);
    const actualValue = matchedAcrossWeek || adaptiveActual || partialActual;
    if (!(actualValue > 0)) return;

    const windowDates = brDates(cells[1].textContent || "");
    const weekStart = windowDates[0] || "";
    const weekEnd = windowDates[1] || weekStart;
    if (!weekStart) return;

    const storedDates = row.dataset.adaptiveActualDates?.split(",").filter(Boolean) || [];
    const statusDates = brDates(statusText);
    const actualDates = storedDates.length ? storedDates : statusDates;
    const firstActualDate = actualDates[0] || weekStart;
    const actualWeek = row.dataset.adaptiveActualWeek || actualWeekId(firstActualDate) || weekStart;

    const expected = Number(row.dataset.adaptiveExpected || 0)
      || (statusTitle.includes("Pagou a menor") ? numericCurrency(cells[2].textContent || "") + partialActual : numericCurrency(cells[2].textContent || ""));

    row.dataset.adaptiveExpected = String(expected || actualValue);
    row.dataset.adaptiveActualValue = String(actualValue);
    row.dataset.adaptiveRemaining = "0";
    row.dataset.adaptiveActualDates = actualDates.join(",");
    row.dataset.adaptiveActualWeek = actualWeek;
    row.dataset.adaptiveOutcome = outcomeFor(firstActualDate, weekStart, weekEnd);
    row.dataset.adaptiveMatched = "true";
    row.dataset.weeklyTruthApplied = "full";
    row.dataset.forecastReceiptCompletedV23 = "true";
    row.dataset.onlyPendingReceived = "true";

    // Se o recebimento aconteceu em outra semana, ele pertence somente à semana real.
    if (actualWeek && actualWeek !== weekStart) {
      row.style.display = "none";
      return;
    }

    row.style.display = "";
    const valueStrong = cells[2].querySelector<HTMLElement>("strong");
    if (valueStrong) valueStrong.textContent = currency.format(actualValue);

    const wrapper = document.createElement("span");
    wrapper.className = "status received";
    const title = document.createElement("b");
    title.textContent = "Recebido";
    const detail = document.createElement("small");
    detail.textContent = `${currency.format(actualValue)} em ${actualDates.map((date) => parseIso(date)?.toLocaleDateString("pt-BR") || date).join(", ")}`;
    wrapper.append(title, detail);
    cells[3].replaceChildren(wrapper);
    cells[6].innerHTML = '<span class="no-action">—</span>';
  });
}

export default function ReceiptForecastAnyReceiptCompletesPredictionV23() {
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const schedule = () => {
      if (frame.current !== null) return;
      frame.current = window.requestAnimationFrame(() => {
        frame.current = null;
        completeAutomaticReceiptRows();
      });
    };

    schedule();
    const target = document.querySelector<HTMLElement>(".content-area") || document.body;
    const observer = new MutationObserver(schedule);
    observer.observe(target, { childList: true, subtree: true, characterData: true });
    document.addEventListener("change", schedule, true);
    document.addEventListener("click", schedule, true);

    return () => {
      observer.disconnect();
      document.removeEventListener("change", schedule, true);
      document.removeEventListener("click", schedule, true);
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    };
  }, []);

  return null;
}
