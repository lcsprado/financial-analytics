"use client";

import { useEffect } from "react";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

function updateKpis() {
  document.querySelectorAll<HTMLElement>(".kpi-grid").forEach((grid) => {
    const cards = Array.from(grid.querySelectorAll<HTMLElement>(":scope > .kpi-card"));
    let hasTicket = false;

    cards.forEach((card) => {
      const title = normalize(card.querySelector(".kpi-title")?.textContent ?? "");
      if (title !== "TICKET MEDIO") return;

      hasTicket = true;
      card.classList.add("kpi-ticket-hidden");
      card.setAttribute("aria-hidden", "true");
    });

    grid.classList.toggle("kpi-grid-core-only", hasTicket);
  });
}

export default function DashboardKpiCleanup() {
  useEffect(() => {
    updateKpis();
    const observer = new MutationObserver(updateKpis);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <style jsx global>{`
      .kpi-ticket-hidden {
        display: none !important;
      }

      @media (min-width: 1001px) {
        .kpi-grid.kpi-grid-core-only {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        }

        .kpi-grid.kpi-grid-core-only .kpi-card {
          min-height: 128px;
          padding: 20px 22px;
        }

        .kpi-grid.kpi-grid-core-only .kpi-card > strong {
          font-size: clamp(27px, 2.2vw, 34px);
        }
      }

      @media (min-width: 641px) and (max-width: 1000px) {
        .kpi-grid.kpi-grid-core-only {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        }
      }

      @media (max-width: 640px) {
        .kpi-grid.kpi-grid-core-only {
          grid-template-columns: 1fr !important;
        }
      }
    `}</style>
  );
}
