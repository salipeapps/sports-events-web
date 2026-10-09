import Link from "next/link";

import type { AdminAccessFailureReason } from "@/domain/adminAccess";
import { AdminLoginForm } from "./AdminLoginForm";

const messages: Record<AdminAccessFailureReason, { title: string; description: string }> = {
  missing_session: {
    title: "Acceso administrativo requerido",
    description: "Necesitas una sesión administrativa válida para acceder a esta zona.",
  },
  expired: {
    title: "La sesión ha caducado",
    description: "Vuelve a iniciar sesión con el proveedor de acceso administrativo.",
  },
  unauthorized: {
    title: "No tienes permisos para acceder",
    description: "Tu sesión no dispone de acceso al área de administración.",
  },
};

export function AdminAccessState({ reason }: { reason: AdminAccessFailureReason }) {
  const message = messages[reason];

  return (
    <main className="admin-access-page">
      <section className="admin-access-card" aria-labelledby="admin-access-title">
        <span className="admin-access-mark" aria-hidden="true" />
        <p className="admin-access-eyebrow">Sports Events · Admin</p>
        <h1 id="admin-access-title">{message.title}</h1>
        <p>{message.description}</p>
        <AdminLoginForm />
        <Link className="admin-access-recovery-link" href="/admin-access/recover">
          Recuperar contraseña
        </Link>
        <Link className="admin-access-public-link" href="/">
          Volver al sitio público <span aria-hidden="true">→</span>
        </Link>
      </section>
    </main>
  );
}
