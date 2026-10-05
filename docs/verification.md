# Verification record

## Workspace redesign verification

The usability redesign adds larger primary controls, readable interface and document text, persistent Bold/Italic controls, content-sized titles, labeled workspace actions, and a responsive assistant. The added coverage targets:

- 44 px primary hit areas and readable computed font sizes at desktop and mobile viewports
- Persistent Bold/Italic behavior alongside selection formatting and keyboard shortcuts
- Long-title sizing, narrow layouts, and horizontal-overflow regressions
- A docked assistant at desktop widths of 1280 px and above, without covering the editor
- Phone-sized assistant sheets with a fixed close control, an internally scrolling preview, and reachable Apply/Reject actions
- Desktop/mobile screenshot regression captures for the writing surface and the open assistant, including long preview content

[CI run 37349994848](https://github.com/loufengzh/foliohush/actions/runs/37349994848) passed at source commit [`7a2f45d`](https://github.com/loufengzh/foliohush/commit/7a2f45da00902322f4b97418f411a9c032dd5f31): **130 unit/jsdom tests, 23 gateway tests, and 111 Chromium browser cases**, with 7 intentional project-specific skips. Type checking and production build also passed. The viewport matrix covers 360, 412, 768, 1024, and 1440 px; rail tests additionally cover 1280 px.

Fresh [desktop](screenshots/desktop.png), [mobile](screenshots/mobile.png), [desktop assistant](screenshots/assistant-desktop.png), and [mobile assistant](screenshots/assistant-mobile.png) captures were inspected. Screenshot review caught conditional navigation controls appearing in the wrong modes; dedicated regressions now cover the corrected visibility and focus transitions. Long-title header overflow and undersized search text were corrected without weakening the checks.

Local formatting, type checking, and production build passed. Local unit execution was interrupted after severe host delays and timeouts; it is **not** reported as passing. The full unit, gateway, and real-browser results above come from GitHub Actions. This verifies the named source revision; subsequent changes need their own CI result. Mobile emulation remains distinct from physical-device testing.

## Theme release verification

[CI run 37287214973](https://github.com/loufengzh/foliohush/actions/runs/37287214973) passed **87 unit/jsdom tests and 54 Playwright cases** at commit [`630230b`](https://github.com/loufengzh/foliohush/commit/630230bc12f0f612f667ea37ef05e23c24b09f33). Type checking and the production build passed too.

The theme checks cover all eight palettes in desktop and Pixel 7-emulated Chromium, persisted and invalid preferences, system appearance changes, real cross-tab preference synchronization, unchanged document bytes and undo history, keyboard dialog focus and repeated dismissal, reduced motion, and horizontal overflow. Resolved theme tokens are checked at 4.5:1 for normal text, selection, highlights, and errors, and 3:1 for focus indicators on the corresponding surfaces.

All eight workspace and picker screenshots were visually reviewed in both projects. See the [desktop theme gallery](screenshots/themes-desktop.jpg) and [mobile theme gallery](screenshots/themes-mobile.jpg). These screenshots show the sample document; the mobile picker scrolls internally on short viewports.

During theme-release verification, the local shell could not start Chromium because its sandbox blocked Chromium's singleton socket. Browser assertions and screenshot generation therefore ran through the repository's GitHub Actions workflow. This was separate from the successful local type checking, formatting, unit/jsdom tests, and production build; it is not a claim about the current executor.

Results apply to the named revision. Check the [current CI runs](https://github.com/loufengzh/foliohush/actions/workflows/ci.yml) for subsequent changes. Later edits, including print, floating-toolbar focus, and workspace-layout regression coverage, require their own passing run.

## What the checks cover

| Check               | Scope                                                                          |
| ------------------- | ------------------------------------------------------------------------------ |
| `npm run typecheck` | TypeScript source and configuration checks                                     |
| `npm test`          | Document-layer unit tests and jsdom application/editor integration tests       |
| `npm run build`     | Third-party notice preparation, TypeScript build, and Vite production bundling |
| `npm run test:e2e`  | Playwright interactions in desktop and Pixel 7-sized Chromium projects         |

Local type checking and the unit/jsdom suite passed during development. Use the logs for the exact revision being reviewed for current counts and outcomes; later edits do not inherit an earlier pass.

### Passed Chromium coverage

The original editor cases exercise the following flows across the two configured projects:

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
