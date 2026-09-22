# Issue templates — 2026-09-21

Adds Feature request, Bug report, and Documentation request forms with category-specific guidance and a linked reporting guide. Each form collects exactly four required answers: Objective, Scope, Acceptance criteria, and Verification. Bug reproduction and documentation references stay within these sections so they reach Prime Mover's execution contract.

The forms apply existing category labels only. An allowlisted maintainer must separately review and authorize execution with `codex-ready`. Existing templates and blank-issue behavior are preserved. No application code, production service, or deployment configuration changed.

## Verified delivery

Reviewed implementation: `9dfb04ed3e7f9a2751c22316f98ad7d7b08d764b` in [PR #15](https://github.com/talaniz/doom-control/pull/15).

- [Independent code-review sign-off](https://github.com/talaniz/doom-control/pull/15#issuecomment-5762473538): both implementation commits and combined diff inspected; ISSUE-FORMS-1 context loss confirmed addressed. Six form schemas, 42 actual intake-policy scenarios, and exact preservation of 24 full answers passed across both projects.
- [Independent documentation workflow E2E sign-off](https://github.com/talaniz/doom-control/pull/15#issuecomment-5762516244): realistic feature, bug, and documentation authoring walkthroughs for both projects; 54 actual intake decisions and preservation of 24 full answers passed, including missing sections, absent/unauthorized actor evidence and withdrawn authorization.
- Reporting navigation, existing remote category labels, preserved template configuration, and diff whitespace passed. Implementation-head repository CI passed.

## Limitations and activation

Submission Markdown was constructed locally from GitHub's documented field-to-heading conversion. Native GitHub chooser and required-field UI have not been exercised; verify all three choices after merge into the default branch. This is a documentation workflow review, not a new application E2E acceptance run. No real issues or execution jobs were created, and DOOM's application UI is unchanged.

Merge remains an owner action. Merging activates the templates on GitHub; no Pi deployment or reboot is needed. This notes-only commit requires final-head review revalidation and passing CI, recorded on the PR rather than recursively copied into this file.
