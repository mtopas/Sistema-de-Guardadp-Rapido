# Claude Code — Complete Field Guide

## What It Is

Claude Code is Anthropic's AI coding CLI. It runs in your terminal, reads your codebase, and acts as a pair programmer that can read, write, edit, run commands, search the web, and chain complex multi-step tasks. It has persistent memory across sessions and can be automated with hooks and schedules.

---

## Starting a Session

```bash
claude                   # Start interactive session in current directory
claude "fix the bug in app/main.py"   # One-shot command
claude --continue        # Resume last conversation
claude --resume          # Pick a past conversation to resume
```

The working directory matters — always `cd` into your project root before starting.

---

## Core Mental Model

Claude Code works best when you treat it as a **junior-to-senior developer who has read every file in your repo** but needs clear instructions on *intent*, not just mechanics.

Bad: "fix the login"  
Good: "The `/api/login` endpoint in `app/main.py` returns 500 when `password` is None — add a 422 check before the DB query."

---

## Slash Commands (Built-in)

| Command | What it does |
|---|---|
| `/help` | List all commands |
| `/clear` | Clear conversation context (start fresh) |
| `/compact` | Compress conversation to save context space |
| `/model` | Switch model (Opus/Sonnet/Haiku) |
| `/fast` | Toggle fast mode (Opus 4.6 with faster output) |
| `/memory` | View and manage persistent memories |
| `/cost` | Show token usage for the session |
| `/doctor` | Diagnose Claude Code setup issues |
| `/init` | Generate a CLAUDE.md for your project |
| `/review` | Code review for current branch changes |
| `/security-review` | Security audit of current branch |

---

## Skills (Slash Commands via Skill System)

These are advanced built-in skills you can invoke:

| Command | Use case |
|---|---|
| `/init` | Auto-generate CLAUDE.md from your codebase |
| `/review` | Review a pull request |
| `/security-review` | Security review of pending changes |
| `/simplify` | Refactor changed code for quality |
| `/fewer-permission-prompts` | Auto-configure allowlist to reduce prompts |
| `/update-config` | Modify settings.json (hooks, permissions, env vars) |
| `/keybindings-help` | Customize keyboard shortcuts |
| `/schedule` | Create recurring automated agents |
| `/loop [interval] [command]` | Run something on a recurring interval |
| `/claude-api` | Help building Anthropic SDK apps |

---

## CLAUDE.md — Your Project Brain

The `CLAUDE.md` file in your repo root is **always loaded into context**. Use it to tell Claude:

- How to start the dev servers
- Architecture overview
- Conventions (naming, imports, patterns)
- Things to never do
- Key file locations

Keep it under ~300 lines. Claude reads it every session — stale or bloated CLAUDE.md degrades quality.

**This project's CLAUDE.md already covers:**
- FastAPI backend (`uvicorn app.main:app --reload`)
- React/Vite frontend (`npm run dev` on `:5173`)
- Telegram bot
- Domain model (Categorias / Hojas)
- Zustand store architecture
- Theme and i18n systems

---

## Memory System

Claude Code has persistent memory stored in `~/.claude/projects/<project>/memory/`.

### Memory types:
- **user** — who you are, your expertise level
- **feedback** — how you like Claude to behave
- **project** — ongoing context (deadlines, decisions, bugs)
- **reference** — where things live (Linear, Grafana, Slack)

### Commands:
```
/memory          # View all memories
remember X       # Ask Claude to save something
forget X         # Remove a memory
```

### What NOT to save:
- Code patterns (read the code instead)
- Git history (use `git log`)
- File paths (use Glob/Grep)

---

## Permission Modes

Claude asks before running risky commands. You can control this:

```bash
claude --dangerously-skip-permissions   # Skip ALL prompts (use carefully)
```

Or use `/update-config` to add specific allowlists so common safe commands never prompt:

```
/fewer-permission-prompts   # Auto-detect and whitelist safe commands
```

Permissions live in `.claude/settings.json` (project) or `~/.claude/settings.json` (global).

---

## Hooks — Automated Behaviors

Hooks run shell commands automatically when Claude does something. Set via `/update-config`.

**Examples:**
- Run linter after every file edit
- Run tests after code changes
- Show a notification when Claude stops
- Log all tool calls

```
/update-config   # Then describe: "after every file edit, run eslint"
```

Hooks execute in `.claude/settings.json` under `"hooks"`.

---

## MCP Servers — Extending Claude's Tools

MCP (Model Context Protocol) servers give Claude new tools — Gmail, Google Calendar, Drive, databases, APIs, etc.

The current session has:
- `mcp__claude_ai_Gmail` — read/send email
- `mcp__claude_ai_Google_Calendar` — calendar events
- `mcp__claude_ai_Google_Drive` — file access

Configure MCP servers in `~/.claude/settings.json` under `"mcpServers"`.

---

## Context Window Tips

Context fills up in long sessions. Strategies:

1. **`/compact`** — Summarizes history and frees space (use when you see "context getting long")
2. **`/clear`** — Full reset. Good when switching to an unrelated task.
3. **`--continue`** — Resumes last session with its compressed context.
4. Start a new session per feature/bug rather than one mega-session.
5. Reference specific files/line numbers instead of pasting code.

---

## Parallel Agents

For big tasks, Claude can spawn sub-agents that run in parallel:

```
"Explore the codebase and tell me all API endpoints"
"Run both the backend and frontend analysis simultaneously"
```

Agent types available:
- **Explore** — fast codebase search
- **Plan** — architecture planning
- **general-purpose** — research + multi-step tasks
- **frontend-design** — production-grade UI

---

## Working Effectively on This Project

### Starting a feature:
1. `cd C:\Users\Provincias\Documents\Sistema-de-Guardado-Rápido`
2. `claude`
3. Describe the feature with: which screen, which store action, which API endpoint is involved.

### Debugging:
```
"The NetworkGraph in BrowseScreen is not showing edges. The data comes from 
useStore's hojas array. The D3 code is in NetworkGraph.jsx. Check for missing 
links in the force simulation setup."
```

### Adding a new Hoja field:
Tell Claude to touch all 4 layers: `crud.py` → `main.py` (route) → `useStore.js` (action) → the relevant screen component.

### Migrations:
Database migrations run automatically via `init_db()` in `database.py` on startup — tell Claude to add the `ALTER TABLE` there.

---

## Useful One-Liners

```bash
# Start a task with full context
claude "In app/main.py around line 200, the PUT /hojas/{id} endpoint doesn't update 
the icono field. Add it to the UPDATE query in crud.py and the Pydantic model."

# Ask for a plan before coding
claude "How should I add offline support to the frontend? Give me 3 options 
and a recommendation before writing any code."

# Review your own changes
claude /review

# Security check before committing
claude /security-review

# Auto-reduce permission prompts
claude /fewer-permission-prompts
```

---

## Settings Files

| File | Scope | What it controls |
|---|---|---|
| `~/.claude/settings.json` | Global | Default model, themes, MCP servers, global hooks |
| `.claude/settings.json` | Project | Project-specific permissions, hooks, env vars |
| `CLAUDE.md` | Project | Codebase docs and behavioral instructions |
| `~/.claude/keybindings.json` | Global | Keyboard shortcuts |

---

## Keyboard Shortcuts (Default)

| Shortcut | Action |
|---|---|
| `Enter` | Submit message |
| `Shift+Enter` | New line in message |
| `Ctrl+C` | Cancel current tool/generation |
| `Ctrl+Z` | Undo last file change |
| `Up/Down arrows` | Navigate message history |
| `Ctrl+R` | Fuzzy search message history |
| `/` | Trigger slash command menu |

Customize with `/keybindings-help`.

---

## Dos and Don'ts

### Do:
- Keep CLAUDE.md up-to-date as the project evolves
- Use `/compact` proactively before context fills
- Give Claude file paths and line numbers
- Ask for a plan on big features before implementation
- Use `/review` before every PR
- Set up hooks for linting/testing automation

### Don't:
- Start huge sessions without `/clear` between unrelated tasks
- Paste entire files into the chat — Claude can read them directly
- Ask for features "while you're at it" — one task per session works better
- Run `--dangerously-skip-permissions` on production systems
- Let CLAUDE.md grow past ~400 lines

---

## Token Optimization

Tokens are the currency of every Claude Code session. Every file read, every tool call, every line of conversation consumes input tokens; every response consumes output tokens. Burning them carelessly means slower responses, higher costs, and hitting context limits mid-task.

### Understand where tokens go

| Source | Cost level | Notes |
|---|---|---|
| Long conversation history | High | Grows every turn; use `/compact` early |
| Reading large files | Medium-High | Claude reads the whole file even if you need 10 lines |
| Pasting code into chat | High | Never do this — use file paths instead |
| Bloated CLAUDE.md | Medium | Loaded every session; keep it lean |
| Verbose prompts | Low-Medium | Be precise, not wordy |
| Tool call results | Medium | Long grep/bash output inflates context |

### Reduce input tokens

**Reference files, don't paste them.**  
`"Look at app/main.py line 140"` uses a small tool call. Pasting 200 lines of code uses 200 lines of input tokens — every turn.

**Give exact coordinates.**  
`"In crud.py, the function update_hoja around line 80"` is cheaper than `"somewhere in the database layer"` which forces Claude to search broadly.

**Keep CLAUDE.md surgical.**  
Every word in CLAUDE.md is re-read every session. Remove outdated sections. Prefer bullet points over prose. Target under 200 lines.

**Use `/compact` before the context fills.**  
Once context is 70–80% full, run `/compact`. It summarizes history into a dense block and frees space. Waiting until 100% forces a harder reset.

**Scope your sessions.**  
One bug fix or one feature per session. Long sessions accumulate context from unrelated work. Use `/clear` between tasks.

**Use `--continue` over restarting.**  
`claude --continue` resumes with compressed prior context. Starting a fresh session on the same topic re-explains everything from zero.

### Reduce output tokens

**Ask for targeted outputs.**  
`"Show only the changed function, not the whole file"` cuts output significantly on large-file edits.

**Ask for a plan first, then code.**  
`"What's your approach? Don't write code yet."` Costs almost nothing. Catching a wrong direction early avoids a long wrong implementation you then throw away.

**Suppress unnecessary explanation.**  
Add `"no explanation needed"` or `"just the code"` when you already understand the context. Claude's default is to explain; suppressing this saves output tokens.

**Use Haiku for cheap tasks.**  
`/model` → Haiku 4.5 is dramatically cheaper for: renaming variables, reformatting, simple lookups, writing boilerplate. Switch back to Sonnet/Opus for architecture or debugging.

### Model selection by task

| Task | Best model | Why |
|---|---|---|
| Architecture decisions | Opus 4.7 | Needs deep reasoning |
| Feature implementation | Sonnet 4.6 | Balanced cost/quality |
| Bug debugging | Sonnet 4.6 | Strong at tracing logic |
| Renaming / reformatting | Haiku 4.5 | Mechanical task, cheap |
| Code review / security | Sonnet 4.6 or Opus 4.7 | Needs broad pattern recognition |
| Quick lookups / grep | Haiku 4.5 | Minimal reasoning needed |

### Prompt Cache (API-level)

If you're calling the Claude API directly (e.g., in `mybot/bot.py` or any future AI feature), use **prompt caching** to avoid re-sending the same system prompt on every request. Cache hits cost ~10% of normal input token price.

```python
# In Anthropic SDK: mark stable content with cache_control
{"type": "text", "text": system_prompt, "cache_control": {"type": "ephemeral"}}
```

Cache TTL is 5 minutes. Structure prompts so the stable part (instructions, context) comes first and the variable part (user input) comes last — only the prefix can be cached.

### Token hygiene checklist

Before a long session:
- [ ] CLAUDE.md is under 200 lines and current
- [ ] You know which files/line numbers are relevant (no broad searches needed)
- [ ] Session has a single clear goal

During a session:
- [ ] Run `/compact` when context reaches ~70%
- [ ] Use Haiku for mechanical subtasks
- [ ] Reference files by path, never paste

After a session:
- [ ] Use `/clear` before switching to an unrelated task
- [ ] Check `/cost` to see what the session consumed

---

## Quick Reference Card

```
Start session:          claude
Resume last:            claude --continue
One-shot task:          claude "task description"
Plan mode:              /plan (then approve before Claude codes)
Clear context:          /clear
Compress context:       /compact
Switch model:           /model
Review branch:          /review
Security audit:         /security-review
Auto-whitelist cmds:    /fewer-permission-prompts
Configure hooks:        /update-config
View memories:          /memory
Schedule recurring:     /schedule
```
