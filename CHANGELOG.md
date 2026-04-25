# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
