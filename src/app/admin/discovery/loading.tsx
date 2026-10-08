export default function DiscoveryLoading() {
  return (
    <main className="admin-page">
      <section className="admin-empty-state" role="status" aria-live="polite">
        <strong>Cargando descubrimiento…</strong>
        <p>Consultando proveedores, consultas y resultados de búsqueda.</p>
      </section>
    </main>
  );
}
