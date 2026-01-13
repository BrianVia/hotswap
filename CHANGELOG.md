# Changelog

## [1.8.0](https://github.com/BrianVia/dynomite/compare/v1.7.0...v1.8.0) (2026-01-13)


### Features

* add UI polish and micro-interactions ([4deaa4e](https://github.com/BrianVia/dynomite/commit/4deaa4e3f48edb7869517057ed1f47fb3d3e2656))

## [1.7.0](https://github.com/BrianVia/dynomite/compare/v1.6.0...v1.7.0) (2026-01-06)


### Features

* add input validation to all IPC handlers ([61657e6](https://github.com/BrianVia/dynomite/commit/61657e6541936aa0c86336c3b004ff43d3f9867f))
* support numeric key types in DynamoDB queries ([6f908eb](https://github.com/BrianVia/dynomite/commit/6f908eb99cb25776a01d027bd004859ec2e8d75c))


### Bug Fixes

* prevent query progress race conditions and improve error handling ([3a4edb6](https://github.com/BrianVia/dynomite/commit/3a4edb6effd066be4dab5864e0985d1e7500619a))

## [1.6.0](https://github.com/BrianVia/dynomite/compare/v1.5.1...v1.6.0) (2025-12-29)


### Features

* add bulk JSON import functionality ([#12](https://github.com/BrianVia/dynomite/issues/12)) ([db28f06](https://github.com/BrianVia/dynomite/commit/db28f065808b739e9175144fb01a13bac54e2417))


### Bug Fixes

* preserve nested objects in export by detecting all fields from rows ([#14](https://github.com/BrianVia/dynomite/issues/14)) ([c436de5](https://github.com/BrianVia/dynomite/commit/c436de59642e42b11870ac9f275babf815458d6b))

## [1.5.1](https://github.com/BrianVia/dynomite/compare/v1.5.0...v1.5.1) (2025-12-23)


### Bug Fixes

* preserve query results after saving table changes ([782094c](https://github.com/BrianVia/dynomite/commit/782094c45212c1982df7ad2f0ddd06be27826363))

## [1.5.0](https://github.com/BrianVia/dynomite/compare/v1.4.1...v1.5.0) (2025-12-17)


### Features

* add resizable sidebar ([4c917d9](https://github.com/BrianVia/dynomite/commit/4c917d97de91e8aee6e15fb467868673cc9b60e1))


### Bug Fixes

* extend PATH for AWS CLI in packaged app ([4d02792](https://github.com/BrianVia/dynomite/commit/4d02792d848493796d2dd992bfb2aab3b224e190))

## [1.4.1](https://github.com/BrianVia/dynomite/compare/v1.4.0...v1.4.1) (2025-12-16)


### Bug Fixes

* remove unused variables breaking CI build ([b2a4526](https://github.com/BrianVia/dynomite/commit/b2a45263e3f5bcde4ff95cfd515ef61cb7f5e4f1))

## [1.4.0](https://github.com/BrianVia/dynomite/compare/v1.3.0...v1.4.0) (2025-12-16)


### Features

* add JavaScript bulk edit for transforming field values ([f8caa08](https://github.com/BrianVia/dynomite/commit/f8caa08540de3deb4edc2ea2de934fa4af346554))
* add production environment warning to confirmation dialog ([16b4fca](https://github.com/BrianVia/dynomite/commit/16b4fcac9b7ad2fc07fb4eea99fe8e0c3b07e429))
* add query cancellation support ([8cb825e](https://github.com/BrianVia/dynomite/commit/8cb825e5211bd85fdcb99704fb3db11738b8f766))
* add quick "Set to value" option in bulk edit context menu ([671ac5a](https://github.com/BrianVia/dynomite/commit/671ac5a5c18c849387918b69c285e6b7cca93ffd))
* add theme selector UI ([8604baf](https://github.com/BrianVia/dynomite/commit/8604baf07c39ee87f7c686deb805976a6a81268c))


### Bug Fixes

* auto-add return statement for expression scripts ([3938429](https://github.com/BrianVia/dynomite/commit/3938429c9812aaa8ca6b4bea5738d77bc0186fe3))
* improve profile selector spacing and dropdown positioning ([8ce9c7a](https://github.com/BrianVia/dynomite/commit/8ce9c7a8ee0378fcafd6f54be06a9138c31d5936))
* include maxResults in TabResultsTable memo comparison ([4028846](https://github.com/BrianVia/dynomite/commit/4028846f018f04cce170ded8212b389bbdef4cde))
* prevent Cmd+A from selecting rows when in textarea ([d33a720](https://github.com/BrianVia/dynomite/commit/d33a7208063550b215f3950022144806cf18c58c))
* show row count in JavaScript edit menu item ([c6a95db](https://github.com/BrianVia/dynomite/commit/c6a95db5bacf278a39362410d3f9328d3ef70e7e))


### Performance Improvements

* optimize tab switching for large result sets ([37f4803](https://github.com/BrianVia/dynomite/commit/37f4803d5332bd272304f65ad80639c2a50b6ccd))

## [1.3.0](https://github.com/BrianVia/dynomite/compare/v1.2.0...v1.3.0) (2025-12-13)


### Features

* rename project from HotSwap to Dynomite ([d460ab9](https://github.com/BrianVia/dynomite/commit/d460ab94f4faf5137e659096909e050b7170be0d))


### Bug Fixes

* allow opening multiple tabs for the same table ([7996c37](https://github.com/BrianVia/dynomite/commit/7996c37afdec631d133cf1dfa6b93723dd64cedd))

## [1.2.0](https://github.com/BrianVia/hotswap/compare/v1.1.0...v1.2.0) (2025-12-12)


### Features

* add bookmarks feature and fix sidebar layout ([e288227](https://github.com/BrianVia/hotswap/commit/e2882272473a1951a6a58c7c58d43360e5b24f42))
* add cell-level copy to results table ([a4a555d](https://github.com/BrianVia/hotswap/commit/a4a555d082be92b3e2bf154e1b94906e36cba355))
* add Insert Row dialog with JSON mode and column resizing ([159b526](https://github.com/BrianVia/hotswap/commit/159b526718b0c77ff6d113af7d3846bcfb7dcbbb))

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
