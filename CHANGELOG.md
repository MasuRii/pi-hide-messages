# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.1] - 2026-07-12

### Fixed
- Restored TUI hiding on Pi 0.80.5+ where the interactive renderer was refactored from `renderSessionContext()` to `renderSessionEntries()`/`renderSessionItems()`. The render patch now targets `renderSessionEntries` on current Pi and falls back to `renderSessionContext` on older releases, resolving the `InteractiveMode.renderSessionContext is unavailable` startup warning. ([#5](https://github.com/MasuRii/pi-hide-messages/issues/5))

### Changed
- Widened the Pi peer dependency range to include `^0.81.0`.

## [0.2.0] - 2026-07-03

### Added
- Added an `enabled` master config toggle to disable the extension without uninstalling. ([ea04f4c](https://github.com/MasuRii/pi-hide-messages/commit/ea04f4c171f98a859e57d11e1ae3e0d9908cb914))

### Changed
- Widened Pi peer dependency ranges to 0.80 and added security dependency overrides. ([2ac001c](https://github.com/MasuRii/pi-hide-messages/commit/2ac001c37059e8ffbb3885c08050102fbd417637))
- Extracted shared error and session-file utilities to reduce duplication. ([ea04f4c](https://github.com/MasuRii/pi-hide-messages/commit/ea04f4c171f98a859e57d11e1ae3e0d9908cb914))

## [0.1.7] - 2026-06-16

### Changed
- Replaced auto-hide, atomic-write, and session-file modules with append-only hide/restore intent recording and render-time omission.
- Tracked `visibleCount` and `firstVisibleEntryId` in the hide-messages control entry for more precise hide/restore state.

### Removed
- Removed the `auto-hide` session-start hook; hiding is now driven entirely by manual `/hide-messages` commands and render-time filtering.
- Removed the `atomic-write` and `session-file` modules that previously rewrote historical JSONL entries.

## [0.1.6] - 2026-06-01

### Changed
- Deferred command registration and render patch loading to reduce startup work.
- Expanded Pi peer dependency ranges to include `^0.77.0` and `^0.78.0`.

### Fixed
- Kept auto-hide live visibility updates consistent while hidden prefixes are applied.
- Updated restore command and runtime validation paths for async deferred render patching.

## [0.1.5] - 2026-05-26

### Changed
- Widened Pi peer dependency ranges to `^0.74.0 || ^0.75.0` for broader runtime compatibility.

## [0.1.4] - 2026-05-22

### Changed
- Aligned Pi peer dependency metadata with the `@earendil-works` Pi v0.75.4 extension runtime packages.

### Fixed
- Fixed global configuration loading for npm and git installs by resolving `config.json` from Pi's agent extension directory. Thanks @any-victor for the report and proposed fix.

## [0.1.3] - 2026-04-25

### Added
- Added runtime reload queue handling for hide and restore command reload failures
- Added runtime validation coverage for hide and restore command flows

### Changed
- Clarified global config path guidance in README and the example config template
- Aligned Pi peer dependency metadata with the local Pi v0.70.2 extension runtime target
- Extended Pi runtime type shims for the reload queue and validation coverage

## [0.1.1] - 2026-04-01

### Changed
- Added Related Pi Extensions cross-linking section to README for discoverability
- Aligned npm keywords for improved extension searchability (pi-coding-agent, pi-tui, coding-agent, context-window, messages, privacy)

## [0.1.0] - 2026-04-01

### Added
- Public repository scaffolding for standalone distribution: `README.md`, `LICENSE`, `CHANGELOG.md`, `.gitignore`, `.npmignore`, and `config/config.example.json`
- Installation, usage, command, and configuration documentation for `pi-hide-messages`
- Example configuration template for global and project-local Pi installs

### Changed
- Set the standalone extension baseline version to `0.1.0`
- Expanded npm/GitHub package metadata and keywords to improve extension discoverability
- Clarified README messaging that hidden entries only affect TUI visibility and preserve full model/agent session context
- Published package file list now includes public documentation and config example assets
