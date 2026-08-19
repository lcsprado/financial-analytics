"use client";

import type { ImportState } from "@/lib/types";

const SUPABASE_URL = "https://mnzzulllazckqinudgoc.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_f8CrCRfwhhx1e3T9B7bp7Q_9p0zDBJL";
const SESSION_KEY = "financial-analytics-sandbox-session-v1";

export type SandboxRole = "admin" | "updater" | "viewer";

export type SandboxSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: {
    id: string;
    email?: string;
  };
};

export type SandboxProfile = {
  user_id: string;
  display_name: string | null;
  role: SandboxRole;
};

export type SandboxSnapshot = {
  id: string;
  created_at: string;
  uploaded_by: string;
  uploaded_by_name: string | null;
  invoice_file_name: string | null;
  receipt_file_name: string | null;
  invoices: ImportState["invoices"];
  receipts: ImportState["receipts"];
  receipt_channels: unknown[];
  metadata: Record<string, unknown>;
  note: string | null;
};

function headers(accessToken?: string) {
  return {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

function persistSession(session: SandboxSession | null) {
  if (typeof window === "undefined") return;
  if (!session) window.localStorage.removeItem(SESSION_KEY);
  else window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function readSandboxSession() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) as SandboxSession : null;
  } catch {
    return null;
  }
}

export async function signInSandbox(email: string, password: string) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ email, password }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error_description || payload?.msg || "Não foi possível entrar.");

  const session: SandboxSession = {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + Number(payload.expires_in || 3600),
    user: payload.user,
  };
  persistSession(session);
  return session;
}

export function signOutSandbox() {
  persistSession(null);
}

export async function getValidSandboxSession() {
  const current = readSandboxSession();
  if (!current) return null;
  if (current.expires_at > Math.floor(Date.now() / 1000) + 60) return current;

  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ refresh_token: current.refresh_token }),
  });
  if (!response.ok) {
    persistSession(null);
    return null;
  }
  const payload = await response.json();
  const refreshed: SandboxSession = {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token ?? current.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + Number(payload.expires_in || 3600),
    user: payload.user ?? current.user,
  };
  persistSession(refreshed);
  return refreshed;
}

export async function loadSandboxProfile(session: SandboxSession) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/dashboard_test_profiles?user_id=eq.${encodeURIComponent(session.user.id)}&select=user_id,display_name,role&limit=1`,
    { headers: headers(session.access_token) },
  );
  if (!response.ok) throw new Error("Usuário autenticado, mas sem acesso ao sandbox.");
  const rows = await response.json() as SandboxProfile[];
  return rows[0] ?? null;
}

export async function loadCurrentSandboxSnapshot(session: SandboxSession) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/dashboard_test_current_snapshot?select=*&limit=1`,
    { headers: headers(session.access_token), cache: "no-store" },
  );
  if (!response.ok) throw new Error("Não foi possível carregar a base compartilhada.");
  const rows = await response.json() as SandboxSnapshot[];
  return rows[0] ?? null;
}

export async function saveSandboxSnapshot({
  session,
  profile,
  data,
  receiptChannels,
  note,
}: {
  session: SandboxSession;
  profile: SandboxProfile;
  data: ImportState;
  receiptChannels: unknown[];
  note?: string;
}) {
  if (profile.role === "viewer") throw new Error("Seu perfil é somente consulta.");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/dashboard_test_snapshots`, {
    method: "POST",
    headers: {
      ...headers(session.access_token),
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      uploaded_by: session.user.id,
      invoice_file_name: data.invoiceFileName ?? null,
      receipt_file_name: data.receiptFileName ?? null,
      invoices: data.invoices,
      receipts: data.receipts,
      receipt_channels: receiptChannels,
      metadata: {
        invoice_count: data.invoices.length,
        receipt_count: data.receipts.length,
        source: "financial-analytics-test",
      },
      note: note ?? null,
    }),
  });
  if (!response.ok) {
    const payload = await response.text();
    throw new Error(payload || "Não foi possível publicar a base compartilhada.");
  }
}
