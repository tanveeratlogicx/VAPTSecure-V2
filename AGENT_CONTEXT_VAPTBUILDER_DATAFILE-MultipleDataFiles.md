# Extra AI Agent Instructions for VAPTBuilder

Use these instructions when working on the WordPress plugin builder and the active data file is any JSON under `data/`.

## Primary Rule

- Do not hard-code one specific JSON filename as the only source of truth.
- Treat the currently active or explicitly referenced JSON in `data/` as the canonical input for the current task.
- If multiple JSON files exist in `data/`, prefer this resolution order:
  1. the file currently open in the editor
  2. the file explicitly named by the user
  3. the file directly referenced by the code being edited
  4. the most recently modified matching JSON in `data/`
- If the task compares or migrates between files, treat both as first-class inputs and do not collapse them into one schema prematurely.

## Current Known Datafiles

- `data/Feature-List-159-Adaptive-Updated.json`
- `data/Updated_Feature_List_159_Adaptive.json`

These files are related, but they do not have identical top-level structure.

## Required Workflow For Any Agent

- Inspect the active JSON before making assumptions.
- Detect the schema shape from actual top-level keys.
- Build a normalized internal model from the active file.
- Preserve source values and source key names in the normalization layer.
- Do not rewrite source meaning just to force a uniform schema.

## Schema Detection Rules

### Schema Profile A: Expanded Adaptive Layout

Use this profile when the file has keys such as:

- `_meta`
- `_index`
- `_categories`
- `_severities`
- `_owasp_mapping`
- `RISK_001` style top-level objects
- `features`
- `_wp_path_patterns`
- `_wp_paths_flat`
- `_rate_limiting_controls`
- `_form_builder_support`

Interpretation:

- This is the richer adaptive layout.
- `features` is the main normalized feature list.
- `RISK_###` top-level objects are duplicated keyed accessors, not a separate product definition.
- Underscored top-level sections are support dictionaries and metadata.

### Schema Profile B: Lean Adaptive Layout

Use this profile when the file has keys such as:

- `meta`
- `reference`
- `features`
- `wp_path_patterns`
- `wp_paths_flat`
- `rate_limiting_controls`
- `form_builder_support`

Interpretation:

- This is a leaner normalized layout.
- Shared support sections are top-level and non-underscored.
- There may be no `RISK_###` keyed duplication layer.
- There may be no `_index`, `_categories`, `_severities`, or `_owasp_mapping` helper blocks.

## Canonical Normalized Model

Any parser, agent, or builder logic should normalize the active file to this internal shape:

- `meta`
- `reference`
- `features`
- `categories`
- `severities`
- `owasp_mapping`
- `wp_path_patterns`
- `wp_paths_flat`
- `rate_limiting_controls`
- `form_builder_support`
- `risk_lookup`

Normalization expectations:

- `meta`
  - map from `_meta` or `meta`
- `reference`
  - map from `reference` when present
  - otherwise derive from `_index` and keyed `RISK_###` objects if available
- `features`
  - always use the `features` array as the primary iterable feature collection
- `categories`
  - map from `_categories` when present
  - otherwise derive from distinct `features[].category`
- `severities`
  - map from `_severities` when present
  - otherwise derive from distinct `features[].severity`
- `owasp_mapping`
  - map from `_owasp_mapping` when present
  - otherwise derive from distinct `features[].owasp` values that exist
- `wp_path_patterns`
  - map from `_wp_path_patterns` or `wp_path_patterns`
- `wp_paths_flat`
  - map from `_wp_paths_flat` or `wp_paths_flat`
- `rate_limiting_controls`
  - map from `_rate_limiting_controls` or `rate_limiting_controls`
- `form_builder_support`
  - map from `_form_builder_support` or `form_builder_support`
- `risk_lookup`
  - in Profile A, derive from top-level `RISK_###` objects and/or `features`
  - in Profile B, derive from `features` keyed by `RiskID` and `id`

## Feature-Level Assumptions

- Each feature should be treated as a security capability to build, enforce, detect, verify, or document.
- Stable identifiers are:
  - `RiskID`
  - `id`
- Common feature fields are:
  - `RiskID`
  - `id`
  - `name`
  - `description`
  - `category`
  - `severity`
  - `owasp`
  - `test_method`
  - `verification_steps`
  - `remediation`
- Some files or entries may also include optional fields such as:
  - `granular_controls`
  - future feature-specific extensions

## Interpretation Rules

- `verification_steps` should drive:
  - QA scenarios
  - test cases
  - acceptance criteria
  - admin-facing evidence or explanation copy
- `remediation` should drive:
  - implementation goals
  - recommended defaults
  - help text
  - autofix suggestions where safe
- `test_method` should influence how the feature is validated in code, UI, or scanner logic.
- `category`, `severity`, and `owasp` should drive prioritization, grouping, filtering, and reporting.

## Important Normalization Notes

- Do not assume helper sections exist in every file.
- Do not assume helper sections use the same top-level key names across files.
- Do not assume every feature has `owasp`.
- Missing `owasp` mapping must not block feature generation or prioritization.
- Do not assume every file includes top-level `RISK_###` objects.
- If `granular_controls.reference` points to `_rate_limiting_controls`, normalize it to the active file's canonical `rate_limiting_controls` model.
- `form_builder_support` may contain mixed shapes:
  - third-party builders under `supported_form_builders`
  - WordPress native forms under `wordpress_core_forms`
- Do not assume one uniform schema for all form-related definitions.

## WordPress-Specific Meaning

- These data files model real WordPress attack surfaces, including:
  - `/wp-login.php`
  - `/xmlrpc.php`
  - `/wp-cron.php`
  - `/wp-json/`
  - `/wp-admin/admin-ajax.php`
  - `/wp-content/uploads/`
  - sensitive config and backup files
- `wp_path_patterns` should be treated as a reusable endpoint and path dictionary for:
  - route targeting
  - scanner generation
  - block rules
  - hardening rules
  - documentation
- `wp_paths_flat` should be treated as helper or derived path data.

## Builder Design Assumptions

- The plugin builder should convert the active JSON into modular WordPress protections, not a monolithic hard-coded ruleset.
- Each feature should ideally map to one or more of:
  - detection logic
  - prevention or hardening logic
  - logging or evidence logic
  - admin configuration
  - test or verification workflow
- A feature may be:
  - enforceable automatically
  - monitor-only
  - advisory with guided remediation
- Do not force all features into identical implementation patterns.

## Shared Engines The Builder Should Prefer

- Central rate-limiting engine
- Shared request inspection and endpoint matching
- Shared sanitization and validation layer
- Central logging and audit event service
- Shared admin policy registry
- Shared rule-to-endpoint mapping layer
- Shared evidence export and reporting layer

## Rate Limiting Guidance

- `rate_limiting_controls` is a reusable control specification, not just documentation.
- Use it as the basis for:
  - per-IP limits
  - per-user limits
  - per-endpoint limits
  - block, throttle, captcha, lockout, and log-only actions
  - reset controls
  - alerting
  - evidence collection
- Features with `granular_controls` should be wired into this shared engine instead of implementing bespoke limiters.

## Form Builder Guidance

- `form_builder_support` is a domain-specific security blueprint when present.
- It may cover third-party builders and WordPress core forms.
- Use it for:
  - plugin detection
  - endpoint discovery
  - field-level sanitization rules
  - rate-limiting defaults
  - file upload controls
  - builder-specific protection steps
- WordPress core forms should be treated as high-priority attack surfaces when modeled explicitly.

## Do Not Make These Mistakes

- Do not treat a data file as a vulnerability scan result for one site only unless the file explicitly says so.
- Do not assume all files expose the same helper sections.
- Do not assume all features already have complete OWASP mapping.
- Do not assume every remediation should be auto-applied without admin review.
- Do not build endpoint logic from free text when structured endpoint or path data already exists.
- Do not duplicate form-builder or rate-limit logic across multiple features.
- Do not drop `verification_steps`; they are part of the product definition.
- Do not bind agent behavior to one filename when multiple valid datafiles exist in `data/`.

## Output Expectations For Future AI Agents

- Any implementation proposal should state:
  - which datafile was used
  - which schema profile was detected
  - which `RiskID` or feature `id` it covers
  - which WordPress surface it protects
  - whether it is prevent, detect, log, or advise
  - what shared engine it depends on
  - how success is verified from `verification_steps`
- Any generated UI or admin settings should preserve the language of:
  - severity
  - category
  - OWASP mapping when present
  - remediation guidance
- Any generated test plan should be traceable back to the active JSON feature entries.

## Recommended Default Mindset

- Build the plugin as a policy-driven security platform for WordPress.
- Use the active JSON as the contract for the current task.
- Prefer normalized internal models, shared enforcement engines, and traceability back to `RiskID`.
- If data is ambiguous, preserve the source value and add a normalization layer instead of silently rewriting meaning.
