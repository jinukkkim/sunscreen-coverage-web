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
- The stack, server requirements, and image data flow are not finalized. There is no application source or build/test command in this repository yet.
- UI copy is Korean; code identifiers are English.
- Shared research is in `docs/sunguard/`, indexed by `docs/README.md`, and is intended for GitHub.
- Design documents go in `docs/superpowers/specs/`; implementation plans go in `docs/superpowers/plans/`.
- Keep pre-SunGuard materials in the ignored `archive/` directory. Never force-add that directory.
- Do not commit credentials, private participant photos/videos, or raw participant datasets. Document image transmission before implementing it.
