# Refactor Task Queue

## In Progress
- PR-12 phase 3: production DSN rollout and smoke validation with enabled Sentry.

## Next
- PR-11 phase 5c: optional extract of shared ServiceCard render adapter to remove remaining duplication in web/mobile pages.
- PR-10 phase 3c: expand legacy-types guard to additional folders when migration is complete.

## Done
- PR-09 follow-up: isolated legacy `constants/Routes.ts` into deprecated empty stub and confirmed no runtime imports.
- PR-12 phase 3b prep: added runtime/env checks (`EXPO_PUBLIC_SENTRY_ENVIRONMENT`, `EXPO_PUBLIC_SENTRY_RELEASE`, `check:sentry-config`).
- PR-11 phase 5b: extracted shared loading/error state views for services (`src/features/services/ui/ServiceStateViews.tsx`).
- PR-11 phase 4g: extracted reusable users moderation action block (`UsersModerationActions.tsx`), `UsersTab` now 333 lines.
- PR-11 phase 4f: extracted reject-reason modal to `app/(main)/admin/tabs/UsersRejectReasonModal.tsx` (`UsersTab` now 349 lines).
- PR-10 phase 3b: added cross-platform guard `scripts/checkLegacyTypesImports.js` + CI step in `.github/workflows/quality-check.yml`.
- PR-09 follow-up (partial): moved sidebar map to `src/features/navigation/sidebarScreens.ts` and switched `WebSidebar` to new source.
- PR-12 phase 3a: installed `@sentry/react-native` and added Expo plugin in `app.config.ts`.
- PR-11 phase 4e: extracted editor modal to `app/(main)/admin/tabs/UsersEditorModal.tsx`.
- PR-11 phase 5a: extracted shared services data hook `src/features/services/hooks/useServicesData.ts` and connected `app/(main)/services/index.tsx` + `app/(main)/services/index.web.tsx`.
- PR-11 phase 4d: extracted users list row to `app/(main)/admin/tabs/UsersListItemCard.tsx`.
- PR-11 phase 4c: extracted users data/query state to `app/(main)/admin/tabs/useUsersData.ts`.
- PR-10 phase 3a: migrated QR/Home consumers from `@/types/*` to `@/src/entities/*/types` bridges.
- PR-11 phase 4b: moved `UsersTab` style factory to `usersTab.styles.ts`.
- PR-11 phase 4a: extracted `useUsersActions` and wired `UsersTab` moderation/editor save flow.
- PR-12 phase 3 prep: added rollout checklist `docs/sentry-rollout-checklist.md`.
- PR-11 phase 3: extracted `useRolesActions` and wired `RolesTab` to shared CRUD/action hook.
- PR-10 phase 2: converted `types/index.ts` to legacy bridge re-export file.
- PR-06 phase 3: split `AppealDetailContent` realtime and action-dock into dedicated hook/UI (`useAppealRealtimeEvents`, `AppealActionDock`).
- PR-07 phase 3: queued message diagnostics in Appeals list and improved failed-message UX in chat.
- PR-11 phase 2: extracted `useRolesData` and `useUpdatesData` hooks.
- PR-07 phase 2: outbox UI actions (manual retry/cancel) + web attachment readability checks before upload.
- PR-12 phase 2: breadcrumbs for auth, http, appeals outbox and tracking flows.
- PR-10 phase 1: bridge entrypoints under `src/entities/*` and `src/shared/types/*`.
- PR-11 phase 1: extracted shared services grid logic and admin updates help dictionary.
