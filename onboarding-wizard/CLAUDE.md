# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

The **Onboarding Wizard** is a React + TypeScript customer onboarding application that guides Fullbay repair shop customers through AutoCare (ACES/PIES) data validation, vehicle clean-up, and export packaging. The system consists of a Vite-powered React frontend and an Express API backend that orchestrates the `transformer/` pipeline, hydrates vehicle/parts matches from generated output, and persists review decisions in per-customer workspaces.

## Architecture

### Full-Stack TypeScript Application
- **Frontend**: React 18 + TypeScript + Vite (port 3005)
- **Backend**: Express API + TypeScript (port 4005)
- **State Management**: Zustand for client-side state
- **Data Layer**: File-based persistence with JSON storage
- **Build System**: Concurrent client/server builds with TypeScript compilation

### Key Design Patterns

**Shared Types**: `shared/onboarding.ts` defines the contract between frontend and backend:
- `VehicleMatch` and `PartMatch` represent standardized data with AutoCare matching
- `CustomerProfile` tracks onboarding session state
- `ReviewSummary` provides completion metrics

**Session Management**: `server/lib/sessionStore.ts` manages in-memory sessions with file-based persistence to `customer-output/<customerId>/review-state.json` for resumability.

**Data Pipeline Integration**: The server expects transformer output at `../output/<customerId>/` with customer units organized as:
```
../output/<entityId>/customers/<customerId>/units/<unitId>/entity.json
```

**Multi-Tenant Architecture**: Each customer gets isolated workspace at `customer-output/<customerId>/` containing:
- `review-state.json` - session state persistence
- `vehicles-reviewed.json` - validated vehicle data
- `parts-reviewed.json` - validated parts data
- `summary.json` - completion metrics
- `raw-output/` - copy of transformer export

## Development Commands

### Development
```bash
npm run dev              # Start both client (3005) and server (4005) concurrently
npm run dev:client       # Start only Vite dev server
npm run dev:server       # Start only Express API with tsx watch
```

### Build
```bash
npm run build            # Build server then client for production
npm run build:client     # Build Vite bundle
npm run build:server     # Compile TypeScript server to dist/server
```

### Type Checking
```bash
npm run type-check       # Run TypeScript compiler without emitting files
```

## API Architecture

### Endpoints (all under `/api/onboarding`)

**POST /lookup** - Find customer by username, searches transformer output tree

**POST /bootstrap** - Initialize onboarding session:
- Validates transformer output exists at `../output/<customerId>/`
- Loads vehicle/unit matches from `customers/<customerId>/units/*/entity.json`
- Loads parts data from transformer output
- Creates session workspace at `customer-output/<customerId>/`
- Returns session metadata + initial vehicle/parts arrays

**GET /:customerId/vehicles** - Retrieve vehicles with validation summary

**POST /:customerId/vehicles/:vehicleId** - Update vehicle with corrections or mark as legacy

**GET /:customerId/parts** - Retrieve parts with validation summary

**POST /:customerId/parts/:partId** - Update part with overrides or mark as legacy

**POST /:customerId/complete** - Finalize onboarding:
- Copies transformer output to `customer-output/<customerId>/raw-output/`
- Writes reviewed vehicle/parts JSON files
- Generates summary with validation counts and export path

### Error Handling
All endpoints use `handleError()` utility that extracts `statusCode` from error objects and returns consistent JSON error responses.

## Frontend Architecture

### Pages (`src/pages/`)
- `CustomerIntakePage.tsx` - Customer lookup and session initialization
- `VehicleReviewPage.tsx` - Vehicle validation with AutoCare matching
- `PartsReviewPage.tsx` - Parts validation with PIES matching
- `ReviewSummaryPage.tsx` - Completion summary with metrics

### State Management (`src/state/wizardStore.ts`)
Zustand store manages:
- Session metadata and customer profile
- Vehicle/parts arrays with optimistic updates
- Validation summaries (totals, top failures)
- Per-item update functions for granular state changes

### API Client (`src/services/onboardingApi.ts`)
Typed axios-based client wrapping all `/api/onboarding` endpoints with TypeScript interfaces from `shared/onboarding.ts`.

### Routing
React Router 6 with routes defined in `src/App.tsx`, shared `WizardLayout.tsx` provides progress indicator.

## Server Library Modules (`server/lib/`)

**vehicleLoader.ts** - Loads unit entities from transformer output, calculates AutoCare match confidence, builds validation suggestions (VIN normalization, AutoCare standardization)

**partLoader.ts** - Similar pattern for parts data with PIES matching

**transformerRunner.ts** - Validates transformer output exists (currently expects pre-generated data)

**sessionStore.ts** - In-memory session cache + JSON file persistence with atomic writes

**customerLookup.ts** - Searches transformer output for customers by username/title/ID

**fileUtils.ts** - Filesystem utilities (pathExists, readJson, writeJson, copyDirectory)

## Data Validation Logic

### Vehicle Matching (server/lib/vehicleLoader.ts:150-185)
`recalcVehicle()` validates:
- VIN presence and format (17-character alphanumeric)
- Make/model/year completeness
- AutoCare confidence threshold (warns if <80%)

Creates `matchedAttributes` (captured + AutoCare data) and `unmatchedAttributes` (missing fields, low confidence).

### Suggestions System
`buildVehicleSuggestions()` generates actionable fixes:
- **vin-format**: Normalize to uppercase, strip punctuation
- **autocare-standardized**: Apply AutoCare make/model/year when available

Parts follow similar pattern with PIES-based matching.

## Environment Configuration

**PORT** - Override API port (default 4005)

**SKIP_TRANSFORMER_EXPORT** - When `true`, server expects transformer output already exists at `../output/<customerId>/` and will not attempt to generate it

## Filesystem Conventions

**Transformer Output** - Expected at `../output/<entityId>/customers/<customerId>/units/<unitId>/entity.json`

**Customer Workspaces** - Created at `../customer-output/<customerId>/` with:
- Session state
- Reviewed data exports
- Raw transformer output copy

**Path Resolution** - Server uses `process.cwd()` as base, expects to run from `onboarding-wizard/` directory

## TypeScript Configuration

**tsconfig.json** - Frontend config with React JSX, ES2020 target, strict mode

**tsconfig.server.json** - Server config targeting ES2022 with Node resolution

**tsconfig.node.json** - Vite config file compilation

**Shared Types** - `shared/onboarding.ts` uses `.ts` extension, imported by both client and server with proper module resolution

## Development Workflow

1. Ensure transformer has generated output at `../output/<customerId>/`
2. Run `npm run dev` to start both servers concurrently
3. Frontend proxies `/api` requests to Express backend via Vite config (vite.config.ts:18-23)
4. Client state updates optimistically, syncs to backend on save
5. Session state persists to disk, allowing resumable workflows

## Integration Points

**Transformer Pipeline** - Expects output structure with:
- Entity-level customer organization
- Unit entities with optional `standardizedVehicle` field containing AutoCare matches
- Parts data with PIES matching metadata

**AutoCare/ACES/PIES** - Vehicle and parts matching powered by transformer's AutoCare integration

**File System** - Heavy use of JSON file persistence for session state and final exports
