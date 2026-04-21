# VAPTGuard Pro - Implementation Plan (Merged)

## Mission
Clone VAPTSecure Clean as a fully functional independent plugin "VAPTGuard Pro" that can coexist with the original on the same WordPress installation.

## Canonical Datasource Contract

All implementation work uses exactly one datasource:
- `data/Updated_Feature_List_159_Adaptive.json`

This file is the product-security contract for this implementation:
- `meta.version`: `3.1.0`
- `meta.source`: `VAPT Builder Adaptive Core`
- `meta.schema`: `A+ Adaptive Layout`
- `meta.total_features`: `159`
- `meta.generated_at`: `2026-04-02`
- `meta.owasp_standard`: `OWASP Top 10:2025`

Required normalization behavior:
- Read metadata from `meta.*` (not top-level root fields).
- Normalize `granular_controls.reference = _rate_limiting_controls` to top-level `rate_limiting_controls`.
- Treat `form_builder_support.supported_form_builders` and `form_builder_support.wordpress_core_forms` as different shapes.
- Do not block feature generation when `owasp` is missing (73/159 entries).
- Preserve both `RiskID` and `id` as stable keys for implementation and reporting.

---

## PART 1: FEATURE LIFECYCLE (4 States)

```
Draft ──► Develop ──► Test ──► Release
```

### State Meanings:

| State | Context | Description |
|-------|---------|-------------|
| **Draft** | - | Feature exists in canonical 159-feature datasource |
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
| /wp-json/vaptsecure/v1/ | /wp-json/vaptguard/v1/ |

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

> Features loaded from canonical datasource start as **Draft** state

**Deliverables**:
- `vaptguard.php` - Main plugin
- `includes/class-vaptguard-db.php` - Database handler
- `includes/class-vaptguard-auth.php` - Auth stub
- Canonical data file `data/Updated_Feature_List_159_Adaptive.json` (already present)

**Test Criteria**:
- [ ] Plugin activates without errors
- [ ] 7 DB tables created
- [ ] Menus appear (Status, Workbench, Domain Admin)
- [ ] Features load in Draft state
- [ ] No naming conflicts

### CHUNK 2: DEVELOP Stage - REST API & Core Functions

**Purpose**: API, authentication, options, transition to Develop

**Deliverables**:
- `class-vaptguard-rest.php` - REST API handler
- `class-vaptguard-admin.php` - Admin pages
- `class-vaptguard-license-manager.php` - License system
- `class-vaptguard-config-cleaner.php` - Config utilities
- `assets/js/admin-modules/` - Admin JS modules

**Test Criteria**:
- [ ] REST API responds at `/wp-json/vaptguard/v1/`
- [ ] Authentication works
- [ ] Transition modal works (Draft → Develop)
- [ ] dev_instruct, wireframe_url saved

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

## DATA FILE

### Updated_Feature_List_159_Adaptive.json
- 159 features with full definitions
- Categories, severity, OWASP mappings
- test_method, verification_steps, remediation
- WordPress surface maps: `wp_path_patterns`, `wp_paths_flat`
- Shared control blueprints: `rate_limiting_controls`, `form_builder_support`

### Implementation Rules From Data File
- Use `verification_steps` as QA acceptance criteria and evidence prompts.
- Use `remediation` as default hardening guidance and safe autofix recommendations.
- Group and prioritize by `severity`, `category`, and `owasp` when present.
- Prefer shared engines: rate limiting, endpoint matching, sanitization/validation, logging, policy registry, rule mapping, evidence export.

---

*Ready for implementation*
*Last updated: April 20, 2026*
*Complete Dual-Interface Platform - VAPTGuard Pro*
