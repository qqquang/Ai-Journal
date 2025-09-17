# Repository Guidelines

## Project Structure & Module Organization
- `Requirements/` stores PRDs and wireframes; bump filenames with version suffixes (e.g., `_v3`).
- Source code lives in `app/` with `app/web` (Next.js) and `app/mobile` (Expo React Native). Shared journaling logic, prompt builders, and types belong in `packages/core` (create as soon as shared code emerges).
- Save research captures in `research/` plus a `README.md` describing source URLs and capture dates.

## Technology Stack
- **Frontend:** React Native (Expo) for mobile, Next.js for web companion, shared UI kit to keep parity.
- **State & Data:** React Query for remote data, lightweight store (Zustand) for local state, React Hook Form for entries.
- **Backend:** Supabase for auth/Postgres/storage with row-level security; edge functions for business logic.
- **AI Layer:** Supabase Edge Functions (or Cloudflare Workers) wrapping Gemini/OpenAI with versioned prompts under `packages/core/prompts`.
- **Analytics:** PostHog (self-hosted via Supabase) for anonymized habit metrics; Supabase logs for auditing.

## Build, Test, and Development Commands
- Run `npm install` at the repo root to hydrate workspaces. Core scripts:
  - `npm run dev:web` / `npm run build:web` / `npm run lint:web` / `npm run test:web`
  - `npm run start:mobile` / `npm run lint:mobile` / `npm run test:mobile`
- Web app includes `app/web/.env.local.example`; copy to `.env.local` with Supabase URL and anon key. Mobile uses `app/mobile/.env.example`.
- Record extra utilities (`npm run seed:demo`, migrations) inside `package.json` and mirror them here.

## Coding Style & Naming Conventions
- TypeScript with 2-space indentation; camelCase for variables/functions, PascalCase for components, kebab-case file names (`journal-timeline.tsx`).
- Keep components functional with hooks and scoped style files (`journal-entry.styles.ts`).
- Run the appropriate `npm run lint:*` before pushing; commit shared ESLint/Prettier configs.

## Testing Guidelines
- Jest + React Testing Library for unit/UI tests; Detox for mobile end-to-end flows; Playwright optional for web smoke tests.
- Mirror `src/` paths under `tests/` and suffix files with `.test.tsx` or `.spec.ts`.
- Cover the core loop (entry capture → AI reflection → suggested action). Stub Gemini responses; no live AI calls in CI.

## Commit & Pull Request Guidelines
- Write present-tense commits (`Implement AI reflection layout`, `Fix goal tracker totals #23`).
- Pull requests restate the problem, list key changes, note user impact, and attach screenshots or screen recordings for UI updates. Call out new env vars or scripts.
- Rebase onto `main` before requesting review and ensure lint/tests pass locally.

## Product Milestones (PRD Context)
- Milestone 1: journaling canvas with timestamped entries and right-rail AI reflection (reflection, reframe, action prompt).
- Milestone 2: goal setup, AI reframing of vague goals, and weekly nudges tied to entries.
- Milestone 3: pattern recognition with monthly progress reports; ship milestones sequentially.

## Security & Configuration Tips
- Keep secrets (e.g., `SUPABASE_SERVICE_ROLE`, `GEMINI_API_KEY`) in git-ignored env files and share via the approved secret manager.
- Anonymize journals and research exports. Strip personal data from logs or screenshots attached to issues.
