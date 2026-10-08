export default function RunsLoading() {
  return (
    <main className="admin-page">
      <section className="admin-empty-state" role="status" aria-live="polite">
        <strong>Cargando ejecuciones…</strong>
        <p>Consultando la actividad reciente del motor.</p>
      </section>
    </main>
  );
}
