const adminAreas = [
  {
    title: "Candidatos",
    description: "Revisión de eventos captados, conflictos y decisiones editoriales.",
  },
  {
    title: "Fuentes",
    description: "Estado y configuración de las fuentes que alimentarán el motor.",
  },
  {
    title: "Ejecuciones",
    description: "Trazabilidad de trabajos, resultados, incidencias y consumo.",
  },
];

export function AdminLanding() {
  return (
    <main className="page-shell">
      <p className="eyebrow">Administración</p>
      <h1>Admin v0</h1>
      <p className="lead">
        Motor y revisión editorial. Este bootstrap prepara las fronteras de la aplicación; los datos y flujos
        funcionales se incorporarán en las siguientes issues.
      </p>

      <section className="status-grid" aria-label="Áreas de administración">
        {adminAreas.map((area) => (
          <article className="status-card" key={area.title}>
            <strong>{area.title}</strong>
            <p>{area.description}</p>
            <span className="status-badge">Preparado para implementar</span>
          </article>
        ))}
      </section>
    </main>
  );
}
