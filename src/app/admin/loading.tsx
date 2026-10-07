export default function AdminLoading() {
  return (
    <main className="admin-page" aria-busy="true" aria-label="Cargando administración">
      <div className="admin-loading-title" />
      <div className="admin-loading-subtitle" />
      <div className="admin-loading-grid">
        {Array.from({ length: 6 }, (_, index) => (
          <span key={index} />
        ))}
      </div>
    </main>
  );
}
