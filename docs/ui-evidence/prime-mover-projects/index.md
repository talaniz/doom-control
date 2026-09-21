# Projects screen evidence

Captured code: `3adaa777538f82affe1045f474a5cdcfadaf0fb9`.

Reproduce from an isolated checkout with Node 22 and Chromium installed:

```sh
npm ci
DOOM_UI_EVIDENCE=docs/ui-evidence/prime-mover-projects node scripts/test-projects-browser.mjs
```

The script starts the actual dashboard frontend/server, synthetic admin and viewer
accounts, a fixture app server and a fixture metadata Unix server. It never connects
to the live dashboard. Loading is held at the browser request boundary through CDP.
Desktop is 1440 x 900; mobile is 390 x 844, both device scale 1. Captures scroll to
the Projects content; mobile cards stack vertically, with the second project reached
by scrolling. These are viewport captures, not full-page composites.

| State | Desktop | Mobile | Evidence |
| --- | --- | --- | --- |
| unavailable | [Desktop](desktop-unavailable.png) | [Mobile](mobile-unavailable.png) | No metadata and no fabricated counts |
| empty-work | [Desktop](desktop-empty-work.png) | [Mobile](mobile-empty-work.png) | Both defaults, no active or completed work |
| active-blocked | [Desktop](desktop-active-blocked.png) | [Mobile](mobile-active-blocked.png) | Active review, global intake pause and blocked second project |
| detail | [Desktop](desktop-detail.png) | [Mobile](mobile-detail.png) | Selected project, issue/PR links and return navigation |
| stale | [Desktop](desktop-stale.png) | [Mobile](mobile-stale.png) | Failed refresh retains timestamped data with warning |
| empty-registry | [Desktop](desktop-empty-registry.png) | [Mobile](mobile-empty-registry.png) | Explicit zero-project registry |
| loading | [Desktop](desktop-loading.png) | [Mobile](mobile-loading.png) | Deterministically pending refresh with existing snapshot |

All 14 PNGs were opened and visually inspected for readable text, wrapping, layout,
overflow and privacy. No credentials or private conversation data are present. Long
mobile content continues below the viewport; it is scrollable rather than clipped
by a fixed-height container. The blocked second card is visible in the desktop
list capture; its mobile position is below the initial viewport.

The capture run passed admin/viewer authentication, list/detail and refresh,
unavailable/stale/loading/empty states, task/draft preservation, task controls during
a metadata outage, POST denial, logout clearing, viewport width assertions, and zero
JavaScript exceptions. DOM coverage also verifies focus preservation on background
refresh and ignores late responses after logout. Full automated suite: 27 passing.

These are fixture integration results. Actual Prime Mover service integration and
independent review are separate outstanding gates and are not implied by screenshots.
