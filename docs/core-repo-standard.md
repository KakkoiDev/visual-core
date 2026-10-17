# A common structure for Kakkoi core repositories

A core gives a weak agent a small dependable route to a result. It centralizes
mechanics that several apps would otherwise duplicate, while consumers keep their
own user experience and data. The standard is language-neutral: do not force a
Python package onto a browser library or a chat harness onto a content library.

## Required surfaces

| Path | Job | Completion criterion |
|---|---|---|
| README.md | Human entry: outcome, one prompt, shortest working example | A new person can get one result |
| AGENTS.md | Small intent router and operating rules | An agent finds the right recipe without being told its name |
| llms.txt | Compact discovery index | Links resolve, no duplicate handbook |
| docs/scope.md | Owns / delegates / explicitly not supported | Consumer and core do not both own the same state |
| CAPABILITIES.json | Stable capability IDs, status, recipe, command, outputs | Implemented claims have executable evidence |
| RECIPES.md + recipes/ | Task-directed instructions | Each gives inputs/defaults, steps, artifacts, checks, recovery |
| src/ (or native equivalent) | Canonical reusable implementation | Consumer examples call it rather than fork it |
| tools/ or bin/ | Thin executable entry | Clear errors and documented exit status; JSON where agents need it |
| presets/ or templates/ | Curated successful starting patterns | Schema-valid; no obsolete API examples |
| examples/ | Small executable integrations | Real paths and repeatable commands |
| tests/ | Contracts, failures and consumer-preserving behavior | Failing before the fix, passing after it |
| evals/ | Task-routing and result-quality cases | Separate static checks from actual agent runs |
| IMPLEMENTATIONS.toml | Verified consumers and useful examples | Exact URLs, capabilities, paths and revisions |
| CHANGELOG.md + license | Compatibility and reuse terms | Dependency/version choices can be reviewed |

When a core wraps existing tools, add vendor/LOCK.json, original licenses, local
reference docs and working examples. Pin releases/commits and every bundled file;
normal agent use must not fetch latest. Keep adapters thin and verify the real
upstream APIs. Distinguish system prerequisites from locally bundled dependencies.

Optional: browser assets, bootstrap instructions, benchmarks, upstream adapters,
migration notes and provenance manifests. Add these only when the domain needs them.
A core does not need a service, UI, agent loop, MCP server or model to be agent-first.

## Stable contract

1. Name the domain nouns and the single authority for each. Stable business IDs
   survive content edits. Examples: Japanese sentence ID, multiplayer room ID,
   music layer ID, visual frame ID. Avoid content hashes as persistent business IDs;
   use hashes for freshness/provenance separately.
2. Define accepted inputs, bounds, diagnostics and output files/return values. Reject
   unknown fields at constrained execution boundaries; do not execute model-generated
   source merely because it arrived as JSON.
3. Offer a good default and a short recipe. Let the agent produce a small result
   promptly, inspect it and patch it. Preserve unaffected state and history. Do not
   require a small model to design an architecture before it can produce one asset.
4. Centralize reusable implementation once. Adapters stay thin; compatibility facades
   forward calls, as jpanki forwards to jp-core. Do not copy the implementation into
   every consumer and then call those copies canonical.
5. Keep optional dependencies optional and external services explicit. Document what
   generation needs versus what consuming the finished output needs. Pin reviewed
   dependency revisions, record licenses and explain upgrades.

## Recipe contract

Every recipe states the outcome, required inputs, chosen defaults, exact available
entry point, ordered steps, output locations, proof of success, common recoverable
errors, and when to stop. Link upstream authoritative instructions for delegated
work; never invent a local API for a capability that is only a recipe.

Use capability statuses `implemented`, `recipe`, and `planned`. Planned items are not
shown as runnable. A starter cannot claim completion simply because the directory
structure exists. Static validators must reject dangling routes and false status.

## Consumer registry contract

Use statuses `consumer`, `planned-consumer`, `candidate-consumer`, `migration-source`,
`related-example`, `retired`. Each entry has an exact URL, capabilities, description
and look_here paths. A consumer additionally records integration_paths, core_revision
and verified_revision as exact commits. Add an entry only after inspecting the host.
An in-repo example is not proof of an external deployment or released integration.

## Verification and release

Test valid and invalid input, deterministic results, real executable entry points,
state-preserving revisions, stale state and failure recovery. UI/audio/image work
also needs real rendering and a separate perceptual review. Do not equate a file
hash or a string-scoring eval with artistic quality, actual model execution, network
behavior or accessibility certification.

Keep manual agent cases: give a weak model just the repo URL and a user request;
check that it discovers the right recipe, uses actual APIs, produces an output and
verifies it. Record model, date, revision and evidence. Missing evidence stays
not-run. A stronger control model can help distinguish routing from model limits.

Document migration and compatibility before moving consumer behavior. Preserve IDs
and published semantics until parity tests pass. Publish a version/tag only when
its documented commands work; consumers pin that revision and upgrade deliberately.

## Create a new core skeleton

```sh
python3 tools/new_core.py physics-core --out ../physics-core
```

The [scaffold](../templates/core/README.md) is documentation and project structure,
not a domain implementation. Its example capability is `planned`. Before promoting
it: specify the domain boundary, implement one complete vertical slice, add a real
example, prove its contract, and only then mark it implemented. Keep the template
inside visual-core as the initial common blueprint; move it to its own canonical
repository only when maintaining several cores demonstrates that need.

This is a proposed shared standard drawn from the inspected repositories, not a
claim that all existing cores already conform. See [research](research.md).
