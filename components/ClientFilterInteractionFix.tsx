"use client";

import { useEffect } from "react";

function clearSearchInput() {
  const clearButton = document.querySelector<HTMLButtonElement>(
    '.multi-client-search button[aria-label="Limpar busca"]',
  );

  if (clearButton) {
    clearButton.click();
    return;
  }

  const input = document.querySelector<HTMLInputElement>(".multi-client-search input");
  if (!input || !input.value) return;

  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;

  if (valueSetter) valueSetter.call(input, "");
  else input.value = "";

  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

export default function ClientFilterInteractionFix() {
  useEffect(() => {
    const handleGlobalClear = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(".clear-filter")) return;
      clearSearchInput();
    };

    document.addEventListener("mousedown", handleGlobalClear, true);
    return () => document.removeEventListener("mousedown", handleGlobalClear, true);
  }, []);

  return (
    <style jsx global>{`
      .client-filter .select-wrap .multi-client-navigation svg {
        position: static !important;
        inset: auto !important;
        right: auto !important;
        top: auto !important;
        transform: none !important;
        pointer-events: none !important;
      }

      .client-filter .select-wrap .multi-client-trigger.is-open > svg {
        transform: rotate(180deg) !important;
      }

      .client-filter .select-wrap .multi-client-search {
        grid-template-columns: 18px minmax(0, 1fr) auto !important;
      }

      .client-filter .select-wrap .multi-client-search input {
        position: static !important;
        width: 100% !important;
        min-width: 0 !important;
        max-width: none !important;
        height: auto !important;
        padding: 0 !important;
        margin: 0 !important;
        overflow: visible !important;
        text-overflow: clip !important;
        white-space: nowrap !important;
      }

      .client-filter .select-wrap .multi-client-search > svg {
        width: 15px !important;
        height: 15px !important;
      }
    `}</style>
  );
}
