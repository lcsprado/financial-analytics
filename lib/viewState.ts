export const FORECAST_VIEW_EVENT = "financial-analytics-forecast-view-changed";

export type DashboardViewId = "overview" | "invoices" | "receipts" | "clients" | "import";

const TITLES: Record<DashboardViewId, string> = {
  overview: "Visão geral",
  invoices: "Emissões",
  receipts: "Recebimentos",
  clients: "Clientes",
  import: "Importação",
};

export function resolveNavigationState(view: DashboardViewId, forecastActive: boolean) {
  return {
    title: forecastActive ? "Previsão de Recebimentos" : TITLES[view],
    activeItem: forecastActive ? "forecast" : view,
  } as const;
}

export function forecastViewEvent(active: boolean) {
  return new CustomEvent<{ active: boolean }>(FORECAST_VIEW_EVENT, { detail: { active } });
}
