# Repository instructions

## Team project

- SunGuard is a shared project for the 2026 University of Seoul hackathon.
- Preserve each team member's actual authorship. Do not attribute the whole project to one account owner.
- Never add AI attribution to commits or PRs, or add an AI tool as a collaborator.
- The project uses the MIT license with copyright attributed to SunGuard contributors.

## Git workflow

- Use feature branches and PRs into `main`; there is no `develop` branch.
- The initial bootstrap commit is the only direct-to-main exception and requires explicit approval before repository creation or upload.
- Push or create/update PRs only when requested. Do not merge PRs on the team's behalf.
- Never force-push or amend a commit already pushed to an open PR.
- Use merge commits, not squash or rebase. GitHub branch protection is not configured yet.
- Do not install or configure Claude GitHub Apps, review bots, review workflows, or related secrets. The team has opted out of Claude code review integration.

## Contribution conventions

- Commits and PR titles use Conventional Commits: `type(scope): subject`.
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `revert`.
- Subjects are English, imperative, lowercase first letter, under 100 characters, with no trailing period.
- Branch prefixes match the commit type, for example `feat/coverage-detection` or `docs/research`.
- Scopes follow actual top-level code directories when introduced; documentation and CI take no scope.
- PR descriptions are Korean and explain the problem, change, and validation.
- Feature and bug-fix PRs include relevant tests. Document build and test commands when implementation is introduced.

## Project facts

- Main goal: sunscreen application recognition on the web. UV information, reminders, and ingredient analysis are supporting features.
- Hand movement tracking does not prove actual sunscreen application, adequate amount, SPF, or UVA protection. Actual coverage recognition is not validated yet.
- The app uses React, Vite, Astryx, Express and same-origin MediaPipe face/hand models. Run `npm ci`, `npm run dev`, `npm test`, `npm run build`, and `npm run test:e2e` (Chrome). `npm start` serves the production build and UV API. `predev`/`prebuild` prepare pinned vision assets. Motion observation is connected; actual sunscreen presence and protection are not validated.
- Reapplication reminders use actual manual application timestamps and explicit daily opt-in. Apply the user-requested UV bands: 0–2 wait, 3 -> 150 minutes, 4–5 -> 120, 6–7 -> 80, 8+ -> 60; missing/stale UV -> 120. This is a product reminder policy, not a personalized protection duration or regulatory formula. Refresh location with consent at reminder time and refresh forecasts for the last known position every 30 minutes while visible.
- Camera video and landmarks are processed in browser memory only; they are not stored or transmitted. Motion detection must not automatically create an application-time record. Document image transmission before adding an external analysis service.
- UI copy is Korean; code identifiers are English.
- Shared research is in `docs/sunguard/`, indexed by `docs/README.md`, and is intended for GitHub.
- Design documents go in `docs/superpowers/specs/`; implementation plans go in `docs/superpowers/plans/`.
- Keep pre-SunGuard materials in the ignored `archive/` directory. Never force-add that directory.
- Do not commit credentials, private participant photos/videos, or raw participant datasets. Document image transmission before implementing it.

<!-- ASTRYX:START -->
Astryx v0.7.16 · 174 components
CLI: run every command as `npx astryx <cmd>` (shown below as `astryx ...`).

SETUP (once, in app entry e.g. main.tsx) — without these, components render unstyled:
  import "@astryxdesign/core/reset.css";
  import "@astryxdesign/core/astryx.css";

WORKFLOW — start every page from a template, never from scratch:
1. `astryx build "<idea>"` — names the template to scaffold from and the parts it lacks.
2. `astryx template <name> <path>` — scaffold it; keep its frame, gap and padding; replace the content.
3. `astryx template <Block>` for parts it lacks; `astryx component <Name>` to read props before using one.
Changing an existing page? Keep it: skip step 2 and add blocks/components inside its sections.
Before you deliver a build, run `astryx doctor --built <dir>`; don't deliver it if it fails.

RULES:
- No <div> — components handle all layout and spacing.
- Read `astryx docs layout` before changing a template's frame.
- Dense data = rows (Table, List/Item), not Card-wrapped lists. Badge = counts only.
- Style with component props first, then tokens (var(--color-*|--spacing-*|--radius-*)). No raw hex/px. No StyleX/Tailwind compiler here — don't use xstyle/utility classes directly. Some templates use StyleX and need a compiler plugin; see `astryx docs styling-overview`.
- THEMES: palettes and custom colors go through the theme, never :root overrides. To make or change a theme (colors, fonts, corners, spacing, a look from a picture), prefer the experimental theme editor over hand-written theme files: `astryx experimental theme editor new <name> --like neutral`, then `editor set <name> <thing> <value>` or `editor how "<what you want>"`; wire it with `astryx theme add <name>`; after each change look at it with `astryx experimental theme editor show <name> --png` and open the PNGs it writes (changes nothing in the app); a theme change is not done until you have looked at the pictures. In code, extend an imported theme to customize it; `theme eject <slug>` only forks source. See `astryx docs theme`.
- SELF-CHECK: re-read the file; replace any raw <div>/<span>, imported .css/@apply, or hardcoded #hex/px with the component or a token.

`astryx help` lists every command. Key ones beyond the workflow:
  search "<query>"   find any component / hook / doc / template
  discover <words>   integrations you could add
  docs <topic>       getting-started, principles, tokens, theme … (`astryx docs` lists all)
  docs cli           commands and API reference
  docs authoring     build an integration package, and every field it holds
  upgrade --from <old version> --apply   run after a dependency bump
<!-- ASTRYX:END -->
