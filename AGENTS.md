# Repository Guidelines for LLM Agents

## 🚨 CRITICAL PROHIBITIONS (NEVER DO THIS)
- **NEVER execute `src/main.js`, `npm start`, `scripts/start.ps1`, or `scripts/stop.ps1` inside a worktree or test environment.** Running these production entry points or local PM2-managed runtimes will immediately crash active production sessions, disconnect the live bot, and corrupt user session data.
- **NEVER read, modify, or commit session authentication files** (e.g., `.wwebjs_auth/` or local session tokens). These are strictly production-only artifacts.
- No hardcoded secrets (API keys, passwords, tokens)
- All user inputs validated
- SQL injection prevention (parameterized queries)
- XSS prevention (sanitized HTML)
- CSRF protection enabled
- Authentication/authorization verified
- Rate limiting on all endpoints
- Error messages don't leak sensitive data


## Project Structure & Module Organization
This repository is a CommonJS Node.js WhatsApp bot. Runtime entrypoint is `src/main.js`. Core modules live under `src/`: `config/` loads `data/config.json`, `handlers/` implements command handlers, `services/` owns integrations such as WhatsApp, Obsidian, metrics, transcription, and header watching, while `utils/`, `lib/`, `resolvers/`, and `resourcers/` hold shared support code. Persistent runtime state and configuration are in `data/`; logs are in `logs/`. Tests live in `tests/` and some older smoke/regression checks live in `scripts/test-*.js`. Python transcription code is in `scripts/transcribe.py`; local model files are under `models/`.

## Allowed Development & Testing Commands
You are **ONLY** allowed to use the following commands within your assigned worktree:
- `node --test tests/*.test.js`: runs Node's built-in test files under `tests/`. Use this for checking your new feature mock tests.
- `node --check <file-path>`: quick syntax check for any edited JS files (e.g., `node --check src/handlers/my-handler.js`).
- `npm test`: runs `scripts/test-metric.js` for package-level regression check.

## Coding Style & Naming Conventions
Use CommonJS (`require`, `module.exports`) and keep files focused by feature. Match the existing 4-space indentation in JavaScript tests and config-adjacent code. Use camelCase for functions, variables, and service methods; use descriptive handler names that mirror command intent, such as `readingLog` or `manualForward`. Keep configuration keys aligned with `data/config.json`; do not rename user-facing command keys or Obsidian frontmatter fields without checking the full persistence path.

## Testing Guidelines & Simulation Strategy
- Prefer the smallest regression test that proves the changed path. New Node tests should use `node:test` and `node:assert/strict`, named `*.test.js`, and live in `tests/`.
- **Simulation Strategy:** Simulate all features, regex triggers (`#description`, `#anotação`, `#agenda`, `#on`, `#off`), and group admin permissions using isolated mock tests (unit/integration tests) inside `tests/`. Let the user manually trigger or verify real connection states.

## 1. Worktree & Environment Setup
* New ideas and features must be developed and tested in a separate worktree. See [Ideas](../../Lucas/01_Arquivos/Projetos/Whats-L.md#-ideias) for the backlog. Use `git` or `gh` commands to create the worktree inside `"G:\Projetos\Worktrees-Proj"`.
* **Environment Initialization:** When entering a new worktree directory, you **must** run `npm install` (or `yarn`) immediately before writing or testing any code. Dependencies are not copied automatically by Git.
* **Ignored local files are not copied to new worktrees.** If `data/config.json` is missing, create `data/` and seed it from `.codex/config.default.json` before running tests. This config is a worktree-safe default; keep production-only state in `data/` and do not commit it.
* If `package.json` is missing in a worktree because it is not tracked in the current branch, create a minimal worktree-local `package.json` with `"type": "commonjs"` and `"test": "node --test tests/*.test.js"`, then run `npm install`. Keep this setup scoped to the worktree unless the user explicitly asks to version dependency metadata.

## 2. Git Workflow & Dependency Rules
* **No Manual File Copying:** When your feature is complete, **DO NOT** manually copy files back to the main repository folder. Run `git add`, `git commit`, and `git push` from inside your worktree directory to update the remote feature branch. Leave the feature branch open for subsequent reviews.
* **Dependency Files:** When adding new packages to `package.json`, `package-lock.json`, or `requirements.txt`, modify them **only** within your active worktree/branch. Resolve dependency conflicts through normal git merge/rebase — do not manually sync these files across directories.
* **Local integration path:** If the user asks to bring a finished worktree into the main checkout, commit the worktree branch and merge it into `main` from `G:\Projetos\whats-L`. Do not copy source files manually. After merge, update ignored local config files such as `data/config.json` separately when the feature requires runtime config.
* **Sandbox note:** Git operations that write `.git` metadata (`commit`, `merge`, worktree creation/removal) may need elevated execution in Codex because `.git` can be read-only under the default sandbox. Treat this as a sandbox permission issue, not a repository error.

## 3. Commit & Pull Request Guidelines
Recent history uses short imperative subjects, sometimes Conventional Commit prefixes such as `fix:` and `feat:`. Keep commits scoped, for example `fix: recover messages missed by live listener`. PRs should describe the changed runtime path, list the exact checks run, mention config or `.env` changes, and include log excerpts only when they prove simulated behavior.

## 4. Communication & Logging
* Document your progress, logic changes, and implementation details clearly. Use [Session Notes](../../Lucas/01_Arquivos/Projetos/Whats-L.md#-anotações) to write comprehensive logs and keep Lucas fully informed of your structural and functional changes.

## gh-cli commands
To use GitHub Actions, use skill gh-cli — any new learning about gh-cli will be added to this file.

### List
