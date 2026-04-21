# VAPTGuard Pro - Master Implementation Index

## Quick Reference

| Phase | Name | Goal | Exit Criteria |
|-------|------|------|------------|
| 1 | Core Foundation | Plugin activates, features in Draft | 7 DB tables, menus appear |
| 2 | Core Functionality | REST API works, Draft→Develop | Transition modal works |
| 3 | Feature System | Workbench, 4 states, Test isolation | Adjacent-only transitions |
| 4 | Build & Client | Builds generate, client view | Full plugin working |

---

## Phase Files

| Phase | File | Status |
|-------|------|--------|
| 1 | `PHASE-1-Core-Foundation.md` | ✅ Ready |
| 2 | `PHASE-2-Core-Functionality.md` | ✅ Ready |
| 3 | `PHASE-3-Feature-System.md` | ✅ Ready |
| 4 | `PHASE-4-Build-ClientViews.md` | ✅ Ready |

---

## Feature Lifecycle

```
Draft ──► Develop ──► Test ──► Release
```

| State | Can Go To |
|-------|----------|
| Draft | Develop |
| Develop | Draft, Test |
| Test | Develop, Release |
| Release | Test |

---

## Canonical Datasource

`data/Updated_Feature_List_159_Adaptive.json` is the only datasource for the implementation.

Contract rules:
- Read catalog metadata from `meta.*` (version `3.1.0`, total features `159`, generated_at `2026-04-02`).
- Preserve stable identifiers: `RiskID` and `id`.
- Normalize `_rate_limiting_controls` references to `rate_limiting_controls`.
- Support mixed `form_builder_support` shapes.
- Missing `owasp` values are valid and must not block feature generation.

---

## Rename Patterns (Summary)

Replace all occurrences:
- `vaptsecure` → `vaptguard`
- `VAPTSECURE` → `VAPTGUARD`
- `vaptSecureSettings` → `vaptguardSecureSettings`
- `[VAPT]` → `[VAPTGuard]`
- `x-vapt-` → `x-vaptguard-`
- Database: `wp_vaptsecure_*` → `wp_vaptguard_*`

---

## Success Criteria

1. ✅ Both plugins activate without conflicts
2. ✅ No collisions (functions, classes, constants)
3. ✅ Different REST endpoints
4. ✅ Superadmin: Workbench + Domain Admin
5. ✅ Client: Status page only
6. ✅ Client: Release features only
7. ✅ Build generator works
8. ✅ Domain locking works
9. ✅ Adjacent transitions only
10. ✅ Test state local isolation

---

## Data File

`data/Updated_Feature_List_159_Adaptive.json` - Already present, no copy needed.

---

## Implementation Order

```
PHASE 1: Core Foundation
    ↓
PHASE 2: Core Functionality  
    ↓
PHASE 3: Feature System
    ↓
PHASE 4: Build & Client Views
    ↓
COMPLETE ✓
```

---

## Notes

- Each phase can be iterated multiple times
- Test criteria must pass before advancing
- Reference `rename-mapping.json` for complete identifier list
- Reference `Implementation-Plan-Merged.md` for full details

---

*Last updated: April 20, 2026*
*VAPTGuard Pro - Ready for Implementation*
