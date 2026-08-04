"use client";

import { useEffect, useRef } from "react";

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

function currentFilterScope() {
  return document
    .querySelector<HTMLElement>(".topbar-title h1")
    ?.textContent
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase() || "GERAL";
}

export default function ClientFilterInteractionFix() {
  const scrollPositions = useRef<Record<string, number>>({});

  useEffect(() => {
    const handleGlobalClear = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(".clear-filter")) return;
      clearSearchInput();
    };

    document.addEventListener("mousedown", handleGlobalClear, true);
    return () => document.removeEventListener("mousedown", handleGlobalClear, true);
  }, []);

  useEffect(() => {
    const listeners = new Map<HTMLElement, EventListener>();

    const attachList = (list: HTMLElement) => {
      if (listeners.has(list)) return;

      const scope = currentFilterScope();
      const handleScroll: EventListener = () => {
        scrollPositions.current[scope] = list.scrollTop;
      };

      list.addEventListener("scroll", handleScroll, { passive: true });
      listeners.set(list, handleScroll);

      const restore = () => {
        if (!list.isConnected) return;
        list.scrollTop = scrollPositions.current[scope] ?? 0;
      };

      restore();
      window.requestAnimationFrame(() => {
        restore();
        window.requestAnimationFrame(restore);
      });
    };

    const syncLists = () => {
      for (const [list, listener] of listeners) {
        if (list.isConnected) continue;
        list.removeEventListener("scroll", listener);
        listeners.delete(list);
      }

      document
        .querySelectorAll<HTMLElement>(".multi-client-list")
        .forEach(attachList);
    };

    syncLists();
    const observer = new MutationObserver(syncLists);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      listeners.forEach((listener, list) => {
        list.removeEventListener("scroll", listener);
      });
      listeners.clear();
    };
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
