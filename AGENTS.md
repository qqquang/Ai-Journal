# Repository Guidelines

## Project Structure & Module Organization
- `Requirements/` holds the PRD and wireframes; version filenames (e.g., `_v3`) when updating.
- Place product code in `app/` with `app/web` (Next.js) and `app/mobile` (React Native). Keep shared journaling logic, AI prompt builders, and types in `packages/core`.
- Store research captures in `research/` with a `README.md` noting sources and capture dates.

## Build, Test, and Development Commands
- After scaffolding, run `npm install` once at the root. Expected scripts: `npm run dev:web` (Next.js dev server), `npm run ios` / `npm run android` (React Native), `npm run test` (Jest), and `npm run lint` (ESLint + Prettier).
- Document any additional utilities (`npm run seed:demo`, migrations, etc.) inside `package.json` and mirror them here.

## Coding Style & Naming Conventions
- Use TypeScript with 2-space indentation, camelCase for variables/functions, PascalCase for components, and kebab-case file names (e.g., `journal-timeline.tsx`).
- Prefer functional components with hooks and scoped style files (`journal-entry.styles.ts`).
- Run `npm run lint` and `npm run format` before every push; keep shared configs in version control.

## Testing Guidelines
- Adopt Jest + React Testing Library for unit/UI coverage and Detox for high-value mobile flows. Mirror `src/` paths inside `tests/` and suffix with `.test.tsx` or `.spec.ts`.
- Cover the MVP loop (entry capture → AI reflection → suggested action) and add regression tests for goal tracking once Milestone 2 launches.
- Stub Gemini responses with fixtures; automated tests must not call live APIs.

## Commit & Pull Request Guidelines
- Write present-tense commits (`Implement AI reflection layout`, `Fix goal tracker totals #23`).
- Pull requests should restate the problem, list key changes, describe user impact, and include screenshots or videos for UI updates. Call out new environment variables or scripts.
- Rebase onto `main` before requesting review and confirm lint/tests pass locally.

## Product Milestones (PRD Context)
- Milestone 1: minimalist journal canvas with timestamped entries and a right-rail AI reflection (reflection, insight/reframe, action prompt).
- Milestone 2: goal setup, AI reframing of vague goals, and weekly nudges tied to entries.
- Milestone 3: pattern recognition with monthly progress reports; focus on earlier milestones before tackling this layer.

## Security & Configuration Tips
- Keep API keys (e.g., `GEMINI_API_KEY`) and secrets in `.env.local` and share via the approved secret manager; ensure the file stays git-ignored.
- Anonymize journals and research exports. Scrub personal data from logs or screenshots attached to issues.
