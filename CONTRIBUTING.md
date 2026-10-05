# Contributing to Foliohush

Thanks for helping make a small writing tool dependable. The project values clear writing, quiet interaction design, portable documents, and honest data-safety behavior.

## Start locally

Use Node.js 22.12 or newer (Node 24 in CI) and npm:

```sh
npm ci
npm run dev
```

The development server binds to `127.0.0.1`. Use sample text in a separate browser profile or test origin while developing persistence changes. Export important drafts before changing the application or its storage format.

## Before proposing a change

- Keep changes focused and explain the user-visible problem they solve.
- For a substantial feature, discuss its scope with the maintainer before investing in a large implementation. Use the issue tracker of the actual repository hosting your copy; this document does not assume a hosted repository or published package exists.
- Preserve existing documents. A format change needs explicit version handling, migration/recovery design, and regression tests. Unknown versions must not be silently overwritten.
- Keep the Tiptap extensions, validator, JSON format, and HTML/Markdown exporters consistent. New nodes need validation rules and export behavior, not only an editor button.
- Never add analytics, remote document transmission, or cloud synchronization without an explicit design decision and corresponding user-facing documentation.
- Keep downloaded fonts and other redistributed assets properly attributed.

## Verification

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

On Linux, `npx playwright install --with-deps chromium` may be needed to install browser system dependencies. The CI workflow is configured to run the same types of checks. Read [verification.md](docs/verification.md) for the current verification boundary; jsdom does not establish layout, real selection geometry, or browser interoperability. Report which checks passed and which were not run; do not replace a failing check with a screenshot or claim a remote CI pass from local results.

For UI changes, also check keyboard operation, focus after dismissing a dialog, Escape and cancellation, narrow screens, repeated actions, document switching, snapshot restoration, and interrupted import/export flows. Test that undo does not cross document boundaries. Check both ordinary and reduced-motion settings when changing animation.

For storage/import changes, cover malformed JSON, unknown versions, unsupported nodes/attributes, unsafe links, oversized input, denied storage, quota failures, and simultaneous tabs. Verify that failures leave existing stored drafts intact and make unsaved state visible. Cover rejection before editor transactions commit, expected-raw-byte conflicts, Web Locks and the optimistic fallback, and emergency plain-text recovery. Do not report a mocked lock or synthetic storage event as real multi-tab verification.

## Code and documentation

- Use TypeScript and existing React patterns. Prefer a small explicit function over a new abstraction with no concrete use.
- Keep document helpers testable without a DOM through `StorageLike`.
- Avoid dependencies unless their benefit justifies the bundle and maintenance cost.
- Update [architecture](docs/architecture.md) for component API or format changes.
- Keep the English, Chinese, Russian, and German READMEs consistent when changing features, setup, or limitations. The UI remains English unless an actual localization implementation is added.
- Do not add installation instructions for an unpublished package or a demo link that does not exist.

A useful pull request includes the reason for the change, the approach, test results, relevant screenshots for visual changes, and any data compatibility or accessibility tradeoffs. Use fictional content in screenshots and fixtures.

## Security and licensing

Read [SECURITY.md](SECURITY.md) before reporting an exploitable issue; do not post private drafts or weaponized payloads in a public issue. Original contributions are made under the project's [MIT license](LICENSE). Do not contribute code or assets you do not have permission to redistribute. Retain applicable third-party notices.
