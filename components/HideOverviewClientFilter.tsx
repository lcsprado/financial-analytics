"use client";

import { useEffect } from "react";

export default function HideOverviewClientFilter() {
  useEffect(() => {
    const sync = () => {
      const title = document.querySelector<HTMLElement>(".topbar-title h1")?.textContent?.trim();
      const clientFilter = document.querySelector<HTMLElement>(".filter-bar .client-filter");
      if (!clientFilter) return;
      clientFilter.style.display = title === "Visão geral" ? "none" : "";
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
