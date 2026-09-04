# Event ingestion

Every provider will implement a source adapter that preserves its immutable raw record before parsing, validation, normalization, geocoding, classification, and duplicate assessment.

Canonical events retain links to every contributing source. Automatic merges require a high-confidence rule; ambiguous candidates go to operations review. Phase 1 creates no provider integrations.
