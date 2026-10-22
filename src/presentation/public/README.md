# Public presentation

Components for the visitor-facing catalogue belong here.

The home consumes the independent public catalogue port, never Admin repositories or ingestion
candidates. H2 is prepared offline with a disabled default and a labelled loopback-only RPC
integration. See [public catalogue status and contract](../../../docs/public-catalog.md) for
Engine #122/#123 integration gates, temporal semantics and test commands.
