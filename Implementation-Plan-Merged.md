# VAPTGuard Pro - Implementation Plan (Merged)

## Mission
Clone VAPTSecure Clean as a fully functional independent plugin "VAPTGuard Pro" that can coexist with the original on the same WordPress installation.

---

## FQDN Architecture

All URLs must use Fully Qualified Domain Name (FQDN) format:

| Type | Format |
|------|--------|
| REST API | `https://{SITE_DOMAIN}/wp-json/vaptguard/v1/*` |
| Admin Pages | `https://{SITE_DOMAIN}/wp-admin/admin.php?page=*` |
| Plugin/Author URI | `https://vaptguard.com/` |

---

## PART 1: FEATURE LIFECYCLE (4 States)

```
Draft ──► Develop ──► Test ──► Release
```

### State Meanings:

| State | Context | Description |
|-------|---------|-------------|
| **Draft** | - | Feature exists in 159 features list (from data file) |
| **Develop** | Global | Has AI brief + schema, changes affect global context |
| **Test** | Local | Isolated - changes stay local to feature only |
| **Release** | - | Ready for client builds |

### Adjacent States Only (No Skipping):

```
Draft ──► Develop ──► Test ──► Release
    ▲          ▲          ▲
    │          │    ┌────┴────┐
    └──────────┘    └─────────┘
```

| Current | Can Go To |
|---------|----------|
| **Draft** | Develop only |
| **Develop** | Draft OR Test |
| **Test** | Develop OR Release |
| **Release** | Test only |

### In-Place Editing

In **any state**, can edit metadata (dev_instruct, wireframe_url, note) without changing state:
- Just an **update action**, not a transition
- Release features can be enhanced without reverting

---

## PART 2: FRONTEND INTERFACES

### Interface Mapping

| File | Page | Access | Features Shown |
|------|------|--------|----------------|
| `client.js` | Status Page | All admins | Only Release features |
| `workbench.js` | Workbench | Superadmin ONLY | All 159 features |
| `admin.js` | Domain Admin | Superadmin ONLY | Domain management |

### How Interfaces Load

```php
// In vaptguard.php - vaptguard_enqueue_admin_assets()

// 1. Client Status (toplevel_page_vaptguard)
if ($screen->id === 'toplevel_page_vaptguard') {
    wp_enqueue_script('vapt-client-js', ..., 'client.js', ...);
}

// 2. Workbench (vaptguard-workbench)
if (strpos($screen->id, 'vaptguard-workbench') !== false) {
    wp_enqueue_script('vapt-workbench-js', ..., 'workbench.js', ...);
}

// 3. Domain Admin (vaptguard-domain-admin)
if ($screen->id === 'toplevel_page_vaptguard-domain-admin') {
    wp_enqueue_script('vapt-admin-js', ..., 'admin.js', ...);
}
```

---

## PART 3: DUAL INTERFACE ARCHITECTURE

### User Types & Access

| Role | Menu Access | Features Visible | Interface |
|------|-----------|------------------|-----------|
| **Superadmin** | Workbench + Domain Admin | All 159 features in ALL states | workbench.js + admin.js |
| **Client** | Only Status page | Only Release features for domain | client.js |

### Feature States Visibility

| State | Superadmin Sees | Client Sees |
|-------|----------------|-------------|
| Draft | ✅ Yes | ❌ No |
| Develop | ✅ Yes | ❌ No |
| Test | ✅ Yes | ❌ No |
| Release | ✅ Yes | ✅ Yes (if enabled) |

---

## PART 4: AUTHENTICATION

### Superadmin Identity Check
- Uses SHA256 hashed user_login OR user_email
- Configured in `vaptguard_get_superadmin_identity()`
- OTP (One-Time Password) for additional security

### Client Access
- Standard WordPress capability (`manage_options`)
- No OTP required

---

## PART 5: BUILD GENERATOR

### Build Flow

1. **Feature Selection** - Superadmin configures features to Release state
2. **Domain Assignment** - Add client domain, assign features, set license
3. **Generate Build** - Select domain, features (Release only), generate ZIP
4. **Client Deployment** - Client uploads ZIP, domain-locked, sees only their features

### Client Build Logic (class-vaptguard-build.php)
1. Remove superadmin identity
2. Remove workbench menu
3. Remove domain admin menu
4. Filter features - Only Release state
5. Lock domain from build config
6. Remove build functionality

---

## PART 6: LICENSE TYPES

| License | Scope | Domain Lock | Features |
|---------|-------|-------------|----------|
| `standard` | Single domain | Exact match | Only assigned |
| `developer_unbound` | Unlimited | Wildcard (*) | All features |
| `7-day-trial` | Single domain | Exact match | Limited time |
| `15-day-demo` | Single domain | Exact match | Demo set |

---

## PART 7: COMPLETE RENAME REFERENCE

### Core Identity

| Element | Original | New |
|---------|----------|-----|
| Plugin Name | VAPTSecure Clean | VAPTGuard Pro |
| Text Domain | vaptsecure | vaptguard |

### Menu Slugs

| Original | New |
|----------|-----|
| vaptsecure | vaptguard |
| vaptsecure-workbench | vaptguard-workbench |
| vaptsecure-domain-admin | vaptguard-domain-admin |

### REST API

| Original | New |
|----------|-----|
| /wp-json/vaptsecure/v1/ | https://{SITE_DOMAIN}/wp-json/vaptguard/v1/ |

### Constants

| Original | New |
|----------|-----|
| VAPTSECURE_VERSION | VAPTGUARD_VERSION |
| VAPTSECURE_PATH | VAPTGUARD_PATH |
| VAPTSECURE_URL | VAPTGUARD_URL |
| VAPTSECURE_DEBUG | VAPTGUARD_DEBUG |

### Database Tables

| Original | New |
|----------|-----|
| wp_vaptsecure_domains | wp_vaptguard_domains |
| wp_vaptsecure_domain_features | wp_vaptguard_domain_features |
| wp_vaptsecure_feature_status | wp_vaptguard_feature_status |
| wp_vaptsecure_feature_meta | wp_vaptguard_feature_meta |
| wp_vaptsecure_feature_history | wp_vaptguard_feature_history |
| wp_vaptsecure_domain_builds | wp_vaptguard_domain_builds |
| wp_vaptsecure_security_events | wp_vaptguard_security_events |

### WordPress Options

| Original | New |
|----------|-----|
| vaptsecure_version | vaptguard_version |
| vaptsecure_active_feature_file | vaptguard_active_feature_file |
| vaptsecure_global_protection | vaptguard_global_protection |
| vaptsecure_hidden_json_files | vaptguard_hidden_json_files |
| vaptsecure_removed_json_files | vaptguard_removed_json_files |

### Transients

| Original | New |
|----------|-----|
| vaptsecure_active_enforcements | vaptguard_active_enforcements |
| vaptsecure_missing_config_notified | vaptguard_missing_config_notified |
| vaptsecure_network_site_count | vaptguard_network_site_count |

### JavaScript Window Objects

| Original | New |
|----------|-----|
| vaptSecureSettings | vaptguardSecureSettings |
| vaptLog | vaptguardLog |
| VAPTSECURE_GeneratedInterface | VAPTGUARD_GeneratedInterface |
| vapt_GeneratedInterface | vaptguard_GeneratedInterface |

### HTTP Headers

| Original | New |
|----------|-----|
| x-vapt-enforced | x-vaptguard-enforced |
| x-vapt-feature | x-vaptguard-feature |
| x-vapt-debug | x-vaptguard-debug |
| x-vapt-count | x-vaptguard-count |
| x-vapt-trace | x-vaptguard-trace |

### JavaScript Handles (wp_enqueue_script)

| Original | New |
|----------|-----|
| vapt-client-js | vaptguard-client-js |
| vapt-workbench-js | vaptguard-workbench-js |
| vapt-admin-js | vaptguard-admin-js |
| vapt-admin-logger | vaptguard-admin-logger |
| vapt-admin-modals | vaptguard-admin-modals |
| vapt-interface-generator | vaptguard-interface-generator |
| vapt-admin-domains | vaptguard-admin-domains |

### JavaScript URL Parameters

| Original | New |
|----------|-----|
| vaptsecure_header_check | vaptguard_header_check |
| vaptsecure_test_context | vaptguard_test_context |
| vaptsecure_test_spike | vaptguard_test_spike |

### Console Prefix

| Original | New |
|----------|-----|
| [VAPT] | [VAPTGuard] |

### CSS Classes

| Original | New |
|----------|-----|
| .vapt- | .vaptguard- |
| .vapt-admin-root | .vaptguard-admin-root |
| .vapt-workbench-root | .vaptguard-workbench-root |
| .vapt-client-root | .vaptguard-client-root |

### Functions (Key)

| Original | New |
|----------|-----|
| is_vaptsecure_superadmin() | is_vaptguard_superadmin() |
| vaptsecure_is_feature_allowed() | vaptguard_is_feature_allowed() |
| vaptsecure_is_domain_match() | vaptguard_is_domain_match() |
| vaptsecure_render_workbench_page() | vaptguard_render_workbench_page() |

### Classes (Key)

| Original | New |
|----------|-----|
| VAPTSECURE_REST | VAPTGUARD_REST |
| VAPTSECURE_Enforcer | VAPTGUARD_Enforcer |
| VAPTSECURE_Build | VAPTGUARD_Build |
| VAPTSECURE_Admin | VAPTGUARD_Admin |
| VAPTSECURE_DB | VAPTGUARD_DB |
| VAPTSECURE_Auth | VAPTGUARD_Auth |
| VAPTSECURE_License_Manager | VAPTGUARD_License_Manager |
| VAPTSECURE_Workflow | VAPTGUARD_Workflow |

---

## PART 8: IMPLEMENTATION CHUNKS

### CHUNK 1: DRAFT Stage - Core Plugin Skeleton

**Purpose**: Plugin foundation - activate, create DB tables, register menus

> Features loaded from data file start as **Draft** state

**Deliverables**:
- `vaptguard.php` - Main plugin
- `includes/class-vaptguard-db.php` - Database handler
- `includes/class-vaptguard-auth.php` - Auth stub
- Data file (already present)

**Test Criteria**:
- [ ] Plugin activates without errors
- [ ] 7 DB tables created
- [ ] Menus appear (Status, Workbench, Domain Admin)
- [ ] Features load in Draft state
- [ ] No naming conflicts

### CHUNK 2: DEVELOP Stage - REST API & Core Functions

**Purpose**: API, identity check, options, transition to Develop

**Deliverables**:
- `class-vaptguard-rest.php` - REST API handler
- `class-vaptguard-admin.php` - Admin pages
- `class-vaptguard-license-manager.php` - License system
- `class-vaptguard-config-cleaner.php` - Config utilities
- `assets/js/admin-modules/` - Admin JS modules
- `class-vaptguard-auth.php` - Basic identity check (OTP in Phase 3)

**Test Criteria**:
- [ ] REST API responds at `https://{SITE_DOMAIN}/wp-json/vaptguard/v1/`
- [ ] Identity check works (is_vaptguard_superadmin)
- [ ] Transition modal works (Draft → Develop)
- [ ] dev_instruct, wireframe_url saved

**Note**: Full OTP authentication is Phase 3 scope.

### CHUNK 3: TEST Stage - Workbench & State Transitions

**Purpose**: Workbench UI, state transitions, Test state with local context

**Deliverables**:
- `class-vaptguard-enforcer.php` - Core enforcer
- `class-vaptguard-workflow.php` - State handling (4 states, adjacent only)
- `includes/enforcers/` - Enforcer drivers
- `assets/js/workbench.js` - Workbench UI

**Test Criteria**:
- [ ] Workbench loads
- [ ] All 159 features viewable
- [ ] Adjacent transitions work (no skip)
- [ ] Test state = local context
- [ ] State filter works

### CHUNK 4: RELEASE Stage - Build Generator & Client Views

**Purpose**: Client builds, in-place editing for Release features

**Deliverables**:
- `class-vaptguard-build.php` - Build generator
- `assets/js/admin.js` - Domain Admin UI
- `assets/js/client.js` - Client Status UI
- `assets/css/admin.css` - Admin styles

**Test Criteria**:
- [ ] Client Status loads (Release only)
- [ ] Build generator creates ZIP
- [ ] Domain locking works
- [ ] Release features can be edited in place
- [ ] No conflicts with VAPTSecure

---

## PART 9: SUCCESS CRITERIA

1. ✅ Both plugins activate on same WordPress without conflicts
2. ✅ No function/class/constant collisions
3. ✅ Different REST API endpoints
4. ✅ Superadmin sees Workbench + Domain Admin
5. ✅ Client sees only Status page
6. ✅ Client sees only assigned Release features
7. ✅ Build generator creates working client builds
8. ✅ Domain locking works in generated builds
9. ✅ Adjacent state transitions (no skip)
10. ✅ Test state has local isolation

---

## PART 10: ROLLBACK PROCEDURES

### Rollback Strategy by Phase

| Phase | Risk Level | Rollback Action |
|-------|------------|-----------------|
| Phase 1 (Foundation) | High | Deactivate plugin, drop 7 tables, remove menus |
| Phase 2 (Functionality) | Medium | REST endpoints stop responding, re-run Phase 2 |
| Phase 3 (Feature System) | Medium | Features stuck in current state, re-run Phase 3 |
| Phase 4 (Build/Client) | Low | Client builds stop, re-run Phase 4 |

### Emergency Rollback Commands

```sql
-- DROP ALL TABLES (complete removal)
DROP TABLE IF EXISTS wp_vaptguard_security_events;
DROP TABLE IF EXISTS wp_vaptguard_domain_builds;
DROP TABLE IF EXISTS wp_vaptguard_feature_history;
DROP TABLE IF EXISTS wp_vaptguard_feature_meta;
DROP TABLE IF EXISTS wp_vaptguard_feature_status;
DROP TABLE IF EXISTS wp_vaptguard_domain_features;
DROP TABLE IF EXISTS wp_vaptguard_domains;
```

```php
// REMOVE ALL OPTIONS (cleanup)
delete_option('vaptguard_version');
delete_option('vaptguard_active_feature_file');
delete_option('vaptguard_global_protection');
delete_option('vaptguard_hidden_json_files');
delete_option('vaptguard_removed_json_files');
```

```php
// REMOVE ALL TRANSIENTS
delete_transient('vaptguard_active_enforcements');
delete_transient('vaptguard_missing_config_notified');
delete_transient('vaptguard_network_site_count');
```

### Rollback by Phase

#### Phase 1 Rollback (Core Foundation)
If Phase 1 fails:
1. Deactivate plugin in WordPress admin
2. Drop all 7 database tables
3. Delete plugin files via FTP/File Manager
4. Manually remove any added menus (may require page refresh)

#### Phase 2 Rollback (Core Functionality)
If Phase 2 fails:
1. REST endpoints fail to respond
2. Transition modal stops working
3. Re-run Phase 2 files (no DB changes needed)
4. If severe: restore from Phase 1 backup

#### Phase 3 Rollback (Feature System)
If Phase 3 fails:
1. Workbench becomes inaccessible
2. State transitions may break
3. Re-run Phase 3 enforcer files
4. Check feature_status table integrity

#### Phase 4 Rollback (Build & Client Views)
If Phase 4 fails:
1. Client builds stop generating
2. In-place editing may break
3. Re-run Phase 4 build class
4. No database schema changes - low risk

### Pre-Implementation Checklist (Before Each Phase)

- [ ] Backup database (mysqldump or plugin backup)
- [ ] Backup plugin files
- [ ] Note current WordPress admin URL
- [ ] Note PHP/WordPress versions
- [ ] Document any custom modifications

### Post-Implementation Verification (After Each Phase)

- [ ] Test basic functionality
- [ ] Verify no conflicts with VAPTSecure
- [ ] Check error logs
- [ ] Confirm menus appear correctly

---

## DATA FILE

### Feature-List-159-Adaptive-Updated.json
- 159 features with full definitions
- Categories, severity, OWASP mappings
- test_method, verification_steps, remediation
- UI schemas baked in (no separate files needed)

---

*Ready for implementation*
*Last updated: April 16, 2026*
*Initial Version: 1.0.0 | Current: 1.0.1 (Phase 1)*
*Complete Dual-Interface Platform - VAPTGuard Pro*