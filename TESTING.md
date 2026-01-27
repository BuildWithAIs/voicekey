# Testing Guide

This document defines conventions for writing and organizing tests in Voice Key.

## Scope

These rules apply to all new tests in this repository.

## Test Types and Locations

1. Renderer unit tests
   - Location: `src/**/__tests__/*.{test,spec}.{ts,tsx}`
   - Environment: `happy-dom` (default)

2. Main process unit/integration tests
   - Location: `electron/**/__tests__/*.{test,spec}.ts`
   - Environment: `node` (via Vitest projects config)

3. E2E tests
   - Location: `e2e/**/*.spec.ts`
   - Runner: Playwright

Do not put tests next to non-test files unless the directory already uses `__tests__`.

## File Naming

- Unit/Integration: `*.test.ts` or `*.test.tsx`
- E2E: `*.spec.ts`
- One file per production module when possible.

Examples:

- `src/lib/__tests__/hotkey-utils.test.ts`
- `electron/main/__tests__/config-manager.test.ts`
- `e2e/settings.spec.ts`

## Test Setup

Global setup files (do not import manually):

- Renderer: `test/setup.renderer.ts`
- Main: `test/setup.main.ts`

These provide:

- `@testing-library/jest-dom` matchers
- `window.electronAPI` mock for renderer tests
- `matchMedia` mock
- base env vars for main-process tests

## Import Rules

- Prefer relative imports within the same feature folder.
- Use `@/` for renderer modules and `@electron/` for main/shared modules.
- Avoid importing test setup files directly.

## Test Style

- Use Arrange-Act-Assert.
- Keep tests deterministic (no real network, timers, or file IO).
- Prefer explicit, readable expectations over snapshot tests.
- Avoid testing third-party libraries.

## Mocking Rules

- Mock Electron APIs in main-process tests (`vi.mock('electron', ...)`).
- For renderer tests, rely on the global `window.electronAPI` mock and override per test when needed.
- Avoid `any`. Use `Partial<T>` or concrete interfaces.
- If a module has top-level side effects, import it after mocks:
  - Use `vi.resetModules()` + dynamic `import()`.

## Stable Selectors (UI Tests)

- Prefer roles and labels (`getByRole`, `getByLabelText`).
- Avoid raw text selectors when i18n is involved.
- If needed, add `data-testid` in the component for stable targeting.

## Coverage

Keep coverage realistic. Minimums (guideline):

- Utilities: 90%+
- UI components: 70%+
- Main-process modules: 50%+

## Running Tests

```bash
# Unit/integration
npm run test:run

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage

# E2E (requires build)
npm run build
npm run test:e2e
```

## Checklist for New Tests

- [ ] File placed under `__tests__` or `e2e/`
- [ ] File name follows naming rules
- [ ] Uses the correct environment (renderer vs main)
- [ ] No real network/file system dependencies
- [ ] Stable selectors for UI tests
