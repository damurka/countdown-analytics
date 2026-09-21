# Changelog

All notable changes to this extension are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows
[Semantic Versioning](https://semver.org/).

## [2.0.0] - Unreleased

### Added

- Single extension bundling the **RMNCAH**, **Vaxx** and **Pooled** Shiny apps, replacing the
  separate `datasuite-rmncah`, `datasuite-vaxx` and `datasuite-pooled` extensions.
- `cd2030Docs` tool: look up which `cd2030.core` `CacheConnection` methods and fields each app page
  uses, with technical documentation and analysis rationale.
- `readCd2030Cache` tool: load an app's `.rds` cache into the managed R session as `.datasuite_cache`,
  always reopened fresh.
- Chat instructions for analysing data in the Countdown apps.
- MIT license, README and this changelog.

### Changed

- The extension now lives in its own repository and builds standalone (own `tsconfig`, pinned
  dependencies and lockfile) instead of inside the DataSuite monorepo.
- Releases are built and published by CI: pushing a `v*` tag packages the `.vsix`, publishes it to
  the DataSuite extension registry and creates a GitHub release.
- Package renamed from `datasuite-countdown` to `countdown-analytics`, so the extension ID is now
  `datasuite.countdown-analytics`.
- Refreshed the extension description and keywords.
