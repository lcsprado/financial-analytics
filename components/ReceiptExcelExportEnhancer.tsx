"use client";

import { useEffect } from "react";

function parseBrazilianCurrency(value: string) {
  const normalized = value
    .replace(/\s/g, "")
    .replace(/R\$/gi, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function parseBrazilianDate(value: string) {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return value.trim();
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 12);
}

function receiptPanelFor(button: HTMLButtonElement) {
  const panel = button.closest<HTMLElement>("section.panel");
  if (!panel) return null;
  const title = panel.querySelector<HTMLElement>(".panel-header h2")?.textContent?.trim();
  return title === "Recebimentos bancários" ? panel : null;
}

function filteredPeriod(panel: HTMLElement) {
  const inputs = panel.querySelectorAll<HTMLInputElement>("[data-receipt-date-filter] input[type='date']");
  const start = inputs[0]?.value;
  const end = inputs[1]?.value;
  if (!start && !end) return "Todos os períodos";
  const format = (iso?: string) => {
    if (!iso) return "—";
    const [year, month, day] = iso.split("-");
    return `${day}/${month}/${year}`;
  };
  return `${format(start)} a ${format(end)}`;
}

async function exportReceipts(panel: HTMLElement) {
  const sourceTable = panel.querySelector<HTMLTableElement>(".print-full-table table");
  if (!sourceTable) throw new Error("Tabela completa de recebimentos não encontrada.");

  const rows = [...sourceTable.querySelectorAll<HTMLTableRowElement>("tbody tr")].map((row) => {
    const cells = [...row.querySelectorAll<HTMLTableCellElement>("td")].map((cell) => cell.textContent?.trim() ?? "");
    return [
      parseBrazilianDate(cells[0] ?? ""),
      cells[1] ?? "",
      cells[2] ?? "",
      cells[3] || "Não identificada",
      parseBrazilianCurrency(cells[4] ?? "0"),
    ];
  });

  const total = rows.reduce((sum, row) => sum + Number(row[4] || 0), 0);
  const XLSX = await import("xlsx");
  const generatedAt = new Date();

  const sheetData: Array<Array<string | number | Date>> = [
    ["RELATÓRIO DE RECEBIMENTOS"],
    [`Período: ${filteredPeriod(panel)}`],
    ["Lançamentos", rows.length, "", "Total recebido", Math.round(total * 100) / 100],
    [`Gerado em ${generatedAt.toLocaleString("pt-BR")}`],
    ["Recebimento", "Banco", "Descrição", "NF identificada", "Valor"],
    ...rows,
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(sheetData, { cellDates: true });
  worksheet["!merges"] = [
    XLSX.utils.decode_range("A1:E1"),
    XLSX.utils.decode_range("A2:E2"),
    XLSX.utils.decode_range("A4:E4"),
  ];
  worksheet["!cols"] = [
    { wch: 15 },
    { wch: 16 },
    { wch: 68 },
    { wch: 22 },
    { wch: 18 },
  ];
  worksheet["!autofilter"] = { ref: `A5:E${Math.max(5, rows.length + 5)}` };

  const currencyFormat = 'R$ #,##0.00;[Red]-R$ #,##0.00';
  if (worksheet.E3) worksheet.E3.z = currencyFormat;
  for (let row = 6; row <= rows.length + 5; row += 1) {
    const dateCell = worksheet[`A${row}`];
    const valueCell = worksheet[`E${row}`];
    if (dateCell && dateCell.v instanceof Date) dateCell.z = "dd/mm/yyyy";
    if (valueCell) valueCell.z = currencyFormat;
  }

  const titleCell = worksheet.A1;
  if (titleCell) {
    titleCell.s = {
      font: { bold: true, sz: 16, color: { rgb: "FFFFFF" } },
      fill: { patternType: "solid", fgColor: { rgb: "1D2A4A" } },
      alignment: { horizontal: "left", vertical: "center" },
    };
  }
  ["A5", "B5", "C5", "D5", "E5"].forEach((address) => {
    const cell = worksheet[address];
    if (!cell) return;
    cell.s = {
      font: { bold: true, color: { rgb: "FFFFFF" } },
      fill: { patternType: "solid", fgColor: { rgb: "5D72F6" } },
      alignment: { vertical: "center" },
    };
  });
  ["A3", "D3"].forEach((address) => {
    if (worksheet[address]) worksheet[address].s = { font: { bold: true } };
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Recebimentos");
  XLSX.writeFile(workbook, "recebimentos-filtrados.xlsx", {
    compression: true,
    cellDates: true,
    cellStyles: true,
  });
}

export default function ReceiptExcelExportEnhancer() {
  useEffect(() => {
    const markButtons = () => {
      document.querySelectorAll<HTMLButtonElement>("button.table-export").forEach((button) => {
        if (!receiptPanelFor(button)) return;
        button.title = "Exportar recebimentos filtrados em Excel (.xlsx)";
        button.dataset.receiptExcelExport = "true";
      });
    };

    const handleClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button.table-export") : null;
      if (!target) return;
      const panel = receiptPanelFor(target);
      if (!panel) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void exportReceipts(panel).catch((error) => {
        console.error("Falha ao exportar recebimentos em Excel", error);
        window.alert("Não foi possível gerar o arquivo Excel. Atualize a página e tente novamente.");
      });
    };

    markButtons();
    const observer = new MutationObserver(markButtons);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", handleClick, true);

    return () => {
      observer.disconnect();
      document.removeEventListener("click", handleClick, true);
    };
  }, []);

  return null;
}
