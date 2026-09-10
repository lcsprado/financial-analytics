import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = "https://mnzzulllazckqinudgoc.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_f8CrCRfwhhx1e3T9B7bp7Q_9p0zDBJL";
const PROTECTED_OWNER_EMAIL = "lcsprado4@gmail.com";

type AuthUser = { id: string; email?: string };

type ManagedUser = {
  email: string;
  display_name: string;
  role: "admin" | "updater" | "viewer";
  active: boolean;
  must_change_password: boolean;
  last_access_at: string | null;
  refresh_requested_at: string | null;
  created_at: string;
  updated_at: string;
};

const USER_SELECT = "email,display_name,role,active,must_change_password,last_access_at,refresh_requested_at,created_at,updated_at";

function serviceKey() {
  return process.env.SUPABASE_SECRET_KEY?.trim()
    || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    || "";
}

function serviceHeaders(key: string) {
  return {
    apikey: key,
    ...(key.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${key}` }),
    "Content-Type": "application/json",
  };
}

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

async function authenticateAdmin(request: NextRequest, key: string) {
  const token = bearerToken(request);
  if (!token) return { failure: "Sessão não informada.", status: 401 } as const;

  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!userResponse.ok) return { failure: "Sessão inválida ou expirada.", status: 401 } as const;

  const authUser = await userResponse.json() as Partial<AuthUser>;
  if (!authUser.id) return { failure: "Usuário não identificado.", status: 401 } as const;

  const profileResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/dashboard_prod_profiles?user_id=eq.${encodeURIComponent(authUser.id)}&select=role&limit=1`,
    { headers: serviceHeaders(key), cache: "no-store" },
  );
  if (!profileResponse.ok) return { failure: "Não foi possível validar o administrador.", status: 500 } as const;

  const profiles = await profileResponse.json() as Array<{ role: string }>;
  if (profiles[0]?.role !== "admin") return { failure: "Somente administradores podem gerenciar usuários.", status: 403 } as const;

  return { user: { id: authUser.id, email: authUser.email } } as const;
}

async function fetchAllowedUser(email: string, key: string) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/dashboard_prod_allowed_users?email=eq.${encodeURIComponent(email)}&select=${USER_SELECT}&limit=1`,
    { headers: serviceHeaders(key), cache: "no-store" },
  );
  if (!response.ok) throw new Error("Não foi possível consultar o usuário autorizado.");
  const rows = await response.json() as ManagedUser[];
  return rows[0] ?? null;
}

async function findAuthUserByEmail(email: string, key: string) {
  const perPage = 1000;
  for (let page = 1; page <= 100; page += 1) {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=${perPage}`, {
      headers: serviceHeaders(key),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Não foi possível consultar os usuários de autenticação.");
    const payload = await response.json() as { users?: AuthUser[] };
    const users = payload.users ?? [];
    const found = users.find((user) => user.email?.toLowerCase() === email);
    if (found) return found;
    if (users.length < perPage) return null;
  }
  throw new Error("A consulta de usuários de autenticação excedeu o limite de paginação.");
}

async function restoreProfile(user: ManagedUser, authUserId: string, key: string) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/dashboard_prod_profiles?on_conflict=user_id`, {
    method: "POST",
    headers: { ...serviceHeaders(key), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      user_id: authUserId,
      display_name: user.display_name,
      role: user.role,
      must_change_password: user.must_change_password,
      last_access_at: user.last_access_at,
      refresh_requested_at: user.refresh_requested_at,
    }),
  });
  if (!response.ok) throw new Error("Não foi possível restaurar o perfil após uma falha na exclusão.");
}

export async function DELETE(request: NextRequest) {
  const key = serviceKey();
  if (!key) return error("Configuração de autenticação do servidor indisponível.", 503);

  const auth = await authenticateAdmin(request, key);
  if ("failure" in auth) return error(auth.failure, auth.status);

  const body = await request.json().catch(() => null) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) return error("Usuário não informado.", 400);

  const ownEmail = auth.user.email?.toLowerCase() ?? "";
  if (email === PROTECTED_OWNER_EMAIL) return error("O acesso principal do proprietário não pode ser excluído.", 403);
  if (email === ownEmail) return error("Você não pode excluir o seu próprio acesso administrativo.", 400);

  try {
    const current = await fetchAllowedUser(email, key);
    if (!current) return error("Usuário não localizado no Dashboard.", 404);

    const authUser = await findAuthUserByEmail(email, key);
    if (authUser) {
      const profileResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/dashboard_prod_profiles?user_id=eq.${encodeURIComponent(authUser.id)}`,
        { method: "DELETE", headers: serviceHeaders(key) },
      );
      if (!profileResponse.ok) return error("Não foi possível remover o perfil de acesso do Dashboard.", 500);
    }

    const allowResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/dashboard_prod_allowed_users?email=eq.${encodeURIComponent(email)}`,
      { method: "DELETE", headers: serviceHeaders(key) },
    );

    if (!allowResponse.ok) {
      if (authUser) await restoreProfile(current, authUser.id, key).catch(() => undefined);
      return error("Não foi possível excluir o usuário do Dashboard.", 500);
    }

    return NextResponse.json({ deleted: true, email, authAccountPreserved: Boolean(authUser) });
  } catch (caught) {
    return error(caught instanceof Error ? caught.message : "Falha ao excluir o usuário.", 500);
  }
}
