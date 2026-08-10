"use client";

import { useEffect, useRef } from "react";

function brDates(value: string) {
  return [...value.matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)]
    .map((match) => `${match[3]}-${match[2]}-${match[1]}`);
}

function currentWeekFilter() {
  const selects = document.querySelectorAll<HTMLSelectElement>(".forecast-filter-v13 select");
  return selects[2]?.value || "all";
}

function cleanupFilteredWeek() {
  if (!document.body.classList.contains("receipt-forecast-active-v13")) return;

  const weekFilter = currentWeekFilter();
  const rows = document.querySelectorAll<HTMLTableRowElement>(".forecast-table-v13 tbody tr");

  rows.forEach((row) => {
    if (row.dataset.filteredWeekCleanupHidden === "true") {
      row.style.display = "";
      delete row.dataset.filteredWeekCleanupHidden;
    }
  });

  if (!weekFilter || weekFilter === "all") return;

  rows.forEach((row) => {
    const cells = row.querySelectorAll<HTMLTableCellElement>("td");
    if (cells.length < 7) return;

    const rowWeek = brDates(cells[1].textContent || "")[0] || "";
    if (!rowWeek || rowWeek !== weekFilter) return;

    const actualWeek = row.dataset.adaptiveActualWeek || "";
    if (!actualWeek || actualWeek === rowWeek) return;

    const statusTitle = cells[3].querySelector(".status b")?.textContent?.trim() || "";
    const remaining = Number(row.dataset.adaptiveRemaining || "NaN");
    const fullyConsumed = statusTitle.includes("Recebido") || (Number.isFinite(remaining) && remaining <= 0);

    if (!fullyConsumed || row.dataset.adaptiveMatched !== "true") return;

    // O recebimento pertence à semana real. A semana prevista não deve repeti-lo como recebido antecipado.
    row.style.display = "none";
    row.dataset.filteredWeekCleanupHidden = "true";
  });
}

export default function ReceiptForecastFilteredWeekCleanup() {
  const scheduled = useRef<number | null>(null);
  const observer = useRef<MutationObserver | null>(null);
  const observedTarget = useRef<Element | null>(null);

  useEffect(() => {
    const connectObserver = () => {
      const target = document.querySelector(".forecast-table-v13 tbody");
      if (target === observedTarget.current) return;

      observer.current?.disconnect();
      observer.current = null;
      observedTarget.current = target;

      if (!target) return;
      observer.current = new MutationObserver(() => schedule());
      observer.current.observe(target, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: [
          "style",
          "class",
          "data-adaptive-actual-week",
          "data-adaptive-matched",
          "data-adaptive-remaining",
        ],
      });
    };

    const run = () => {
      scheduled.current = null;
      connectObserver();
      cleanupFilteredWeek();
    };

    const schedule = () => {
      if (scheduled.current !== null) return;
      scheduled.current = window.requestAnimationFrame(run);
    };

    const onInteraction = () => {
      schedule();
      window.setTimeout(schedule, 60);
    };

    schedule();
    document.addEventListener("change", onInteraction, true);
    document.addEventListener("click", onInteraction, true);

    return () => {
      document.removeEventListener("change", onInteraction, true);
      document.removeEventListener("click", onInteraction, true);
      observer.current?.disconnect();
      if (scheduled.current !== null) window.cancelAnimationFrame(scheduled.current);
    };
  }, []);

  return null;
}
