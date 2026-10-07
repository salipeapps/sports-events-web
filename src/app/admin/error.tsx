"use client";

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="admin-page">
      <section className="admin-empty-state admin-error-state">
        <strong>No se han podido cargar los datos del Admin</strong>
        <p>El estado no se sustituye por fixtures alternativos ni por valores inventados.</p>
        <button className="admin-primary-button" type="button" onClick={reset}>
          Reintentar
        </button>
      </section>
    </main>
  );
}
