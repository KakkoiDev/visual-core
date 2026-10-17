# {{CORE_NAME}} agent router

Read the host project's instructions first. The core owns only the reusable domain
in [docs/scope.md](docs/scope.md); consumers own their application experience.

Read [CAPABILITIES.json](CAPABILITIES.json), then the matching [recipe](RECIPES.md).
A `planned` capability is not callable. Do not invent an API or claim the generated
skeleton implements it. Inspect examples and use the canonical implementation.

Preserve stable business IDs, user data and unaffected behavior. Keep dependencies
minimal, follow authoritative upstream references for delegated tasks, and return
concrete outputs and validation evidence. Register real consumers only after their
integration is verified. Keep sources and compatibility guarantees explicit.
