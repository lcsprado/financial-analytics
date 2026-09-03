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

export default function ReceiptDateRangeFilter() {
  useEffect(() => {
    let applying = false;

    const enhance = () => {
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

        if (!filterBox) {
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

          const applyFilter = () => {
            const start =
              filterBox?.querySelector<HTMLInputElement>(
                'input[name="receipt-start-date"]'
              )?.value ?? "";
            const end =
              filterBox?.querySelector<HTMLInputElement>(
                'input[name="receipt-end-date"]'
              )?.value ?? "";

            const rows = Array.from(tbody.querySelectorAll<HTMLTableRowElement>("tr"));
            let visibleCount = 0;
            let total = 0;

            rows.forEach((row) => {
              const receiptDate = parseBrazilianDate(row.cells[0]?.textContent ?? "");
              const afterStart = !start || receiptDate >= start;
              const beforeEnd = !end || receiptDate <= end;
              const visible = Boolean(receiptDate && afterStart && beforeEnd);

              row.style.display = visible ? "" : "none";

              if (visible) {
                visibleCount += 1;
                total += parseCurrency(
                  row.cells[row.cells.length - 1]?.textContent ?? ""
                );
              }
            });

            const subtitle = panel.querySelector<HTMLElement>(".panel-header p");
            if (subtitle) {
              subtitle.textContent = `${visibleCount.toLocaleString(
                "pt-BR"
              )} lançamentos após os filtros`;
            }

            const totalContainer = Array.from(
              toolbar.querySelectorAll<HTMLElement>("span")
            ).find((item) => item.textContent?.trim().startsWith("Total:"));
            const totalStrong = totalContainer?.querySelector("strong");
            if (totalStrong) totalStrong.textContent = currency.format(total);

            const printSummary = panel.querySelector<HTMLElement>(".print-table-summary");
            if (printSummary) {
              const summaryItems = Array.from(
                printSummary.querySelectorAll<HTMLElement>("span")
              );
              const setSummaryValue = (label: string, value: string) => {
                const item = summaryItems.find((summary) =>
                  summary.textContent?.trim().startsWith(label)
                );
                const strong = item?.querySelector("strong");
                if (strong) strong.textContent = value;
              };

              setSummaryValue("Lançamentos", visibleCount.toLocaleString("pt-BR"));
              setSummaryValue(
                "Valor médio",
                currency.format(visibleCount ? total / visibleCount : 0)
              );
              setSummaryValue("Total recebido", currency.format(total));
            }
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

    enhance();

    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return null;
}
