import Link from "next/link";
import { AdminLoginForm } from "@/presentation/admin/AdminLoginForm";
export const metadata = { title: "Recuperar acceso", robots: { index: false, follow: false } };
export default function RecoverPage() {
  return (
    <main className="admin-access-page">
      <section className="admin-access-card">
        <h1>Recuperar contraseña</h1>
        <p>Introduce el email de tu cuenta administrativa.</p>
        <AdminLoginForm mode="recover" />
        <Link href="/admin-access">Volver al acceso</Link>
      </section>
    </main>
  );
}
