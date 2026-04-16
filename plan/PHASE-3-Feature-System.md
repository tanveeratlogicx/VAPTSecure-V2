# Phase 3: Feature System

## Overview
Workbench UI, feature state transitions (4 states), enforcers, Test state with local context.

---

## Phase Goal
Workbench functional. Features can transition through all 4 states with adjacent-only rules. Test state isolates local config.

---

## Files to Process

### 3.1 Core Enforcer
| Source | Target | Required Changes |
|--------|--------|------------------|
| `includes/class-vaptsecure-enforcer.php` | `includes/class-vaptguard-enforcer.php` | Full rename |

**Key components:**
- Enforcement logic
- Hook drivers
- Feature rebuild

### 3.2 Workflow (State Transitions)
| Source | Target | Required Changes |
|--------|--------|------------------|
| `includes/class-vaptsecure-workflow.php` | `includes/class-vaptguard-workflow.php` | Full rename |

**CRITICAL - Adjacent States Only:**
```php
// CORRECT transition rules (no skip):
'develop' => array('draft', 'test'),      // NOT 'release'
'test'   => array('develop', 'release'),
'release' => array('test'),             // NOT 'develop' or 'draft'
```

### 3.3 Schema Validator
| Source | Target | Required Changes |
|--------|--------|------------------|
| `includes/class-vaptsecure-schema-validator.php` | `includes/class-vaptguard-schema-validator.php` | Full rename |

### 3.4 Deployment Orchestrator
| Source | Target | Required Changes |
|--------|--------|------------------|
| `includes/class-vaptsecure-deployment-orchestrator.php` | `includes/class-vaptguard-deployment-orchestrator.php` | Full rename |

### 3.5 Migrations
| Source | Target | Required Changes |
|--------|--------|------------------|
| `includes/class-vaptsecure-migrations.php` | `includes/class-vaptguard-migrations.php` | Full rename |

### 3.6 AI Config
| Source | Target | Required Changes |
|--------|--------|------------------|
| `includes/class-vaptsecure-ai-config.php` | `includes/class-vaptguard-ai-config.php` | Full rename |

### 3.7 AI Validator
| Source | Target | Required Changes |
|--------|--------|------------------|
| `includes/class-vaptsecure-ai-validator.php` | `includes/class-vaptguard-ai-validator.php` | Full rename |

### 3.8 Enforcer Drivers (Copy All)
| Source | Target |
|--------|--------|
| `includes/enforcers/class-vaptsecure-hook-driver.php` | Copy |
| `includes/enforcers/class-vaptsecure-apache-deployer.php` | Copy |
| `includes/enforcers/class-vaptsecure-apache-driver.php` | Copy |
| `includes/enforcers/class-vaptsecure-caddy-driver.php` | Copy |
| `includes/enforcers/class-vaptsecure-config-deployer.php` | Copy |
| `includes/enforcers/class-vaptsecure-config-driver.php` | Copy |
| `includes/enforcers/class-vaptsecure-htaccess-driver.php` | Copy |
| `includes/enforcers/class-vaptsecure-iis-driver.php` | Copy |
| `includes/enforcers/class-vaptsecure-nginx-deployer.php` | Copy |
| `includes/enforcers/class-vaptsecure-nginx-driver.php` | Copy |
| `includes/enforcers/class-vaptsecure-php-deployer.php` | Copy |
| `includes/enforcers/class-vaptsecure-php-driver.php` | Copy |

### 3.9 Self-Check System (Copy All)
| Source | Target |
|--------|--------|
| `includes/self-check/class-vapt-audit-log.php` | Copy |
| `includes/self-check/class-vapt-auto-correct.php` | Copy |
| `includes/self-check/class-vapt-check-item.php` | Copy |
| `includes/self-check/class-vapt-cron.php` | Copy |
| `includes/self-check/class-vapt-lifecycle.php` | Copy |
| `includes/self-check/class-vapt-self-check-result.php` | Copy |
| `includes/self-check/class-vapt-self-check.php` | Copy |

### 3.10 Workbench UI (Clone)
| Source | Target | Required Changes |
|--------|--------|------------------|
| `assets/js/workbench.js` | `assets/js/workbench.js` | All renames |

**Key components:**
- ClientDashboard component
- Feature list with status badges
- Implementation panels
- State transition controls

---

## State Transitions (Adjacent Only)

### Allowed Transitions:
```
Draft ──► Develop ──► Test ──► Release
  ▲          ▲         ▲          ▲
  │          │    ┌────┴────┐    │
  └──────────┘    └─────────┘    │
    (revert)        (revert)     │
                       (revert)  │
```

| From | Can Go To |
|------|----------|
| Draft | Develop |
| Develop | Draft, Test |
| Test | Develop, Release |
| Release | Test |

### Test State = Local Context
When a feature is in **Test** state:
- Changes affect that feature **only**
- Does NOT inherit global config changes
- Isolated from other features

---

## Test Criteria (Phase 3)

- [ ] Workbench loads at `/wp-admin/admin.php?page=vaptguard-workbench`
- [ ] All 159 features display:
  - [ ] Status badges show (Draft/Develop/Test/Release)
  - [ ] Feature list sortable
- [ ] Feature search/filter works
- [ ] Adjacent transitions work:
  - [ ] Draft → Develop ✓
  - [ ] Develop → Test ✓
  - [ ] Test → Release ✓
- [ ] Transitions blocked (no skip):
  - [ ] Draft → Release blocked ❌
  - [ ] Develop → Release blocked ❌
- [ ] Revert transitions work:
  - [ ] Test → Develop ✓
  - [ ] Develop → Draft ✓
- [ ] Test state isolation works
- [ ] Transition modal captures history
- [ ] Enforcers load correctly
- [ ] No JavaScript console errors

---

## Exit Gate

> Phase 3 COMPLETE when: Workbench functional, all 4 states work, adjacent-only transitions enforced, Test state has local isolation

---

## Files Created

After Phase 3, additional files:
```
VAPTSecureV2/
├── includes/
│   ├── class-vaptguard-enforcer.php          # ✓ Clone
│   ├── class-vaptguard-workflow.php      # ✓ Clone
│   ├── class-vaptguard-schema-validator.php  # ✓ Clone
│   ├── class-vaptguard-deployment-orchestrator.php  # ✓ Clone
│   ├── class-vaptguard-migrations.php   # ✓ Clone
│   ├── class-vaptguard-ai-config.php  # ✓ Clone
│   ├── class-vaptguard-ai-validator.php  # ✓ Clone
│   ├── enforcers/
│   │   ├── class-vaptguard-hook-driver.php  # ✓ Copy
│   │   ├── class-vaptguard-apache-deployer.php  # ✓ Copy
│   │   └── ... (all 12 drivers)        # ✓ Copy
│   └── self-check/
│       ├── class-vaptguard-audit-log.php  # ✓ Copy
│       └── ... (all 7 files)           # ✓ Copy
└── assets/js/
    └── workbench.js                    # ✓ Clone
```

*Phase 3 - Ready for iteration*