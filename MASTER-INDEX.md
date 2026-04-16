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

| Phase | File | Status | Version |
|-------|------|--------|---------|
| 1 | `PHASE-1-Core-Foundation.md` | ✅ Ready | 1.0.1 |
| 2 | `PHASE-2-Core-Functionality.md` | ✅ Ready | 1.0.2 |
| 3 | `PHASE-3-Feature-System.md` | ✅ Ready | 1.0.3 |
| 4 | `PHASE-4-Build-ClientViews.md` | ✅ Ready | 1.0.4 |

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

`data/Feature-List-159-Adaptive-Updated.json` - Already present, no copy needed.

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
- Each phase file includes rollback procedure

---

*Last updated: April 15, 2026*
*VAPTGuard Pro - Ready for Implementation*