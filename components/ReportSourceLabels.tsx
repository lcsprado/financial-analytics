"use client";

import { useEffect } from "react";
import { ANALYSIS_DATA_EVENT } from "@/lib/offlineStorage";

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

function findPanelHeader(title: string) {
  return Array.from(document.querySelectorAll<HTMLElement>(".panel-header"))
    .find((header) => normalize(header.querySelector("h2")?.textContent ?? "") === normalize(title));
}

export default function ReportSourceLabels() {
  useEffect(() => {
    let scheduled: number | null = null;
    const sync = () => {
      scheduled = null;
      const navButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".sidebar nav button"));
      navButtons.forEach((button) => {
        const label = normalize(button.textContent ?? "");
        button.removeAttribute("data-report-source");
        button.removeAttribute("title");
        if (label === "EMISSOES") {
          button.dataset.reportSource = "FINR020";
          button.title = "Exibe exclusivamente os dados importados da FINR020";
        }
        if (label === "RECEBIMENTOS") {
          button.dataset.reportSource = "CONCILIAÇÃO";
          button.title = "Exibe exclusivamente os recebimentos importados da planilha de conciliação";
        }
      });

      document.querySelectorAll<HTMLElement>(".panel-header.report-source-header").forEach((header) => {
        header.classList.remove("report-source-header");
        header.removeAttribute("data-report-source-label");
      });

      const invoiceHeader = findPanelHeader("Notas emitidas");
      if (invoiceHeader) {
        invoiceHeader.classList.add("report-source-header");
        invoiceHeader.dataset.reportSourceLabel = "Fonte exclusiva: FINR020 — relatório 1";
      }
      const receiptHeader = findPanelHeader("Recebimentos bancários");
      if (receiptHeader) {
        receiptHeader.classList.add("report-source-header");
        receiptHeader.dataset.reportSourceLabel = "Fonte exclusiva: Conciliação/Contas a Receber — relatório 2";
      }
    };

    const schedule = () => {
      if (scheduled !== null) return;
      scheduled = window.setTimeout(sync, 0);
    };

    sync();
    document.addEventListener("click", schedule, true);
    document.addEventListener("change", schedule, true);
    window.addEventListener(ANALYSIS_DATA_EVENT, schedule);
    return () => {
      document.removeEventListener("click", schedule, true);
      document.removeEventListener("change", schedule, true);
      window.removeEventListener(ANALYSIS_DATA_EVENT, schedule);
      if (scheduled !== null) window.clearTimeout(scheduled);
    };
  }, []);

  return (
    <style jsx global>{`
      .sidebar nav button[data-report-source]::after {
        content: attr(data-report-source); margin-left:auto; padding:3px 6px;
        border:1px solid rgba(139,154,255,.28); border-radius:999px; color:#aeb9ff;
        font-size:8px; font-weight:800; letter-spacing:.05em; line-height:1;
      }
      .panel-header.report-source-header { align-items:center; gap:12px; }
      .panel-header.report-source-header::after {
        content:attr(data-report-source-label); margin-left:auto; padding:7px 10px;
        border:1px solid #dfe4ff; border-radius:999px; background:#f5f7ff; color:#5265c7;
        font-size:11px; font-weight:700; white-space:nowrap;
      }
      @media(max-width:720px){
        .sidebar nav button[data-report-source]::after{font-size:7px}
        .panel-header.report-source-header{align-items:flex-start;flex-direction:column}
        .panel-header.report-source-header::after{margin-left:0;white-space:normal}
      }
    `}</style>
  );
}
