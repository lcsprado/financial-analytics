"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type SeriesMode = "both" | "emitted" | "received";

type BankBrand = {
  label: string;
  className: string;
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

function findPanel(title: string) {
  return Array.from(document.querySelectorAll<HTMLElement>(".panel")).find(
    (panel) => panel.querySelector(".panel-header h2")?.textContent?.trim() === title,
  ) ?? null;
}

function resolveBankBrand(bankName: string): BankBrand {
  const bank = normalize(bankName);

  if (/BANCO DO BRASIL|\bBB\b/.test(bank)) return { label: "BB", className: "bb" };
  if (/BRADESCO/.test(bank)) return { label: "B", className: "bradesco" };
  if (/ITAU|ITAÚ/.test(bank)) return { label: "i", className: "itau" };
  if (/SANTANDER/.test(bank)) return { label: "S", className: "santander" };
  if (/CAIXA/.test(bank)) return { label: "X", className: "caixa" };
  if (/C6/.test(bank)) return { label: "C6", className: "c6" };
  if (/NUBANK|NU PAGAMENTOS/.test(bank)) return { label: "Nu", className: "nubank" };
  if (/CIELO/.test(bank)) return { label: "c", className: "cielo" };
  if (/BANCO INTER|\bINTER\b/.test(bank)) return { label: "I", className: "inter" };
  if (/MERCADO PAGO/.test(bank)) return { label: "MP", className: "mercadopago" };
  if (/PICPAY/.test(bank)) return { label: "P", className: "picpay" };
  if (/PAGSEGURO|PAGBANK/.test(bank)) return { label: "P", className: "pagbank" };
  if (/STONE/.test(bank)) return { label: "S", className: "stone" };
  if (/REDE/.test(bank)) return { label: "R", className: "rede" };
  if (/SICOOB/.test(bank)) return { label: "S", className: "sicoob" };
  if (/SICREDI/.test(bank)) return { label: "S", className: "sicredi" };
  if (/SAFRA/.test(bank)) return { label: "S", className: "safra" };
  if (/BTG/.test(bank)) return { label: "BTG", className: "btg" };
  if (/XP/.test(bank)) return { label: "XP", className: "xp" };
  if (/PIX/.test(bank)) return { label: "◆", className: "pix" };

  const initials = bank
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("") || "$";

  return { label: initials, className: "generic" };
}

function createBankMark(bankName: string, small = false) {
  const brand = resolveBankBrand(bankName);
  const mark = document.createElement("span");
  mark.className = `bank-brand-mark bank-${brand.className}${small ? " bank-brand-mark-small" : ""}`;
  mark.textContent = brand.label;
  mark.setAttribute("aria-hidden", "true");
  mark.title = bankName;
  return mark;
}

function decorateBankLegends() {
  const bankPanel = findPanel("Recebimentos por banco");
  if (bankPanel) {
    bankPanel.querySelectorAll<HTMLElement>(".pie-legend > div").forEach((row) => {
      const label = Array.from(row.children).find(
        (child) => child.tagName === "SPAN" && !child.classList.contains("bank-brand-mark"),
      ) as HTMLElement | undefined;

      const bankName = label?.textContent?.trim();
      if (!label || !bankName || row.querySelector(":scope > .bank-brand-mark")) return;
      row.insertBefore(createBankMark(bankName), label);
    });
  }

  document.querySelectorAll<HTMLElement>(".bank-pill").forEach((pill) => {
    if (pill.querySelector(":scope > .bank-brand-mark")) return;

    const bankName = Array.from(pill.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim() || pill.textContent?.trim();

    if (!bankName) return;
    pill.insertBefore(createBankMark(bankName, true), pill.firstChild);
  });
}

function ChartSeriesControl({ panel }: { panel: HTMLElement }) {
  const [mode, setMode] = useState<SeriesMode>("both");

  useEffect(() => {
    const apply = () => {
      const bars = Array.from(panel.querySelectorAll<SVGGElement>("g.recharts-bar"));
      bars.forEach((bar, index) => {
        const visible = mode === "both"
          || (mode === "emitted" && index === 0)
          || (mode === "received" && index === 1);
        bar.style.display = visible ? "" : "none";
      });

      panel.querySelectorAll<HTMLElement>(".recharts-legend-item").forEach((item) => {
        const text = normalize(item.textContent ?? "");
        const isEmitted = text.includes("EMITIDO");
        const isReceived = text.includes("RECEBIDO");
        const visible = mode === "both"
          || (mode === "emitted" && isEmitted)
          || (mode === "received" && isReceived);
        item.style.display = visible ? "" : "none";
      });

      panel.querySelectorAll<HTMLElement>(".chart-tooltip span").forEach((item) => {
        const text = normalize(item.textContent ?? "");
        const isEmitted = text.startsWith("EMITIDO");
        const isReceived = text.startsWith("RECEBIDO");
        const visible = mode === "both"
          || (mode === "emitted" && isEmitted)
          || (mode === "received" && isReceived);
        item.style.display = visible ? "" : "none";
      });

      panel.dataset.seriesMode = mode;
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(panel, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [mode, panel]);

  return (
    <div className="chart-series-toggle" role="group" aria-label="Séries exibidas no gráfico">
      <button type="button" className={mode === "both" ? "active" : ""} aria-pressed={mode === "both"} onClick={() => setMode("both")}>Ambos</button>
      <button type="button" className={mode === "emitted" ? "active" : ""} aria-pressed={mode === "emitted"} onClick={() => setMode("emitted")}>Só emitido</button>
      <button type="button" className={mode === "received" ? "active" : ""} aria-pressed={mode === "received"} onClick={() => setMode("received")}>Só recebido</button>
    </div>
  );
}

export default function DashboardVisualControls() {
  const [chartPanel, setChartPanel] = useState<HTMLElement | null>(null);
  const [chartHeader, setChartHeader] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const sync = () => {
      const nextPanel = findPanel("Emitido × recebido");
      const nextHeader = nextPanel?.querySelector<HTMLElement>(".panel-header") ?? null;
      setChartPanel((current) => current === nextPanel ? current : nextPanel);
      setChartHeader((current) => current === nextHeader ? current : nextHeader);
      decorateBankLegends();
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return (
    <>
      <style jsx global>{`
        .chart-series-toggle {
          margin-left: auto;
          display: inline-flex;
          align-items: center;
          gap: 3px;
          padding: 3px;
          border: 1px solid #e6e9f1;
          border-radius: 9px;
          background: #f6f7fb;
        }

        .chart-series-toggle button {
          min-height: 28px;
          padding: 0 10px;
          border: 0;
          border-radius: 6px;
          background: transparent;
          color: #747d91;
          font-size: 10px;
          font-weight: 800;
          white-space: nowrap;
        }

        .chart-series-toggle button:hover {
          color: #394154;
          background: #eceff6;
        }

        .chart-series-toggle button.active {
          color: #fff;
          background: #5d72f6;
          box-shadow: 0 4px 10px rgba(93, 114, 246, 0.2);
        }

        .pie-legend > div {
          grid-template-columns: 8px 24px minmax(0, 1fr) auto !important;
        }

        .bank-brand-mark {
          width: 24px;
          height: 24px;
          display: inline-grid !important;
          place-items: center;
          flex: 0 0 auto;
          overflow: visible !important;
          border-radius: 7px;
          color: #fff !important;
          font-size: 8px !important;
          font-weight: 900;
          line-height: 1;
          letter-spacing: -0.2px;
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.2), 0 2px 6px rgba(28, 35, 60, 0.12);
        }

        .bank-brand-mark-small {
          width: 18px;
          height: 18px;
          border-radius: 5px;
          font-size: 7px !important;
          margin-right: 5px;
        }

        .bank-pill {
          align-items: center;
        }

        .bank-bb { background: #f6d318; color: #073d75 !important; }
        .bank-bradesco { background: #cc092f; }
        .bank-itau { background: #ec7000; }
        .bank-santander { background: #ec0000; }
        .bank-caixa { background: linear-gradient(135deg, #0067a6 0 64%, #f7941d 64%); }
        .bank-c6 { background: #151515; }
        .bank-nubank { background: #820ad1; }
        .bank-cielo { background: #00a9e0; }
        .bank-inter { background: #ff7a00; }
        .bank-mercadopago { background: #009ee3; }
        .bank-picpay { background: #21c25e; }
        .bank-pagbank { background: #16a34a; }
        .bank-stone { background: #00a868; }
        .bank-rede { background: #ff6a00; }
        .bank-sicoob { background: #006b63; }
        .bank-sicredi { background: #58a618; }
        .bank-safra { background: #183d69; }
        .bank-btg { background: #111827; font-size: 6px !important; }
        .bank-xp { background: #111; }
        .bank-pix { background: #32bcad; }
        .bank-generic { background: #677189; }

        @media (max-width: 760px) {
          .panel-header {
            align-items: flex-start;
            gap: 10px;
            flex-wrap: wrap;
          }

          .chart-series-toggle {
            width: 100%;
            margin-left: 0;
          }

          .chart-series-toggle button {
            flex: 1;
            padding: 0 5px;
          }
        }

        @media print {
          .chart-series-toggle {
            display: none !important;
          }
        }
      `}</style>
      {chartPanel && chartHeader ? createPortal(<ChartSeriesControl panel={chartPanel} />, chartHeader) : null}
    </>
  );
}
