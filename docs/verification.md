# Verification record

## Verified revision

[CI run 37284170780](https://github.com/loufengzh/foliohush/actions/runs/37284170780) passed **all 24 Playwright tests** across desktop and mobile-emulated Chromium projects at commit [`b435db19afe09e5eaa3a706ee457cf7018348959`](https://github.com/loufengzh/foliohush/commit/b435db19afe09e5eaa3a706ee457cf7018348959).

The [live demo](https://loufengzh.github.io/foliohush/) also received manual desktop checks for text selection, links, and persistence across reload. Desktop and mobile screenshots were visually inspected for the sample document's layout, typography, and overflow.

These results apply to the tested revision. For subsequent revisions, check the [current CI runs](https://github.com/loufengzh/foliohush/actions/workflows/ci.yml). Later code or test changes require their own passing run; a historical result is not a claim that the latest commit is green.

## Screenshots

- [Desktop workspace](screenshots/desktop.png)
- [Mobile-emulated workspace](screenshots/mobile.png)

These are actual Chromium captures from commit `5fa88cb`, not generated mockups. The inspected layout is unchanged in the verified revision above. The screenshots show sample content and are evidence of those captured layouts, not every possible document or browser state.

## What the checks cover

| Check               | Scope                                                                          |
| ------------------- | ------------------------------------------------------------------------------ |
| `npm run typecheck` | TypeScript source and configuration checks                                     |
| `npm test`          | Document-layer unit tests and jsdom application/editor integration tests       |
| `npm run build`     | Third-party notice preparation, TypeScript build, and Vite production bundling |
| `npm run test:e2e`  | Playwright interactions in desktop and Pixel 7-sized Chromium projects         |

Local type checking and the unit/jsdom suite passed during development. Use the logs for the exact revision being reviewed for current counts and outcomes; later edits do not inherit an earlier pass.

### Passed Chromium coverage

The 24-test run exercises the following flows across the two configured projects:

- Sample rendering, title, and horizontal overflow
- Title/body persistence across reload; empty-title editing and spaces
- Keyboard slash commands and Escape dismissal
- Undo/redo and history isolation between documents
- Snapshot restore, retention of the replaced draft, and reload
- JSON import as a separate document and rejection of malformed input
- JSON download initiation and dialog cancellation
- Preservation of corrupt stored data
- A second tab changing the workspace while the first has a draft
- Focus mode and repeated modal opening/closing
- Selection formatting and rejection of unsafe links

The suite uses the Vite development server on `http://127.0.0.1:4173`. Production bundling is checked separately; the deployed demo received the manual checks above. The JSON download assertion checks the download event and suggested filename, not a complete downloaded-file re-import round trip.

### Unit and jsdom coverage

`src/lib/documents.test.ts` covers schema validation, identities and dates, complexity limits, safe URLs, ordered-list attributes, storage errors, corrupt-data preservation, explicit recovery, snapshots, import identity handling, and JSON/HTML/Markdown serialization.

`src/App.test.tsx` and `src/editor/FolioEditor.test.tsx` exercise the real application/editor in jsdom: state changes, callbacks, document switching, snapshots, cancellation, stale storage, storage clearing, emergency TXT availability, and rejection of unsupported editor transactions.

jsdom supplies synthetic range geometry and a stubbed `ResizeObserver`. Those tests complement browser checks; they do not validate real text-selection geometry, rendering, native downloads, or actual device behavior.

## Coverage still to add

The completed checks are not a comprehensive compatibility or accessibility audit. In particular, they do not establish:

- Physical Android/iOS device behavior or mobile Safari support
- Firefox or Safari compatibility
- Screen-reader behavior or an accessibility certification
- IME composition and every keyboard/layout combination
- Every storage quota, denial, eviction, or concurrent-write race
- A complete Web Locks versus no-Web-Locks browser matrix
- Full downloaded-file inspection and re-import for every export format
- Exhaustive long-document, long-title, code-overflow, touch, or reduced-motion review

Mobile emulation changes viewport and device settings; it is not a physical-device test. Screenshots and happy-path interaction checks do not guarantee that all document sizes or content combinations render correctly. Keep JSON backups of important work.

## Reproduce the checks

```sh
npm ci
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Linux hosts may need `npx playwright install --with-deps chromium`. Use `npm run preview` to inspect the production build separately. When reporting results, include the commit, browser/OS versions, commands, and any failures or checks that were not run.
