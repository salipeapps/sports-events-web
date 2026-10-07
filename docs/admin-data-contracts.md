# Admin v0 data contracts

Issue #2 introduces the stable data boundary consumed by the administration UI. Presentation code
should depend on `AdminRepository` and the domain contracts in `src/domain/admin.ts`, never on a
scraper payload, fixture file, database SDK or AI provider response.

## Source basis

The initial fixtures are based on the Valencia research snapshot dated 2026-10-05. Facts copied
from that research remain explicit and missing values remain `unknown`; they are not completed from
assumptions. Representative source cases include:

- Le Tarot E023/E024: website Wednesday 19:00 vs Meetup 18:30, therefore a blocking schedule conflict.
- Penyagolosa E064: 49 EUR in summary vs 54 EUR with transport in description; 18 EUR hike-only is a separate modality.
- Las Arenas E049/R011: 8 EUR cash / 9 EUR Bizum are payment variants of one session.
- Bueno E017: 5 EUR is a first-class trial price; the regular tariff is unknown.
- Amigos Valencia R018: a community/recurrence announcement whose header date/time must not create a fictitious occurrence.

The research snapshot did not contain production engine runs, publication-policy decisions or AI
evaluations. `fixtureMetadata` therefore marks operational run counters, source policy states and the
published/change scenario as simulations for Admin v0. They must not be treated as historical facts.

## Unknown values

`FieldValue<T>` makes uncertainty explicit:

- `{ state: "known", value: 0 }` is a known numeric zero (for example an explicitly free price).
- `{ state: "known", value: false }` is a known negative boolean.
- `{ state: "unknown", reason: ... }` means the fact is absent, unverified, conflicting or not applicable.

This prevents a blank value from silently becoming `0`, `false`, free or another business fact.

## Evidence, extraction and publication

A candidate keeps four concepts separate:

1. `evidence`: where/when a field was observed.
2. `extracted`: normalized values obtained from the source/import.
3. `final`: the editable publication proposal; editorial corrections do not mutate evidence.
4. evaluations: deterministic rules, AI evaluation, conflicts and identity matches.

AI is modeled as `not_run`, `failed` or `completed`. Model confidence, when eventually populated, is
stored as model-reported metadata and is not factual verification.

## Editorial state vs time

`editorialStatus` (`candidate`, `review`, `blocked`, `published`, `rejected`, `cancelled`, `archived`)
is independent from `temporalStatus` (`upcoming`, `ongoing`, `past`, `unknown`). A historical item does
not become future by changing its editorial label.

## Repository boundary

`AdminRepository` currently supports:

- dashboard summary;
- activity/candidate listing and filters;
- candidate detail;
- approve, reject, block, requery and reprocess actions;
- source list;
- engine run list.

`FixtureAdminRepository` is in-memory and intentionally replaceable. Issue #3+ can consume the same
interface while a later backend adapter implements persistence and server authorization.
