import Link from "next/link";

import type { AdminAccessFailureReason } from "@/domain/adminAccess";

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
        <Link href="/">Volver al sitio público</Link>
      </section>
    </main>
  );
}
