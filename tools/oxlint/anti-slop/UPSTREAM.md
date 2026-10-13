# Anti-slop provenance

Source: https://github.com/dmmulroy/anti-slop
Source commit: `c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b`.

Copied from `skills/install-anti-slop/assets/anti-slop/` using the upstream
`skills/install-anti-slop/scripts/install.mjs` installer on 2026-10-13.
All 38 copied files were verified byte-for-byte against their Git blob hashes
from the source snapshot. No plugin code was changed. This provenance file is
an addition to that copy.

Entry points: `index.ts` and `effect/index.ts` in this directory.
The nested Stylistic license and `vendor/eslint-stylistic/UPSTREAM.md` are retained.

Oxlint and `@oxlint/plugins` are both pinned to 1.88.0. All generic rules and the
Effect rules are enabled in the root `.oxlintrc.json`. Generated runtime types
and this vendored directory are excluded from application linting. The Effect
service-constructor import rule currently covers relative imports; package
aliases are outside its enforcement.
