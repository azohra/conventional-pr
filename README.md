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

There is no required body, PR template, heading convention or line-length limit.
Markdown and additional footer names are accepted.

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

## Bodies and annotations

Write the outcome and context as ordinary prose, then add relevant footers:

```text
Return a validation error instead of terminating the process when a record
contains an invalid length. Valid records retain their existing behaviour.

Security: Malformed records can no longer terminate the process.
```

`Security:` records a specific security consequence. `Deprecated:` identifies
supported behaviour being retired and its replacement. Neither is required and
neither changes version semantics. Missing annotations are not negative findings.

Use plain-text footers at the end. Indent literal footer lines when documenting
their syntax in code examples, so a Conventional Commit parser does not treat
them as annotations on the change. Review still owns the accuracy and completeness
of the explanation.

## Generate changelogs

The [git-cliff preset](cliff.toml) renders the same records as concise summaries
with expandable Markdown explanations. Migration instructions and all other
footers remain visible, including security and deprecation annotations. Entries
link to their PRs when GitHub metadata is available, otherwise to their commits.
Repository identity comes from the checkout's Git remote. On a new local branch,
configure its upstream or pass `--github-repo owner/repo` before rendering.

Use git-cliff 2.14.1 or later and pin the preset to a reviewed full commit SHA:

```sh
git cliff --config-url https://raw.githubusercontent.com/azohra/conventional-pr/<full-commit-sha>/cliff.toml
```

The same option works with `--unreleased`, `--tag`, `--bumped-version` and
`--context`. JSON preserves the parsed records for other consumers. The preset
includes only Conventional commits, groups entries by type, and recognises
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
