import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const SUPABASE_URL = "https://mnzzulllazckqinudgoc.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_f8CrCRfwhhx1e3T9B7bp7Q_9p0zDBJL";
const NO_STORE = { "Cache-Control": "no-store" };

type AuthUser = { id: string; email?: string };
type ProductionProfile = { user_id: string; must_change_password: boolean };
type AllowedUser = { email: string; active: boolean; must_change_password: boolean };

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE });
}

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

export async function POST(request: NextRequest) {
  const key = serviceKey();
  if (!key) return error("Configuração de autenticação do servidor indisponível.", 503);

  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return error("Sessão não informada.", 401);

  const body = await request.json().catch(() => null) as { password?: unknown } | null;
  const password = body?.password;
  if (typeof password !== "string" || password.length < 8) {
    return error("A nova senha precisa ter pelo menos 8 caracteres.", 400);
  }

  try {
    const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!authResponse.ok) return error("Sessão inválida ou expirada.", 401);
    const authUser = await authResponse.json() as Partial<AuthUser>;
    if (!authUser.id || !authUser.email) return error("Usuário não identificado.", 401);

    const [profileResponse, allowedResponse] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/dashboard_prod_profiles?user_id=eq.${encodeURIComponent(authUser.id)}&select=user_id,must_change_password&limit=1`, {
        headers: serviceHeaders(key), cache: "no-store",
      }),
      fetch(`${SUPABASE_URL}/rest/v1/dashboard_prod_allowed_users?email=eq.${encodeURIComponent(authUser.email.toLowerCase())}&select=email,active,must_change_password&limit=1`, {
        headers: serviceHeaders(key), cache: "no-store",
      }),
    ]);
    if (!profileResponse.ok || !allowedResponse.ok) return error("Não foi possível validar o primeiro acesso.", 503);

    const profiles = await profileResponse.json() as ProductionProfile[];
    const allowedUsers = await allowedResponse.json() as AllowedUser[];
    if (!profiles[0] || !allowedUsers[0]?.active) return error("Usuário sem acesso ao Dashboard.", 403);
    if (!profiles[0].must_change_password && !allowedUsers[0].must_change_password) {
      return error("O primeiro acesso já foi concluído.", 409);
    }

    const passwordResponse = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(authUser.id)}`, {
      method: "PUT",
      headers: serviceHeaders(key),
      body: JSON.stringify({ password }),
      cache: "no-store",
    });
    if (!passwordResponse.ok) return error("Não foi possível alterar a senha. O acesso continua bloqueado.", 502);

    const allowedUpdate = await fetch(`${SUPABASE_URL}/rest/v1/dashboard_prod_allowed_users?email=eq.${encodeURIComponent(authUser.email.toLowerCase())}&active=eq.true`, {
      method: "PATCH",
      headers: { ...serviceHeaders(key), Prefer: "return=representation" },
      body: JSON.stringify({ must_change_password: false, updated_at: new Date().toISOString() }),
      cache: "no-store",
    });
    if (!allowedUpdate.ok || !(await allowedUpdate.json() as AllowedUser[]).length) {
      return error("A senha foi alterada, mas o primeiro acesso não foi concluído. Entre novamente com a nova senha e tente outra vez.", 503);
    }

    const profileUpdate = await fetch(`${SUPABASE_URL}/rest/v1/dashboard_prod_profiles?user_id=eq.${encodeURIComponent(authUser.id)}&must_change_password=eq.true`, {
      method: "PATCH",
      headers: { ...serviceHeaders(key), Prefer: "return=representation" },
      body: JSON.stringify({ must_change_password: false, updated_at: new Date().toISOString() }),
      cache: "no-store",
    });
    if (!profileUpdate.ok || !(await profileUpdate.json() as ProductionProfile[]).length) {
      return error("A senha foi alterada, mas o primeiro acesso não foi concluído. Entre novamente com a nova senha e tente outra vez.", 503);
    }

    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch {
    return error("Não foi possível concluir a troca de senha agora. Tente novamente.", 503);
  }
}

