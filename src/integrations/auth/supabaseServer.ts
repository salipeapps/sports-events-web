import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getAuthConfig } from "@/config/env";

export async function createAuthClient() {
  const config = getAuthConfig();
  if (!config) return null;
  const store = await cookies();
  return createServerClient(config.url, config.key, {
    cookieOptions: { httpOnly: true, sameSite: "lax", secure: config.origin.startsWith("https://"), path: "/" },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (values) => {
        // Server Components cannot write; proxy refreshes before rendering.
        try {
          values.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* Read-only render. */
        }
      },
    },
  });
}
