# Dynomite

A macOS Electron app for browsing and querying DynamoDB tables across multiple AWS SSO profiles.

<img width="2000" height="1232" alt="image" src="https://github.com/user-attachments/assets/bab4f719-04df-44c3-a4d2-8fb8b207175d" />


## Features

### Profile & Authentication
- **Multi-Profile Support**: Reads AWS profiles from `~/.aws/config`
- **SSO Authentication**: One-click login via AWS CLI
- **Profile Switching**: Quickly switch between AWS accounts/environments

### Table Browser
- **Table List**: Browse all DynamoDB tables per profile with search
- **Table Details**: View key schema, GSIs, LSIs, item counts, and table size
- **Multi-Tab Interface**: Open multiple tables in separate tabs

### Query Builder
- **Visual Query Builder**: Build queries without writing KeyConditionExpressions
- **Index Selection**: Query primary table or any GSI/LSI
- **Sort Key Operators**: `=`, `begins_with`, `between`, `<`, `<=`, `>`, `>=`
- **Configurable Limits**: Set max results with auto-pagination

### Results Table
- **Spreadsheet-Style View**: Powered by TanStack Table
- **Sorting**: Click column headers to sort
- **Column Reordering**: Drag columns to rearrange
- **Cell-Level Copy**: Click any cell to copy its value
- **Row Expansion**: Click rows to see full attribute details
- **Type-Aware Rendering**: Booleans, numbers, objects, and arrays rendered appropriately

### Data Operations
- **Inline Editing**: Edit individual rows or bulk edit multiple items
- **Insert Rows**: Add new items directly from the UI
- **Delete Items**: Remove items with confirmation
- **Batch Operations**: Process multiple changes with progress tracking

### Export
- **JSON/CSV Export**: Export query results to file
- **Field Selection**: Choose which fields to include
- **Row Selection**: Export all results or just selected rows

### Bookmarks
- **Save Queries**: Bookmark frequently used queries per table
- **Cross-Environment**: Bookmarks work across environments with matching table prefixes

### Other
- **Dark/Light Mode**: Follows system preference
- **Auto-Updates**: Automatic update notifications and installation

## Performance

Dynomite auto-paginates through DynamoDB results with streaming progress updates.

| Records | Time | Throughput |
|--------:|-----:|-----------:|
| ~250 | <100ms | ~2,500 items/sec |
| ~12,000 | ~2-3s | ~4,500 items/sec |
| ~100,000 | ~10s | ~9,500 items/sec |

*Benchmarks from querying production DynamoDB tables over network.*

## Prerequisites

- Node.js 18+
- AWS CLI v2 installed and configured with SSO profiles
- macOS (designed for macOS with native title bar)

## Setup

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev
```

## Development Commands

```bash
npm run dev              # Run full dev mode (Vite + Electron)
npm run build            # Build everything for production
npm run build:electron   # Build only Electron main process
npm run package:mac      # Package as macOS app
npm run lint             # Run ESLint
```

## Architecture

```
dynomite/
├── electron/           # Main process (Node.js)
│   ├── main.ts         # Electron entry point
│   ├── preload.ts      # Context bridge (IPC)
│   ├── ipc/            # IPC handlers
│   └── services/       # AWS SDK logic
├── src/                # Renderer process (React)
│   ├── components/     # UI components
│   ├── stores/         # Zustand state management
│   ├── lib/            # Utilities
│   └── types/          # TypeScript types
```

### Security

- Credentials never touch the renderer process
- All AWS operations happen in the main process via IPC
- Context bridge exposes only specific APIs to the renderer

### Table Matching

Tables are matched across environments using their stable CloudFormation prefix:
```
{StackName}-{TableLogicalId}{Hash}-{RandomSuffix}
         ↑ stable across envs ↑    ↑ varies ↑
```

This enables bookmarks and future "Open in Profile B" functionality to find equivalent tables across AWS accounts.

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for planned features including:

- **Post-Query IN Filter**: Client-side filtering for `attribute IN [value1, value2, ...]`
- **Environment Switcher**: "Open in DEV/TEST/PROD" button to run the same query in another profile
- **Query Suggestions**: Parse README/docs to suggest likely queries based on data model

## Tech Stack

- **Electron** - Desktop app framework
- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Tailwind CSS 4** - Styling
- **Zustand** - State management
- **TanStack Table** - Data table
- **AWS SDK v3** - DynamoDB operations

## License

MIT
