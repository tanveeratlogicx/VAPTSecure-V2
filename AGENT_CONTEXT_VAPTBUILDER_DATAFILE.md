# Extra AI Agent Instructions for VAPTBuilder

Use these instructions when working on the WordPress plugin builder that is driven by `data/Updated_Feature_List_159_Adaptive.json`.

## Primary Context

- This project is a **WordPress Security & Hardening Plugin Builder**.
- The analyzed data file declares:
  - `version`: `3.1.0`
  - `source`: `VAPT Builder Adaptive Core`
  - `schema`: `A+ Adaptive Layout`
  - `total_features`: `159`
  - `generated_at`: `2026-04-02`
  - `owasp_standard`: `OWASP Top 10:2025`
- Treat the JSON file as the **canonical product-security catalog** for the builder.
- The file is not only a risk list. It is also a **feature-definition file**, a **verification guide**, and a **WordPress surface map**.

## What The JSON Actually Contains

- A `features` array with `159` security features/risk definitions.
- Top-level WordPress targeting data:
  - `wp_path_patterns`
  - `wp_paths_flat`
  - `rate_limiting_controls`
  - `form_builder_support`
- Each feature is usually a normalized object with:
  - `RiskID`
  - `id`
  - `name`
  - `description`
  - `category`
  - `severity`
  - `test_method`
  - `verification_steps`
  - `remediation`
- `owasp` exists only on part of the dataset, not all entries.
- `granular_controls` exists only on a small subset of features and points to rate-limiting detail.

## Critical Interpretation Rules

- Treat each item in `features` as a **security capability to build or enforce**, not merely as a scanner finding.
- `verification_steps` should drive:
  - QA scenarios
  - test cases
  - acceptance criteria
  - admin-facing evidence/explanation copy
- `remediation` should drive:
  - implementation goals
  - recommended defaults
  - help text
  - autofix suggestions where safe
- `test_method` is a clue for how the feature should be validated in code or UI.
- `category`, `severity`, and `owasp` should drive prioritization, grouping, filtering, and reporting.

## Important Data Normalization Notes

- The file contains a schema inconsistency:
  - feature `granular_controls.reference` points to `_rate_limiting_controls`
  - the real top-level key is `rate_limiting_controls`
- Normalize `_rate_limiting_controls` to `rate_limiting_controls` in any parser, mapper, or agent logic.
- `form_builder_support` has mixed shapes:
  - third-party builders are under `form_builder_support.supported_form_builders`
  - WordPress native forms are under `form_builder_support.wordpress_core_forms`
- Do not assume one uniform schema for all form-related definitions.
- `owasp` is missing for `73` of `159` features. Missing mapping must not block feature generation.

## Risk Prioritization Guidance

- Severity distribution in this file:
  - `Critical`: 28
  - `High`: 60
  - `Medium`: 58
  - `Low`: 13
- The most frequent categories are:
  - `Information Disclosure`
  - `Injection`
  - `Configuration`
  - `Access Control`
  - `Input Validation`
  - `Authentication`
- The most common OWASP mappings present are:
  - `A01:2025 - Broken Access Control`
  - `A02:2025 - Security Misconfiguration`
  - `A05:2025 - Injection`
- When sequencing work, prioritize:
  - Critical and High items first
  - risks affecting always-present WordPress surfaces first
  - risks with explicit endpoint coverage first
  - risks that can be enforced centrally first

## WordPress-Specific Meaning

- This data is strongly centered on real WordPress attack surfaces, including:
  - `/wp-login.php`
  - `/xmlrpc.php`
  - `/wp-cron.php`
  - `/wp-json/`
  - `/wp-admin/admin-ajax.php`
  - `/wp-content/uploads/`
  - sensitive config and backup files
- `wp_path_patterns` should be used as a reusable endpoint/path dictionary for:
  - route targeting
  - scanner generation
  - block rules
  - hardening rules
  - documentation
- `wp_paths_flat` is a convenience list and should be treated as derived helper data.

## Builder Design Assumptions

- The plugin builder should convert this JSON into **modular WordPress protections**, not a monolithic hard-coded ruleset.
- Each feature should ideally map to one or more of:
  - detection logic
  - prevention/hardening logic
  - logging/evidence logic
  - admin configuration
  - test/verification workflow
- A feature may be:
  - enforceable automatically
  - monitor-only
  - advisory with guided remediation
- Do not force all `159` items into identical implementation patterns.

## How An Agent Should Build From This File

- Parse the JSON once and convert it into an internal normalized model.
- Preserve `RiskID` and `id` as stable identifiers.
- Group features by category, severity, endpoint, and enforcement type.
- Infer implementation families such as:
  - authentication hardening
  - access control hardening
  - input validation and sanitization
  - rate limiting and brute-force protection
  - API and AJAX protection
  - file and upload protection
  - configuration hardening
  - logging and evidence collection
- Reuse shared enforcement engines instead of creating one-off code per feature where possible.

## Shared Engines The Builder Should Prefer

- Central rate-limiting engine
- Shared request inspection and endpoint matching
- Shared sanitization and validation layer
- Central logging/audit event service
- Shared admin policy registry
- Shared rule-to-endpoint mapping layer
- Shared evidence export/reporting layer

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

- `form_builder_support` is effectively a domain-specific security blueprint.
- It covers:
  - Contact Form 7
  - Elementor Forms
  - Gravity Forms
  - Ninja Forms
  - WordPress core forms
- Use it for:
  - plugin detection
  - endpoint discovery
  - field-level sanitization rules
  - rate-limiting defaults
  - file upload controls
  - builder-specific protection steps
- WordPress core forms are always high priority because they are modeled as guaranteed or near-guaranteed attack surfaces.

## Do Not Make These Mistakes

- Do not treat this file as a vulnerability scan result for one site only.
- Do not assume all features already have complete OWASP mapping.
- Do not assume every remediation should be auto-applied without admin review.
- Do not build endpoint logic from free text when structured endpoint/path data already exists.
- Do not duplicate form-builder or rate-limit logic across multiple features.
- Do not drop `verification_steps`; they are part of the product definition.

## Output Expectations For Future AI Agents

- Any implementation proposal should state:
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
- Any generated test plan should be traceable back to the JSON feature entries.

## Recommended Default Mindset

- Build the plugin as a **policy-driven security platform** for WordPress.
- Use the JSON as the contract.
- Prefer normalized internal models, shared enforcement engines, and traceability back to `RiskID`.
- If the data is ambiguous, preserve the source value and add a normalization layer instead of silently rewriting meaning.
