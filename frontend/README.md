# Frontend structure

The existing guest booking site and admin dashboard remain the active application. The expanded folders under `src/components`, `src/features`, and `src/pages` are scaffold placeholders (`export {}`) and are not yet connected to routes or backend endpoints.

`src/app` contains the active app entry, routing, and React Query provider. Existing page implementations remain under `src/pages` at the source root to avoid breaking the current booking and admin flows while the new structure is filled in.

Hotel photographs, font files, and the favicon are intentionally not fabricated. Add licensed hotel assets under `public/images` and `public/fonts` when available.

Run `npm run dev` from the repository root to start the frontend and backend, or `npm run build --workspace @ayele-hotel/frontend` to build the frontend.
