# Conventional PR

Check a pull request's title and body as the Conventional Commit message that
will reach main through squash merging. Failures explain what to correct; valid
records are quiet.

The action checks:

- A Conventional title using lowercase `build`, `chore`, `ci`, `docs`, `feat`,
  `fix`, `perf`, `refactor`, `revert`, `style` or `test`. Scopes are optional.
- Both `!` and a nonempty uppercase `BREAKING CHANGE:` or `BREAKING-CHANGE:`
  footer when a breaking change is declared.
- A blank line separating the explanation from footers.
- Nonempty `Security:` and `Deprecated:` annotations when supplied.

A title that fully explains the change needs no body. Explanations are free-form
Markdown; no template, reserved headings or line-length limit is required.
Additional footer names are accepted.

These rules build on [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/).
The fixed lowercase types, use of both breaking markers and optional annotation
names are this action's conventions. The specification itself permits either
breaking marker. This action does not calculate versions, infer compatibility
from code, or verify factual claims in the description.

## Use on GitHub

Replace `<full-commit-sha>` with the reviewed revision you want to use:

```yaml
name: Conventional PR
on:
  pull_request_target:
    types: [opened, reopened, edited, synchronize]
permissions: {}
concurrency:
  group: conventional-pr-${{ github.event.pull_request.number }}
  cancel-in-progress: true
jobs:
  conventional-pr:
    runs-on: ubuntu-latest
    steps:
      - uses: azohra/conventional-pr@<full-commit-sha>
```

Require the job's result before merging. Preserve an existing required job name
when replacing another check. Configure squash messages to use the PR title and
body so the validated record is what lands on main.

The action reads the PR event as data. It needs no token, API request, checkout or
dependency installation in the consuming repository. It reports violations with
GitHub error annotations and a failing exit code. The `edited` event reruns it
when the title or body changes.

For another event, pass a JSON object with `title` and `body` through the
`pull-request` input. The caller retrieves the record and associates the check
with the correct commit; the action validates that record with the same rules.
This also supports generated release PRs without rewriting their notes or
exempting them from validation.

## Bodies and annotations

Describe what changed and why, including limitations and required actions.
Use headings when they help a reader navigate a larger change. Put structured
compatibility information, issue references and attribution in footers after
the explanation, separated by a blank line.

For example, `feat(profiles): switch profiles without restarting`:

```text
Switch between saved profiles while the service keeps running. Existing requests finish without interruption, and a failed switch leaves the previous profile active.

Resolve the selected profile before replacing the active connection pool.

Refs: #123
```

Write paragraphs without hard line wrapping. Preserve intentional lists, tables
and code blocks.

`Security:` records a specific security consequence or known advisory.
`Deprecated:` identifies supported behaviour being retired and its replacement.
Neither annotation is required or changes version semantics. A removed contract
requires breaking markers. Keep footer tokens at the end as plain text; indent
literal footer examples so a Conventional Commit parser does not interpret them
as metadata. Review owns factual accuracy and summary completeness.

## Generate changelogs

The [git-cliff preset](cliff.toml) puts breaking changes, security consequences
and deprecations first. Changes follow in Added, Fixed, Improved, Documentation
and Maintenance groups, with empty groups omitted. These correspond to `feat`,
`fix`, `perf`, `docs` and the remaining types. Entries link to their PR or commit;
a contributors line credits GitHub commit authors when available.

When a body uses `## Summary` and `## Details`, the preset keeps its Summary
visible and expands it into its Details. An entry with no Details has no
disclosure. Footers remain visible outside the expansion; the template does
not infer reviewers or coauthors. Bodies without the section structure render
intact. JSON retains original bodies and footers.

One PR is one entry in the group selected by its title. A mixed PR should explain
each material outcome in its body; body sections do not create separate
version impacts or inferred classifications.

Repository identity comes from the checkout's Git remote. On a new local branch,
configure its upstream or pass `--github-repo owner/repo` before rendering.

Use git-cliff 2.14.1 or later. Follow the maintained preset on main:

```sh
git cliff --config-url https://raw.githubusercontent.com/azohra/conventional-pr/main/cliff.toml
```

Use a full commit SHA instead of `main` when a fixed configuration is required.
The preset includes version rules as well as presentation; following main adopts
changes to both on the next invocation. Published release notes are not rewritten.

The same option works with `--unreleased`, `--tag`, `--bumped-version` and
`--context`. JSON preserves the parsed records for other consumers. The preset
includes only Conventional commits, retains type groups in JSON, and recognises
`vMAJOR.MINOR.PATCH` tags on the current branch. It uses git-cliff's default bump
rules with breaking changes incrementing the minor version before v1. When no
matching tags exist, the first version is `v0.1.0`; existing matching tags remain
the basis for subsequent versions.

`--config-url` replaces local configuration and fetches the preset on every run,
even with `--offline`; that flag disables remote metadata requests. Pinning fixes
the configuration contents, not its availability. Keep publication commands in
the consuming repository. Use git-cliff's native flags or
[environment overrides](https://git-cliff.org/docs/configuration/#environment-configuration-overrides)
for a different tag pattern or version policy.

## Local use and development

```sh
mise install
printf '%s\n' '{"title":"docs: correct an example","body":""}' | mise run lint:pr
```

`lint:pr` reads a JSON object with `title` and optional `body` from standard input.
It uses the same validator as the action; null and empty bodies are equivalent.

`mise run build` bundles the action and its parser into `dist/index.js`.
The bundle is tracked because GitHub runs JavaScript actions without installing
their dependencies. `mise run check` tests the source and packaged entry points,
verifies the bundle matches the locked dependencies and source, and lints the
workflows. Rebuild and commit the bundle when its inputs change.

The parser is [conventional-commits-parser](https://github.com/conventional-changelog/conventional-changelog/tree/master/packages/conventional-commits-parser),
under the MIT licence. Its complete notice is included in the bundle.
