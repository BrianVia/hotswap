# Dynomite - DynamoDB Explorer for AWS SSO

A local macOS Electron app for browsing and querying DynamoDB tables across multiple AWS SSO profiles.

## Features (Phase 1)

- **Profile Management**: Reads AWS profiles from `~/.aws/config`
- **SSO Authentication**: One-click login via AWS CLI (`aws sso login`)
- **Table Browser**: List all DynamoDB tables per profile
- **Table Details**: View key schema, GSIs, LSIs, item counts, and table size
- **Dark/Light Mode**: Follows system preference

## Prerequisites

- Node.js 18+
- AWS CLI v2 installed and configured
- macOS (designed for macOS with native title bar)

## Setup

```bash
# Install dependencies
npm install

# Build the Electron main process
npm run build:electron

# Run in development mode (opens browser + Electron)
npm run dev
```

## Development Commands

```bash
# Run full dev mode (Vite + Electron)
npm run dev

# Build everything for production
npm run build

# Package as macOS app
npm run package:mac
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
│   ├── stores/         # Zustand state
│   ├── hooks/          # React hooks
│   └── types/          # TypeScript types
```

## How It Works

1. **Config Parsing**: Reads `~/.aws/config` to extract SSO profiles
2. **Authentication**: Spawns `aws sso login --profile X` when needed
3. **AWS SDK**: Uses credential-provider-sso to get temporary credentials
4. **DynamoDB**: All operations go through the main process (secure)

## Coming in Phase 2

- Query Builder (visual PK/SK/filter builder)
- Query Execution with results table
- Post-query filtering (IN arrays, contains, etc.)
- Export to JSON/CSV with field selection
- Cross-environment query switching ("Open in Profile B")

## Table Matching Logic

Tables are matched across environments using their stable CloudFormation prefix:
- `MyStack-MyTableLogicalId` (stable) + `-RANDOMSUFFIX` (varies per env)

This allows "Open in Profile B" to find the equivalent table in another AWS account/environment.

## Notes

- Credentials never touch the renderer process
- All AWS operations happen in the main process via IPC
- Theme follows system preference automatically
