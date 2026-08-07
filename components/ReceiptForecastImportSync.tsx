"use client";

import { useEffect } from "react";
import { ANALYSIS_DATA_EVENT } from "@/lib/offlineStorage";

export default function ReceiptForecastImportSync() {
  useEffect(() => {
    const handleImport = () => {
      const timers = [80, 250, 600].map((delay) => window.setTimeout(() => {
        document.dispatchEvent(new Event("change", { bubbles: true }));
      }, delay));

      return () => timers.forEach((timer) => window.clearTimeout(timer));
    };

    const onData = () => {
      handleImport();
    };

    window.addEventListener(ANALYSIS_DATA_EVENT, onData);
    return () => window.removeEventListener(ANALYSIS_DATA_EVENT, onData);
  }, []);

  return null;
}
