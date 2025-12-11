# Changelog

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
