import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { EditorialTrustPanel } from "./EditorialTrustPanel";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

describe("EditorialTrustPanel initial state", () => {
  const html = renderToStaticMarkup(<EditorialTrustPanel />);

  it("renders three separate forms and no bulk action", () => {
    expect(html.match(/<form/g)).toHaveLength(3);
    expect(html).toContain('aria-label="Alias de organizador"');
    expect(html).toContain('aria-label="Canal oficial de organizador"');
    expect(html).toContain('aria-label="Autoridad de ubicación"');
    expect(html).not.toMatch(/masiv|todos los|seleccionar todo/i);
  });

  it("prefills nothing: empty inputs, no selected change and no send button before review", () => {
    expect(html).not.toMatch(/<input[^>]*value="[^"]+"/);
    expect(html).not.toMatch(/<textarea[^>]*>[^<]+<\/textarea>/);
    expect(html).not.toMatch(/checked/);
    expect(html).not.toContain("Enviar al Engine");
  });

  it("requires reason and evidence in every form", () => {
    expect(html.match(/Motivo editorial \(obligatorio\)/g)).toHaveLength(3);
    expect(html.match(/URL de evidencia oficial revisada/g)).toHaveLength(3);
  });

  it("never suggests that an action is approved or authorized", () => {
    expect(html).not.toMatch(/aprobad|autorizad|approved/i);
    expect(html).toContain("no autoriza ejecutarlos");
  });
});
