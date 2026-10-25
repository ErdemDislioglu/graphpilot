# GraphPilot

🇬🇧 **English** · [🇹🇷 Türkçe](README.tr.md)

**A token-optimized orchestration plugin for [Claude Code](https://code.claude.com).**
GraphPilot breaks a task into a graph of linked Markdown nodes, tags each node with
routing flags, sends it to the right model/agent, and runs the whole graph step by
step in the background — with measurably less token spend than driving the same work
by hand.

```
/gp:plan     → brief + epics
/gp:expand   → lazily expand an epic into features/tasks, flag them
/gp:run      → execute the graph (manager + junior/senior/tester/docs roles, on by default)
gp autopilot → run it unattended, with Telegram notifications and approvals (opt-in)
```

## Why

Long-running coding agents tend to re-read the same files, re-explain the same context
on every turn, and burn tokens on output nobody needed in full. GraphPilot's answer is
structural, not prompting: the **graph is the single source of truth** for state, and a
deterministic CLI (`gp`) — not an LLM — handles everything that doesn't require
judgment: parsing, validation, indexing, routing, context assembly, checks.

- **Graph, not chat history.** Progress, decisions, and interfaces live in linked
  Markdown files under `.graph/`, not in a conversation nobody can audit later.
- **Only as much context as needed.** A task node sees the project brief, its own
  direct dependencies' handoffs, and the knowledge it explicitly reads — never the
  whole repo, never transitive dependencies.
- **Smart defaults, open settings.** It works out of the box; every optimization is a
  flag in `config.yml` you can tune or turn off.
- **Every claim gets measured.** Each token-saving technique can be toggled
  independently so its real effect can be benchmarked (see `bench/`), not assumed.

## How it works

| Concept | What it is |
|---|---|
| **Graph** | Linked Markdown files under `.graph/` — the single source of truth |
| **L0 Brief** | Project constitution: stack, conventions, layout — read (and cached) by every agent |
| **L1 Epic** | Large chunks of work, created up front |
| **L2 Feature / L3 Task** | Expanded just-in-time, only when work is about to start |
| **Task node** | What to build: flags, `depends_on`, status, handoff |
| **Knowledge node** | What exists: interfaces, module summaries, decisions |
| **Handoff** | A short (~300-token) summary written when a task finishes — downstream nodes read *this*, not the code |
| **INDEX** | Generated "what's where" table, root + per-epic |
| **Flags** | `complexity`, `type`, `risk`, `context_size` → drive model and agent selection |

The execution loop (`/gp:run`) is a tight cycle: find ready tasks → route to a model/agent
→ assemble an isolated context package → delegate → verify (cheap script checks first,
a cheap model for acceptance criteria second) → fix on failure → commit → update the
index, repeating until the graph is done.

## Status

GraphPilot's core (graph schema, a fully tested `gp` CLI, the plugin scaffold,
intake/planning, lazy expansion, the execution engine, independently-toggleable
token-optimization techniques, and interrupt/resume resilience) is done, plus two
later-roadmap features that were pulled ahead of packaging and release:

- **Team mode** — *on by default*, no setup needed. A manager routes tasks to
  junior/senior/tester/docs roles by complexity and risk tags, escalates failures up
  the chain (junior → junior on a stronger model → senior), and asks for approval —
  via Telegram or in-session — on security, architecture, and scope decisions, with
  every decision logged and revertible. Turn it off per-project with `team.enabled:
  false` in `config.yml` if you'd rather have every task go to one model.
- **Autopilot** — *opt-in*, since it needs a real Telegram bot. Unattended headless
  execution with Telegram notifications, button-based approvals, automatic resume
  after hitting a usage limit, and process management
  (`gp autopilot start|stop|status|logs`). `/gp:init` asks once, right after it
  scaffolds `.graph/`, whether you want to wire this up — say no and it's skipped
  entirely with no trace left anywhere in the project.

580 tests pass; the CLI type-checks and lints clean, and every one of those tests runs
against deterministic code — none of this work spent a real LLM API call. A live,
end-to-end trial of autopilot/team mode against a real Telegram bot hasn't been run yet
and is noted as such.

This project is built with an unusual amount of rigor about **what has actually been
verified versus assumed**: every architectural decision is logged in
[`docs/decisions.md`](docs/decisions.md) as a dated ADR with its evidence, and every
claim about Claude Code's own behavior that couldn't be confirmed in-session is marked
`DOĞRULANMADI` (unverified) rather than asserted. Benchmarking against raw Claude Code
is deliberately shelved — producing a real comparison needs paid API usage, which was
judged not worth spending yet. Packaging/release and a cheap reviewer + API-test layer
haven't been started.

## Install

GraphPilot ships as a Claude Code plugin. From inside Claude Code:

```
/plugin marketplace add <this-repo-url>
/plugin install gp
```

Then, in your project:

```
/gp:init    # scaffolds .graph/ (brief.md + config.yml) — asks once if you want Telegram notifications
/gp:plan    # turns a product brief into brief.md + epics
/gp:expand  # expands an epic into flagged features/tasks on demand
/gp:run     # executes the graph end to end — team mode (junior/senior/tester/docs) is on by default
/gp:team    # same, explicitly — useful if you want the full manager experience regardless of config.yml
```

`/gp:init` will ask, right after it scaffolds `.graph/`, whether you want Telegram
notifications for autopilot mode. Say yes and it walks you through creating a bot with
`@BotFather` and links your chat; say no (or skip it) and you can set it up any time
later:

```
gp autopilot setup --token <your-bot-token>   # validates the bot, links your chat
gp autopilot start --agents-dir plugin/agents # runs in the background; /pause /resume /stop from Telegram
```

## Repository layout

```
cli/      TypeScript source for the `gp` CLI (parse, validate, route, context, checks, hooks, ...)
plugin/   The installable Claude Code plugin (agents, skills, hooks)
docs/     Spec (SPEC.md) and architecture decisions (decisions.md)
bench/    Benchmark scenarios and results (incl. the token-optimization ablation table)
```

## Development

```bash
cd cli
nvm use          # Node >=22 required
npm install
npm test          # Vitest — 580 tests
npm run lint
npm run build      # emits dist/, synced into plugin/lib/ via scripts/sync-cli-to-plugin.sh
```

Every exported function has a Vitest test; nothing in the CLI calls an LLM — it is a
deterministic layer the agents and the orchestrator skill call into.

## Contributing

Issues and PRs are welcome. If you're proposing a new optimization technique, the bar
set by the existing code is: it should be independently toggleable via
`config.yml`'s `optimizations:` block, and its effect should be measurable, not assumed.

## License

[MIT](LICENSE)
