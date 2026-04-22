# Phase 4: Build & Client Views

## Overview
Build generator, client views, in-place editing for Release features, domain management.

Build generation in this phase must be sourced from:
- `data/Updated_Feature_List_159_Adaptive.json` only

---

## Phase Goal
Release features available for builds. Client sees only Release features. In-place editing works without state change.

---

## Files to Process

### 4.1 Build Generator
| Source | Target | Required Changes |
|--------|--------|------------------|
| `includes/class-vaptsecure-build.php` | `includes/class-vaptguard-build.php` | Full rename |

**Key components:**
- ZIP generation
- Release-only feature filtering
- Domain locking
- White-label options
- Client build stripping (remove superadmin, workbench, build functionality)

### 4.2 Admin JS (Domain Admin)
| Source | Target | Required Changes |
|--------|--------|------------------|
| `assets/js/admin.js` | `assets/js/admin.js` | All renames |

**Key components:**
- Domain management UI
- Feature assignment modal
- Build generation UI
- License type selection

### 4.3 Client JS
| Source | Target | Required Changes |
|--------|--------|------------------|
| `assets/js/client.js` | `assets/js/client.js` | All renames |

**Key components:**
- Status dashboard
- Feature toggles (Release features only)
- Security events display

### 4.4 Generator Modules (Copy)
| Source | Target |
|--------|--------|
| `assets/js/modules/interface-generator.js` | Copy |
| `assets/js/modules/aplus-generator.js` | Copy |
| `assets/js/modules/generated-interface.js` | Copy |

### 4.5 Admin CSS (Clone)
| Source | Target | Required Changes |
|--------|--------|------------------|
| `assets/css/admin.css` | `assets/css/admin.css` | Class renames |

### 4.6 Diagnostics Page
| Source | Target | Required Changes |
|--------|--------|------------------|
| `includes/admin/class-vapt-diagnostics-page.php` | `includes/admin/class-vapt-diagnostics-page.php` | All renames |

---

## In-Place Editing for Release Features

### What Works:
- Edit `dev_instruct` without changing state
- Edit `wireframe_url` without changing state  
- Edit `note` without changing state
- Re-generate implementation without reverting

### Action: Update (No State Change)
```
Feature is in Release state
    │
    ▼
Edit dev_instruct/wireframe_url/note
    │
    ▼
Save to DB (status = Release unchanged)
    │
    ▼
Can continue editing anytime
```

---

## Build Generation Logic

### Steps:
1. **Select Features** - Only Release state features
2. **Select Domain** - Assign to client domain
3. **Generate Build** - Create ZIP with domain-lock
4. **Download** - Client receives ZIP

### What's Included in Client Build:
- Plugin files with domain lock
- Release features only
- client.js (not workbench.js or admin.js)
- No Build Generator functionality
- Feature metadata required for client evidence/UI: `RiskID`, `id`, `name`, `category`, `severity`, `owasp` (if present), `verification_steps`, `remediation`

### What's Excluded from Client Build:
- Superadmin identity functions
- Workbench menu
- Domain Admin menu
- Build Generator functionality

---

## Client View (what they see)

### Menus (Client):
```
VAPTGuard Pro (only this)
└── VAPTGuard Pro Status
```

### Features (Client):
- Only features in **Release** state
- Only features **assigned to their domain**
- Can toggle on/off
- Can view stats

### NOT Visible to Client:
- Draft features
- Develop features
- Test features
- Workbench
- Domain Admin

---

## Test Criteria (Phase 4)

- [ ] Client Status page loads:
  - [ ] Only Release features visible
  - [ ] Only assigned features visible
  - [ ] Feature toggles work
- [ ] Domain Admin functional:
  - [ ] Add/edit/remove domains
  - [ ] Assign features to domain
  - [ ] Set license type
- [ ] Build Generator works:
  - [ ] Select domain
  - [ ] Select Release features
  - [ ] Generate ZIP
  - [ ] Domain locking works
  - [ ] Build manifest traces each feature back to `RiskID` and `id`
- [ ] In-place editing works:
  - [ ] Edit Release feature metadata
  - [ ] State stays "Release"
  - [ ] No reversion needed
- [ ] No conflicts with VAPTSecure

---

## Exit Gate

> Phase 4 COMPLETE when: Full plugin functional, both superadmin and client views work, builds generate from Release features, in-place editing works

---

## Files Created

After Phase 4, final files:
```
VAPTSecureV2/
├── vaptguard.php
├── includes/
│   ├── class-vaptguard-build.php       # ✓ Clone
│   ├── class-vaptguard-rest.php
│   ├── class-vaptguard-admin.php
│   └── admin/
│       └── class-vapt-diagnostics-page.php  # ✓ Clone
├── assets/
│   ├── js/
│   │   ├── admin.js               # ✓ Clone
│   │   ├── client.js            # ✓ Clone
│   │   ├── workbench.js        # ✓ Clone
│   │   ├── admin-modules/     # (all files)
│   │   └── modules/           # (all files)
│   └── css/
│       └── admin.css          # ✓ Clone
└── data/
    └── Updated_Feature_List_159_Adaptive.json
```

---

## SUCCESS CRITERIA

1. ✅ Both plugins activate without conflicts
2. ✅ No function/class collisions
3. ✅ Different REST endpoints
4. ✅ Superadmin sees Workbench + Domain Admin
5. ✅ Client sees only Status page
6. ✅ Client sees only Release features
7. ✅ Build generator creates ZIP
8. ✅ Domain locking works
9. ✅ Adjacent state transitions (no skip)
10. ✅ Test state has local isolation
11. ✅ In-place editing works

*Phase 4 - Ready for iteration*

---

*ALL PHASES COMPLETE*
*VAPTGuard Pro Ready for Production*
