# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ShipLog is an AI-powered GitHub activity feed that transforms GitHub events (pushes, pull requests) into human-readable digests with impact analysis. It uses Convex as the backend (database + serverless functions) with a React frontend.

## Development Commands

This project uses **bun** as the package manager (not npm).

```bash
# Start development (frontend + backend in parallel)
bun run dev

# Run tests
bun run test           # Watch mode
bun run test:once      # Single run
bun run test:coverage  # With coverage

# Build and lint
bun run build          # TypeScript check + Vite build
bun run lint           # TypeScript + ESLint
```

## Architecture

### Backend (Convex)

The `convex/` directory contains all backend code running on Convex:

- **schema.ts** - Database schema with tables: `users`, `repositories`, `events`, `digests`, `codeSurfaces`, `surfaceImpacts`, `digestPerspectives`, `summaries`
- **http.ts** - HTTP endpoints for GitHub webhooks (`/github/webhook`) and OAuth callback (`/github/callback`)
- **ai.ts** - AI digest generation using Vercel AI SDK with OpenAI/Anthropic/OpenRouter
- **events.ts**, **digests.ts**, **repositories.ts**, **users.ts** - CRUD operations for each entity
- **surfaces.ts**, **surfacesActions.ts** - Code surface indexing for impact analysis
- **summaries.ts**, **summariesAi.ts** - Periodic summary generation (daily/weekly/monthly)

**Key patterns:**
- Public functions use `query`/`mutation`/`action`, internal use `internalQuery`/`internalMutation`/`internalAction`
- File-based routing: `convex/foo.ts` exports become `api.foo.*` or `internal.foo.*`
- Always include argument validators (`args: {}`) and return validators (`returns: v.xxx()`)
- Actions with Node.js modules require `"use node";` at top of file

### Frontend (React + Vite)

- **src/main.tsx** - App entry with Clerk auth + Convex provider setup
- **src/App.tsx** - Routes: `/` (Summary), `/feed` (Feed), `/github/callback`
- **src/pages/** - Page components (Dashboard, Feed, Summary)
- **src/components/** - UI components organized by feature (feed/, layout/, github/, settings/, summary/, common/)
- **src/components/ui/** - shadcn/ui component library
- **src/hooks/** - Custom hooks for Convex queries (useEvents, useDigests, useRepository, etc.)

### Data Flow

1. GitHub webhook → `http.ts` → creates `event` record
2. Event triggers `ai.digestEvent` action → generates digest with AI
3. Frontend queries digests via hooks → displays in feed/summary views

## Key Conventions

### Convex Functions

Always use the new function syntax with validators:
```typescript
import { query } from "./_generated/server";
import { v } from "convex/values";

export const myQuery = query({
  args: { id: v.id("tableName") },
  returns: v.object({ name: v.string() }),
  handler: async (ctx, args) => {
    // implementation
  },
});
```

Use `v.null()` for functions that don't return a value.

### UI Components

- Use shadcn/ui components from `src/components/ui/`
- Use Lucide React icons exclusively (`lucide-react`)
- Never use unicode arrows/symbols or other icon libraries

### Testing

Tests use `convex-test` with `vitest` in edge-runtime environment. Test files are in `convex/*.test.ts`.

## Environment Variables

Required for local development:
- `VITE_CONVEX_URL` - Convex deployment URL
- `VITE_CLERK_PUBLISHABLE_KEY` - Clerk auth

Convex environment variables (set via dashboard):
- `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`
- `FRONTEND_URL`
