"use client";

import { useEffect } from "react";

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

export default function InvoiceDateRangeFilter() {
  useEffect(() => {
    let applying = false;
    let frame: number | null = null;
    let retryTimer: number | null = null;

    const enhance = () => {
      frame = null;
      if (applying) return;
      applying = true;

      try {
        const panels = Array.from(document.querySelectorAll<HTMLElement>(".panel"));
        const panel = panels.find(
          (item) => item.querySelector("h2")?.textContent?.trim() === "Notas emitidas"
        );
        if (!panel) return;

        const toolbar = panel.querySelector<HTMLElement>(".table-toolbar");
        const tbody = panel.querySelector<HTMLTableSectionElement>("tbody");
        if (!toolbar || !tbody) return;

        let filterBox = panel.querySelector<HTMLElement>("[data-invoice-date-filter]");

        if (!filterBox) {
          filterBox = document.createElement("div");
          filterBox.dataset.invoiceDateFilter = "true";
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
          headingTitle.textContent = "Período das emissões";
          headingTitle.style.fontSize = "13px";

          const headingSubtitle = document.createElement("small");
          headingSubtitle.textContent = "Escolha uma data inicial e uma data final";
          Object.assign(headingSubtitle.style, {
            color: "#7e879b",
            fontSize: "10px",
            marginTop: "3px",
          });

          heading.append(headingTitle, headingSubtitle);

          const startField = createField("Data inicial", "invoice-start-date");
          const endField = createField("Data final", "invoice-end-date");

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

          const applyFilter = () => {
            const start =
              filterBox?.querySelector<HTMLInputElement>(
                'input[name="invoice-start-date"]'
              )?.value ?? "";
            const end =
              filterBox?.querySelector<HTMLInputElement>(
                'input[name="invoice-end-date"]'
              )?.value ?? "";

            const rows = Array.from(tbody.querySelectorAll<HTMLTableRowElement>("tr"));
            let visibleCount = 0;
            let total = 0;

            rows.forEach((row) => {
              const emissionDate = parseBrazilianDate(row.cells[0]?.textContent ?? "");
              const afterStart = !start || emissionDate >= start;
              const beforeEnd = !end || emissionDate <= end;
              const visible = Boolean(emissionDate && afterStart && beforeEnd);

              row.style.display = visible ? "" : "none";

              if (visible) {
                visibleCount += 1;
                total += parseCurrency(row.cells[4]?.textContent ?? "");
              }
            });

            const subtitle = panel.querySelector<HTMLElement>(".panel-header p");
            if (subtitle) {
              subtitle.textContent = `${visibleCount.toLocaleString(
                "pt-BR"
              )} registros após os filtros`;
            }

            const totalContainer = Array.from(
              toolbar.querySelectorAll<HTMLElement>("span")
            ).find((item) => item.textContent?.trim().startsWith("Total:"));
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

          applyFilter();
        }
      } finally {
        applying = false;
      }
    };

    const scheduleEnhance = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(enhance);
    };

    enhance();
    scheduleEnhance();
    retryTimer = window.setTimeout(scheduleEnhance, 80);

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, []);

  return null;
}
