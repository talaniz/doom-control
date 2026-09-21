# Reporting issues for DOOM Dashboard

Open [New issue](https://github.com/talaniz/doom-control/issues/new/choose) and choose **Feature request**, **Bug report**, or **Documentation request**. These forms become available after their files are merged into the default branch.

- Features describe the user problem, scope, observable outcomes, and verification.
- Bugs put expected/actual behavior in Objective, affected areas and environment in Scope, and reproduction steps/regression checks in Verification.
- Documentation requests identify the reader in Objective, affected pages and references in Scope, expected improvements in Acceptance criteria, and a reader walkthrough in Verification.

All three require **Objective**, **Scope**, **Acceptance criteria**, and **Verification**. These exact labels produce the Markdown headings consumed by Prime Mover. All submitted answers stay within these four sections because only the extracted contract is passed to execution and review tasks. Use concrete prose or lists under them; do not rename/repeat the contract headings or replace their contents with TODO, TBD, or N/A. Use plain-text lead-ins such as `Steps to reproduce:` inside an answer, rather than additional Markdown headings. You can describe verification steps in plain language when you do not know test commands. Maintainers should clarify incomplete scope or verification before authorizing work.

The forms apply only category labels (`enhancement`, `bug`, or `documentation`). Submitting a form does not enqueue execution by itself. An allowlisted maintainer must separately apply `codex-ready` after reviewing the contract. Remove that label to withdraw authorization; materially editing already-authorized work requires reconciliation. Merge and deployment approval remain separate.

Search existing issues first. Keep passwords, tokens, private conversations, and unredacted logs/screenshots out of issue text. Blank issues remain available for other requests; they also need a complete contract before execution.

If a ticket depends on another change, identify that dependency in Scope and wait until its prerequisite is available on `main` before authorizing it. The current worker does not automatically stack dependent PRs.
