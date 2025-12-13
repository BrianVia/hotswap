# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dynomite is a macOS Electron app for browsing and querying DynamoDB tables across multiple AWS SSO profiles. It uses React 19, TypeScript, Vite, Tailwind CSS 4, and Zustand for state management.

## Commands

```bash
npm run dev              # Run full dev mode (Vite + Electron concurrently)
npm run build            # Build everything for production
npm run build:electron   # Build only Electron main process (run after modifying electron/)
npm run package:mac      # Package as macOS app
npm run lint             # ESLint
```

## Architecture

### Process Separation
- **Main Process** (`electron/`): Handles all AWS SDK operations, credentials, and system APIs. Credentials never touch the renderer.
- **Renderer Process** (`src/`): React UI. Communicates with main via IPC through the `window.dynomite` API.
- **Preload** (`electron/preload.ts`): Context bridge exposing `window.dynomite` API to renderer.

### Key Data Flow
1. Renderer calls `window.dynomite.queryTable(...)`
2. Preload forwards via `ipcRenderer.invoke('dynamo:query', ...)`
3. Main process handler in `electron/ipc/handlers.ts` executes with AWS SDK
4. Results returned through IPC

### State Management (Zustand Stores)
- `tabs-store.ts`: Multi-tab query sessions with query state per tab
- `profile-store.ts`: Selected AWS profile, auth status
- `table-store.ts`: Selected table info
- `pending-changes-store.ts`: Staged edits before applying to DynamoDB

### Main Components
- `TabContent.tsx`: Query builder, results table (virtualized with TanStack), inline editing
- `ProfileSelector.tsx`: AWS profile dropdown with SSO login
- `TableList.tsx`: Table browser with search
- `dialogs/`: EditRowDialog, BulkEditDialog, FieldPickerDialog, ExportDialog

### IPC API (`window.dynomite`)
- Profile/Auth: `getProfiles()`, `checkAuthStatus()`, `loginWithSSO()`
- DynamoDB Read: `queryTable()`, `scanTable()`, `queryTableBatch()`, `scanTableBatch()`
- DynamoDB Write: `putItem()`, `updateItem()`, `deleteItem()`, `batchWrite()`
- Progress events: `onQueryProgress()`, `onWriteProgress()`

## Type System

Types are defined in two places:
- `electron/types.ts`: Main process types (used by IPC handlers)
- `src/types/index.ts`: Renderer types (re-exports + declares `window.dynomite`)

When adding IPC methods: update both `electron/preload.ts` (implementation) and `src/types/index.ts` (declaration).

## Table Matching

Tables are matched across AWS environments using their stable CloudFormation prefix (before the random suffix). This enables "Open in another profile" functionality.

## Git Commits & Releases

This project uses **release-please** for automated changelog generation and releases. Follow these guidelines:

### Conventional Commits (Required)

Use conventional commit format so release-please can generate changelogs:

```
<type>: <description>

[optional body]
```

**Types:**
- `feat:` New feature → appears in "Features" section
- `fix:` Bug fix → appears in "Bug Fixes" section
- `perf:` Performance improvement → appears in "Performance" section
- `refactor:` Code refactoring (no feature change)
- `docs:` Documentation only
- `chore:` Maintenance (hidden from changelog)

**Examples:**
```
feat: add profile color customization
fix: resolve Enter key not triggering query
perf: memoize TabResultsTable to prevent unnecessary re-renders
```

### Atomic Commits

- **One logical change per commit** - Don't bundle unrelated changes
- **Commit working states** - Each commit should compile and run
- **Split large features** - Break into smaller, reviewable commits

**Good:**
```
feat: add local state for query inputs
perf: memoize TabQueryBuilder component
perf: memoize TabResultsTable component
```

**Bad:**
```
feat: fix input lag and add memoization and rename variables
```

### Release Flow

1. Push conventional commits to `main`
2. Release-please opens/updates a "Release PR"
3. Merge the Release PR to publish a new version
4. GitHub Release is created with changelog, binaries attached automatically
