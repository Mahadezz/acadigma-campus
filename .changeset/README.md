# Changesets

Versioning and changelogs for this monorepo. Every user-visible change ships with
a changeset so the release notes write themselves (DECISION-LOG D-14).

## Adding one

```bash
pnpm changeset
```

Pick the packages you touched, pick a bump (`patch` / `minor` / `major`), write one
sentence in the voice of a release note. This creates a markdown file in this folder
— commit it with your PR.

## Releasing

`.github/workflows/release.yml` runs `changesets/action` on every push to `main`.
It opens (or updates) a **Version Packages** PR; merging that PR bumps versions,
writes `CHANGELOG.md` files and publishes a tagged GitHub Release.

Full docs: <https://github.com/changesets/changesets>
