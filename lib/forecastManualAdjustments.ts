export type ForecastAdjustmentType = "exclude" | "move" | "confirm" | "manual_add";

export type ForecastManualAdjustment = {
  id: string;
  month_key: string;
  source_key: string;
  client_key: string;
  client_name: string;
  adjustment_type: ForecastAdjustmentType;
  original_week_id: string | null;
  target_week_id: string | null;
  confirmed_value: number | null;
  manual_value: number | null;
  manual_date: string | null;
  note: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type NewForecastManualAdjustment = Omit<
  ForecastManualAdjustment,
  "id" | "active" | "created_at" | "updated_at"
>;

const SUPABASE_URL = "https://mnzzulllazckqinudgoc.supabase.co";
const SUPABASE_KEY = "sb_publishable_f8CrCRfwhhx1e3T9B7bp7Q_9p0zDBJL";
const TABLE = "forecast_manual_adjustments_prod";

function headers(prefer?: string) {
  return {
    apikey: SUPABASE_KEY,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

async function parseError(response: Response) {
  const body = await response.text();
  throw new Error(body || `Supabase respondeu ${response.status}`);
}

export async function listForecastAdjustments(monthKey: string) {
  const query = new URLSearchParams({
    select: "*",
    month_key: `eq.${monthKey}`,
    order: "created_at.asc",
  });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?${query.toString()}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as ForecastManualAdjustment[];
}

async function deactivatePrevious(adjustment: NewForecastManualAdjustment) {
  if (adjustment.adjustment_type === "manual_add") return;
  const query = new URLSearchParams({
    month_key: `eq.${adjustment.month_key}`,
    source_key: `eq.${adjustment.source_key}`,
    adjustment_type: `eq.${adjustment.adjustment_type}`,
    active: "eq.true",
  });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?${query.toString()}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ active: false, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) await parseError(response);
}

export async function createForecastAdjustment(adjustment: NewForecastManualAdjustment) {
  await deactivatePrevious(adjustment);
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
    method: "POST",
    headers: headers("return=representation"),
    body: JSON.stringify({ ...adjustment, active: true }),
  });
  if (!response.ok) await parseError(response);
  const rows = (await response.json()) as ForecastManualAdjustment[];
  return rows[0];
}

export async function restoreForecastAdjustment(id: string) {
  const query = new URLSearchParams({ id: `eq.${id}` });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?${query.toString()}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ active: false, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) await parseError(response);
}
