import Link from "next/link";

import { requireAdminAccess } from "@/integrations/auth/adminAuth";

export default async function ForbiddenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAdminAccess("dashboard.view");
  const { capability } = await searchParams;
  const restriction =
    capability === "sources.manage"
      ? "La gestión de fuentes está reservada a administradores."
      : capability === "runs.execute"
        ? "La gestión de ejecuciones está reservada a administradores."
        : "Esta sección requiere permisos adicionales.";

  return (
    <main className="admin-page">
      <section className="admin-empty-state" aria-labelledby="forbidden-title">
        <h1 id="forbidden-title">No tienes permisos para acceder a esta sección</h1>
        <p>
          Tu rol es {session.role === "reviewer" ? "Revisor" : "Administrador"}. {restriction}
        </p>
        <Link className="admin-primary-button" href="/admin/discovery">
          Volver a Descubrimiento
        </Link>
        <Link className="admin-secondary-button" href="/admin">
          Volver a Resumen
        </Link>
      </section>
    </main>
  );
}
