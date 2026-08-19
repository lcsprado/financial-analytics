"use client";

import { useEffect } from "react";
import { ANALYSIS_DATA_EVENT } from "@/lib/offlineStorage";

function parseBrazilianDate(value: string) {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return "";
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function parseCurrency(value: string) {
  const normalized = value
    .replace(/R\$/g, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  return Number(normalized) || 0;
}

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export default function ReceiptDateRangeFilter() {
  useEffect(() => {
    let applying = false;
    let frame: number | null = null;
    let retryTimer: number | null = null;
    let lateRetryTimer: number | null = null;

    const enhance = () => {
      frame = null;
      if (applying) return;
      applying = true;

      try {
        const panels = Array.from(document.querySelectorAll<HTMLElement>(".panel"));
        const panel = panels.find(
          (item) => item.querySelector("h2")?.textContent?.trim() === "Recebimentos bancários"
        );
        if (!panel) return;

        const toolbar = panel.querySelector<HTMLElement>(".table-toolbar");
        const tbody = panel.querySelector<HTMLTableSectionElement>("tbody");
        if (!toolbar || !tbody) return;

        let filterBox = panel.querySelector<HTMLElement>("[data-receipt-date-filter]");
        if (filterBox) return;

        filterBox = document.createElement("div");
        filterBox.dataset.receiptDateFilter = "true";
        Object.assign(filterBox.style, {
          display: "flex",
          flexWrap: "wrap",
          alignItems: "end",
          gap: "10px",
          marginBottom: "14px",
          padding: "12px",
          border: "1px solid #e6e9f1",
          borderRadius: "10px",
          background: "#f8f9fd",
        });

        const createField = (labelText: string, name: string) => {
          const label = document.createElement("label");
          Object.assign(label.style, {
            display: "flex",
            flexDirection: "column",
            gap: "5px",
          });

          const title = document.createElement("span");
          title.textContent = labelText;
          Object.assign(title.style, {
            color: "#8b93a5",
            fontSize: "9px",
            fontWeight: "800",
            letterSpacing: ".7px",
            textTransform: "uppercase",
          });

          const input = document.createElement("input");
          input.type = "date";
          input.name = name;
          Object.assign(input.style, {
            height: "34px",
            padding: "0 10px",
            color: "#50596c",
            background: "#fff",
            border: "1px solid #e6e9f0",
            borderRadius: "8px",
            fontSize: "12px",
            fontWeight: "600",
          });

          label.append(title, input);
          return label;
        };

        const heading = document.createElement("div");
        Object.assign(heading.style, {
          marginRight: "auto",
          display: "flex",
          flexDirection: "column",
          alignSelf: "center",
        });

        const headingTitle = document.createElement("strong");
        headingTitle.textContent = "Período dos recebimentos";
        headingTitle.style.fontSize = "13px";

        const headingSubtitle = document.createElement("small");
        headingSubtitle.textContent = "Escolha uma data inicial e uma data final";
        Object.assign(headingSubtitle.style, {
          color: "#7e879b",
          fontSize: "10px",
          marginTop: "3px",
        });

        heading.append(headingTitle, headingSubtitle);

        const startField = createField("Data inicial", "receipt-start-date");
        const endField = createField("Data final", "receipt-end-date");

        const clearButton = document.createElement("button");
        clearButton.type = "button";
        clearButton.textContent = "Limpar período";
        Object.assign(clearButton.style, {
          height: "34px",
          padding: "0 11px",
          border: "0",
          background: "transparent",
          color: "#5d72f6",
          fontSize: "11px",
          fontWeight: "800",
        });

        filterBox.append(heading, startField, endField, clearButton);
        toolbar.parentElement?.insertBefore(filterBox, toolbar);

        let hasAppliedFilter = false;
        const originalSubtitle = panel.querySelector<HTMLElement>(".panel-header p")?.textContent ?? "";
        const totalContainer = Array.from(toolbar.querySelectorAll<HTMLElement>("span")).find(
          (item) => item.textContent?.trim().startsWith("Total:")
        );
        const originalTotal = totalContainer?.querySelector("strong")?.textContent ?? "";

        const applyFilter = () => {
          const start =
            filterBox?.querySelector<HTMLInputElement>('input[name="receipt-start-date"]')?.value ?? "";
          const end =
            filterBox?.querySelector<HTMLInputElement>('input[name="receipt-end-date"]')?.value ?? "";

          // Na entrada da aba os dois campos estão vazios. Não percorre nem escreve
          // estilo em milhares de linhas: a tabela já está corretamente renderizada.
          if (!start && !end && !hasAppliedFilter) return;

          const rows = Array.from(tbody.querySelectorAll<HTMLTableRowElement>("tr"));

          if (!start && !end) {
            rows.forEach((row) => {
              if (row.style.display) row.style.removeProperty("display");
            });
            const subtitle = panel.querySelector<HTMLElement>(".panel-header p");
            if (subtitle && originalSubtitle) subtitle.textContent = originalSubtitle;
            const totalStrong = totalContainer?.querySelector("strong");
            if (totalStrong && originalTotal) totalStrong.textContent = originalTotal;
            hasAppliedFilter = false;
            return;
          }

          hasAppliedFilter = true;
          let visibleCount = 0;
          let total = 0;

          rows.forEach((row) => {
            const receiptDate = parseBrazilianDate(row.cells[0]?.textContent ?? "");
            const afterStart = !start || receiptDate >= start;
            const beforeEnd = !end || receiptDate <= end;
            const visible = Boolean(receiptDate && afterStart && beforeEnd);

            const nextDisplay = visible ? "" : "none";
            if (row.style.display !== nextDisplay) row.style.display = nextDisplay;

            if (visible) {
              visibleCount += 1;
              total += parseCurrency(row.cells[row.cells.length - 1]?.textContent ?? "");
            }
          });

          const subtitle = panel.querySelector<HTMLElement>(".panel-header p");
          if (subtitle) {
            subtitle.textContent = `${visibleCount.toLocaleString("pt-BR")} lançamentos após os filtros`;
          }

          const totalStrong = totalContainer?.querySelector("strong");
          if (totalStrong) totalStrong.textContent = currency.format(total);
        };

        filterBox
          .querySelectorAll("input")
          .forEach((input) => input.addEventListener("change", applyFilter));

        clearButton.addEventListener("click", () => {
          filterBox
            ?.querySelectorAll<HTMLInputElement>("input")
            .forEach((input) => {
              input.value = "";
            });
          applyFilter();
        });
      } finally {
        applying = false;
      }
    };

    const scheduleEnhance = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(enhance);
    };

    const scheduleAfterNavigation = () => {
      scheduleEnhance();
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      if (lateRetryTimer !== null) window.clearTimeout(lateRetryTimer);
      retryTimer = window.setTimeout(scheduleEnhance, 60);
      lateRetryTimer = window.setTimeout(scheduleEnhance, 180);
    };

    enhance();
    scheduleAfterNavigation();
    document.addEventListener("click", scheduleAfterNavigation, true);
    window.addEventListener(ANALYSIS_DATA_EVENT, scheduleAfterNavigation);

    return () => {
      document.removeEventListener("click", scheduleAfterNavigation, true);
      window.removeEventListener(ANALYSIS_DATA_EVENT, scheduleAfterNavigation);
      if (frame !== null) window.cancelAnimationFrame(frame);
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      if (lateRetryTimer !== null) window.clearTimeout(lateRetryTimer);
    };
  }, []);

  return null;
}
