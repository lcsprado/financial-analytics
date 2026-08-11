"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type Snapshot = {
  pending: number;
  received: number;
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function parseCurrency(value: string) {
  const match = value.match(/R\$\s*-?[\d.]+,\d{2}/i);
  if (!match) return 0;
  const parsed = Number(match[0].replace(/R\$/gi, "").replace(/\s/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateFromWeekLabel(value: string) {
  const match = value.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
}

function selectedWeekValue() {
  const label = [...document.querySelectorAll<HTMLLabelElement>(".forecast-filter-v13 label")]
    .find((item) => normalize(item.querySelector(":scope > span")?.textContent || "") === "SEMANA");
  return label?.querySelector<HTMLSelectElement>("select")?.value || "all";
}

function sameSnapshot(left: Snapshot, right: Snapshot) {
  return left.pending === right.pending && left.received === right.received;
}

export default function ReceiptForecastKpiSimplifier() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>({ pending: 0, received: 0 });
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const read = () => {
      const container = document.querySelector<HTMLElement>(".forecast-kpis-v13");
      if (container && container !== target) setTarget(container);
      if (!container) return;

      const weekFilter = selectedWeekValue();
      const weekButtons = [...document.querySelectorAll<HTMLButtonElement>(".forecast-weeks-v13 button")];

      let pending = 0;
      let received = 0;

      if (weekButtons.length) {
        const scopedWeeks = weekFilter === "all"
          ? weekButtons
          : weekButtons.filter((button) => dateFromWeekLabel(button.querySelector("span")?.textContent || "") === weekFilter);

        pending = scopedWeeks.reduce(
          (sum, button) => sum + parseCurrency(button.querySelector<HTMLElement>("strong")?.textContent || ""),
          0,
        );
        received = scopedWeeks.reduce(
          (sum, button) => sum + parseCurrency(button.querySelector<HTMLElement>("em")?.textContent || ""),
          0,
        );
      } else {
        const baseCards = [...container.querySelectorAll<HTMLElement>(":scope > article")];
        pending = parseCurrency(baseCards[0]?.querySelector<HTMLElement>("strong")?.textContent || "");
        received = parseCurrency(baseCards[1]?.querySelector<HTMLElement>("strong")?.textContent || "");
      }

      const next = { pending, received };
      setSnapshot((current) => sameSnapshot(current, next) ? current : next);
    };

    const schedule = () => {
      if (frame.current !== null) return;
      frame.current = window.requestAnimationFrame(() => {
        frame.current = null;
        read();
      });
    };

    schedule();
    const observerTarget = document.querySelector<HTMLElement>(".content-area") || document.body;
    const observer = new MutationObserver(schedule);
    observer.observe(observerTarget, { childList: true, subtree: true, characterData: true, attributes: true });
    document.addEventListener("change", schedule, true);
    document.addEventListener("click", schedule, true);

    return () => {
      observer.disconnect();
      document.removeEventListener("change", schedule, true);
      document.removeEventListener("click", schedule, true);
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    };
  }, [target]);

  return (
    <>
      <style jsx global>{`
        .receipt-forecast-active-v13 .forecast-kpis-v13 {
          grid-template-columns: 1fr !important;
        }

        .receipt-forecast-active-v13 .forecast-kpis-v13 > article {
          display: none !important;
        }

        .receipt-forecast-active-v13 .forecast-kpis-stable-v26 {
          grid-column: 1 / -1;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          width: 100%;
        }

        .receipt-forecast-active-v13 .forecast-kpis-stable-v26 article {
          min-width: 0;
          cursor: default;
        }

        .receipt-forecast-active-v13 #forecast-accuracy-v14,
        .receipt-forecast-active-v13 .forecast-accuracy-v14 {
          display: none !important;
        }

        @media (max-width: 760px) {
          .receipt-forecast-active-v13 .forecast-kpis-stable-v26 {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      {target ? createPortal(
        <div className="forecast-kpis-stable-v26">
          <article>
            <span>A receber no período</span>
            <strong>{BRL.format(snapshot.pending)}</strong>
            <small>Previsão consolidada do período selecionado</small>
          </article>
          <article>
            <span>Recebido no período</span>
            <strong>{BRL.format(snapshot.received)}</strong>
            <small>Recebimentos reais do período selecionado</small>
          </article>
        </div>,
        target,
      ) : null}
    </>
  );
}
