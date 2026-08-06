"use client";

import { useEffect } from "react";
import ReceiptForecastEnhancerV3 from "@/components/ReceiptForecastEnhancerV3";

function WeekClientFilterSync() {
  useEffect(() => {
    let frame = 0;

    const syncClientOptions = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const root = document.querySelector<HTMLElement>(".receipt-forecast-page-v3");
        if (!root) return;

        const selects = root.querySelectorAll<HTMLSelectElement>(".forecast-filter-bar-v3 select");
        const clientSelect = selects.item(0);
        const weekSelect = selects.item(2);
        if (!clientSelect || !weekSelect) return;

        const selectedWeek = weekSelect.value;
        const isWeekFiltered = selectedWeek !== "all";
        const visibleClientNames = new Set(
          [...root.querySelectorAll<HTMLElement>(".forecast-table-wrap-v3 tbody .forecast-client-v3 strong")]
            .map((element) => element.textContent?.trim() ?? "")
            .filter(Boolean),
        );

        [...clientSelect.options].forEach((option) => {
          if (option.value === "all") {
            option.hidden = false;
            option.disabled = false;
            option.textContent = isWeekFiltered
              ? `Todos da semana (${visibleClientNames.size})`
              : "Todos os clientes";
            return;
          }

          const belongsToSelectedWeek = visibleClientNames.has(option.textContent?.trim() ?? "");
          const keepSelectedVisible = option.selected;
          option.hidden = isWeekFiltered && !belongsToSelectedWeek && !keepSelectedVisible;
          option.disabled = isWeekFiltered && !belongsToSelectedWeek && !keepSelectedVisible;
        });

        const tableSubtitle = root.querySelector<HTMLElement>(".forecast-table-header-v3 p");
        if (tableSubtitle && isWeekFiltered) {
          tableSubtitle.textContent = `${visibleClientNames.size} clientes da semana selecionada`;
        }
      });
    };

    const observer = new MutationObserver(syncClientOptions);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("change", syncClientOptions, true);
    document.addEventListener("click", syncClientOptions, true);
    syncClientOptions();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("change", syncClientOptions, true);
      document.removeEventListener("click", syncClientOptions, true);
    };
  }, []);

  return null;
}

export default function ReceiptForecastEnhancerV4() {
  return (
    <>
      <ReceiptForecastEnhancerV3 />
      <WeekClientFilterSync />
    </>
  );
}
