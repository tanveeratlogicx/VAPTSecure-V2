# Phase 1: Core Foundation

## Overview
Plugin foundation - activate, create DB tables, register menus, load features in Draft state.

---

## Phase Goal
Plugin activates successfully with 159 features loaded in **Draft** state.

---

## Files to Process

### 1.1 Main Plugin File
| Source | Target | Required Changes |
|--------|--------|------------------|
| `vaptsecure.php` | `vaptguard.php` | All renames |

**Key components in this file:**
- Plugin header
- Constants (VERSION, PATH, URL, etc.)
- Menu registration
- DB table creation (7 tables)
- Feature loading from data file
- Activation hook
- Required files include

**Plugin Header Details:**
```php
/*
Plugin Name: VAPTGuard Pro
Plugin URI: https://vaptguard.com/
Description: WordPress Security SaaS Platform - Dual interface security plugin with feature builder
Version: 1.0.1 (Phase 1 Complete)
Author: [Your Name]
Author URI: https://vaptguard.com/
License: GPLv2 or later
Text Domain: vaptguard
Domain Path: /languages
Requires at least: 5.0
Tested up to: 6.4
*/

// Additional headers if needed:
* Network: true (for multisite)
```

### 1.2 Database Handler
| Source | Target | Required Changes |
|--------|--------|------------------|
| `includes/class-vaptsecure-db.php` | `includes/class-vaptguard-db.php` | Class rename |

**Key functions:**
- DB connection methods
- Feature status methods
- Global protection toggle

### 1.3 Auth Stub
| Source | Target | Required Changes |
|--------|--------|------------------|
| `includes/class-vaptsecure-auth.php` | `includes/class-vaptguard-auth.php` | Class rename |

**Note**: This is an **empty stub** - full auth implementation comes in Phase 2.
- Create class with minimal stub methods
- Real auth functions added in Phase 2

### 1.4 Driver Interface
| Source | Target | Required Changes |
|--------|--------|------------------|
| `includes/interfaces/interface-vaptsecure-driver.php` | `includes/interfaces/interface-vaptguard-driver.php` | Interface rename |

### 1.5 Data File
| Source | Status |
|--------|--------|
| `data/Updated_Feature_List_159_Adaptive.json` | Primary file - already present |
| `data/Feature-List-159-Adaptive-Updated.json` | Legacy compatibility file |

---

## Required Renames

### 2.1 Plugin Header
```php
// OLD:
Plugin Name: VAPTSecure Clean

// NEW:
Plugin Name: VAPTGuard Pro

// ALSO:
// Text Domain in header: 'vaptguard'
// In translation calls: 'vaptsecure' → 'vaptguard'
```

### 2.2 Include Paths (CRITICAL)
Every require/include path using VAPTSECURE_PATH needs update:

```php
// OLD (in vaptguard.php after rename):
require_once VAPTGUARD_PATH . 'includes/class-vaptsecure-db.php';

// NEW:
require_once VAPTGUARD_PATH . 'includes/class-vaptguard-db.php';

// Pattern: VAPTSECURE_PATH -> VAPTGUARD_PATH
//         class-vaptsecure-*   -> class-vaptguard-*
```

**Files to include (update paths):**
- `class-vaptguard-auth.php`
- `interface-vaptguard-driver.php`
- `class-vaptguard-schema-validator.php`
- `class-vaptguard-rest.php`
- `class-vaptguard-db.php`
- `class-vaptguard-workflow.php`
- `class-vaptguard-ai-config.php`
- `class-vaptguard-build.php`
- `class-vaptguard-config-cleaner.php`
- `class-vaptguard-enforcer.php`
- `class-vaptguard-admin.php`
- `class-vaptguard-license-manager.php`

---

## Rename Patterns for Phase 1

### Constants
```
VAPTSECURE_VERSION         → VAPTGUARD_VERSION
VAPTSECURE_DATA_VERSION  → VAPTGUARD_DATA_VERSION
VAPTSECURE_PATH          → VAPTGUARD_PATH
VAPTSECURE_URL           → VAPTGUARD_URL
VAPTSECURE_ACTIVE_DATA_FILE → VAPTGUARD_ACTIVE_DATA_FILE
VAPTSECURE_PATTERN_LIBRARY → VAPTGUARD_PATTERN_LIBRARY
VAPTC_VERSION           → VAPTG_VERSION
VAPTC_PATH              → VAPTG_PATH
VAPTC_URL               → VAPTG_URL
```

### Menu Slugs
```
vaptsecure          → vaptguard
vaptsecure-workbench → vaptguard-workbench
vaptsecure-domain-admin → vaptguard-domain-admin
```

### Database Tables
```
wp_vaptsecure_domains          → wp_vaptguard_domains
wp_vaptsecure_domain_features → wp_vaptguard_domain_features
wp_vaptsecure_feature_status  → wp_vaptguard_feature_status
wp_vaptsecure_feature_meta    → wp_vaptguard_feature_meta
wp_vaptsecure_feature_history → wp_vaptguard_feature_history
wp_vaptsecure_domain_builds   → wp_vaptguard_domain_builds
wp_vaptsecure_security_events → wp_vaptguard_security_events
```

### Options
```
vaptsecure_active_feature_file → vaptguard_active_feature_file
vaptsecure_version            → vaptguard_version
```

### WordPress Option Calls (function of option name)
```
// Pattern: Replace 'vaptsecure' with 'vaptguard' in ALL option names
update_option('vaptsecure_*', ...) → update_option('vaptguard_*', ...)
get_option('vaptsecure_*', ...)    → get_option('vaptguard_*', ...)
delete_option('vaptsecure_*', ...)   → delete_option('vaptguard_*', ...)
```

### Transient Calls (function of transient name)
```
// Pattern: Replace 'vaptsecure' with 'vaptguard' in ALL transient names
set_transient('vaptsecure_*', ...) → set_transient('vaptguard_*', ...)
get_transient('vaptsecure_*', ...) → get_transient('vaptguard_*', ...)
delete_transient('vaptsecure_*', ...) → delete_transient('vaptguard_*', ...)
```

### Functions (prefix)
```
vaptsecure_*   → vaptguard_*
is_vaptsecure_* → is_vaptguard_*
```

### Classes (prefix)
```
VAPTSECURE_*   → VAPTGUARD_*
```

### Text Domain
```
'vaptsecure'  → 'vaptguard'
// Used in: __(), _e(), load_plugin_textdomain(), etc.
```

### Console Prefix
```
[VAPT]  → [VAPTGuard]
// Used in: error_log, console.log, etc.
```

### REST API Namespace
```
vaptsecure/v1  → vaptguard/v1
```

---

## Feature Loading (Draft State)

### How Features Load:

1. **Source**: `data/Updated_Feature_List_159_Adaptive.json` (primary) with legacy fallback support
2. **Method**: On activation, iterate through all 159 features
3. **Initial Status**: 'Draft'

### Code Pattern:
```php
// On plugin activation
$features_json = file_get_contents(VAPTGUARD_PATH . 'data/Updated_Feature_List_159_Adaptive.json');
$features = json_decode($features_json, true);

// For new schema: iterate features[] and use item['id'].
// For legacy schema: iterate _index['by_risk_id'].
// INSERT INTO wp_vaptguard_feature_status (feature_key, status)
// VALUES ('feature_id', 'Draft')

// This seeds all 159 features in Draft state
```

---

## Test Criteria (Phase 1)

- [ ] Plugin activates without errors
- [ ] 7 database tables created:
  - [ ] vaptguard_domains
  - [ ] vaptguard_domain_features
  - [ ] vaptguard_feature_status
  - [ ] vaptguard_feature_meta (with wireframe_url, dev_instruct columns)
  - [ ] vaptguard_feature_history
  - [ ] vaptguard_domain_builds
  - [ ] vaptguard_security_events
- [ ] Menu "VAPTGuard Pro" appears in admin
- [ ] Submenus:
  - [ ] VAPTGuard Pro Status
  - [ ] VAPTGuard Workbench
  - [ ] VAPTGuard Domain Admin
- [ ] Features load from JSON file in Draft state (159 features)
- [ ] No naming conflicts with VAPTSecure

---

## Exit Gate

> Phase 1 COMPLETE when: Plugin activates, menus appear, 7 DB tables created, features load in Draft state

---

## Files Created

After Phase 1, these files should exist:
```
VAPTSecureV2/
├── vaptguard.php                          # ✓ Clone
├── includes/
│   ├── class-vaptguard-db.php            # ✓ Clone
│   ├── class-vaptguard-auth.php          # ✓ Clone (stub - empty class)
│   └── interfaces/
│       └── interface-vaptguard-driver.php  # ✓ Clone
├── data/
│   ├── Updated_Feature_List_159_Adaptive.json  # primary catalog
│   └── Feature-List-159-Adaptive-Updated.json  # legacy compatibility
```

---

## Implementation Checklist

- [ ] Clone `vaptsecure.php` → `vaptguard.php`
- [ ] Update plugin header (name, text domain)
- [ ] Replace all constants (`VAPTSECURE_*` → `VAPTGUARD_*`)
- [ ] Replace all menu slugs
- [ ] Replace all function names
- [ ] Replace all class names
- [ ] Replace all include paths
- [ ] Clone database handler class
- [ ] Clone auth stub interface
- [ ] Clone driver interface
- [ ] Update data file reference
- [ ] Test: Activate plugin
- [ ] Verify: 7 tables created
- [ ] Verify: Menus appear
- [ ] Verify: 159 features in Draft

*Phase 1 - Ready for iteration*

---

## ROLLBACK PROCEDURE

### If Phase 1 Fails:

1. **Deactivate plugin** in WordPress admin
2. **Drop database tables:**
```sql
DROP TABLE IF EXISTS wp_vaptguard_domains;
DROP TABLE IF EXISTS wp_vaptguard_domain_features;
DROP TABLE IF EXISTS wp_vaptguard_feature_status;
DROP TABLE IF EXISTS wp_vaptguard_feature_meta;
DROP TABLE IF EXISTS wp_vaptguard_feature_history;
DROP TABLE IF EXISTS wp_vaptguard_domain_builds;
DROP TABLE IF EXISTS wp_vaptguard_security_events;
```
3. **Delete plugin files** via FTP/File Manager
4. **Remove menus** - may require page refresh

### Pre-Phase Checklist:
- [ ] Backup database
- [ ] Backup plugin files
- [ ] Note WordPress admin URL