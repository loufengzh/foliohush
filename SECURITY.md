# Security and data safety

Foliohush is an early-stage browser-local writing application. It has no account system or server-side document store. It is not an encrypted vault, an audited security product, or a backup service.

## What the application does

- Validates a versioned JSON envelope and reconstructs supported document nodes and attributes before importing.
- Filters document-changing editor transactions before commit and rejects content outside the supported schema/limits, reporting the reason to the host.
- Restricts links to absolute HTTP, HTTPS, and mailto URLs; rejects executable schemes, web credentials, control characters, and relative links.
- Rejects unsupported content such as images, embedded frames, scripts, arbitrary CSS attributes, and tables in JSON documents.
- Bounds JSON size and document complexity to reduce accidental or malicious resource exhaustion.
- Escapes text and attributes in HTML export rather than interpolating raw imported HTML.
- Refuses ordinary saves over corrupt or incompatible stored data and displays storage failures.
- Checks expected stored bytes before writing, uses Web Locks to serialize cooperating tabs when available, and pauses on detected conflicts or externally cleared storage.

These controls have a limited scope. Link validation does not make a destination safe. Complexity limits do not eliminate all performance issues. Without Web Locks, the optimistic storage comparison and write are not atomic. Web Locks coordinate only cooperating tabs; neither path merges competing drafts or controls arbitrary same-origin code. There has been no claim of an independent security audit or full browser/accessibility certification.

## Privacy boundaries

Documents and snapshots are stored without application-level encryption in the current origin's `localStorage`. Browser extensions, compromised same-origin scripts, someone with access to the browser profile, or local malware may be able to read them. A deployed host also delivers executable application code, so choose a host you trust.

The app includes no analytics or remote document-sync feature, and font assets are bundled locally. A hosting provider can still receive ordinary requests for the app and its assets. Following an exported link can contact the linked website or mail application. JSON, HTML, and Markdown exports contain your document text in readable form; JSON also includes saved snapshots, titles, labels, IDs, and timestamps. Review files before sharing them.

## Prevent data loss

Export important documents as JSON and keep the files outside browser storage. Snapshots are stored alongside drafts and do not protect against clearing site data, browser eviction, private-session cleanup, device loss, or profile damage. A JSON export covers the selected document, not the entire workspace.

When saving is paused or an error is shown, export the current draft before closing or reloading. **Export → Emergency plain text** is available while unsaved and downloads the current editor text as TXT without requiring a JSON export to succeed. TXT loses formatting and snapshots; it does not recover a rejected edit or the original bytes of corrupt storage. Do not clear site data as a first troubleshooting step. For technical investigation, preserve the raw stored value before attempting recovery, and never post that value publicly. The explicit `recoverWorkspace` helper preserves original bytes under a second local key, but the app currently has no recovery UI and that same-device copy is not an external backup.

## Reporting a vulnerability

This checkout does not establish a verified private reporting email or promise a response-time SLA. On a hosted repository, use its private vulnerability-reporting channel if one is enabled. Otherwise obtain a private contact method from the maintainer before disclosing an exploit. Do not assume that a public issue is confidential. A public request for a private reporting route should contain no exploit details, tokens, personal information, or real drafts.

A useful private report includes:

- The affected commit or version, browser, and operating system
- A minimal reproduction using synthetic content
- Expected and observed behavior, with impact explained
- Whether the issue affects imported JSON, editing, exports, storage, or deployment
- A proposed mitigation if you have one

Dependency vulnerabilities should also be reported through the relevant upstream project's official channel when appropriate. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the main upstream projects.

## Supported versions

Development currently follows the repository's current code. No long-term support matrix, guaranteed patch window, or maintained historical release line is established. Check actual repository releases and advisories before assuming a fix has shipped.
