import Link from "next/link";
import type { ReactNode } from "react";
import { AdminReadError, type AdminReadErrorCode } from "@/domain/adminRead";

const modules = {
  dashboard: "Resumen",
  activities: "Actividades",
  candidates: "Candidatos",
  candidate: "Detalle de candidatura",
  sources: "Fuentes",
  source: "Detalle de fuente",
  runs: "Ejecuciones",
  run: "Detalle de ejecución",
} as const;
type AdminModule = keyof typeof modules;

export function AdminReadState({ module, code }: { module: AdminModule; code: AdminReadErrorCode }) {
  return (
    <main className="admin-page">
      <header className="admin-page-header">
        <h1>{modules[module]}</h1>
        {module === "dashboard" ? <p>Visión general del estado operativo de la plataforma y del catálogo.</p> : null}
      </header>
      <section className="admin-empty-state" role="alert">
        <strong>
          {code === "NOT_AVAILABLE" ? "Datos todavía no disponibles" : "No se han podido cargar los datos"}
        </strong>
        <p>
          {code === "NOT_AVAILABLE"
            ? "La lectura de esta sección todavía no está disponible. No hay un inventario verificado que mostrar."
            : "La lectura ha fallado. Vuelve a cargar la página para reintentar."}
        </p>
        <p>
          <code>{code}</code>
        </p>
        <Link className="admin-secondary-button" href="/admin/discovery">
          Ir a Descubrimiento
        </Link>
      </section>
      {module === "dashboard" ? (
        <section className="admin-dashboard-grid" aria-label="Disponibilidad del catálogo">
          {[
            { title: "Cola editorial", href: "/admin/candidates", text: "Candidatos pendientes de revisión." },
            { title: "Actividades", href: "/admin/activities", text: "Inventario del catálogo editorial." },
            {
              title: "Fuentes y ejecuciones",
              text: "Seguimiento operativo disponible para el rol Admin cuando se habilite la lectura.",
            },
            { title: "Bloqueos y cobertura", text: "Sin métricas verificadas de conflictos, publicación o cobertura." },
          ].map((item) => (
            <article className="admin-dashboard-card" key={item.title}>
              <h2>{item.title}</h2>
              <p>{item.text}</p>
              <p>
                <code>{code}</code>
              </p>
              {item.href ? <Link href={item.href}>Abrir {item.title.toLowerCase()}</Link> : null}
            </article>
          ))}
        </section>
      ) : null}
    </main>
  );
}

/** Catch only typed read failures; preserve Next.js auth redirects and notFound. */
export async function loadAdminView(module: AdminModule, load: () => Promise<ReactNode>): Promise<ReactNode> {
  try {
    return await load();
  } catch (error) {
    if (!(error instanceof AdminReadError)) throw error;
    return <AdminReadState module={module} code={error.code} />;
  }
}
