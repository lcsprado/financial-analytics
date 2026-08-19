import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = "https://mnzzulllazckqinudgoc.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_f8CrCRfwhhx1e3T9B7bp7Q_9p0zDBJL";

type SandboxRole = "admin" | "updater" | "viewer";
type ManagedUser = {
  email: string;
  display_name: string;
  role: SandboxRole;
  active: boolean;
  must_change_password: boolean;
  last_access_at: string | null;
  created_at: string;
  updated_at: string;
};
type AdminAuthResult =
  | { user: { id?: string; email?: string }; token: string }
  | { failure: string; status: number };

const VALID_ROLES = new Set<SandboxRole>(["admin", "updater", "viewer"]);
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

async function authenticateAdmin(request: NextRequest, key: string): Promise<AdminAuthResult> {
  const token = bearerToken(request);
  if (!token) return { failure: "Sessão não informada.", status: 401 };

  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!userResponse.ok) return { failure: "Sessão inválida ou expirada.", status: 401 };

  const authUser = await userResponse.json() as { id?: string; email?: string };
  if (!authUser.id) return { failure: "Usuário não identificado.", status: 401 };

  const profileResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/dashboard_test_profiles?user_id=eq.${encodeURIComponent(authUser.id)}&select=role&limit=1`,
    { headers: serviceHeaders(key), cache: "no-store" },
  );
  if (!profileResponse.ok) return { failure: "Não foi possível validar o administrador.", status: 500 };
  const profiles = await profileResponse.json() as Array<{ role: SandboxRole }>;
  if (profiles[0]?.role !== "admin") return { failure: "Somente administradores podem gerenciar usuários.", status: 403 };
  return { user: authUser, token };
}

async function fetchAllowedUser(email: string, key: string) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/dashboard_test_allowed_users?email=eq.${encodeURIComponent(email)}&select=*&limit=1`,
    { headers: serviceHeaders(key), cache: "no-store" },
  );
  if (!response.ok) throw new Error("Não foi possível consultar o usuário autorizado.");
  const rows = await response.json() as ManagedUser[];
  return rows[0] ?? null;
}

async function findAuthUserByEmail(email: string, key: string) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers: serviceHeaders(key),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Não foi possível consultar os usuários de autenticação.");
  const payload = await response.json() as { users?: Array<{ id: string; email?: string }> };
  return (payload.users ?? []).find((user) => user.email?.toLowerCase() === email) ?? null;
}

function generateTemporaryPassword() {
  const bytes = randomBytes(2);
  const number = ((bytes[0] << 8) + bytes[1]) % 10000;
  return `Teste${String(number).padStart(4, "0")}!`;
}

async function syncProfile(user: ManagedUser, authUserId: string, key: string) {
  if (user.active) {
    await fetch(`${SUPABASE_URL}/rest/v1/dashboard_test_profiles?on_conflict=user_id`, {
      method: "POST",
      headers: { ...serviceHeaders(key), Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        user_id: authUserId,
        display_name: user.display_name,
        role: user.role,
        must_change_password: user.must_change_password,
        last_access_at: user.last_access_at,
      }),
    });
  } else {
    await fetch(`${SUPABASE_URL}/rest/v1/dashboard_test_profiles?user_id=eq.${encodeURIComponent(authUserId)}`, {
      method: "DELETE",
      headers: serviceHeaders(key),
    });
  }
}

export async function GET(request: NextRequest) {
  const key = serviceKey();
  if (!key) return error(MISSING_SECRET, 503);
  const auth = await authenticateAdmin(request, key);
  if ("failure" in auth) return error(auth.failure, auth.status);

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/dashboard_test_allowed_users?select=email,display_name,role,active,must_change_password,last_access_at,created_at,updated_at&order=display_name.asc`,
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

  const body = await request.json().catch(() => null) as { displayName?: string; email?: string; role?: SandboxRole } | null;
  const displayName = body?.displayName?.trim() ?? "";
  const email = body?.email?.trim().toLowerCase() ?? "";
  const role = body?.role;
  if (!displayName) return error("Informe o nome do usuário.", 400);
  if (!email || !email.includes("@")) return error("Informe um e-mail válido.", 400);
  if (!role || !VALID_ROLES.has(role)) return error("Selecione um perfil válido.", 400);

  try {
    if (await fetchAllowedUser(email, key)) return error("Este e-mail já está cadastrado no Dashboard.", 409);
    if (await findAuthUserByEmail(email, key)) return error("Este e-mail já existe no Supabase Auth. Para evitar misturar acessos antigos, use outro e-mail ou trate esse cadastro separadamente.", 409);

    const allowResponse = await fetch(`${SUPABASE_URL}/rest/v1/dashboard_test_allowed_users`, {
      method: "POST",
      headers: { ...serviceHeaders(key), Prefer: "return=representation" },
      body: JSON.stringify({ email, display_name: displayName, role, active: true, must_change_password: true }),
    });
    if (!allowResponse.ok) return error("Não foi possível autorizar o novo usuário.", 500);

    const temporaryPassword = generateTemporaryPassword();
    const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: "POST",
      headers: serviceHeaders(key),
      body: JSON.stringify({ email, password: temporaryPassword, email_confirm: true, user_metadata: { display_name: displayName } }),
    });
    if (!authResponse.ok) {
      await fetch(`${SUPABASE_URL}/rest/v1/dashboard_test_allowed_users?email=eq.${encodeURIComponent(email)}`, { method: "DELETE", headers: serviceHeaders(key) });
      const payload = await authResponse.json().catch(() => null) as { msg?: string; message?: string } | null;
      return error(payload?.msg || payload?.message || "Não foi possível criar o acesso no Supabase Auth.", 500);
    }

    const created = await fetchAllowedUser(email, key);
    if (!created) return error("Usuário criado, mas não foi possível recuperar o cadastro.", 500);
    return NextResponse.json({ user: created, temporaryPassword }, { status: 201 });
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
    email?: string;
    role?: SandboxRole;
    active?: boolean;
    resetTemporaryPassword?: boolean;
  } | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  if (!email) return error("Usuário não informado.", 400);
  if (body?.role !== undefined && !VALID_ROLES.has(body.role)) return error("Perfil inválido.", 400);

  const ownEmail = auth.user.email?.toLowerCase() ?? "";
  if (email === ownEmail && (body?.active === false || (body?.role && body.role !== "admin"))) {
    return error("Você não pode desativar nem remover o perfil de administrador do seu próprio acesso.", 400);
  }

  try {
    const current = await fetchAllowedUser(email, key);
    if (!current) return error("Usuário não localizado.", 404);

    if (body?.resetTemporaryPassword) {
      if (!current.active) return error("Ative o usuário antes de gerar uma nova senha temporária.", 400);
      if (!current.must_change_password) return error("A senha temporária só pode ser gerada enquanto o primeiro acesso estiver pendente.", 400);

      const authUser = await findAuthUserByEmail(email, key);
      if (!authUser) return error("Usuário não localizado no Supabase Auth.", 404);
      const temporaryPassword = generateTemporaryPassword();
      const passwordResponse = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(authUser.id)}`, {
        method: "PUT",
        headers: serviceHeaders(key),
        body: JSON.stringify({ password: temporaryPassword }),
      });
      if (!passwordResponse.ok) {
        const payload = await passwordResponse.json().catch(() => null) as { msg?: string; message?: string } | null;
        return error(payload?.msg || payload?.message || "Não foi possível redefinir a senha temporária.", 500);
      }

      const updateResponse = await fetch(`${SUPABASE_URL}/rest/v1/dashboard_test_allowed_users?email=eq.${encodeURIComponent(email)}`, {
        method: "PATCH",
        headers: { ...serviceHeaders(key), Prefer: "return=representation" },
        body: JSON.stringify({ must_change_password: true, updated_at: new Date().toISOString() }),
      });
      if (!updateResponse.ok) return error("A senha foi redefinida, mas não foi possível atualizar o primeiro acesso.", 500);
      const rows = await updateResponse.json() as ManagedUser[];
      const updated = rows[0];
      if (!updated) return error("Senha redefinida, mas não foi possível recuperar o cadastro.", 500);
      await syncProfile(updated, authUser.id, key);
      return NextResponse.json({ user: updated, temporaryPassword });
    }

    const changes: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body?.role !== undefined) changes.role = body.role;
    if (body?.active !== undefined) changes.active = body.active;

    const updateResponse = await fetch(`${SUPABASE_URL}/rest/v1/dashboard_test_allowed_users?email=eq.${encodeURIComponent(email)}`, {
      method: "PATCH",
      headers: { ...serviceHeaders(key), Prefer: "return=representation" },
      body: JSON.stringify(changes),
    });
    if (!updateResponse.ok) return error("Não foi possível atualizar o usuário.", 500);
    const updatedRows = await updateResponse.json() as ManagedUser[];
    const updated = updatedRows[0];
    if (!updated) return error("Usuário atualizado, mas não foi possível recuperar o cadastro.", 500);

    const authUser = await findAuthUserByEmail(email, key);
    if (authUser) await syncProfile(updated, authUser.id, key);
    return NextResponse.json({ user: updated });
  } catch (caught) {
    return error(caught instanceof Error ? caught.message : "Falha ao atualizar o usuário.", 500);
  }
}
