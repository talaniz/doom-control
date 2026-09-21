# Reporting issues for DOOM Dashboard

Open [New issue](https://github.com/talaniz/doom-control/issues/new/choose) and choose **Feature request**, **Bug report**, or **Documentation request**. These forms become available after their files are merged into the default branch.

- Features describe the user problem, scope, observable outcomes, and verification.
- Bugs include reproduction steps, expected/actual behavior, optional environment/evidence, and a fix contract.
- Documentation requests identify the reader, affected pages, scope, expected improvements, and a reader walkthrough.

All three require **Objective**, **Scope**, **Acceptance criteria**, and **Verification**. These exact labels produce the Markdown headings consumed by Prime Mover. Use concrete prose or lists under them; do not rename/repeat the contract headings or replace their contents with TODO, TBD, or N/A. You can describe verification steps in plain language when you do not know test commands. Maintainers should clarify incomplete scope or verification before authorizing work.

The forms apply only category labels (`enhancement`, `bug`, or `documentation`). Submitting a form does not enqueue execution by itself. An allowlisted maintainer must separately apply `codex-ready` after reviewing the contract. Remove that label to withdraw authorization; materially editing already-authorized work requires reconciliation. Merge and deployment approval remain separate.

Search existing issues first. Keep passwords, tokens, private conversations, and unredacted logs/screenshots out of issue text. Blank issues remain available for other requests; they also need a complete contract before execution.

If a ticket depends on another change, identify that dependency in Scope and wait until its prerequisite is available on `main` before authorizing it. The current worker does not automatically stack dependent PRs.
