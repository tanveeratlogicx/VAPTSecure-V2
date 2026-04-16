# Phase 2: Core Functionality

## Version: 1.0.2 (after Phase 2 complete)

## Overview
REST API, authentication system, options/session management, transition modal.

---

## Phase Goal
Features can **transition to Develop** state. Transition modal collects dev_instruct, wireframe_url, note.

---

## Files to Process

### 2.1 REST API Handler
| Source | Target | Required Changes |
|--------|--------|------------------|
| `includes/class-vaptsecure-rest.php` | `includes/class-vaptguard-rest.php` | Class rename + all internal references |

**Key components:**
- REST namespace: `vaptguard/v1`
- Feature endpoints (`/features`, `/features/update`, `/features/list`)
- Domain management endpoints
- License management endpoints
- File upload endpoint (`/upload-media`)

### 2.2 Admin Pages
| Source | Target | Required Changes |
|--------|--------|------------------|
| `includes/class-vaptsecure-admin.php` | `includes/class-vaptguard-admin.php` | Class rename + all internal references |

**Key components:**
- Page renderers (status, workbench, admin)
- Asset enqueueing (JS handles)
- Superadmin capability checks

### 2.3 License Manager
| Source | Target | Required Changes |
|--------|--------|------------------|
| `includes/class-vaptsecure-license-manager.php` | `includes/class-vaptguard-license-manager.php` | Class rename + all internal references |

### 2.4 Config Cleaner
| Source | Target | Required Changes |
|--------|--------|------------------|
| `includes/class-vaptsecure-config-cleaner.php` | `includes/class-vaptguard-config-cleaner.php` | Class rename + all internal references |

### 2.5 Environment Detector
| Source | Target | Required Changes |
|--------|--------|------------------|
| `includes/class-vaptsecure-environment-detector.php` | `includes/class-vaptguard-environment-detector.php` | Class rename + all internal references |

### 2.6 Debug Utils
| Source | Target | Required Changes |
|--------|--------|------------------|
| `includes/debug-utils.php` | `includes/debug-utils.php` | Class and function renames |

### 2.7 REST Base
| Source | Target | Required Changes |
|--------|--------|------------------|
| `includes/rest/class-vaptsecure-rest-base.php` | `includes/rest/class-vaptguard-rest-base.php` | Class rename + all internal references |

### 2.8 Admin JS Modules (Copy All)
| Source | Target |
|--------|--------|
| `assets/js/admin-modules/logger.js` | Copy as-is (no internal renames needed - just copy) |
| `assets/js/admin-modules/api-fetch-hotpatch.js` | Copy as-is |
| `assets/js/admin-modules/modals.js` | Copy as-is |
| `assets/js/admin-modules/field-mapping.js` | Copy as-is |
| `assets/js/admin-modules/design-modal.js` | Copy as-is |
| `assets/js/admin-modules/domains.js` | Copy as-is |

**Note**: These files contain mostly UI logic, not plugin-specific naming. They reference `vaptSecureSettings` which we'll rename in Phase 2.

---

## Required Renames for Phase 2

### 3.1 REST API Routes
```
// In register_rest_route():
'vaptsecure/v1'  → 'vaptguard/v1'

// Full endpoint patterns:
/wp-json/vaptsecure/v1/*  → /wp-json/vaptguard/v1/*
```

### 3.2 HTTP Headers
```
x-vapt-enforced    → x-vaptguard-enforced
x-vapt-feature    → x-vaptguard-feature
x-vapt-debug      → x-vaptguard-debug
x-vapt-count      → x-vaptguard-count
x-vapt-trace      → x-vaptguard-trace
```

### 3.3 Query Parameters
```
vaptsecure_header_check   → vaptguard_header_check
vaptsecure_test_context → vaptguard_test_context
vaptsecure_test_spike   → vaptguard_test_spike
```

### 3.4 JavaScript Handles (wp_enqueue_script)
```
vapt-admin-logger             → vaptguard-admin-logger
vapt-admin-api-fetch-hotpatch → vaptguard-admin-api-fetch-hotpatch
vapt-admin-modals           → vaptguard-admin-modals
vapt-admin-field-mapping   → vaptguard-admin-field-mapping
vapt-admin-design-modal    → vaptguard-admin-design-modal
vapt-admin-domains        → vaptguard-admin-domains

// Also in admin.php enqueue:
vapt-admin-css             → vaptguard-admin-css
vapt-interface-generator  → vaptguard-interface-generator
vapt-generated-interface-ui → vaptguard-generated-interface-ui
```

### 3.5 JavaScript Window Objects
```
// In admin JS, these globals are used:
window.vaptSecureSettings → window.vaptguardSecureSettings
window.vaptLog           → window.vaptguardLog
window.VAPTSECURE_GeneratedInterface → window.VAPTGUARD_GeneratedInterface
```

### 3.6 LocalStorage Keys
```
vaptsecure_workbench_active_status   → vaptguard_workbench_active_status
vaptsecure_workbench_active_feature  → vaptguard_workbench_active_feature
```

### 3.7 Additional Options
```
vaptsecure_global_protection            → vaptguard_global_protection
vaptsecure_global_protection_prev      → vaptguard_global_protection_prev
vaptsecure_over_installation_limit    → vaptguard_over_installation_limit
vaptsecure_hidden_json_files          → vaptguard_hidden_json_files
vaptsecure_removed_json_files         → vaptguard_removed_json_files
vaptsecure_config_original_b64        → vaptguard_config_original_b64
vaptsecure_config_original_hash      → vaptguard_config_original_hash
vaptsecure_config_original_path     → vaptguard_config_original_path
vaptsecure_config_current_b64       → vaptguard_config_current_b64
vaptsecure_config_last_sync         → vaptguard_config_last_sync
```

### 3.8 Additional Transients
```
vaptsecure_active_enforcements         → vaptguard_active_enforcements
vaptsecure_missing_config_notified  → vaptguard_missing_config_notified
vaptsecure_network_site_count       → vaptguard_network_site_count
```

---

## Transition Modal (Draft → Develop)

### Modal Flow:

1. **User selects feature** → clicks "Transition to Develop"
2. **Modal displays** with fields:
   - Internal Note (required)
   - Development Instructions / AI Guidance (optional)
   - Wireframe / Design URL (optional)
3. **User fills fields** → clicks "Confirm to Develop"
4. **Data saves** to feature_meta table
5. **Status updates** in feature_status table

### DB Storage:

```php
// Save to feature_meta table:
$meta_updates = array(
    'dev_instruct' => $dev_instruct,    // AI guidance text
    'wireframe_url' => $wireframe_url    // Image URL
);
$wpdb->update($meta_table, $meta_updates, array('feature_key' => $feature_key));

// Save to feature_history table:
$history = array(
    'feature_key' => $feature_key,
    'old_status' => 'Draft',
    'new_status' => 'Develop',
    'user_id' => get_current_user_id(),
    'note' => $note,
    'created_at' => current_time('mysql')
);
$wpdb->insert($history_table, $history);

// Update status:
$wpdb->update($status_table, 
    array('status' => 'Develop'), 
    array('feature_key' => $feature_key)
);
```

---

## Test Criteria (Phase 2)

- [ ] REST API responds at `/wp-json/vaptguard/v1/status`
- [ ] Feature endpoints work (`/features`, `/features/update`)
- [ ] Domain endpoints work (`/domains`)
- [ ] License endpoints work (`/license`)
- [ ] File upload works (`/upload-media`)
- [ ] Authentication works:
  - [ ] Superadmin identity check (`is_vaptguard_superadmin()`)
  - [ ] OTP flow functional
- [ ] Options save/retrieve correctly
- [ ] Transition modal displays:
  - [ ] Draft → Develop modal shows
  - [ ] All 3 fields present (note, dev_instruct, wireframe_url)
- [ ] Data saves correctly:
  - [ ] dev_instruct saves to DB
  - [ ] wireframe_url saves to DB
  - [ ] Note saves to history table
  - [ ] Status changes to 'Develop'
- [ ] JavaScript loads without errors

---

## Exit Gate

> Phase 2 COMPLETE when: REST API functional, authentication works, transition modal works, features can transition to Develop state

---

## Files Created

After Phase 2, additional files:
```
VAPTSecureV2/
├── includes/
│   ├── class-vaptguard-rest.php         # ✓ Clone
│   ├── class-vaptguard-admin.php       # ✓ Clone
│   ├── class-vaptguard-license-manager.php  # ✓ Clone
│   ├── class-vaptguard-config-cleaner.php  # ✓ Clone
│   ├── class-vaptguard-environment-detector.php # ✓ Clone
│   ├── debug-utils.php               # ✓ Clone + renames
│   └── rest/
│       └── class-vaptguard-rest-base.php  # ✓ Clone
└── assets/js/admin-modules/
    ├── logger.js                     # ✓ Copy
    ├── api-fetch-hotpatch.js         # ✓ Copy
    ├── modals.js                   # ✓ Copy
    ├── field-mapping.js            # ✓ Copy
    ├── design-modal.js            # ✓ Copy
    └── domains.js                # ✓ Copy
```

---

## Implementation Checklist

- [ ] Clone REST handler class
- [ ] Rename namespace: `vaptsecure/v1` → `vaptguard/v1`
- [ ] Clone admin pages class
- [ ] Clone license manager class
- [ ] Clone config cleaner class
- [ ] Rename headers in all HTTP responses
- [ ] Rename query params
- [ ] Update JavaScript handle names
- [ ] Update window object names
- [ ] Copy all admin JS modules
- [ ] Test: REST endpoints respond
- [ ] Test: Transition Draft → Develop modal
- [ ] Verify: dev_instruct saves
- [ ] Verify: wireframe_url saves

*Phase 2 - Ready for iteration*

---

## ROLLBACK PROCEDURE

### If Phase 2 Fails:

1. **REST endpoints stop responding** - verify in browser DevTools
2. **Transition modal stops working** - may need to re-run REST class
3. **Re-run Phase 2 files** - no DB schema changes needed
4. **If severe:** restore from Phase 1 backup

### Rollback Commands:
```php
// Clear cached REST routes
flush_rewrite_rules();

// Re-check auth class
is_vaptguard_superadmin();
```

### Pre-Phase Checklist:
- [ ] Backup database
- [ ] Backup plugin files