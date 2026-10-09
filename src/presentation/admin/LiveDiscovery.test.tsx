import { describe, expect, it } from "vitest";

import { candidatePageHref } from "./LiveDiscovery";

describe("independently paginated candidate sections", () => {
  const candidateId = "ca73b0ff-8001-4000-8000-111111111111";

  it("keeps the review cursor when advancing observations", () => {
    const href = candidatePageHref(candidateId, "observations", "observation:next", "review+previous");
    const url = new URL(href, "https://example.test");
    expect(url.searchParams.get("observationsCursor")).toBe("observation:next");
    expect(url.searchParams.get("reviewsCursor")).toBe("review+previous");
  });

  it("keeps the observation cursor when advancing reviews", () => {
    const href = candidatePageHref(candidateId, "reviews", "review:next", "observation+previous");
    const url = new URL(href, "https://example.test");
    expect(url.searchParams.get("reviewsCursor")).toBe("review:next");
    expect(url.searchParams.get("observationsCursor")).toBe("observation+previous");
  });

  it("omits absent sibling cursors on first-page navigation", () => {
    const href = candidatePageHref(candidateId, "observations", "opaque");
    const url = new URL(href, "https://example.test");
    expect(url.searchParams.get("reviewsCursor")).toBeNull();
  });
});
