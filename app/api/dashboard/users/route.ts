import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = "https://mnzzulllazckqinudgoc.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_f8CrCRfwhhx1e3T9B7bp7Q_9p0zDBJL";
const PROTECTED_OWNER_EMAIL = "lcsprado4@gmail.com";
const TEMPORARY_PASSWORD = "1234";
const USER_SELECT = "email,display_name,role,active,must_change_password,last_access_at,refresh_requested_at,created_at,updated_at";

type DashboardRole = "admin" | "updater" | "viewer";
type ManagedUser = {
  email: string;
  display_name: string;
  role: DashboardRole;
  active: boolean;
  must_change_password: boolean;
  last_access_at: string | null;
  refresh_requested_at: string | null;
  created_at: string;
  updated_at: string;
};
type AuthUser = { id: string; email?: string };
type AdminAuthResult =
  | { user: AuthUser }
  | { failure: string; status: number };

const VALID_ROLES = new Set<DashboardRole>(["admin", "updater", "viewer"]);
const MISSING_SECRET = "SUPABASE_SECRET_KEY não configurada no ambiente Preview.";

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

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function authenticateAdmin(request: NextRequest, key: string): Promise<AdminAuthResult> {
  const token = bearerToken(request);
  if (!token) return { failure: "Sessão não informada.", status: 401 };

  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!userResponse.ok) return { failure: "Sessão inválida ou expirada.", status: 401 };

  const authUser = await userResponse.json() as Partial<AuthUser>;
  if (!authUser.id) return { failure: "Usuário não identificado.", status: 401 };

  const profileResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/dashboard_prod_profiles?user_id=eq.${encodeURIComponent(authUser.id)}&select=role&limit=1`,
    { headers: serviceHeaders(key), cache: "no-store" },
  );
  if (!profileResponse.ok) return { failure: "Não foi possível validar o administrador.", status: 500 };

  const profiles = await profileResponse.json() as Array<{ role: DashboardRole }>;
  if (profiles[0]?.role !== "admin") {
    return { failure: "Somente administradores podem gerenciar usuários.", status: 403 };
  }

  return { user: { id: authUser.id, email: authUser.email } };
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

async function syncProfile(user: ManagedUser, authUserId: string, key: string) {
  const response = user.active
    ? await fetch(`${SUPABASE_URL}/rest/v1/dashboard_prod_profiles?on_conflict=user_id`, {
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
    })
    : await fetch(`${SUPABASE_URL}/rest/v1/dashboard_prod_profiles?user_id=eq.${encodeURIComponent(authUserId)}`, {
      method: "DELETE",
      headers: serviceHeaders(key),
    });

  if (!response.ok) throw new Error("Não foi possível sincronizar o perfil do usuário.");
}

async function removeAllowedUser(email: string, key: string) {
  return fetch(`${SUPABASE_URL}/rest/v1/dashboard_prod_allowed_users?email=eq.${encodeURIComponent(email)}`, {
    method: "DELETE",
    headers: serviceHeaders(key),
  });
}

async function resetExistingAuthUser(authUserId: string, key: string) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(authUserId)}`, {
    method: "PUT",
    headers: serviceHeaders(key),
    body: JSON.stringify({ password: TEMPORARY_PASSWORD }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { msg?: string; message?: string } | null;
    throw new Error(payload?.msg || payload?.message || "Não foi possível preparar o acesso existente com a senha temporária.");
  }
}

export async function GET(request: NextRequest) {
  const key = serviceKey();
  if (!key) return error(MISSING_SECRET, 503);
  const auth = await authenticateAdmin(request, key);
  if ("failure" in auth) return error(auth.failure, auth.status);

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/dashboard_prod_allowed_users?select=${USER_SELECT}&order=display_name.asc`,
    { headers: serviceHeaders(key), cache: "no-store" },
  );
  if (!response.ok) return error("Não foi possível listar os usuários do Dashboard.", 500);
  return NextResponse.json({ users: await response.json() as ManagedUser[] });
}

export async function POST(request: NextRequest) {
  const key = serviceKey();
  if (!key) return error(MISSING_SECRET, 503);
  const auth = await authenticateAdmin(request, key);
  if ("failure" in auth) return error(auth.failure, auth.status);

  const body = await request.json().catch(() => null) as {
    displayName?: unknown;
    email?: unknown;
    role?: unknown;
  } | null;
  const displayName = typeof body?.displayName === "string" ? body.displayName.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = body?.role;

  if (!displayName) return error("Informe o nome do usuário.", 400);
  if (!isValidEmail(email)) return error("Informe um e-mail válido.", 400);
  if (typeof role !== "string" || !VALID_ROLES.has(role as DashboardRole)) {
    return error("Selecione um perfil válido.", 400);
  }

  try {
    if (await fetchAllowedUser(email, key)) return error("Este e-mail já está cadastrado no Dashboard.", 409);
    const existingAuthUser = await findAuthUserByEmail(email, key);

    const allowResponse = await fetch(`${SUPABASE_URL}/rest/v1/dashboard_prod_allowed_users`, {
      method: "POST",
      headers: { ...serviceHeaders(key), Prefer: "return=representation" },
      body: JSON.stringify({
        email,
        display_name: displayName,
        role,
        active: true,
        must_change_password: true,
      }),
    });
    if (!allowResponse.ok) return error("Não foi possível autorizar o novo usuário.", 500);

    const allowedRows = await allowResponse.json() as ManagedUser[];
    const created = allowedRows[0];
    if (!created) {
      await removeAllowedUser(email, key);
      return error("Não foi possível recuperar o cadastro autorizado.", 500);
    }

    let authUserId = existingAuthUser?.id ?? null;
    let reusedAuthUser = false;

    if (existingAuthUser) {
      try {
        await resetExistingAuthUser(existingAuthUser.id, key);
        reusedAuthUser = true;
      } catch (caught) {
        await removeAllowedUser(email, key);
        throw caught;
      }
    } else {
      const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: "POST",
        headers: serviceHeaders(key),
        body: JSON.stringify({
          email,
          password: TEMPORARY_PASSWORD,
          email_confirm: true,
          user_metadata: { display_name: displayName },
        }),
      });
      if (!authResponse.ok) {
        await removeAllowedUser(email, key);
        const payload = await authResponse.json().catch(() => null) as { msg?: string; message?: string } | null;
        return error(payload?.msg || payload?.message || "Não foi possível criar o acesso no Supabase Auth.", 500);
      }

      const createdAuthPayload = await authResponse.json().catch(() => null) as (Partial<AuthUser> & { user?: Partial<AuthUser> }) | null;
      authUserId = createdAuthPayload?.id
        ?? createdAuthPayload?.user?.id
        ?? (await findAuthUserByEmail(email, key))?.id
        ?? null;
    }

    if (!authUserId) {
      await removeAllowedUser(email, key);
      return error("Usuário criado, mas não foi possível identificar o acesso no Supabase Auth.", 500);
    }

    try {
      await syncProfile(created, authUserId, key);
    } catch (caught) {
      await removeAllowedUser(email, key);
      throw caught;
    }

    return NextResponse.json({ user: created, temporaryPassword: TEMPORARY_PASSWORD, reusedAuthUser }, { status: 201 });
  } catch (caught) {
    return error(caught instanceof Error ? caught.message : "Falha ao criar o usuário.", 500);
  }
}

export async function PATCH(request: NextRequest) {
  const key = serviceKey();
  if (!key) return error(MISSING_SECRET, 503);
  const auth = await authenticateAdmin(request, key);
  if ("failure" in auth) return error(auth.failure, auth.status);

  const body = await request.json().catch(() => null) as {
    email?: unknown;
    role?: unknown;
    active?: unknown;
    resetTemporaryPassword?: unknown;
    refreshDashboard?: unknown;
  } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const hasRole = body?.role !== undefined;
  const hasActive = body?.active !== undefined;
  const resetTemporaryPassword = body?.resetTemporaryPassword === true;
  const refreshDashboard = body?.refreshDashboard === true;

  if (!email) return error("Usuário não informado.", 400);
  if (hasRole && (typeof body?.role !== "string" || !VALID_ROLES.has(body.role as DashboardRole))) {
    return error("Perfil inválido.", 400);
  }
  if (hasActive && typeof body?.active !== "boolean") return error("Status inválido.", 400);
  if (resetTemporaryPassword && refreshDashboard) return error("Informe apenas uma operação por vez.", 400);
  if (!hasRole && !hasActive && !resetTemporaryPassword && !refreshDashboard) {
    return error("Nenhuma alteração foi informada.", 400);
  }

  const ownEmail = auth.user.email?.toLowerCase() ?? "";
  const isOwner = email === PROTECTED_OWNER_EMAIL;
  const isSelf = email === ownEmail;

  if (isOwner && body?.active === false) {
    return error("O acesso principal do proprietário não pode ser desativado.", 403);
  }
  if (isOwner && hasRole && body?.role !== "admin") {
    return error("O acesso principal do proprietário deve permanecer administrador.", 403);
  }
  if (isOwner && !isSelf && (resetTemporaryPassword || refreshDashboard)) {
    return error("A senha e a atualização do proprietário não podem ser alteradas por outro administrador.", 403);
  }
  if (isSelf && (body?.active === false || (hasRole && body?.role !== "admin"))) {
    return error("Você não pode desativar nem remover o perfil de administrador do seu próprio acesso.", 400);
  }

  try {
    const current = await fetchAllowedUser(email, key);
    if (!current) return error("Usuário não localizado.", 404);

    const authUser = await findAuthUserByEmail(email, key);
    if (!authUser) return error("Usuário não localizado no Supabase Auth.", 404);

    if (refreshDashboard) {
      if (!current.active) return error("Ative o usuário antes de solicitar a atualização do Dashboard.", 400);
      const requestedAt = new Date().toISOString();
      const updateResponse = await fetch(`${SUPABASE_URL}/rest/v1/dashboard_prod_allowed_users?email=eq.${encodeURIComponent(email)}`, {
        method: "PATCH",
        headers: { ...serviceHeaders(key), Prefer: "return=representation" },
        body: JSON.stringify({ refresh_requested_at: requestedAt, updated_at: requestedAt }),
      });
      if (!updateResponse.ok) return error("Não foi possível solicitar a atualização do Dashboard.", 500);

      const rows = await updateResponse.json() as ManagedUser[];
      const updated = rows[0];
      if (!updated) return error("Atualização solicitada, mas não foi possível recuperar o cadastro.", 500);
      await syncProfile(updated, authUser.id, key);
      return NextResponse.json({ user: updated, refreshRequestedAt: requestedAt });
    }

    if (resetTemporaryPassword) {
      if (!current.active) return error("Ative o usuário antes de gerar uma nova senha temporária.", 400);

      const passwordResponse = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(authUser.id)}`, {
        method: "PUT",
        headers: serviceHeaders(key),
        body: JSON.stringify({ password: TEMPORARY_PASSWORD }),
      });
      if (!passwordResponse.ok) {
        const payload = await passwordResponse.json().catch(() => null) as { msg?: string; message?: string } | null;
        return error(payload?.msg || payload?.message || "Não foi possível redefinir a senha temporária.", 500);
      }

      const updatedAt = new Date().toISOString();
      const updateResponse = await fetch(`${SUPABASE_URL}/rest/v1/dashboard_prod_allowed_users?email=eq.${encodeURIComponent(email)}`, {
        method: "PATCH",
        headers: { ...serviceHeaders(key), Prefer: "return=representation" },
        body: JSON.stringify({ must_change_password: true, updated_at: updatedAt }),
      });
      if (!updateResponse.ok) return error("A senha foi redefinida, mas não foi possível atualizar o primeiro acesso.", 500);

      const rows = await updateResponse.json() as ManagedUser[];
      const updated = rows[0];
      if (!updated) return error("Senha redefinida, mas não foi possível recuperar o cadastro.", 500);
      await syncProfile(updated, authUser.id, key);
      return NextResponse.json({ user: updated, temporaryPassword: TEMPORARY_PASSWORD });
    }

    const changes: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (hasRole) changes.role = body?.role;
    if (hasActive) changes.active = body?.active;

    const updateResponse = await fetch(`${SUPABASE_URL}/rest/v1/dashboard_prod_allowed_users?email=eq.${encodeURIComponent(email)}`, {
      method: "PATCH",
      headers: { ...serviceHeaders(key), Prefer: "return=representation" },
      body: JSON.stringify(changes),
    });
    if (!updateResponse.ok) return error("Não foi possível atualizar o usuário.", 500);

    const updatedRows = await updateResponse.json() as ManagedUser[];
    const updated = updatedRows[0];
    if (!updated) return error("Usuário atualizado, mas não foi possível recuperar o cadastro.", 500);
    await syncProfile(updated, authUser.id, key);
    return NextResponse.json({ user: updated });
  } catch (caught) {
    return error(caught instanceof Error ? caught.message : "Falha ao atualizar o usuário.", 500);
  }
}
