"use client";

import { useEffect, useRef } from "react";

function parseBrazilianDate(value: string) {
  const match = value.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 12);
  return Number.isNaN(date.getTime()) ? null : date;
}

function weekDates(label: string) {
  const matches = [...label.matchAll(/(\d{2}\/\d{2}\/\d{4})/g)].map((match) => parseBrazilianDate(match[1])).filter((date): date is Date => Boolean(date));
  return { start: matches[0] ?? null, end: matches[1] ?? matches[0] ?? null };
}

export default function ReceiptForecastWeekCardsPolishV15() {
  const frame = useRef<number | null>(null);
  const applying = useRef(false);

  useEffect(() => {
    const sync = () => {
      if (applying.current || frame.current !== null) return;
      frame.current = window.requestAnimationFrame(() => {
        frame.current = null;
        if (!document.body.classList.contains("receipt-forecast-active-v13")) return;
        applying.current = true;
        try {
          const panels = [...document.querySelectorAll<HTMLElement>(".forecast-panel-v13")];
          const weeksPanel = panels.find((panel) => panel.querySelector("h3")?.textContent?.trim().startsWith("Semanas de"));
          if (!weeksPanel) return;

          const subtitle = weeksPanel.querySelector<HTMLElement>(".forecast-panel-head-v13 p");
          const subtitleText = "Semanas seguem o calendário financeiro; a última pode avançar para o mês seguinte.";
          if (subtitle && subtitle.textContent !== subtitleText) subtitle.textContent = subtitleText;

          const now = new Date();
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);

          weeksPanel.querySelectorAll<HTMLButtonElement>(".forecast-weeks-v13 button").forEach((button) => {
            button.querySelector("i")?.remove();

            const label = button.querySelector("span")?.textContent?.trim() || "";
            const { start, end } = weekDates(label);
            button.classList.remove("week-current-v15", "week-past-v15", "week-future-v15");
            if (start && end) {
              if (today >= start && today <= end) button.classList.add("week-current-v15");
              else if (today > end) button.classList.add("week-past-v15");
              else button.classList.add("week-future-v15");
            }

            const small = button.querySelector("small");
            const smallText = small?.textContent?.trim() || "";
            const countMatch = smallText.match(/^(\d+)\s+previstos\s+·\s+(\d+)\s+recebidos$/i);
            if (small && countMatch) {
              small.textContent = `${countMatch[1]} clientes previstos · ${countMatch[2]} com recebimento`;
            }

            const aria = [label, button.querySelector("strong")?.textContent, button.querySelector("em")?.textContent, small?.textContent]
              .filter(Boolean)
              .join(". ");
            if (aria) button.setAttribute("aria-label", aria);
          });
        } finally {
          window.setTimeout(() => { applying.current = false; }, 0);
        }
      });
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class"] });
    document.addEventListener("click", sync, true);
    document.addEventListener("change", sync, true);

    return () => {
      observer.disconnect();
      document.removeEventListener("click", sync, true);
      document.removeEventListener("change", sync, true);
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    };
  }, []);

  return (
    <style jsx global>{`
      .receipt-forecast-active-v13 .forecast-weeks-v13 {
        display: grid !important;
        gap: 8px !important;
        max-height: 430px !important;
        padding: 10px !important;
        overflow: auto !important;
        border-top: 1px solid #edf0f5 !important;
        background: #f8f9fc !important;
      }

      .receipt-forecast-active-v13 .forecast-weeks-v13 button {
        position: relative;
        display: grid !important;
        grid-template-columns: minmax(175px,.9fr) minmax(220px,1.15fr) minmax(190px,1fr) minmax(190px,.9fr) !important;
        gap: 14px !important;
        align-items: center !important;
        padding: 16px 18px !important;
        border: 1px solid #e5e9f1 !important;
        border-radius: 13px !important;
        background: #fff !important;
        text-align: left !important;
        box-shadow: 0 4px 14px rgba(31,39,67,.025) !important;
      }

      .receipt-forecast-active-v13 .forecast-weeks-v13 button:hover {
        transform: translateY(-1px);
        border-color: #d9deea !important;
        box-shadow: 0 8px 20px rgba(31,39,67,.05) !important;
      }

      .receipt-forecast-active-v13 .forecast-weeks-v13 button > span {
        display: flex !important;
        align-items: center;
        gap: 8px;
        color: #333b50 !important;
        font-size: 10.5px !important;
        font-weight: 850 !important;
        line-height: 1.35;
      }

      .receipt-forecast-active-v13 .forecast-weeks-v13 button > strong {
        color: #20263a !important;
        font-size: 15px !important;
        font-weight: 850 !important;
        letter-spacing: -.25px;
      }

      .receipt-forecast-active-v13 .forecast-weeks-v13 button > em {
        color: #16866f !important;
        font-size: 11px !important;
        font-style: normal !important;
        font-weight: 850 !important;
      }

      .receipt-forecast-active-v13 .forecast-weeks-v13 button > small {
        justify-self: end;
        color: #8992a5 !important;
        font-size: 9.5px !important;
        line-height: 1.35;
        text-align: right;
      }

      .receipt-forecast-active-v13 .forecast-weeks-v13 button > i {
        display: none !important;
      }

      .receipt-forecast-active-v13 .forecast-weeks-v13 button.week-current-v15 {
        border-color: rgba(93,114,246,.42) !important;
        background: linear-gradient(90deg,#f6f7ff,#fff 72%) !important;
        box-shadow: 0 8px 24px rgba(93,114,246,.075) !important;
      }

      .receipt-forecast-active-v13 .forecast-weeks-v13 button.week-current-v15 > span::after {
        content: "SEMANA ATUAL";
        display: inline-flex;
        align-items: center;
        min-height: 20px;
        padding: 0 7px;
        border-radius: 999px;
        background: #eef0ff;
        color: #5367df;
        font-size: 7.5px;
        font-weight: 900;
        letter-spacing: .055em;
        white-space: nowrap;
      }

      .receipt-forecast-active-v13 .forecast-weeks-v13 button.week-past-v15:not(.active) {
        background: #fbfcfd !important;
      }

      .receipt-forecast-active-v13 .forecast-weeks-v13 button.active {
        border-color: rgba(93,114,246,.58) !important;
        background: #f4f6ff !important;
        box-shadow: inset 3px 0 #5d72f6, 0 8px 22px rgba(93,114,246,.07) !important;
      }

      @media (max-width: 1050px) {
        .receipt-forecast-active-v13 .forecast-weeks-v13 button {
          grid-template-columns: minmax(0,1fr) minmax(0,1fr) !important;
          gap: 8px 18px !important;
        }
        .receipt-forecast-active-v13 .forecast-weeks-v13 button > small {
          justify-self: start;
          text-align: left;
        }
      }

      @media (max-width: 640px) {
        .receipt-forecast-active-v13 .forecast-weeks-v13 {
          max-height: none !important;
          padding: 7px !important;
        }
        .receipt-forecast-active-v13 .forecast-weeks-v13 button {
          grid-template-columns: 1fr !important;
          gap: 6px !important;
          padding: 14px !important;
        }
        .receipt-forecast-active-v13 .forecast-weeks-v13 button > strong {
          font-size: 16px !important;
        }
      }
    `}</style>
  );
}
