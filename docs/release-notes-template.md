# Mac Cleaner v0.2.0

## Highlights

- Adds a custom Mac Cleaner app icon for local `.app`, `.dmg`, and `.zip` builds.
- Adds maintainer-only Developer ID signing and Apple notarization release workflow.
- Keeps local contributor builds free, open source, unsigned, and telemetry-free.

## Downloads

- Download the signed and notarized `.dmg` from this release for the easiest install path.
- Source builds are still supported with `npm install` and `npm run package:dir`.

## Safety

Mac Cleaner still does not auto-delete files, does not permanently delete files, does not request administrator access, and does not run telemetry or background cleanup jobs.

## Verification

Maintainer release artifacts should be verified with:

```bash
codesign --verify --deep --strict --verbose=2 "release/mac-arm64/Mac Cleaner.app"
spctl -a -vvv --type exec "release/mac-arm64/Mac Cleaner.app"
xcrun stapler validate release/*.dmg
```
