import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { LiveCandidateDetail, LiveDiscoveryOverview } from "../../../src/presentation/admin/LiveDiscovery";
import type { DiscoveryCandidate } from "../../../src/integrations/discovery/readApi";
import type { DiscoveryReviewAccess } from "../../../src/presentation/admin/discoveryReview";
import "../../../src/app/globals.css";

export interface FixtureState {
  candidate: DiscoveryCandidate;
  access?: DiscoveryReviewAccess;
  queue?: DiscoveryCandidate[];
}

function Fixture() {
  const [state, setState] = useState<FixtureState | null>(null);
  useEffect(() => {
    const refresh = () => {
      void fetch("/fixture/state")
        .then((response) => response.json())
        .then(setState);
    };
    refresh();
    window.addEventListener("fixture-refresh", refresh);
    return () => window.removeEventListener("fixture-refresh", refresh);
  }, []);
  if (!state) return <p>Cargando fixture offline…</p>;
  const candidate = state.candidate;
  return (
    <div className="admin-discovery-page" style={{ maxWidth: 1000, margin: "auto", padding: 16 }}>
      {state.queue ? (
        <LiveDiscoveryOverview
          tab="resultados"
          data={{ items: state.queue, nextCursor: null }}
          params={{}}
          reviewAccess={state.access}
        />
      ) : (
        <LiveCandidateDetail
          detail={{ candidate, promotion: null }}
          observations={{ items: [], nextCursor: null }}
          reviews={{ items: candidate.latestReview ? [candidate.latestReview] : [], nextCursor: null }}
          cursors={{}}
          reviewAccess={state.access}
        />
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
