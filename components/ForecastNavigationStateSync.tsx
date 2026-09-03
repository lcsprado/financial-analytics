"use client";

import { useEffect } from "react";
import { forecastViewEvent } from "@/lib/viewState";

const FORECAST_ACTIVE_CLASS = "receipt-forecast-active-v13";

export default function ForecastNavigationStateSync() {
  useEffect(() => {
    const syncForecastState = () => {
      window.dispatchEvent(
        forecastViewEvent(document.body.classList.contains(FORECAST_ACTIVE_CLASS)),
      );
    };

    syncForecastState();

    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.attributeName === "class")) {
        syncForecastState();
      }
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  return null;
}
