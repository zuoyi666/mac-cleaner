# Contributing

## Branch Flow

- Keep `main` buildable.
- Use `feature/<short-description>` or `codex/<short-description>` for updates.
- Open a pull request before merging changes into `main`.
- Require CI to pass before merging.

## Checks

Run these before pushing:

```bash
npm run typecheck
npm test
npm run build
npm audit
```

## Commit Style

Use short Conventional Commit style messages:

- `feat: add cleanup category`
- `fix: guard cleanup candidate paths`
- `docs: update release notes`

## Versioning

- Patch: fixes, tests, small safety improvements.
- Minor: new scan categories, UI features, cleanup capabilities.
- Major: incompatible cleanup policy or public interface changes.

Create releases with a SemVer tag such as `v0.1.0`.
