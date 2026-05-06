# Mac Cleaner

[中文](README.zh-CN.md) | English

Mac Cleaner is a free, open-source, local visual macOS storage cleanup assistant built with Electron, React, and TypeScript. It scans low-risk user-level storage locations, explains what each cleanup candidate means, and only moves files to Trash after an explicit second confirmation.

## Install With English UI

Any GitHub user can build and install a double-clickable local app with the Mac Cleaner icon. This does not require our Apple Developer account and does not require your own Apple Developer account.

```bash
git clone https://github.com/zuoyi666/mac-cleaner.git
cd mac-cleaner
npm ci
npm run install:local:en
```

By default, the app is installed to the Desktop:

```bash
~/Desktop/Mac Cleaner.app
```

This command sets the default interface language on this Mac to English. The preference is stored only on this device in:

```bash
~/Library/Application Support/Mac Cleaner/settings.json
```

On first install, the terminal lets you enter another install directory; press Enter to keep the Desktop default. You can also pass the install directory explicitly:

```bash
npm run install:local:en -- --install-dir "$HOME/Tools"
```

You can still switch to Chinese from the Local Settings card inside the app. This is an unsigned local build from source, so macOS may show an unsigned-app warning the first time you open it.

## Safety Model

- No automatic deletion.
- No permanent deletion.
- No administrator privilege escalation.
- No telemetry, cloud sync, account system, or background cleanup task.
- Cleanup actions only accept candidate IDs produced by the scanner, never arbitrary paths from the renderer.
- Cleanup confirmations are bound to the scan ID and path snapshot shown in the preview.
- Confirmed cleanup uses macOS Trash through Electron `shell.trashItem`, then verifies the original path is gone.
- Inaccessible paths, symbolic links, and paths outside the fixed allowlist are skipped or blocked.
- The app reports Trash size changes as an estimate; macOS may rename items inside Trash.

## Current Scan Scope

The current release intentionally keeps scope conservative:

- `~/Library/Caches`
- `~/Library/Logs`
- `~/Library/Logs/DiagnosticReports`
- `~/Library/Logs/CrashReporter`
- `~/Library/HTTPStorages` (requires confirmation because it can include cookies, sessions, or site data)
- `~/Library/Saved Application State`
- old installer/archive files in `~/Downloads`
- `~/.Trash` size is reported only; the app does not empty Trash

Each cleanup item is labelled as:

- `Safe to Clean`: low-risk cache, log, or diagnostic data
- `Review First`: user-visible or potentially useful generated/downloaded data
- `Not Recommended`: blocked, inaccessible, unsupported, or unclear-risk data

Small same-kind items are grouped by default so the app does not flood you with dozens of tiny files. Large safe caches and old installers stay visible as individual rows.

## Language

The interface supports Chinese and English. Language-specific install commands set the default language for this Mac:

```bash
npm run install:local:en
npm run install:local:zh
```

The in-app language switch remains available in Local Settings. Language preference never leaves the device.

## Development

Requirements:

- macOS
- Node.js 22+
- npm

Install dependencies:

```bash
npm ci
```

Run the desktop app:

```bash
npm run dev
```

Install a local double-clickable app with English as the default UI:

```bash
npm run install:local:en
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

Install and keep the maintainer's local app synced from this source checkout:

- The app checks the current GitHub branch at startup and from Local Settings.
- When an update is available, Sync and Install runs `git pull --ff-only`, `npm ci`, `npm run package:dir`, installs to `~/Desktop/Mac Cleaner.app`, and restarts the app.
- The update is blocked if tracked local files are dirty or if the branch diverged from its upstream.

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

`v0.5.0` changes the default install location to Desktop, allows first-install directory selection, and keeps language-directed install commands. GitHub CI runs typecheck, tests, production build, Electron smoke test, audit, and an unsigned Electron packaging dry-run.

## Maintainer Push Helpers

Push regular changes after validation:

```bash
npm run changes:push -- --message "feat: describe change"
```

Bump a SemVer version, validate, commit, and push the current PR branch:

```bash
npm run version:push -- --level patch --message "chore: release patch"
```

Use `--dry-run` to preview the commands without changing files or pushing.

## Versioning

This project uses SemVer:

- patch releases for bug fixes and small safety/UI improvements
- minor releases for new scan categories or cleanup capabilities
- major releases for incompatible cleanup policy or public API changes

## License

MIT
