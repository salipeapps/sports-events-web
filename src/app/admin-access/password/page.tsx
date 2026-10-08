import { redirect } from "next/navigation";
import { createAuthClient } from "@/integrations/auth/supabaseServer";
import { AdminLoginForm } from "@/presentation/admin/AdminLoginForm";
export const metadata = { title: "Establecer contraseña", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function PasswordPage() {
  const client = await createAuthClient();
  const user = await client?.auth.getUser();
  if (!user?.data.user || user.error) redirect("/admin-access?reason=expired");
  return (
    <main className="admin-access-page">
      <section className="admin-access-card">
        <h1>Establecer contraseña</h1>
        <p>Completa tu invitación o recuperación con una contraseña nueva.</p>
        <AdminLoginForm mode="password" />
      </section>
    </main>
  );
}
