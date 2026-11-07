import Link from "next/link";

export function PublicHeader() {
  return (
    <header className="public-header">
      <Link className="public-brand" href="/" prefetch={false} aria-label="Sports Events, inicio">
        <span aria-hidden="true" className="public-brand-mark">
          ↗
        </span>{" "}
        Sports Events
      </Link>
      <span className="public-header-note">Deporte para participar</span>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="public-footer">
      <strong>Sports Events</strong>
      <span>Valencia y alrededores · Horarios en Europe/Madrid</span>
    </footer>
  );
}
