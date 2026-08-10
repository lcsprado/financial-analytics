export type ForecastPredictionOutcome =
  | "pending"
  | "received_on_time"
  | "received_early"
  | "received_late"
  | "partial_on_time"
  | "partial_early"
  | "partial_late";

export type ForecastPredictionSnapshot = {
  month_key: string;
  source_key: string;
  client_key: string;
  client_name: string;
  predicted_week_id: string;
  predicted_date: string;
  predicted_value: number;
  confidence: string;
  active_months: number;
  actual_value: number;
  actual_dates: string[];
  outcome: ForecastPredictionOutcome;
  date_error_days: number | null;
  value_error_ratio: number | null;
  current_predicted_week_id: string;
  current_predicted_date: string;
  current_predicted_value: number;
};

export type ForecastPredictionHistoryRow = ForecastPredictionSnapshot & {
  id: string;
  first_predicted_at: string;
  last_evaluated_at: string;
  updated_at: string;
};

const SUPABASE_URL = "https://mnzzulllazckqinudgoc.supabase.co";
const SUPABASE_KEY = "sb_publishable_f8CrCRfwhhx1e3T9B7bp7Q_9p0zDBJL";
const TABLE = "forecast_prediction_history";

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

export async function syncForecastPredictionHistory(rows: ForecastPredictionSnapshot[]) {
  if (!rows.length) return;
  const now = new Date().toISOString();
  const payload = rows.map((row) => ({
    ...row,
    last_evaluated_at: now,
    updated_at: now,
  }));
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${TABLE}?on_conflict=month_key,source_key`,
    {
      method: "POST",
      headers: headers("resolution=merge-duplicates,return=minimal"),
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) await parseError(response);
}

export async function listForecastPredictionHistory(limit = 500) {
  const query = new URLSearchParams({
    select: "*",
    order: "predicted_date.desc",
    limit: String(limit),
  });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?${query.toString()}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as ForecastPredictionHistoryRow[];
}
