import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = "https://mnzzulllazckqinudgoc.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_f8CrCRfwhhx1e3T9B7bp7Q_9p0zDBJL";

type AllowedUser = {
  email: string;
  display_name: string;
  active: boolean;
};

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

function normalizeLoginName(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function loginError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as {
    name?: unknown;
    password?: unknown;
  } | null;

  const name = typeof body?.name === "string" ? body.name : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const normalizedName = normalizeLoginName(name);

  if (!normalizedName || !password) {
    return loginError("Informe seu nome e senha.", 400);
  }

  const key = serviceKey();
  if (!key) {
    return loginError("Login por nome indisponível no momento. Você ainda pode entrar com seu e-mail.", 503);
  }

  try {
    const allowedResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/dashboard_prod_allowed_users?select=email,display_name,active`,
      { headers: serviceHeaders(key), cache: "no-store" },
    );

    if (!allowedResponse.ok) {
      return loginError("Não foi possível validar seu acesso agora. Tente novamente ou use seu e-mail.", 503);
    }

    const users = await allowedResponse.json() as AllowedUser[];
    const matches = users.filter((user) => normalizeLoginName(user.display_name) === normalizedName);

    if (matches.length !== 1 || !matches[0].active) {
      return loginError("Nome ou senha inválidos.", 401);
    }

    const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: matches[0].email, password }),
      cache: "no-store",
    });

    const payload = await authResponse.json().catch(() => ({}));
    if (!authResponse.ok) {
      return loginError("Nome ou senha inválidos.", 401);
    }

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return loginError("Não foi possível entrar agora. Tente novamente ou use seu e-mail.", 503);
  }
}
