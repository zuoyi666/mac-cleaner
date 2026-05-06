# macOS Release Guide

This project supports two macOS build paths:

- unsigned local development builds for contributors
- signed and notarized release builds for the maintainer

Apple certificates, API keys, app-specific passwords, and private key files must never be committed to this repository.

## Prerequisites

- macOS with Xcode command line tools
- Node.js 22+
- GitHub CLI authenticated with release upload permission
- Apple Developer Program membership
- A `Developer ID Application` certificate installed in Keychain
- App Store Connect API key credentials for notarization

Recommended notarization environment:

```bash
export APPLE_API_KEY="/absolute/path/to/AuthKey_XXXXXXXXXX.p8"
export APPLE_API_KEY_ID="XXXXXXXXXX"
export APPLE_API_ISSUER="00000000-0000-0000-0000-000000000000"
```

If multiple signing identities are installed, pin the certificate:

```bash
export CSC_NAME="Developer ID Application: Your Name (TEAMID)"
```

## Preflight

Run the preflight check before producing signed artifacts:

```bash
npm run icon:build
npm run release:mac:preflight
```

The preflight validates macOS tooling, local signing identity, notarization environment variables, the app icon, and entitlement files.

## Build Unsigned Local App

Use this for local development and contributor testing:

```bash
npm run package:dir
```

This creates a local `.app` with the project icon but intentionally disables signing and notarization.

## Build Signed Release Artifacts

Use this for maintainer releases:

```bash
npm run dist:mac:signed
```

This produces signed and notarized `.dmg` and `.zip` artifacts in `release/`.

## Verify Release Artifacts

Verify the signed app bundle:

```bash
codesign --verify --deep --strict --verbose=2 "release/mac-arm64/Mac Cleaner.app"
spctl -a -vvv --type exec "release/mac-arm64/Mac Cleaner.app"
```

Validate stapled notarization for each DMG:

```bash
xcrun stapler validate release/*.dmg
```

For a final smoke test, download the GitHub Release DMG on a second Mac and open it from Finder.

## Publish

Create or update the SemVer tag and release, then upload artifacts:

```bash
git tag v0.2.0
git push origin v0.2.0
gh release create v0.2.0 --title "v0.2.0" --notes-file docs/release-notes-template.md
gh release upload v0.2.0 release/*.dmg release/*.zip --clobber
```

The release notes must say whether the uploaded artifacts are signed and notarized. Source builds remain available for users who prefer to build locally.
