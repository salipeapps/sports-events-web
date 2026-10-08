"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthConfig } from "@/config/env";
import { createAuthClient } from "@/integrations/auth/supabaseServer";
import { SupabaseAdminSessionProvider } from "@/integrations/auth/supabaseAccess";

export type AuthFormState = { message: string };
const unavailable = { message: "No se ha podido completar la solicitud. Inténtalo de nuevo." };
function field(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

export async function loginAction(_state: AuthFormState, form: FormData): Promise<AuthFormState> {
  const email = field(form, "email").trim();
  const password = field(form, "password");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length > 1024)
    return { message: "Introduce un email y una contraseña válidos." };
  let allowed = false;
  try {
    const client = await createAuthClient();
    if (!client) return unavailable;
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) return { message: "No se ha podido iniciar sesión con esas credenciales." };
    allowed = (await new SupabaseAdminSessionProvider(client).getAccess()).status === "authenticated";
    if (!allowed) {
      await client.auth.signOut({ scope: "local" });
      return { message: "No tienes permisos para acceder al área de administración." };
    }
  } catch {
    return unavailable;
  }
  if (allowed) redirect("/admin");
  return unavailable;
}

export async function recoverPasswordAction(_state: AuthFormState, form: FormData): Promise<AuthFormState> {
  const email = field(form, "email").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { message: "Introduce un email válido." };
  try {
    const client = await createAuthClient();
    const config = getAuthConfig();
    if (!client || !config) return unavailable;
    await client.auth.resetPasswordForEmail(email, { redirectTo: `${config.origin}/auth/confirm` });
  } catch {
    /* Never disclose whether an account exists. */
  }
  return { message: "Si la cuenta puede recuperar el acceso, recibirás un email con los siguientes pasos." };
}

export async function setPasswordAction(_state: AuthFormState, form: FormData): Promise<AuthFormState> {
  const password = field(form, "password");
  if (password.length < 12 || password.length > 128 || password !== field(form, "confirmation"))
    return { message: "Usa entre 12 y 128 caracteres y confirma la misma contraseña." };
  try {
    const client = await createAuthClient();
    if (!client) return unavailable;
    const user = await client.auth.getUser();
    if (user.error || !user.data.user) return { message: "El enlace ha caducado. Solicita uno nuevo." };
    const { error } = await client.auth.updateUser({ password });
    if (error) return unavailable;
    await client.auth.signOut({ scope: "global" });
  } catch {
    return unavailable;
  }
  redirect("/admin-access?reason=missing_session");
}

export async function logoutAction(): Promise<never> {
  try {
    const client = await createAuthClient();
    await client?.auth.signOut({ scope: "global" });
  } catch {
    /* Always remove local credentials, even when Auth is unavailable. */
  }
  const store = await cookies();
  const config = getAuthConfig();
  if (config) {
    const prefix = `sb-${new URL(config.url).hostname.split(".")[0]}-auth-token`;
    store
      .getAll()
      .filter(({ name }) => name.startsWith(prefix))
      .forEach(({ name }) => store.delete(name));
  }
  redirect("/admin-access?reason=missing_session");
}
