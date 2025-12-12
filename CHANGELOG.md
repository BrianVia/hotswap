# Changelog

## [1.1.0](https://github.com/BrianVia/hotswap/compare/v1.0.2...v1.1.0) (2025-12-12)


### Features

* add View/Edit JSON option for rows ([0fb1e7c](https://github.com/BrianVia/hotswap/commit/0fb1e7cfe48eeda1162e8c6517835dc4cee2ec52))


### Bug Fixes

* make JSON editor modal 85% viewport, click-away to close ([8880605](https://github.com/BrianVia/hotswap/commit/8880605ca3f3be7a1b8437461e1a99718054e0f9))
* reorder context menu like Dynobase ([38e8219](https://github.com/BrianVia/hotswap/commit/38e821975a3651ec6e53f472ad0937b73a3887cd))

## [1.0.2](https://github.com/BrianVia/hotswap/compare/v1.0.1...v1.0.2) (2025-12-11)


### Bug Fixes

* configure electron-builder to publish to existing releases ([d18588c](https://github.com/BrianVia/hotswap/commit/d18588ca44ec63134f82972f7164538cd12d4d62))

## [1.0.1](https://github.com/BrianVia/hotswap/compare/v1.0.0...v1.0.1) (2025-12-11)


### Bug Fixes

* use npx for electron-builder in CI workflow ([4ca4555](https://github.com/BrianVia/hotswap/commit/4ca45550329d55cb9602de822342d17a5d48d6f5))

## 1.0.0 (2025-12-11)


### Features

* performance improvements, profile customization, and release automation ([c509c50](https://github.com/BrianVia/hotswap/commit/c509c503f780c4292feb3cfa54cd63523007e95d))


### Performance Improvements

* fix input lag in query builder ([68475d8](https://github.com/BrianVia/hotswap/commit/68475d8af0dd58622823b53a56b6c1dc114ac0c0))

## [0.2.0](https://github.com/BrianVia/hotswap/compare/v0.1.0...v0.2.0) (2024-12-11)

### Performance

* Fixed input lag in query builder - typing is now instant
* Added memoization to QueryBuilder and ResultsTable components
* Store updates deferred to onBlur to prevent cascading re-renders

### Features

* Profile customization (colors, display names, environments)
* Disable/hide profiles from selector
* Set default profile for auto-selection

### Bug Fixes

* Enter key now reliably triggers query execution
* Improved table scroll performance

## [0.1.0](https://github.com/BrianVia/hotswap/releases/tag/v0.1.0) (2024-12-10)

Initial release with core DynamoDB browsing functionality.
