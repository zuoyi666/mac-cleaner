# Mac Cleaner

Free, open-source, local macOS storage cleanup assistant. No telemetry, no background cleanup, no administrator permission requests, and no permanent deletion.

Choose your GitHub guide:

- [中文说明与中文界面安装](README.zh-CN.md)
- [English guide and English UI install](README.en-US.md)

The language-specific install commands set the default interface language on this Mac. The default install location is `~/Desktop/Mac Cleaner.app`, and first install allows choosing another local directory. You can still switch between Chinese and English inside Mac Cleaner later. The interface also includes multiple local themes and defaults to your macOS light/dark appearance.

## Quick Safety Notes

- Builds a user-space storage map while keeping cleanup actions limited to curated safe candidates.
- Explains what each cleanup candidate is before cleanup.
- Moves confirmed items to macOS Trash only after a second confirmation.
- Keeps language, theme, and install-location preferences local in `~/Library/Application Support/Mac Cleaner/settings.json`.

## License

MIT
