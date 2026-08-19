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
  must_change_password: boolean;
  last_access_at: string | null;
};

export type SandboxManagedUser = {
  email: string;
  display_name: string;
  role: SandboxRole;
  active: boolean;
  must_change_password: boolean;
  last_access_at: string | null;
  created_at: string;
  updated_at: string;
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

function sessionFromPayload(payload: any): SandboxSession {
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + Number(payload.expires_in || 3600),
    user: payload.user,
  };
}

export async function signInSandbox(email: string, password: string) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ email, password }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error_description || payload?.msg || "Não foi possível entrar.");

  const session = sessionFromPayload(payload);
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
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/dashboard_test_mark_access`, {
    method: "POST",
    headers: headers(session.access_token),
    body: "{}",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Usuário autenticado, mas sem acesso ao sandbox.");
  const rows = await response.json() as SandboxProfile[];
  return rows[0] ?? null;
}

export async function checkSandboxAccess(session: SandboxSession) {
  const query = new URLSearchParams({
    user_id: `eq.${session.user.id}`,
    select: "user_id,display_name,role,must_change_password,last_access_at",
    limit: "1",
  });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/dashboard_test_profiles?${query.toString()}`, {
    headers: headers(session.access_token),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Não foi possível revalidar seu acesso.");
  const rows = await response.json() as SandboxProfile[];
  return rows[0] ?? null;
}

export async function updateSandboxPassword(session: SandboxSession, password: string) {
  if (password.length < 8) throw new Error("A nova senha precisa ter pelo menos 8 caracteres.");

  const passwordResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: "PUT",
    headers: headers(session.access_token),
    body: JSON.stringify({ password }),
  });
  const passwordPayload = await passwordResponse.json().catch(() => null);
  if (!passwordResponse.ok) {
    throw new Error(passwordPayload?.msg || passwordPayload?.message || "Não foi possível alterar a senha.");
  }

  const finishResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/dashboard_test_finish_password_change`, {
    method: "POST",
    headers: headers(session.access_token),
    body: "{}",
  });
  if (!finishResponse.ok) {
    throw new Error("A senha foi alterada, mas não foi possível concluir o primeiro acesso. Entre novamente.");
  }
}

async function adminApi(session: SandboxSession, init?: RequestInit) {
  const response = await fetch("/api/dashboard-test/users", {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || "Não foi possível concluir a operação de usuários.");
  return payload;
}

export async function listSandboxUsers(session: SandboxSession) {
  const payload = await adminApi(session);
  return (payload.users ?? []) as SandboxManagedUser[];
}

export async function createSandboxUser(
  session: SandboxSession,
  input: { displayName: string; email: string; role: SandboxRole },
) {
  return adminApi(session, {
    method: "POST",
    body: JSON.stringify(input),
  }) as Promise<{ user: SandboxManagedUser; temporaryPassword: string }>;
}

export async function updateSandboxManagedUser(
  session: SandboxSession,
  input: { email: string; role?: SandboxRole; active?: boolean },
) {
  return adminApi(session, {
    method: "PATCH",
    body: JSON.stringify(input),
  }) as Promise<{ user: SandboxManagedUser }>;
}

export async function resetSandboxTemporaryPassword(session: SandboxSession, email: string) {
  return adminApi(session, {
    method: "PATCH",
    body: JSON.stringify({ email, resetTemporaryPassword: true }),
  }) as Promise<{ user: SandboxManagedUser; temporaryPassword: string }>;
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
