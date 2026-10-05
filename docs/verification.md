# Verification record

This document separates implementation checks from actual-browser verification. A passing build or jsdom test is useful evidence, but neither demonstrates the finished layout, real text-selection behavior, or mobile usability.

## Current verification boundary

The repository contains type checks, document unit tests, application/editor integration tests in jsdom, and a Playwright suite configured for desktop and mobile-sized Chromium projects. The unit and jsdom checks exercise real project code; they are not screenshots or substitutes for a browser-rendered review.

**Actual-browser execution and visual QA remain pending.** The latest local type check and unit/jsdom suite passed. Re-run the aggregate checks if the source changes; production-build and browser results must be recorded separately. No screenshot is presented as evidence of a browser-verified interface.

See the current CI run for remote verification; this record alone does not establish it. A CI configuration is present, but its existence is not evidence that a remote run passed.

## Local checks and what they cover

Run the complete check sequence against the final source revision. Test counts can change as regressions are added; use the command output from that final run rather than an older count.

| Command             | Evidence it provides                                                                | What it does not establish                                                    |
| ------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `npm run typecheck` | TypeScript checks for the included source and configuration files                   | Runtime correctness or browser compatibility                                  |
| `npm test`          | Vitest document tests and jsdom application/editor integration tests                | Real browser layout, rendering, native input, downloads, or multi-tab locking |
| `npm run build`     | Third-party notice preparation, TypeScript build step, and Vite production bundling | Successful hosting, offline reload, remote deployment, or visual quality      |
| `npm run test:e2e`  | Playwright interaction checks when Chromium can launch and reach the app            | A pass until the suite actually completes successfully                        |

The release handoff should record the final command outcomes and any failing or unrun checks. Do not label the project fully browser-verified until the pending browser work below has been completed.

### Document-layer unit tests

`src/lib/documents.test.ts` covers the versioned data model and storage helpers, including:

- Creation and updates without unintended mutation
- Valid IDs, dates, workspace relationships, and snapshot limits
- Supported schema round trips, including Tiptap's default attributes
- Unknown fields, malformed trees, prototype-related payloads, excessive nesting, node/text limits, and unsafe links
- Valid zero-based ordered lists and allowlisted marker types
- Storage-read errors, quota failures, corrupt or unknown-version data, and preservation before explicit recovery
- Snapshot creation/restoration and retention
- JSON import/export identity handling and bounds
- Escaped HTML and Markdown export behavior

These tests use a storage adapter or in-memory implementation. They do not prove that a particular browser will retain data indefinitely or that every quota/race condition is reproducible in the same way.

### jsdom integration tests

`src/App.test.tsx` mounts the application and exercises document state, title spaces and reload-by-remount, independent drafts, snapshot restoration, Escape/cancellation, corrupt-data preservation, stale stored bytes, externally cleared storage, the emergency TXT option, and reselecting the active page without losing the editor handle.

`src/editor/FolioEditor.test.tsx` mounts the actual Tiptap editor and exercises JSON change callbacks, undo/redo, slash-command selection, and rejection of unsupported transactions before the draft is replaced.

The jsdom setup supplies synthetic range geometry and a stubbed `ResizeObserver`. It cannot validate real selection rectangles, floating-menu placement, responsive overflow, font rendering, actual browser focus/selection quirks, touch behavior, IME input, or assistive-technology output. Synthetic storage events and expected-byte checks also do not establish real multi-tab Web Locks behavior.

## Playwright suite awaiting execution

`playwright.config.ts` starts the Vite development server on `http://127.0.0.1:4173` and defines a desktop Chromium viewport and a Pixel 7-sized Chromium project. Mobile emulation is not testing on a physical Android device or in mobile Safari. The suite targets the development server; a production build is checked separately.

`tests/editor.spec.ts` currently targets:

- Initial document rendering, title, and horizontal overflow
- Title/body persistence across a real page reload
- Empty-title editing and preservation of spaces
- Keyboard slash commands and Escape dismissal
- Undo/redo and isolation between documents
- Snapshot restore, recovery snapshot retention, and reload
- JSON import as a new document and rejection of malformed input
- JSON download initiation and dialog cancellation
- Corrupt stored data remaining untouched
- A second tab changing the workspace while the first has a draft
- Focus mode and repeated modal opening/closing
- Text-selection formatting and unsafe-link rejection

This list describes test intent, not completed browser coverage. Assertions may still expose product bugs or require refinement once the suite can run. The JSON download check currently checks the download event and suggested filename, not a complete downloaded-file re-import round trip.

## Complete the remaining QA

On an authorized environment where the browser can launch and reach the development server:

```sh
npm ci
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Linux hosts may need `npx playwright install --with-deps chromium`. Follow that environment's permission requirements; do not bypass an access denial or disable OS security controls to reproduce a check.

Before describing the UI as visually verified or attaching screenshots:

1. Run the configured Playwright projects, investigate failures, and repeat the affected checks after fixes.
2. Review the production build with `npm run preview`, not only the development server.
3. Inspect desktop and narrow/mobile layouts, long titles, empty states, overflowing code, the sidebar, outline, slash menu, selection toolbar, and error dialogs. Use fictional text in screenshots.
4. Verify real keyboard focus, repeated opening/closing, Escape and cancellation, reduced motion, touch behavior, and IME composition. Add other browsers or physical devices before claiming support verified there.
5. Exercise real concurrent tabs with Web Locks available and the permitted fallback path without it. Confirm that detected conflicts pause saving and that no UI implies merged drafts.
6. Simulate storage denial/quota failure, confirm the unsaved warning and emergency TXT download, inspect that downloaded text, and test JSON/HTML/Markdown contents and JSON re-import. Confirm rejected edits leave the accepted draft intact.
7. Record the source revision, browser/OS versions, commands, outcomes, and any remaining limitations. Add genuine screenshots only after inspecting the actual rendered application.

Until these steps run, keep browser and visual checks marked pending rather than inferring success from unit tests or the presence of responsive CSS.
