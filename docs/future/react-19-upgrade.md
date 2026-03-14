# Future: React 19 upgrade and modern patterns

The app is on React 18.3.1. This doc lists opportunities to adopt React 19 features for simpler form and mutation handling, optimistic UI with clear revert-on-failure, and optional data-loading and compiler improvements. Use it as a roadmap when you're ready to upgrade.

## Current state

- **React version:** `peerDependencies` in [package.json](../package.json): `react` and `react-dom` at `18.3.1`.
- **Forms and mutations:** Manual `useState` for submitting, error, and success in [AddChurchForm.tsx](../../src/app/components/AddChurchForm.tsx) and [SuggestEditForm.tsx](../../src/app/components/SuggestEditForm.tsx); try/catch and setSubmitting in handlers.
- **Reactions:** Manual optimistic updates in [ChurchDetailPanel.tsx](../../src/app/components/ChurchDetailPanel.tsx) (lines ~424–452): update counts and myReaction before `submitReaction`, sync on success, set error on failure (no revert of counts).
- **Data loading:** [useChurchMapData.ts](../../src/app/components/useChurchMapData.ts) uses `useEffect` + `useReducer` for fetch and state.
- **Memoization:** `useMemo` and `useCallback` used in ChurchMapPage, useChurchFilters, and elsewhere.
- **Refs:** No `forwardRef` in the codebase.

## Goals

- Reduce boilerplate for form submissions and mutations (pending, error, result).
- Make optimistic UI (e.g. reactions) clearer and revert-on-failure with a single pattern.
- Optionally simplify data loading with Suspense and improve render performance with the React Compiler.
- Keep dependency upgrades explicit and incremental.

## Steps (when we do it)

### 1. Upgrade React and dependencies

- Bump `peerDependencies` (and install) to React 19 (e.g. `react@19`, `react-dom@19`).
- Confirm compatibility: Vite, @vitejs/plugin-react, React Router 7, MUI 7, Radix packages, react-simple-maps, etc. Check release notes for React 19 support; fix any deprecation or type issues.

### 2. Forms and mutations: useActionState

- **AddChurchForm:** Replace the `submitting` / `error` / `success` state and the `submitToApi` try/catch with an action passed to `useActionState`. The action calls `addChurch(...)`; drive the submit button and messages from the returned state (pending, error, data).
- **SuggestEditForm:** Replace per-field `submitting` and `error` with `useActionState` (or one state + action per submit). The action calls `submitSuggestion(church.id, field, val)`; handle geocode-for-address in the action or a wrapper. Keep existing UX (e.g. which field is submitting, consensus/pending moderation).
- **Other flows:** ReviewerLoginModal and similar loading/error flows can be migrated to the same pattern if desired.

### 3. Reactions: useOptimistic

- **ChurchDetailPanel** `handleReaction`: Use `useOptimistic` to hold optimistic counts and `myReaction`. On click, apply optimistic update and call `submitReaction` in the background; on success sync with server response; on failure let React revert the optimistic state. Remove or simplify manual `setCounts` / `setMyReaction` and centralize error handling.

### 4. Optional: Data loading with use() and Suspense

- Refactor so that states/churches are provided by a stable promise (e.g. from a cache or data layer) and consumed with `use(promise)` inside a component wrapped in `<Suspense fallback={...}>`. This is a larger change to [useChurchMapData.ts](../../src/app/components/useChurchMapData.ts) and the component tree; document as an optional follow-up and outline steps (e.g. introduce cache, wrap map in Suspense, migrate one fetch at a time).

### 5. Optional: React Compiler

- Enable the React Compiler (opt-in). Remove or reduce `useMemo` / `useCallback` where the compiler can infer stability (e.g. ChurchMapPage navigation callbacks, useChurchFilters derived values). Adopt incrementally and verify behavior and performance.

### 6. Refs

- In React 19, `ref` is a normal prop. No change needed now; any future components that expose a ref can accept `ref` without `forwardRef`.

## Summary

| Feature | Target | Benefit |
|---------|--------|---------|
| useActionState | AddChurchForm, SuggestEditForm | Less boilerplate; single pending/error/result state |
| useOptimistic | ChurchDetailPanel reactions | Clear revert on failure; simpler state |
| use() + Suspense | useChurchMapData (optional) | Declarative async data loading |
| React Compiler | ChurchMapPage, useChurchFilters, etc. | Fewer useMemo/useCallback; same behavior |

## References

- [package.json](../package.json) — current React peerDependencies.
- [src/app/components/AddChurchForm.tsx](../../src/app/components/AddChurchForm.tsx) — submit flow and state (lines ~179–240).
- [src/app/components/SuggestEditForm.tsx](../../src/app/components/SuggestEditForm.tsx) — handleSubmit and submitting/error (lines ~163–222).
- [src/app/components/ChurchDetailPanel.tsx](../../src/app/components/ChurchDetailPanel.tsx) — handleReaction and optimistic counts (~424–452).
- [src/app/components/useChurchMapData.ts](../../src/app/components/useChurchMapData.ts) — data loading pattern.
- React 19 docs: [useActionState](https://react.dev/reference/react/useActionState), [useOptimistic](https://react.dev/reference/react/useOptimistic), [use()](https://react.dev/reference/react/use), [Actions](https://react.dev/blog/2024/12/05/react-19).
