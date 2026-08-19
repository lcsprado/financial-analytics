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

const VALID_ROLES = new Set<SandboxRole>(["admin", "updater", "viewer"]);

function serviceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
}

function serviceHeaders(key: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
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
  if (!token) return { error: "Sessão não informada.", status: 401 } as const;

  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  if (!userResponse.ok) return { error: "Sessão inválida ou expirada.", status: 401 } as const;

  const authUser = await userResponse.json() as { id?: string; email?: string };
  if (!authUser.id) return { error: "Usuário não identificado.", status: 401 } as const;

  const profileResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/dashboard_test_profiles?user_id=eq.${encodeURIComponent(authUser.id)}&select=role&limit=1`,
    { headers: serviceHeaders(key), cache: "no-store" },
  );
  if (!profileResponse.ok) return { error: "Não foi possível validar o administrador.", status: 500 } as const;
  const profiles = await profileResponse.json() as Array<{ role: SandboxRole }>;
  if (profiles[0]?.role !== "admin") return { error: "Somente administradores podem gerenciar usuários.", status: 403 } as const;

  return { user: authUser, token } as const;
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
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(14);
  let password = "";
  for (const byte of bytes) password += alphabet[byte % alphabet.length];
  return `${password.slice(0, 6)}-${password.slice(6, 12)}!7`;
}

export async function GET(request: NextRequest) {
  const key = serviceKey();
  if (!key) return error("SUPABASE_SERVICE_ROLE_KEY não configurada no ambiente Preview.", 503);

  const auth = await authenticateAdmin(request, key);
  if ("error" in auth) return error(auth.error, auth.status);

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/dashboard_test_allowed_users?select=email,display_name,role,active,must_change_password,last_access_at,created_at,updated_at&order=display_name.asc`,
    { headers: serviceHeaders(key), cache: "no-store" },
  );
  if (!response.ok) return error("Não foi possível listar os usuários do Dashboard.", 500);
  const users = await response.json() as ManagedUser[];
  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  const key = serviceKey();
  if (!key) return error("SUPABASE_SERVICE_ROLE_KEY não configurada no ambiente Preview.", 503);

  const auth = await authenticateAdmin(request, key);
  if ("error" in auth) return error(auth.error, auth.status);

  const body = await request.json().catch(() => null) as {
    displayName?: string;
    email?: string;
    role?: SandboxRole;
  } | null;
  const displayName = body?.displayName?.trim() ?? "";
  const email = body?.email?.trim().toLowerCase() ?? "";
  const role = body?.role;

  if (!displayName) return error("Informe o nome do usuário.", 400);
  if (!email || !email.includes("@")) return error("Informe um e-mail válido.", 400);
  if (!role || !VALID_ROLES.has(role)) return error("Selecione um perfil válido.", 400);

  try {
    if (await fetchAllowedUser(email, key)) return error("Este e-mail já está cadastrado no Dashboard.", 409);
    if (await findAuthUserByEmail(email, key)) {
      return error("Este e-mail já existe no Supabase Auth. Para evitar misturar acessos antigos, use outro e-mail ou trate esse cadastro separadamente.", 409);
    }

    const allowResponse = await fetch(`${SUPABASE_URL}/rest/v1/dashboard_test_allowed_users`, {
      method: "POST",
      headers: {
        ...serviceHeaders(key),
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        email,
        display_name: displayName,
        role,
        active: true,
        must_change_password: true,
      }),
    });
    if (!allowResponse.ok) return error("Não foi possível autorizar o novo usuário.", 500);

    const temporaryPassword = generateTemporaryPassword();
    const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: "POST",
      headers: serviceHeaders(key),
      body: JSON.stringify({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: { display_name: displayName },
      }),
    });

    if (!authResponse.ok) {
      await fetch(`${SUPABASE_URL}/rest/v1/dashboard_test_allowed_users?email=eq.${encodeURIComponent(email)}`, {
        method: "DELETE",
        headers: serviceHeaders(key),
      });
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
  if (!key) return error("SUPABASE_SERVICE_ROLE_KEY não configurada no ambiente Preview.", 503);

  const auth = await authenticateAdmin(request, key);
  if ("error" in auth) return error(auth.error, auth.status);

  const body = await request.json().catch(() => null) as {
    email?: string;
    role?: SandboxRole;
    active?: boolean;
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

    const changes: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body?.role !== undefined) changes.role = body.role;
    if (body?.active !== undefined) changes.active = body.active;

    const updateResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/dashboard_test_allowed_users?email=eq.${encodeURIComponent(email)}`,
      {
        method: "PATCH",
        headers: { ...serviceHeaders(key), Prefer: "return=representation" },
        body: JSON.stringify(changes),
      },
    );
    if (!updateResponse.ok) return error("Não foi possível atualizar o usuário.", 500);
    const updatedRows = await updateResponse.json() as ManagedUser[];
    const updated = updatedRows[0];
    if (!updated) return error("Usuário atualizado, mas não foi possível recuperar o cadastro.", 500);

    const authUser = await findAuthUserByEmail(email, key);
    if (authUser) {
      if (updated.active) {
        await fetch(`${SUPABASE_URL}/rest/v1/dashboard_test_profiles?on_conflict=user_id`, {
          method: "POST",
          headers: {
            ...serviceHeaders(key),
            Prefer: "resolution=merge-duplicates,return=minimal",
          },
          body: JSON.stringify({
            user_id: authUser.id,
            display_name: updated.display_name,
            role: updated.role,
            must_change_password: updated.must_change_password,
            last_access_at: updated.last_access_at,
          }),
        });
      } else {
        await fetch(`${SUPABASE_URL}/rest/v1/dashboard_test_profiles?user_id=eq.${encodeURIComponent(authUser.id)}`, {
          method: "DELETE",
          headers: serviceHeaders(key),
        });
      }
    }

    return NextResponse.json({ user: updated });
  } catch (caught) {
    return error(caught instanceof Error ? caught.message : "Falha ao atualizar o usuário.", 500);
  }
}
