# Mac Cleaner

Mac Cleaner is a free, open-source, local visual macOS storage cleanup assistant built with Electron, React, and TypeScript. It scans low-risk user-level storage locations, explains what each cleanup candidate means, and only moves files to Trash after an explicit second confirmation.

## Safety Model

- No automatic deletion.
- No permanent deletion.
- No administrator privilege escalation.
- No telemetry, cloud sync, account system, or background cleanup task.
- Cleanup actions only accept candidate IDs produced by the scanner, never arbitrary paths from the renderer.
- Cleanup confirmations are bound to the scan ID and path snapshot shown in the preview.
- Confirmed cleanup uses macOS Trash through Electron `shell.trashItem`.
- Inaccessible paths, symbolic links, and paths outside the fixed allowlist are skipped or blocked.

## Current Scan Scope

The first release intentionally keeps scope conservative:

- `~/Library/Caches`
- `~/Library/Logs`
- `~/Library/Logs/DiagnosticReports`
- `~/Library/Logs/CrashReporter`
- `~/Library/HTTPStorages` (requires confirmation because it can include cookies, sessions, or site data)
- `~/Library/Saved Application State`
- old installer/archive files in `~/Downloads`
- `~/.Trash` size is reported only; the app does not empty Trash

Each cleanup item is labelled as:

- `安全可清理`: low-risk cache, log, or diagnostic data
- `需确认`: user-visible or potentially useful generated/downloaded data
- `不建议清理`: blocked, inaccessible, unsupported, or unclear-risk data

## Development

Requirements:

- macOS
- Node.js 22+
- npm

Install dependencies:

```bash
npm install
```

Run the desktop app:

```bash
npm run dev
```

Run checks:

```bash
npm run icon:build
npm run typecheck
npm test
npm run build
npm run smoke:electron
npm audit
```

Create an unsigned local development app bundle:

```bash
npm run package:dir
```

This produces a double-clickable `.app` with the Mac Cleaner icon, but it is intentionally unsigned for local development.

Create unsigned macOS release artifacts locally:

```bash
npm run dist:mac
```

Maintainer-only signed and notarized macOS release artifacts:

```bash
npm run release:mac:preflight
npm run dist:mac:signed
```

Signing uses the maintainer's local `Developer ID Application` certificate and Apple notarization credentials. Secrets are not stored in this public repository or in GitHub Actions. See [docs/release-macos.md](docs/release-macos.md) for the full release workflow.

## Release Status

`v0.2.0` adds a custom app icon and maintainer-only macOS signing/notarization workflow. Contributor builds remain unsigned local development builds. GitHub CI runs typecheck, tests, production build, Electron smoke test, audit, and an unsigned Electron packaging dry-run.

## Versioning

This project uses SemVer:

- patch releases for bug fixes and small safety/UI improvements
- minor releases for new scan categories or cleanup capabilities
- major releases for incompatible cleanup policy or public API changes

## License

MIT
