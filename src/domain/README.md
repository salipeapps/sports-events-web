# Domain

Pure business concepts and rules live here.

This layer must not depend on Next.js pages, HTTP clients, databases, scrapers or vendor SDKs.

Admin v0 contracts are defined in `admin.ts`. Runtime boundary validation/JSON round-tripping for
candidate, source and run contracts lives in `adminValidation.ts`. Unknown values are represented
explicitly through `FieldValue<T>` so `0`, `false`, free and missing/unverified data cannot collapse
into the same representation.
