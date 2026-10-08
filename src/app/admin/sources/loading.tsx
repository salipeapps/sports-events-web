export default function SourcesLoading() {
  return (
    <main className="admin-page">
      <section className="admin-empty-state" role="status" aria-live="polite">
        <strong>Cargando fuentes…</strong>
        <p>Consultando el registro de fuentes configuradas.</p>
      </section>
    </main>
  );
}
