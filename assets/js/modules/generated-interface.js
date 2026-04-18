// React Component to Render Generated Interfaces
// Version 3.0 - Global Driver & Probe Architecture
// Expects props: { feature, onUpdate }

// Debug mode control - set to true to enable console logs for debugging
var VAPT_DEBUG = window.VAPT_DEBUG || false;

// Helper function for conditional logging
var vaptLog = window.vaptLog || {
  log: (...args) => VAPT_DEBUG && console.log('[VAPTGuard]', ...args),
  warn: (...args) => VAPT_DEBUG && console.warn('[VAPTGuard]', ...args),
  error: (...args) => console.error('[VAPTGuard]', ...args), // Always show errors
  debug: (...args) => VAPT_DEBUG && console.debug('[VAPTGuard]', ...args),
  info: (...args) => VAPT_DEBUG && console.info('[VAPTGuard]', ...args)
};

(function () {
  const { createElement: el, useState, useEffect, useRef, useMemo } = wp.element;
  const { Button, TextControl, ToggleControl, SelectControl, TextareaControl, Modal, Icon, Tooltip } = wp.components;
  const { __, sprintf } = wp.i18n;

  /**
   * Universal URL Resolver (v3.13.2)
   * Standardizes on vaptguardSettings.homeUrl and detects absolute paths/URLs.
   */
  const resolveUrl = (path, configUrl, featureKey = '') => {
    let homeUrl = (window.vaptguardSettings && window.vaptguardSettings.homeUrl) ? window.vaptguardSettings.homeUrl.replace(/\/$/, '') : window.location.origin;

    // 🛡️ Origin Alignment (v3.3.52): Force current protocol/host/port if hostname matches to avoid CORS
    const alignUrl = (urlStr) => {
      try {
        if (!urlStr || !urlStr.startsWith('http')) return urlStr;
        const u = new URL(urlStr);
        const loc = window.location;
        if (u.hostname === loc.hostname) {
          u.protocol = loc.protocol;
          u.host = loc.host;
        }
        return u.toString();
      } catch (e) { }
      return urlStr;
    };

    homeUrl = alignUrl(homeUrl);

    // 🛡️ Logic Refinement (v3.13.8): Context-Aware Specificity
    let base = homeUrl;
    let sub = path || '';

    // [FIX v2.4.11] Handle query strings properly - split path and query
    // If path contains '?', separate the path portion from query parameters
    let queryPart = '';
    if (sub.includes('?')) {
      const parts = sub.split('?');
      sub = parts[0]; // Path portion (e.g., '/' or '/wp-json')
      queryPart = '?' + parts.slice(1).join('?'); // Query string (e.g., '?vapt=1')
    }

    // If path is root default but feature implies a specific target, nudge it (v3.13.8)
    if ((!path || path === '/') && !configUrl && featureKey) {
      if (featureKey.includes('cron') || featureKey === 'RISK-001') sub = 'wp-cron.php';
      else if (featureKey.includes('xmlrpc')) sub = 'xmlrpc.php';
      else if (featureKey.includes('login')) sub = 'wp-login.php';
    }

    if (configUrl) {
      if (configUrl.startsWith('http')) {
        configUrl = alignUrl(configUrl.replace(/\/$/, ''));
        const normalizedConfig = configUrl;
        // If configUrl is just the root domain, AND we have a better sub, JOIN them.
        if (normalizedConfig === homeUrl && (sub && sub !== '/' && !sub.startsWith('http'))) {
          // sub is already set above or from path
        } else {
          return configUrl; // Absolute override (now port-aligned)
        }
      } else {
        sub = configUrl; // Relative override
      }
    } else if (path && path.startsWith('http')) {
      return alignUrl(path); // Path is already absolute (now port-aligned)
    }

    const normalizedPath = sub.startsWith('/') ? sub : '/' + sub;
    let result = base.replace(/\/$/, '') + (normalizedPath === '/' ? '' : normalizedPath);

    // [FIX v2.4.11] Append query string if it was separated
    if (queryPart) {
      result += queryPart;
    }

    // 🛡️ Trailing Slash Resilience (v3.3.53) - File-Aware Patch (v2.4.3)
    // Only append if result doesn't look like a file (e.g., ends in .php or .html)
    const isFile = /\.[a-z0-9]+$/i.test(result);
    if (!result.includes('/', 8) && !isFile) result += '/';

    return result;
  };

  /**
   * Helper: Consistent Boolean Type Casting (v3.14.2)
   */
  const toBool = (val) => {
    if (val === true || val === 1 || val === '1' || val === 'true' || val === 'on') return true;
    return false;
  };

  /**
   * Helper: Determines if a feature is enabled (defaults to true for A+ Architecture)
   */
  const isFeatureEnabled = (featureData) => {
    if (!featureData || featureData.feat_enabled === undefined) return true;
    return toBool(featureData.feat_enabled);
  };

  /**
   * Helper: Safely render a value that might be an object or a URL to linkify
   */
  const safeRender = (val) => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') {
      // Linkify URLs in text
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const parts = val.split(urlRegex);
      if (parts.length > 1) {
        return parts.map((part, i) =>
          part.match(urlRegex)
            ? el('a', { key: i, href: part, target: '_blank', rel: 'noopener noreferrer', style: { color: '#2563eb', textDecoration: 'underline' } }, part)
            : part
        );
      }
      return val;
    }
    if (typeof val === 'number' || typeof val === 'boolean') return val.toString();
    if (typeof val === 'object') {
      if (val.label) return safeRender(val.label);
      if (val.message) return safeRender(val.message);
      if (val.content) return safeRender(val.content);
      return JSON.stringify(val);
    }
    return '';
  };

  /**
   * PROBE REGISTRY: Global Verification Handlers
   */
  const PROBE_REGISTRY = {
    // 1. Header Probe: Verifies HTTP response headers
    check_headers: async (siteUrl, control, featureData, featureKey) => {
      // [FIX v2.4.11] Use test_config.path if available, otherwise default to root
      const configPath = control.test_config?.path || '/';
      const url = resolveUrl(configPath, control.config?.url, featureKey);
      const contextParam = (featureKey && (featureKey.includes('login') || featureKey.includes('brute'))) ? '&vaptguard_test_context=login' : '';
      const finalUrl = url + (url.includes('?') ? '&' : '?') + 'vaptguard_header_check=' + Date.now() + contextParam;
      vaptLog.log(`Header Probe: Fetching ${finalUrl}`);
      const response = await fetch(finalUrl, { method: 'GET', cache: 'no-store' });
      const headers = {};
      response.headers.forEach((v, k) => { headers[k] = v; });
      vaptLog.log("Full Response Headers:", headers);

      const vaptEnforced = response.headers.get('x-vapt-enforced');
      const enforcedFeature = response.headers.get('x-vapt-feature'); // Can be comma-separated

      let headerStr = '';
      const keepHeaders = ['strict-transport-security', 'x-vapt-enforced', 'x-frame-options', 'x-content-type-options', 'x-xss-protection', 'referrer-policy', 'permissions-policy', 'content-security-policy'];
      const isSuperAdmin = window.vaptguardSettings && window.vaptguardSettings.isSuper;

      for (const [k, v] of Object.entries(headers)) {
        if (k.toLowerCase() === 'x-vapt-feature' && !isSuperAdmin) continue; // Explicitly hide the feature list for non-superadmins (v3.13.19)
        if (keepHeaders.includes(k.toLowerCase()) || k.toLowerCase().startsWith('x-') || (isSuperAdmin && k.toLowerCase() === 'x-vapt-feature')) {
          headerStr += `\n${k}: ${v}`;
        }
      }

      // [FIX v2.5.2] State-Aware Success Logic: Verify headers match toggle state
      const hasExpectedHeaders = control.test_config && control.test_config.expected_headers;

      if (hasExpectedHeaders) {
        // The reliable marker is x-vapt-enforced being present with a valid enforcer value.
        const validEnforcers = ['htaccess', 'nginx', 'php-headers', 'php-rate-limit', 'php-xmlrpc', 'php-dir', 'php-null-byte'];
        const isValidEnforcer = vaptEnforced && validEnforcers.some(e => vaptEnforced.toLowerCase().includes(e));
        const isProtectionEnabled = isFeatureEnabled(featureData);

        // [FIX v2.5.2] State-Aware Success: Align result with user intent (toggle state)
        // +-------------------+------------------+-------------------------------------------------------------+---------+
        // | Feature Toggle    | Server Enforce   | Resulting Message                                           | Status  |
        // +-------------------+------------------+-------------------------------------------------------------+---------+
        // | ON                | Detected         | "Plugin is actively enforcing protection."                 | SUCCESS |
        // | ON                | Not Detected     | "Protection toggle is ON but server is NOT enforcing."     | FAILURE |
        // | OFF               | Detected         | "Warning: Toggle is OFF but server is STILL enforcing."     | FAILURE |
        // | OFF               | Not Detected     | "Protection correctly disabled. No enforcement detected."   | SUCCESS |
        // +-------------------+------------------+-------------------------------------------------------------+---------+

        if (isProtectionEnabled === false) {
          // Toggle is OFF: Check if THIS specific feature is still being enforced
          if (isValidEnforcer) {
            const activeFeatures = enforcedFeature ? enforcedFeature.split(',').map(f => f.trim()) : [];
            const isThisFeatureEnforced = activeFeatures.includes(featureKey);
            const otherFeaturesUsingSameProtection = activeFeatures.filter(f => f !== featureKey);
            const displayCount = 5;
            const displayList = otherFeaturesUsingSameProtection.slice(0, displayCount).join(', ');
            const hiddenCount = otherFeaturesUsingSameProtection.length - displayCount;
            const fullList = otherFeaturesUsingSameProtection.join(', ');
            // Only show other features message for superadmins and when there are other features using same protection
            const displayMessageSnippet = (isSuperAdmin && otherFeaturesUsingSameProtection.length > 0)
              ? ` But the following other feature's (RiskID's) are still offering the same Protection: ${hiddenCount > 0 ? `${displayList} (+${hiddenCount} more)` : displayList}`
              : '';

            if (isThisFeatureEnforced) {
              // FAILURE: Toggle is OFF but THIS feature is still being enforced
              return {
                success: false,
                message: `Warning: ${featureKey} toggle is OFF but server is STILL enforcing it (${vaptEnforced}).${displayMessageSnippet}`,
                raw: `URL: ${url} | Status: ${response.status} | Toggle: OFF | Enforcement: ${vaptEnforced} | Same Protection: ${fullList || 'none'}\n\n${headerStr.trim()}`
              };
            } else {
              // SUCCESS: Toggle is OFF, headers present but THIS feature is NOT in the list
              return {
                success: false, unprotected: true,
                message: `Protection currently disabled for this feature.${displayMessageSnippet}`,
                raw: `URL: ${url} | Status: ${response.status} | Toggle: OFF | This Feature: Not Enforced | Same Protection: ${fullList || 'none'}\n\n${headerStr.trim()}`
              };
            }
          }
          // SUCCESS: Toggle is OFF and no enforcement detected - correctly disabled
          return {
            success: false, unprotected: true,
            message: `Protection correctly disabled. No enforcement headers detected.`,
            raw: `URL: ${url} | Status: ${response.status} | Toggle: OFF | Enforcement: None\n\n${headerStr.trim()}`
          };
        }

        // Toggle is ON: Success depends on whether headers are detected
        if (!isValidEnforcer) {
          // FAILURE: Toggle is ON but headers missing - protection not active!
          return {
            success: false,
            message: `Protection toggle is ON but VAPT enforcement headers not found. Expected x-vapt-enforced. Got: ${vaptEnforced || 'none'}.`,
            raw: `URL: ${url} | Status: ${response.status} | Toggle: ON | Expected: A+ Headers\n\n${headerStr.trim()}`
          };
        }
        // SUCCESS: Toggle is ON and headers present - protection is active
        return { success: true, message: `Plugin is actively enforcing protection (${vaptEnforced}).`, raw: `URL: ${url} | Status: ${response.status} | Toggle: ON | Enforcement: ${vaptEnforced}\n\n${headerStr.trim()}` };
      }

      // Legacy behavior for tests without expected_headers
      if (vaptEnforced === 'php-headers' || vaptEnforced === 'htaccess' || vaptEnforced?.includes('php')) {
        if (featureKey && enforcedFeature) {
          const activeFeatures = enforcedFeature.split(',').map(f => f.trim());
          if (activeFeatures.includes(featureKey)) {
            if (isFeatureEnabled(featureData) === false) {
              return { success: false, message: `Warning: Feature is DISABLED in UI but still being ENFORCED by server policy.`, raw: `URL: ${url} | Active Features: ${enforcedFeature}\n\n${headerStr.trim()}` };
            }
            return { success: true, message: `Plugin is actively enforcing headers (${vaptEnforced}).`, raw: `URL: ${url} | Status: ${response.status} | Expected: A+ Headers\n\n${headerStr.trim()}` };
          } else {
            // Case: Global headers exist but this feature isn't in the active list (intentional non-enforcement)
            if (isFeatureEnabled(featureData) === false) {
              return { success: false, unprotected: true, message: `Baseline Test: No enforcement headers for this feature. The system is unprotected for this risk vector.`, raw: `URL: ${url} | Active Features: ${enforcedFeature}\n\n${headerStr.trim()}` };
            }
            return { success: false, message: `Discrepancy: Global headers found, but this specific feature ('${featureKey}') is NOT matching enforcement policy.`, raw: `URL: ${url} | Status: ${response.status} | Active Features: ${enforcedFeature}\n\n${headerStr.trim()}` };
          }
        }
        // If no feature list is provided, we can only verify global enforcement
        return { success: true, message: `Global security headers detected (${vaptEnforced}).`, raw: `URL: ${url} | Status: ${response.status} | Expected: A+ Headers\n\n${headerStr.trim()}` };
      }

      if (isFeatureEnabled(featureData) === false) {
        return { success: false, unprotected: true, message: `Baseline Test: No enforcement detected. You are currently unprotected for this feature.`, raw: `URL: ${url} | Status: ${response.status} | Expected: No VAPT Headers\n\n${headerStr.trim()}` };
      }

      return { success: false, message: `Security headers present, but NOT by this plugin. VAPT enforcement header missing.`, raw: `URL: ${url} | Status: ${response.status} | Expected: A+ Headers\n\n${headerStr.trim()}` };
    },

    // 2. Batch Probe: Verifies Rate Limiting (Sends 125% of RPM) (v3.6.25 Sequential)
    spam_requests: async (siteUrl, control, featureData, featureKey, onProgress) => {
      try {
        let rpm = parseInt(control.numTests || featureData['rpm'] || featureData['rate_limit'], 10);

        // Dynamic Context Detection (v3.3.40 / v3.6.24 expanded)
        let contextParam = '';
        const loginKeywords = ['login', 'brute', 'auth', 'password', 'email', 'reset'];
        if (featureKey && loginKeywords.some(kw => featureKey.toLowerCase().includes(kw))) {
          contextParam = '&vaptguard_test_context=login';
        }

        if (isNaN(rpm)) {
          const limitKey = Object.keys(featureData).find(k => k.includes('limit') || k.includes('max') || k.includes('rpm'));
          if (limitKey) rpm = parseInt(featureData[limitKey], 10);
        }

        // Fallback for custom strictness keywords (v3.6.25/26)
        if (isNaN(rpm)) {
          const val = control.numTests || featureData['rpm'] || featureData['rate_limit'];
          if (val === 'strict') rpm = 5;
          else if (val === 'moderate') rpm = 10;
          else if (val === 'permissive') rpm = 20;
        }

        if (isNaN(rpm)) rpm = 5;

        vaptLog.log(`spam_requests Debug: rpm=${rpm}, load=${Math.ceil(rpm * 1.25)}, data=`, featureData);
        if (isNaN(rpm) || rpm <= 0) {
          throw new Error('Invalid rate limit configuration. RPM must be a positive number.');
        }

        const load = Math.ceil(rpm * 1.25);
        if (load > 1000) {
          vaptLog.warn('Warning: Rate limit test sending more than 1000 requests. This may impact server performance.');
        }

        try {
          const resetRes = await fetch(siteUrl + '/wp-json/vaptguard/v1/reset-limit', { method: 'POST', cache: 'no-store' });
          const resetJson = await resetRes.json();
          vaptLog.log('Rate limit reset debug:', resetJson);
        } catch (e) {
          vaptLog.warn('Failed to reset rate limit:', e);
        }

        const responses = [];
        const stats = {};
        let debugInfo = '';
        let lastCount = -1;
        let traceInfo = '';
        let hasVaptHeader = false;

        // Process sequentially for real-time reporting (v3.6.25)
        for (let i = 0; i < load; i++) {
          try {
            const url = resolveUrl('/', control.config?.url);
            const r = await fetch(url + '?vaptguard_test_spike=' + i + contextParam, { cache: 'no-store' });
            const respData = { status: r.status, headers: r.headers };
            responses.push(respData);

            // Update stats
            stats[r.status] = (stats[r.status] || 0) + 1;
            if (r.headers.has('x-vapt-debug')) debugInfo = r.headers.get('x-vapt-debug');
            if (r.headers.has('x-vapt-count')) lastCount = r.headers.get('x-vapt-count');
            if (r.headers.has('x-vapt-trace')) traceInfo = r.headers.get('x-vapt-trace');
            if (r.headers.get('x-vapt-enforced') === 'php-rate-limit') hasVaptHeader = true;

            // Report progress every 2 requests or if blocked
            if (onProgress && (i % 2 === 0 || r.status === 429 || i === load - 1)) {
              onProgress({
                total: load,
                current: i + 1,
                accepted: stats[200] || 0,
                blocked: stats[429] || 0,
                errors: stats[500] || 0
              });

              // Always trigger monitor refresh for immediate feedback (v3.6.26/28)
              // Standardized to lowercase (v3.6.28)
              window.dispatchEvent(new CustomEvent('vapt-refresh-stats', { detail: { featureKey: featureKey.toLowerCase() } }));
            }
          } catch (err) {
            vaptLog.warn(`Request ${i} failed:`, err);
            stats[0] = (stats[0] || 0) + 1;
          }
        }

        const blocked = stats[429] || 0;
        const total = load;
        const successCount = stats[200] || 0;
        const errorCount = stats[500] || 0;
        const debugMsg = `(Debug: ${debugInfo || 'None'}, Count: ${lastCount}, Trace: ${traceInfo || 'None'})`;

        const resultMeta = {
          total: total,
          accepted: successCount,
          blocked: blocked,
          errors: errorCount,
          details: debugMsg
        };

        const isEnabled = isFeatureEnabled(featureData);

        // [FIX v2.5.2] State-Aware Success Logic for Rate Limiting
        // +-------------------+------------------+-------------------------------------------------------------+---------+
        // | Feature Toggle    | Server Enforce   | Resulting Message                                           | Status  |
        // +-------------------+------------------+-------------------------------------------------------------+---------+
        // | ON                | Detected (429)   | "Rate limiter is ACTIVE. Security measures working."        | SUCCESS |
        // | ON                | Not Detected     | "Protection ON but rate limiter NOT active."               | FAILURE |
        // | OFF               | Detected (429)   | "Warning: Toggle OFF but rate limiter STILL active."        | FAILURE |
        // | OFF               | Not Detected     | "Protection correctly disabled. No rate limiting."          | SUCCESS |
        // +-------------------+------------------+-------------------------------------------------------------+---------+

        if (blocked > 0 && hasVaptHeader) {
          window.dispatchEvent(new CustomEvent('vapt-refresh-stats', { detail: { featureKey } }));
          if (!isEnabled) {
            // FAILURE: Toggle OFF but rate limiter still active
            return {
              success: false,
              message: `Warning: Protection toggle is OFF but rate limiter is STILL blocking traffic (${blocked} blocked).`,
              meta: resultMeta,
              raw: `URL: ${resolveUrl('/', control.config?.url)} | Status: 429 | Toggle: OFF | Blocked: ${blocked}`
            };
          }
          // SUCCESS: Toggle ON and rate limiter active
          return {
            success: true,
            message: `Rate limiter is ACTIVE. Security measures are working correctly (${blocked} requests blocked).`,
            meta: resultMeta,
            raw: `URL: ${resolveUrl('/', control.config?.url)} | Status: 429 | Toggle: ON | Blocked: ${blocked}`
          };
        }

        if (successCount > 0 || lastCount > 0) {
          window.dispatchEvent(new CustomEvent('vapt-refresh-stats', { detail: { featureKey } }));
        }

        if (errorCount > 0) {
          return {
            success: false,
            message: `Server Error (500). Internal configuration or logic error detected.`,
            meta: resultMeta,
            raw: `URL: ${resolveUrl('/', control.config?.url)} | Status: 500 | Expected: 429`
          };
        }

        if (!isEnabled) {
          // Toggle is OFF: Check if rate limiting is inactive
          if (blocked === 0) {
            // SUCCESS: Toggle OFF and no rate limiting - correctly disabled
            return {
              success: false, unprotected: true,
              message: `Protection correctly disabled. No rate limiting detected (all ${total} requests accepted).`,
              meta: resultMeta,
              raw: `URL: ${resolveUrl('/', control.config?.url)} | Status: 200 | Toggle: OFF | Rate Limiting: Inactive`
            };
          }
          // FAILURE: Toggle OFF but external rate limiting detected
          return {
            success: false,
            external_block: true,
            message: `Warning: Protection toggle is OFF but external rate limiting detected (${blocked} blocked).`,
            meta: resultMeta,
            raw: `URL: ${resolveUrl('/', control.config?.url)} | Status: 429 | Toggle: OFF | External Rate Limiting`
          };
        }

        // Toggle is ON but rate limiter not active
        return {
          success: false,
          message: `Protection toggle is ON but rate limiter is NOT active. All requests were accepted.`,
          meta: resultMeta,
          raw: `URL: ${resolveUrl('/', control.config?.url)} | Status: 200 | Toggle: ON | Rate Limiting: Inactive`
        };
      } catch (err) {
        return {
          success: false,
          message: `Test Error: ${err.message}. Rate limit test could not complete.`,
          raw: { error: err.message, stack: err.stack }
        };
      }
    },

    // 3. Status Probe: Verifies specific file block (e.g., XML-RPC)
    block_xmlrpc: async (siteUrl, control, featureData, featureKey) => {
      const url = resolveUrl('/xmlrpc.php', control.config?.url, featureKey);
      vaptLog.log(`XML-RPC Probe: Fetching ${url}`);
      const response = await fetch(url, { method: 'POST', body: '<?xml version="1.0"?><methodCall><methodName>system.listMethods</methodName><params></params></methodCall>' });
      const vaptEnforced = response.headers.get('x-vapt-enforced');
      const enforcedFeature = response.headers.get('x-vapt-feature');

      const isEnabled = isFeatureEnabled(featureData);

      // [FIX v2.5.2] State-Aware Success Logic for XML-RPC Blocking
      // +-------------------+------------------+-------------------------------------------------------------+---------+
      // | Feature Toggle    | Server Enforce   | Resulting Message                                           | Status  |
      // +-------------------+------------------+-------------------------------------------------------------+---------+
      // | ON                | Blocked (403)    | "Plugin is actively blocking XML-RPC."                      | SUCCESS |
      // | ON                | Not Blocked      | "Protection ON but XML-RPC is OPEN and VULNERABLE."         | FAILURE |
      // | OFF               | Blocked (403)    | "Warning: Toggle OFF but XML-RPC STILL blocked."           | FAILURE |
      // | OFF               | Not Blocked (200)| "Protection correctly disabled. XML-RPC accessible."        | SUCCESS |
      // +-------------------+------------------+-------------------------------------------------------------+---------+

      const isBlocked = response.status === 403 || response.status === 404 || vaptEnforced === 'php-xmlrpc';

      if (vaptEnforced === 'php-xmlrpc') {
        if (featureKey && enforcedFeature && enforcedFeature !== featureKey) {
          return { success: false, message: `Inconclusive: XML-RPC is blocked by another VAPT feature ('${enforcedFeature}'). You must disable it there to verify this control independently.`, raw: `URL: ${url} | Status: ${response.status} | Expected: 403` };
        }
        if (!isEnabled) {
          // FAILURE: Toggle OFF but still enforcing
          return { success: false, message: `Warning: Protection toggle is OFF but XML-RPC is STILL being blocked (${vaptEnforced}).`, raw: `URL: ${url} | Status: ${response.status} | Toggle: OFF | Enforcement: ${vaptEnforced}` };
        }
        // SUCCESS: Toggle ON and blocking active
        return { success: true, message: `Plugin is actively blocking XML-RPC (${vaptEnforced}).`, raw: `URL: ${url} | Status: ${response.status} | Toggle: ON | Enforcement: ${vaptEnforced}` };
      }

      const isVulnerable = response.status === 200;

      if (!isEnabled) {
        // Toggle is OFF: Check if XML-RPC is accessible
        if (isVulnerable) {
          // SUCCESS: Toggle OFF and XML-RPC is accessible - correctly disabled
          return {
            success: false, unprotected: true,
            message: `Protection correctly disabled. XML-RPC is accessible (HTTP 200).`,
            raw: `URL: ${url} | Status: ${response.status} | Toggle: OFF | Enforcement: None`
          };
        }
        // FAILURE: Toggle OFF but XML-RPC is blocked by external system
        return {
          success: false,
          external_block: true,
          message: `Warning: Protection toggle is OFF but XML-RPC is still blocked (HTTP ${response.status}). External protection detected.`,
          raw: `URL: ${url} | Status: ${response.status} | Toggle: OFF | External Block`
        };
      }

      // Toggle is ON: Check if XML-RPC is blocked
      return {
        success: false,
        message: isVulnerable
          ? `SECURITY FAILURE: Protection toggle is ON but XML-RPC is OPEN and VULNERABLE (HTTP 200).`
          : `XML-RPC is blocked (HTTP ${response.status}), but NOT by this plugin. VAPT enforcement header missing.`,
        raw: `URL: ${url} | Status: ${response.status} | Toggle: ON | Expected: 403`
      };
    },

    // 4. Directory Probe: Verifies Indexing Block
    disable_directory_browsing: async (siteUrl, control, featureData, featureKey) => {
      const target = resolveUrl('/wp-content/uploads/', control.config?.url);
      const resp = await fetch(target, { cache: 'no-store' });
      const text = await resp.text();
      const snippet = text.substring(0, 500);
      const vaptEnforced = resp.headers.get('x-vapt-enforced');
      const enforcedFeature = resp.headers.get('x-vapt-feature');

      const isEnabled = isFeatureEnabled(featureData);

      // [FIX v2.5.2] State-Aware Success Logic for Directory Browsing
      // +-------------------+------------------+-------------------------------------------------------------+---------+
      // | Feature Toggle    | Server Enforce   | Resulting Message                                           | Status  |
      // +-------------------+------------------+-------------------------------------------------------------+---------+
      // | ON                | Blocked (403)    | "Plugin is actively blocking directory listing."           | SUCCESS |
      // | ON                | Not Blocked      | "Protection ON but directory browsing is ACCESSIBLE."      | FAILURE |
      // | OFF               | Blocked (403)    | "Warning: Toggle OFF but directory STILL blocked."          | FAILURE |
      // | OFF               | Not Blocked (200)| "Protection correctly disabled. Directory accessible."     | SUCCESS |
      // +-------------------+------------------+-------------------------------------------------------------+---------+

      const isBlocked = resp.status === 403 || resp.status === 404 || vaptEnforced === 'php-dir';

      if (vaptEnforced === 'php-dir') {
        if (featureKey && enforcedFeature && enforcedFeature !== featureKey) {
          return { success: false, message: `Inconclusive: Directory browsing blocked by '${enforcedFeature}'.`, raw: `URL: ${target} | Status: ${resp.status}\n\n${snippet}` };
        }
        if (!isEnabled) {
          // FAILURE: Toggle OFF but still enforcing
          return { success: false, message: `Warning: Protection toggle is OFF but directory listing is STILL being blocked (${vaptEnforced}).`, raw: `URL: ${target} | Status: ${resp.status} | Toggle: OFF | Enforcement: ${vaptEnforced}` };
        }
        // SUCCESS: Toggle ON and blocking active
        return { success: true, message: `Plugin is actively blocking directory listing (${vaptEnforced}).`, raw: `URL: ${target} | Status: ${resp.status} | Toggle: ON | Enforcement: ${vaptEnforced}` };
      }

      if (!isEnabled) {
        // Toggle is OFF: Check if directory browsing is accessible
        if (resp.status === 200) {
          // SUCCESS: Toggle OFF and directory is accessible - correctly disabled
          return {
            success: false, unprotected: true,
            message: `Protection correctly disabled. Directory browsing is accessible (HTTP ${resp.status}).`,
            raw: `URL: ${target} | Status: ${resp.status} | Toggle: OFF | Enforcement: None`
          };
        }
        // FAILURE: Toggle OFF but directory is blocked by external system
        return {
          success: false,
          external_block: true,
          message: `Warning: Protection toggle is OFF but directory is still blocked (HTTP ${resp.status}). External protection detected.`,
          raw: `URL: ${target} | Status: ${resp.status} | Toggle: OFF | External Block\n\n${snippet}`
        };
      }

      // Toggle is ON: Check if directory browsing is blocked
      return { success: false, message: `Directory browsing blocked (HTTP ${resp.status}), but NOT by this plugin. VAPT enforcement header missing.`, raw: `URL: ${target} | Status: ${resp.status} | Toggle: ON\n\n${snippet}` };
    },

    // 5. Null Byte Probe (and aliases)
    inject_null_unicode: async (siteUrl, control, featureData) => {
      return PROBE_REGISTRY.block_null_byte_injection(siteUrl, control, featureData);
    },
    block_null_byte_injection: async (siteUrl, control, featureData) => {
      const target = resolveUrl('/', control.config?.url) + '?vaptguard_test_param=safe&vaptguard_attack=test%00payload';
      const resp = await fetch(target, { cache: 'no-store' });
      const vaptEnforced = resp.headers.get('x-vapt-enforced');

      const isEnabled = isFeatureEnabled(featureData);

      // [FIX v2.5.2] State-Aware Success Logic for Null Byte Injection
      // +-------------------+------------------+-------------------------------------------------------------+---------+
      // | Feature Toggle    | Server Enforce   | Resulting Message                                           | Status  |
      // +-------------------+------------------+-------------------------------------------------------------+---------+
      // | ON                | Blocked (400)    | "Plugin is actively blocking null byte injection."         | SUCCESS |
      // | ON                | Not Blocked      | "Protection ON but null byte payload ACCEPTED."           | FAILURE |
      // | OFF               | Blocked (400)    | "Warning: Toggle OFF but null byte STILL being blocked."   | FAILURE |
      // | OFF               | Not Blocked (200)| "Protection correctly disabled. Null byte accessible."      | SUCCESS |
      // +-------------------+------------------+-------------------------------------------------------------+---------+

      const isBlocked = resp.status === 400 || resp.status === 403 || vaptEnforced === 'php-null-byte';

      if (vaptEnforced === 'php-null-byte' || resp.status === 400) {
        if (!isEnabled && vaptEnforced === 'php-null-byte') {
          // FAILURE: Toggle OFF but still enforcing
          return { success: false, message: `Warning: Protection toggle is OFF but null byte injection is STILL being blocked (${vaptEnforced}).`, raw: `URL: ${target} | Status: ${resp.status} | Toggle: OFF | Enforcement: ${vaptEnforced}` };
        }
        // SUCCESS: Either toggle ON with blocking, or server-level block (400)
        if (isEnabled) {
          return { success: true, message: `Plugin is actively blocking null byte injection (HTTP ${resp.status}). Enforcer: ${vaptEnforced || 'Server'}`, raw: `URL: ${target} | Status: ${resp.status} | Toggle: ON | Enforcement: ${vaptEnforced || 'Server'}` };
        }
      }

      if (!isEnabled) {
        // Toggle is OFF: Check if null byte payload is accepted
        if (resp.status === 200) {
          // SUCCESS: Toggle OFF and null byte is accepted - correctly disabled
          return {
            success: false, unprotected: true,
            message: `Protection correctly disabled. Null byte payload accepted (HTTP ${resp.status}).`,
            raw: `URL: ${target} | Status: ${resp.status} | Toggle: OFF | Enforcement: None`
          };
        }
        // FAILURE: Toggle OFF but null byte is blocked by external system
        return {
          success: false,
          external_block: true,
          message: `Warning: Protection toggle is OFF but null byte payload is still blocked (HTTP ${resp.status}). External protection detected.`,
          raw: `URL: ${target} | Status: ${resp.status} | Toggle: OFF | External Block`
        };
      }

      // Toggle is ON: Check if null byte is blocked
      return { success: false, message: `SECURITY FAILURE: Protection toggle is ON but null byte payload was ACCEPTED (HTTP ${resp.status}).`, raw: `URL: ${target} | Status: ${resp.status} | Toggle: ON | Expected: 400 or 403` };
    },

    // 6. Version Hide Probe
    hide_wp_version: async (siteUrl, control, featureData) => {
      const url = resolveUrl('/', control.config?.url);
      const resp = await fetch(url + '?vaptguard_version_check=1', { method: 'GET', cache: 'no-store' });
      const text = await resp.text();
      const vaptEnforced = resp.headers.get('x-vapt-enforced');

      const hasGenerator = text.toLowerCase().includes('name="generator" content="wordpress');
      const isEnabled = isFeatureEnabled(featureData);

      if (!isEnabled) {
        if (!hasGenerator) {
          return { success: false, unprotected: true, message: `Protection correctly disabled. WordPress generator tag is hidden by external policy.`, raw: `URL: ${url} | Status: ${resp.status} | Toggle: OFF | State: Secure` };
        }
        return { success: false, unprotected: true, message: `Baseline Test: WordPress generator tag is present. You are unprotected for this risk vector.`, raw: `URL: ${url} | Status: ${resp.status} | Toggle: OFF | State: Vulnerable` };
      }

      if (!hasGenerator) {
        return { success: true, message: `Secure: WordPress generator tag is hidden.`, raw: `URL: ${url} | Status: ${resp.status} | Expected: No generator tag` };
      }

      return { success: false, message: `Vulnerable: WordPress generator tag is present in the page source.`, raw: `URL: ${url} | Status: ${resp.status} | Expected: No generator tag` };
    },

    // 7. Universal Payload Probe (Dynamic Real-World Testing)
    universal_probe: async (siteUrl, control, featureData, featureKey) => {
      const config = control.test_config || {};
      const method = config.method || 'GET';
      const path = config.path || '/';
      const params = config.params || {};
      const headers = config.headers || {};
      const body = config.body || null;
      const expectedStatus = config.expected_status;
      const expectedText = config.expected_text;
      const expectedHeaders = config.expected_headers;

      let url = resolveUrl(path, config.url, featureKey);
      const contextParam = (featureKey && (featureKey.includes('login') || featureKey.includes('brute'))) ? 'vaptguard_test_context=login' : '';

      if (method === 'GET') {
        const urlParams = new URLSearchParams(params);
        if (contextParam) urlParams.append('vaptguard_test_context', 'login');
        const qs = urlParams.toString();
        if (qs) url = url + (url.includes('?') ? '&' : '?') + qs;
      } else if (contextParam) {
        url = url + (url.includes('?') ? '&' : '?') + contextParam;
      }

      const fetchOptions = {
        method: method,
        headers: headers,
        cache: 'no-store'
      };

      if (method !== 'GET' && body) {
        fetchOptions.body = typeof body === 'object' ? JSON.stringify(body) : body;
        if (typeof body === 'object' && !fetchOptions.headers['Content-Type']) {
          fetchOptions.headers['Content-Type'] = 'application/json';
        }
      } else if (method !== 'GET' && Object.keys(params).length > 0) {
        const formData = new URLSearchParams();
        for (const k in params) formData.append(k, params[k]);
        fetchOptions.body = formData;
        if (!fetchOptions.headers['Content-Type']) {
          fetchOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
        }
      }

      const resp = await fetch(url, fetchOptions);
      const text = await resp.text();

      let isSecure = false;
      let statusMatches = false;
      let headerMatches = false;
      const code = resp.status;

      let expectedStatusArray = [];
      if (expectedStatus) {
        expectedStatusArray = Array.isArray(expectedStatus)
          ? expectedStatus.map(s => parseInt(s))
          : [parseInt(expectedStatus)];
      }

      if (expectedStatusArray.length > 0) {
        statusMatches = expectedStatusArray.includes(code);
      }

      if (expectedHeaders && typeof expectedHeaders === 'object') {
        headerMatches = true;
        const responseHeaders = {};
        resp.headers.forEach((v, k) => { responseHeaders[k.toLowerCase()] = v; });

        for (const [key, expectedValue] of Object.entries(expectedHeaders)) {
          const actualValue = responseHeaders[key.toLowerCase()];
          // Support multi-value OR logic with | separator (v3.13.17)
          let expectedValueTransformed = expectedValue;

          // Global Platform Normalization: Alias 'htaccess' or 'nginx' to allow fallbacks (v3.13.18)
          // This prevents false failures on Nginx/PHP environments for legacy probes.
          if (key.toLowerCase() === 'x-vapt-enforced' && (expectedValue === 'htaccess' || expectedValue === 'nginx')) {
            expectedValueTransformed = 'htaccess|nginx|php-headers';
          }

          const expectedOptions = expectedValueTransformed.split('|').map(v => v.trim().toLowerCase());
          if (!actualValue || !expectedOptions.includes(actualValue.toLowerCase())) {
            headerMatches = false;
            break;
          }
        }
      }

      const isEnabled = isFeatureEnabled(featureData);
      const vaptEnforced = resp.headers.get('x-vapt-enforced');
      const enforcedFeature = resp.headers.get('x-vapt-feature');

      const expectsBlock = expectedStatusArray.length > 0 && expectedStatusArray.every(s => s >= 400);
      const expectsAllow = expectedStatusArray.includes(200);
      const hasHeaderCheck = expectedHeaders && typeof expectedHeaders === 'object';

      let message = '';

      // [FIX v2.5.2] State-Aware Success Logic for Universal Probe
      // +-------------------+------------------+-------------------------------------------------------------+---------+
      // | Feature Toggle    | Server Enforce   | Resulting Message                                           | Status  |
      // +-------------------+------------------+-------------------------------------------------------------+---------+
      // | ON                | Detected/Blocked | "Protection is active. Attack blocked or headers present."  | SUCCESS |
      // | ON                | Not Detected     | "Protection ON but server NOT enforcing expected response." | FAILURE |
      // | OFF               | Detected         | "Warning: Toggle OFF but server STILL enforcing."           | FAILURE |
      // | OFF               | Not Detected     | "Protection correctly disabled. No enforcement detected."   | SUCCESS |
      // +-------------------+------------------+-------------------------------------------------------------+---------+

      if (!isEnabled) {
        // Toggle is OFF: Success depends on whether enforcement is detected
        const activeFeatures = enforcedFeature ? enforcedFeature.split(',').map(f => f.trim()) : [];
        const isThisFeatureEnforcing = activeFeatures.includes(featureKey);

        if (isThisFeatureEnforcing) {
          // FAILURE: Toggle OFF but this specific feature is still enforcing
          return {
            success: false,
            message: `Warning: Feature '${featureKey}' is OFF but server is STILL enforcing it ('${vaptEnforced}').`,
            raw: `URL: ${url} | Status: ${code} | Toggle: OFF | Enforcement: ${vaptEnforced}`
          };
        }

        if (hasHeaderCheck && headerMatches) {
          // FAILURE: Toggle OFF but expected headers detected
          return {
            success: false,
            message: `Warning: Protection toggle is OFF but expected headers are still present (${vaptEnforced || 'headers matched'}).`,
            raw: `URL: ${url} | Status: ${code} | Toggle: OFF | Headers: Matched`
          };
        }

        if (vaptEnforced && (expectsBlock ? expectedStatusArray.includes(code) : headerMatches)) {
          // FAILURE: Toggle OFF but server appears to be enforcing
          return {
            success: false,
            message: `Warning: Protection toggle is OFF but server is STILL enforcing (${vaptEnforced}).`,
            raw: `URL: ${url} | Status: ${code} | Toggle: OFF | Enforcement: ${vaptEnforced}`
          };
        }

        // SUCCESS: Toggle OFF and no enforcement detected - correctly disabled
        if (expectsBlock && !expectedStatusArray.includes(code) && code === 200) {
          return {
            success: false, unprotected: true,
            message: `Protection correctly disabled. Target is accessible (HTTP ${code}) with toggle OFF.`,
            raw: `URL: ${url} | Status: ${code} | Toggle: OFF | Enforcement: None`
          };
        }
        if (expectsAllow && code === 200) {
          return {
            success: false, unprotected: true,
            message: `Protection correctly disabled. Target responded normally (HTTP ${code}).`,
            raw: `URL: ${url} | Status: ${code} | Toggle: OFF | Enforcement: None`
          };
        }
        return {
          success: false, unprotected: true,
          message: `Protection correctly disabled. No enforcement detected.`,
          raw: `URL: ${url} | Status: ${code} | Toggle: OFF | Enforcement: None`
        };
      } else if (hasHeaderCheck) {
        isSecure = headerMatches && (code === 200 || expectsAllow || statusMatches);
      } else if (expectsBlock) {
        // Allow 404 and 400 as valid "Blocks" (Global Security Best Practice & REST API Protection)
        const is404Acceptable = code === 404;
        const is400Acceptable = code === 400;
        isSecure = (statusMatches || is404Acceptable || is400Acceptable) && code >= 400;
      } else if (statusMatches) {
        isSecure = true;
      } else {
        // 🛡️ Resilience Nudge (v3.14.3): If VAPT header exists, 403/404/429 are valid "Secure" blocks 
        if (vaptEnforced && [403, 404, 429].includes(code)) {
          isSecure = true;
          headerMatches = true;
        } else if (expectsAllow) {
          isSecure = code === 200 && (expectedText ? text.includes(expectedText) : true);
        } else {
          isSecure = code === 200;
        }
      }

      // Helper to resolve feature aliases (v3.6.20)
      const areFeaturesEquivalent = (f1, f2) => {
        if (!f1 || !f2) return false;
        if (f1 === f2) return true;

        // Normalize known aliases
        const aliases = {
          'user-enumeration': ['username-enumeration-via-wordpress-rest-api', 'block-user-enumeration'],
          'username-enumeration-via-wordpress-rest-api': ['user-enumeration', 'block-user-enumeration'],
          'xmlrpc': ['block-xmlrpc', 'disable-xmlrpc'],
          'block-xmlrpc': ['xmlrpc', 'disable-xmlrpc']
        };

        return (aliases[f1] && aliases[f1].includes(f2));
      };


      if (isSecure && expectsBlock && featureKey && enforcedFeature && !areFeaturesEquivalent(enforcedFeature, featureKey)) {
        isSecure = false;
        return {
          success: false,
          message: `Inconclusive: Request blocked by overlapping feature '${enforcedFeature}'. Disable it to verify this control.`,
          raw: `URL: ${url} | Status: ${code} | Enforcer: ${enforcedFeature} vs ${featureKey}`
        };
      }

      if (message) {
        // Message already set by leak detection logic
      } else if (isSecure) {
        if (hasHeaderCheck && headerMatches) {
          message = `Protection Headers Present (HTTP ${code}). All expected headers verified.`;
        } else if (expectsBlock && statusMatches) {
          message = `Attack Blocked (HTTP ${code}). Expected block code (${expectedStatus}).`;
        } else if (expectsBlock && code === 404) {
          message = `Attack Blocked (HTTP 404). Resource hidden successfully.`;
        } else if (expectsBlock && code === 400) {
          message = `Attack Blocked (HTTP 400). Request rejected (Expected ${expectedStatus}).`;
        } else if (expectsAllow && code === 200) {
          message = `Normal Response (HTTP ${code}) with protection indicators.`;
        } else {
          message = `Expected Response Received (HTTP ${code}).`;
        }
      } else {
        if (code === 200 && expectsBlock) {
          message = `Attack Accepted (HTTP 200). Expected Block (${expectedStatus}).`;
        } else if (hasHeaderCheck && !headerMatches) {
          if (expectsBlock && statusMatches) {
            isSecure = true;
            message = `PASS: Request was blocked (HTTP ${code}). Note: Server-Level block detected.`;
          } else {
            const vaptEnforcedHeader = resp.headers.get('x-vapt-enforced');
            if (vaptEnforcedHeader) {
              message = `Header Mismatch (HTTP ${code}). VAPT is active but headers do not match expected values.`;
            } else {
              message = `Missing Protection Headers (HTTP ${code}). Verification failed.`;
            }
          }
        } else if (statusMatches === false && expectedStatus) {
          message = `Mismatch: Got HTTP ${code}, expected ${expectedStatus}.`;
        } else {
          message = `Unexpected Response (HTTP ${code}). Could not verify security.`;
        }
      }

      return {
        success: isSecure,
        message: message,
        raw: `URL: ${url} | Status: ${code} | Expected: ${expectedStatus || 'N/A'} | Toggle: ${isEnabled ? 'ON' : 'OFF'}`
      };
    },

    // 8. Default Generic Probe
    default: async (siteUrl, control, featureData) => {
      const resp = await fetch(siteUrl + '?vaptguard_ping=1');
      const isEnabled = isFeatureEnabled(featureData);
      if (!isEnabled) {
        return { success: false, unprotected: true, message: `Protection correctly disabled. Verification probe active (HTTP ${resp.status}).`, raw: `URL: ${siteUrl} | Status: ${resp.status} | Toggle: OFF` };
      }
      return { success: resp.ok, message: `Probe result: HTTP ${resp.status}`, raw: `URL: ${siteUrl} | Status: ${resp.status} | Time: ${new Date().toISOString()} | Toggle: ON` };
    }
  };

  /*
   * Evidence Gallery Component (v3.5.2)
   * Handles multiple screenshot rendering with modal preview
   */
  const EvidenceGallery = ({ screenshots }) => {
    const [selectedImage, setSelectedImage] = useState(null);

    if (!screenshots || !Array.isArray(screenshots) || screenshots.length === 0) return null;

    return el('div', { className: 'vapt-evidence-gallery', style: { marginTop: '10px' } }, [
      el('div', { style: { fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b', marginBottom: '6px' } },
        sprintf(__('%d Evidence Captured', 'vaptguard'), screenshots.length)
      ),
      el('div', {
        style: {
          display: 'flex',
          gap: '8px',
          overflowX: 'auto',
          padding: '4px',
          background: '#f1f5f9',
          borderRadius: '4px',
          border: '1px solid #e2e8f0'
        }
      }, screenshots.map((url, i) =>
        el('div', {
          key: i,
          onClick: () => setSelectedImage(url),
          style: {
            width: '60px',
            height: '60px',
            flexShrink: 0,
            cursor: 'pointer',
            backgroundImage: `url(${url})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            borderRadius: '3px',
            border: '1px solid #cbd5e1',
            position: 'relative'
          }
        }, el(Icon, { icon: 'search', size: 12, style: { position: 'absolute', bottom: '2px', right: '2px', background: 'rgba(255,255,255,0.8)', borderRadius: '50%', padding: '2px' } }))
      )),

      selectedImage && el(Modal, {
        title: __('Evidence Detail', 'vaptguard'),
        onRequestClose: () => setSelectedImage(null),
        style: { maxWidth: '90vw', maxHeight: '90vh' }
      }, [
        el('div', { style: { display: 'flex', justifyContent: 'center', background: '#000', borderRadius: '4px', overflow: 'hidden' } },
          el('img', { src: selectedImage, style: { maxWidth: '100%', maxHeight: '70vh' } })
        ),
        el('div', { style: { marginTop: '15px', textAlign: 'right' } },
          el(Button, { isPrimary: true, onClick: () => setSelectedImage(null) }, __('Close', 'vaptguard'))
        )
      ])
    ]);
  };

  /*
   * File Inspector Component (v3.13.15)
   * Specialized rendering for file contents/directory listings
   */
  const FileInspector = ({ content, label = __('Verification Trace', 'vaptguard'), testContext = '' }) => {
    if (!content) return null;

    // 🛡️ Robust Type Handling (v3.13.15)
    let displayContent = content;
    if (typeof content === 'object') {
      try {
        displayContent = JSON.stringify(content, null, 2);
      } catch (e) {
        displayContent = String(content);
      }
    }

    // Format headers to appear on separate lines
    if (typeof displayContent === 'string') {
      // Ensure each header starts on a new line for clarity
      // Match headers that might be concatenated without proper line breaks
      const headerPatterns = [
        'x-powered-by:', 'x-frame-options:', 'x-content-type-options:', 'x-xss-protection:',
        'strict-transport-security:', 'content-security-policy:', 'referrer-policy:', 'permissions-policy:',
        'server:', 'cache-control:', 'pragma:', 'expires:', 'vary:',
        'access-control-allow-origin:', 'access-control-allow-methods:', 'access-control-allow-headers:',
        'access-control-expose-headers:', 'access-control-max-age:', 'access-control-allow-credentials:',
        'x-vapt-enforced:', 'x-vapt-feature:'
      ];

      // For each header pattern, ensure it's preceded by a newline if not already
      headerPatterns.forEach(pattern => {
        const regex = new RegExp(`([^\\n])\\s*(${pattern})`, 'gi');
        displayContent = displayContent.replace(regex, '$1\n$2');
      });

      // Clean up multiple consecutive newlines
      displayContent = displayContent.replace(/\n\s*\n/g, '\n').trim();
    }

    // Auto-detect if content implies a directory listing
    const isDir = typeof displayContent === 'string' && (displayContent.includes('Index of /') || displayContent.includes('Parent Directory'));
    const isTrace = label === __('Verification Trace', 'vaptguard');
    const displayLabel = isDir ? __('Directory Listing Exposed', 'vaptguard') : label;
    const resolvedIcon = isTrace ? 'info' : 'media-code';

    return (isTrace && typeof displayContent === 'string' && displayContent.startsWith('URL: ')) ? el('div', { className: 'vapt-file-inspector', style: { marginTop: '10px', maxWidth: '100%', overflow: 'hidden' } }, [
      el(Tooltip, {
        text: el('div', { style: { textAlign: 'left', maxWidth: '300px' } }, [
          testContext ? el('div', { style: { marginBottom: '8px', lineHeight: '1.4' } }, testContext) : null,
          el('div', { style: { color: '#94a3b8', whiteSpace: 'pre-wrap' } }, displayContent.split(' | ').slice(1).join(' | '))
        ]), placement: 'top'
      },
        el('span', { style: { fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' } }, [
          el('span', { style: { color: '#3b82f6', display: 'flex', alignItems: 'center' } }, el(Icon, { icon: 'info', size: 14 })),
          el('span', { style: { color: '#94a3b8' } }, displayLabel)
        ])
      )
    ]) : el('div', { className: 'vapt-file-inspector', style: { marginTop: '10px', display: 'flex', flexDirection: 'column', maxWidth: '100%', overflow: 'hidden' } }, [
      el('div', { style: { fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '5px' } }, [
        el(Icon, { icon: resolvedIcon, size: 14 }),
        displayLabel
      ]),
            typeof displayContent === 'string' && displayContent.startsWith('URL: ') ? (() => {
        // Parse the trace content into structured lines
        const lines = [];
        const parts = displayContent.split(/\n/);
        
        parts.forEach(part => {
          if (part.startsWith('URL: ')) {
            // Extract URL and status info
            const urlMatch = part.match(/URL:\s*(https?:\/\/[^\s|]+)/);
            const statusMatch = part.match(/\|\s*(Status:[^|]+)\|\s*(Toggle:[^|]+)(?:\|\s*(Enforcement:[^\n]+))?/);
            
            if (urlMatch) {
              lines.push({ type: 'url', value: urlMatch[1] });
            }
            if (statusMatch) {
              const statusParts = [];
              if (statusMatch[1]) statusParts.push(statusMatch[1].trim());
              if (statusMatch[2]) statusParts.push(statusMatch[2].trim());
              if (statusMatch[3]) statusParts.push(statusMatch[3].trim());
              lines.push({ type: 'status', value: statusParts.join(' | ') });
            }
          } else if (part.includes(':')) {
            // Header lines (x-powered-by:, x-vapt-enforced:, etc.)
            lines.push({ type: 'header', value: part.trim() });
          }
        });
        
        return el('div', {
          style: {
            fontSize: '11px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '4px',
            padding: '12px',
            color: '#334155',
            fontFamily: 'monospace',
            textAlign: 'left',
            maxWidth: '100%',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            lineHeight: '1.5'
          }
        }, lines.map((line, i) => {
          if (line.type === 'url') {
            return el('div', { key: i }, [
              el('span', { key: 'label', style: { color: '#64748b' } }, 'URL: '),
              el('a', { 
                key: 'link', 
                href: line.value, 
                target: '_blank', 
                rel: 'noopener noreferrer', 
                style: { color: '#2563eb', textDecoration: 'underline', fontWeight: 'bold', wordBreak: 'break-all' } 
              }, line.value)
            ]);
          }
          return el('div', { key: i, style: { wordBreak: 'break-word' } }, line.value);
        }));
      })() : el('pre', {

        style: {
          fontSize: '10px',
          fontFamily: 'monospace',
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: '4px',
          padding: '10px',
          maxHeight: '200px',
          maxWidth: '100%',
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          color: '#334155',
          wordBreak: 'break-word'
        }
      }, typeof displayContent === 'string' ? displayContent.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
        part.match(/^https?:\/\//)
          ? el('a', { key: i, href: part, target: '_blank', rel: 'noopener noreferrer', style: { color: '#2563eb', textDecoration: 'underline' } }, part)
          : part
      ) : displayContent)
    ]);
  };

  /*
   * Sync/Async Toggle Component (v3.5.2)
   * Stateful toggle for execution mode
   */


  const TestRunnerControl = ({ control, featureData, featureKey, globalProtection, showTechnicalTrace = false, showVerificationDetails = true }) => {
    const [status, setStatus] = useState('idle');
    const [result, setResult] = useState(null);
    const [progress, setProgress] = useState(null);
    const [numTests, setNumTests] = useState(''); // Custom test count (v3.6.26)

    const runTest = async () => {
      setStatus('running');
      setResult(null);

      const { test_logic } = control;
      const siteUrl = window.location.origin;
      const handler = PROBE_REGISTRY[test_logic] || PROBE_REGISTRY['default'];

      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Test timeout after 120 seconds')), 120000)
        );
        // Also pass custom numTests (v3.6.26)
        const handlerPromise = handler(siteUrl, { ...control, isAsync: false, numTests }, featureData, featureKey, (p) => {
          setProgress(p);
        });
        const res = await Promise.race([handlerPromise, timeoutPromise]);

        if (res && typeof res === 'object') {
          if (res.unprotected) {
            setStatus('unprotected');
          } else if (res.external_block) {
            setStatus('external_block');
          } else if (res.skipped) {
            setStatus('skipped');
          } else {
            setStatus(res.success ? 'success' : 'error');
          }
          setResult(res);
        } else {
          throw new Error('Invalid test result format');
        }
      } catch (err) {
        vaptLog.error(`Probe Execution Error for ${control.test_logic}:`, err);
        setStatus('error');
        setResult({
          success: false,
          message: `Error: ${err.message}`,
          raw: `URL: ${resolveUrl('/', control.config?.url, featureKey)} | Error: ${err.message}`
        });
      }
    };

    const handleClick = () => {
      runTest();
    };

    let rpmValue = parseInt(featureData['rpm'] || featureData['rate_limit'], 10);
    if (isNaN(rpmValue)) {
      const limitKey = Object.keys(featureData).find(k => k.includes('limit') || k.includes('max') || k.includes('rpm'));
      if (limitKey) rpmValue = parseInt(featureData[limitKey], 10);
    }
    if (isNaN(rpmValue)) rpmValue = 5;

    const currentRPM = parseInt(numTests || rpmValue, 10);
    const loadValue = Math.ceil(currentRPM * 1.25);
    const displayLabel = control.test_logic === 'spam_requests'
      ? control.label.replace(/\(\s*\d+.*\)/g, '').trim() + ` (${loadValue} requests)`
      : control.label;

    return el('div', { className: 'vapt-test-runner', style: { padding: '15px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', marginBottom: '10px' } }, [
      el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' } }, [
        el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
          el('strong', { style: { fontSize: '12px', color: '#334155' } }, displayLabel)
        ]),
        el(Button, { isSecondary: true, isSmall: true, isBusy: status === 'running', onClick: handleClick, disabled: status === 'running' }, 'Run Verify')
      ]),
      !globalProtection && el('div', { style: { marginBottom: '10px', padding: '8px 12px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '8px' } }, [
        el(Icon, { icon: 'warning', size: 16, style: { color: '#ea580c' } }),
        el('span', { style: { fontSize: '11px', color: '#9a3412', fontWeight: '600' } }, __('Global Protection is OFF. This real-time test will likely report "System Vulnerable".', 'vaptguard'))
      ]),
      control.help && el('p', { style: { margin: '2px 0 0', fontSize: '11px', color: '#64748b', opacity: 0.8 } }, control.help),

      // Real-time Progress Bar (v3.6.25)
      status === 'running' && progress && el('div', { style: { marginTop: '10px', background: '#e2e8f0', borderRadius: '4px', height: '4px', overflow: 'hidden' } }, [
        el('div', { style: { background: '#2563eb', width: `${(progress.current / progress.total) * 100}%`, height: '100%', transition: 'width 0.3s' } })
      ]),
      status === 'running' && progress && el('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '10px', color: '#64748b' } }, [
        el('span', null, sprintf(__('Testing: %d/%d requests...', 'vaptguard'), progress.current, progress.total)),
        el('div', { style: { display: 'flex', gap: '8px' } }, [
          el('span', { style: { color: '#10b981' } }, `${progress.accepted} Accepted`),
          el('span', { style: { color: progress.blocked > 0 ? '#ef4444' : '#64748b' } }, `${progress.blocked} Blocked`)
        ])
      ]),

      // Custom Test Count Input (v3.6.26/28)
      // Visible whenever NOT running (v3.6.28)
      status !== 'running' && control.test_logic === 'spam_requests' && el('div', { style: { marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px' } }, [
        el('div', { style: { flex: 1 } }, [
          el(TextControl, {
            label: __('Number of Tests to Run', 'vaptguard'),
            value: numTests,
            type: 'number',
            placeholder: sprintf(__('Default: %d', 'vaptguard'), rpmValue),
            onChange: (val) => setNumTests(val),
            style: { marginBottom: 0 }
          })
        ]),
        el('div', { style: { fontSize: '11px', color: '#64748b', marginTop: '20px' } },
          numTests ? sprintf(__('Target: %d requests', 'vaptguard'), Math.ceil(parseInt(numTests) * 1.25)) : ''
        )
      ]),

      status !== 'idle' && status !== 'running' && result && el('div', {
        className: 'vapt-result-container',
        style: {
          marginTop: '15px',
          padding: '16px',
          background: status === 'success' ? 'rgba(16, 185, 129, 0.04)' : (status === 'unprotected' ? 'rgba(239, 68, 68, 0.04)' : (status === 'external_block' ? 'rgba(59, 130, 246, 0.04)' : (status === 'skipped' ? 'rgba(245, 158, 11, 0.04)' : 'rgba(239, 68, 68, 0.04)'))),
          border: `1px solid ${status === 'success' ? 'rgba(16, 185, 129, 0.2)' : (status === 'unprotected' ? 'rgba(239, 68, 68, 0.2)' : (status === 'external_block' ? 'rgba(59, 130, 246, 0.2)' : (status === 'skipped' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)')))}`,
          borderRadius: '10px',
          transition: 'all 0.3s ease-in-out'
        }
      }, [
        el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' } }, [
          el(Icon, {
            icon: status === 'success' ? 'yes' : (status === 'unprotected' ? 'warning' : (status === 'external_block' ? 'shield' : (status === 'skipped' ? 'warning' : 'no'))),
            size: 18,
            style: { color: status === 'success' ? '#10b981' : (status === 'unprotected' ? '#dc2626' : (status === 'external_block' ? '#2563eb' : (status === 'skipped' ? '#d97706' : '#ef4444'))) }
          }),
          el('span', {
            style: {
              fontSize: '12px',
              fontWeight: 800,
              color: status === 'success' ? '#065f46' : (status === 'unprotected' ? '#991b1b' : (status === 'external_block' ? '#1e3a8a' : (status === 'skipped' ? '#92400e' : '#991b1b'))),
              textTransform: 'uppercase',
              letterSpacing: '0.025em'
            }
          }, status === 'success' ? __('Verification Success', 'vaptguard') : (status === 'unprotected' ? __('System Vulnerable (Unprotected)', 'vaptguard') : (status === 'external_block' ? __('External Protection Detected', 'vaptguard') : (status === 'skipped' ? __('Protection Disabled', 'vaptguard') : __('Verification Failure', 'vaptguard')))))
        ]),

        el('div', { style: { fontSize: '13px', color: '#334155', lineHeight: '1.5', marginBottom: '12px', fontWeight: 500 } }, result.message),

        // 🛡️ Clean Summary Display: URL, Status, Toggle, Enforcement (v3.4.0+)
        showVerificationDetails && (typeof result.raw === 'string' && result.raw.includes('URL: ')) && (() => {
          // Parse the raw string to extract key information
          const urlMatch = result.raw.match(/URL:\s*([^\s|]+)/i);
          const statusMatch = result.raw.match(/Status:\s*([^\s|]+)/i);
          const toggleMatch = result.raw.match(/Toggle:\s*([^\s|]+)/i);
          const enforcementMatch = result.raw.match(/Enforcement:\s*([^\s|]+)/i);

          const targetUrl = urlMatch ? urlMatch[1].trim() : '';
          const status = statusMatch ? statusMatch[1].trim() : '';
          const toggle = toggleMatch ? toggleMatch[1].trim() : '';
          const enforcement = enforcementMatch ? enforcementMatch[1].trim() : '';

          const displayUrl = (() => {
            try {
              return new URL(targetUrl).hostname;
            } catch (e) {
              return targetUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
            }
          })();

          return el('div', {
            style: {
              marginTop: '12px',
              padding: '0',
              background: 'transparent',
              border: 'none',
              borderRadius: '0',
              fontSize: '11px',
              color: '#334155',
              lineHeight: '1.4',
              maxWidth: '100%',
              overflow: 'hidden'
            }
          }, [
            el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' } }, [
              el(Icon, { icon: 'info', size: 12, style: { color: '#64748b', flexShrink: 0 } }),
              el('strong', { style: { fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', fontWeight: '800' } }, __('Verification Details', 'vaptguard'))
            ]),
            el('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px' } }, [
              // Row 1: URL span full width
              el('div', { style: { padding: '4px 0', background: 'transparent', borderRadius: '0', border: 'none', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' } }, [
                el('span', { style: { color: '#64748b', fontWeight: '600' } }, __('URL:', 'vaptguard')),
                el('a', {
                  href: targetUrl,
                  target: '_blank',
                  rel: 'noopener noreferrer',
                  style: {
                    color: '#0284c7',
                    textDecoration: 'none',
                    fontWeight: '700',
                    wordBreak: 'break-all',
                    fontSize: '11px'
                  },
                  onClick: (e) => {
                    e.stopPropagation();
                    window.open(targetUrl, '_blank');
                  }
                }, displayUrl || targetUrl)
              ]),
              // Row 2: Status, Toggle, Enforcement
              el('div', { style: { padding: '4px 0', background: 'transparent', borderRadius: '0', border: 'none', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', color: '#475569' } }, [
                // Status box
                el('div', { style: { display: 'flex', alignItems: 'center', gap: '4px' } }, [
                  el('span', { style: { color: '#64748b', fontWeight: '600' } }, __('Status:', 'vaptguard')),
                  el('span', {
                    style: {
                      color: status === '200' ? '#059669' : '#dc2626',
                      fontWeight: '700'
                    }
                  }, status)
                ]),
                // Separator
                el('span', { style: { color: '#cbd5e1' } }, '|'),
                // Toggle box
                el('div', { style: { display: 'flex', alignItems: 'center', gap: '4px' } }, [
                  el('span', { style: { color: '#64748b', fontWeight: '600' } }, __('Toggle:', 'vaptguard')),
                  el('span', {
                    style: {
                      color: toggle === 'ON' ? '#059669' : '#dc2626',
                      fontWeight: '700'
                    }
                  }, toggle)
                ]),
                // Enforcement conditionally generated
                enforcement ? el('span', { style: { color: '#cbd5e1' } }, '|') : null,
                enforcement ? el('div', { style: { display: 'flex', alignItems: 'center', gap: '4px' } }, [
                  el('span', { style: { color: '#64748b', fontWeight: '600' } }, __('Enforcement:', 'vaptguard')),
                  el('span', {
                    style: {
                      color: enforcement.includes('php') ? '#7c3aed' : '#0284c7',
                      fontWeight: '700',
                      background: enforcement.includes('php') ? '#f5f3ff' : '#f0f9ff',
                      padding: '1px 4px',
                      borderRadius: '3px'
                    }
                  }, enforcement)
                ]) : null
              ])
            ])
          ]);
        })(),

        // Technical Trace section (restored for workbench)
        showTechnicalTrace && result.raw && el('div', {
          style: {
            maxWidth: '100%',
            overflow: 'hidden',
            marginTop: '10px',
            borderTop: '1px solid #e2e8f0',
            paddingTop: '10px'
          }
        }, el(FileInspector, {
          content: result.raw,
          label: __('Technical Trace', 'vaptguard'),
          testContext: control.test_logic
        })),

        // v3.5.2: Multiple Evidence Gallery Renderer (v3.13.16 Safety Fix)
        (result.screenshot_paths || (result.meta && result.meta.screenshot_paths)) &&
        el('div', { style: { marginTop: '15px' } }, el(EvidenceGallery, { screenshots: result.screenshot_paths || (result.meta ? result.meta.screenshot_paths : []) }))
      ])
    ]);
  };

  /**
   * Rate Limit Observability Monitor
   */
  const RateLimitMonitor = ({ featureKey }) => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(false);
    const [resetting, setResetting] = useState(false);
    const consecutiveFailsRef = useRef(0);

    const fetchStats = async () => {
      setLoading(true);
      try {
        const response = await fetch(`${window.vaptguardSettings.root}vaptguard/v1/features/${featureKey}/stats`, {
          headers: { 'X-WP-Nonce': window.vaptguardSettings.nonce }
        });
        const data = await response.json();
        setStats(data);
        consecutiveFailsRef.current = 0;
      } catch (e) {
        vaptLog.error('Failed to fetch stats:', e);
        consecutiveFailsRef.current++;
      } finally {
        setLoading(false);
      }
    };

    const resetStats = async () => {
      if (!confirm(__('Are you sure you want to reset all active rate limit blocks for this feature?', 'vaptguard'))) return;
      setResetting(true);
      try {
        await fetch(`${window.vaptguardSettings.root}vaptguard/v1/features/${featureKey}/reset`, {
          method: 'POST',
          headers: { 'X-WP-Nonce': window.vaptguardSettings.nonce }
        });
        await fetchStats();
      } catch (e) {
        vaptLog.error('Failed to reset stats:', e);
      } finally {
        setResetting(false);
      }
    };

    useEffect(() => {
      fetchStats();
      const interval = setInterval(() => {
        if (consecutiveFailsRef.current >= 3) {
          vaptLog.warn('Background polling stopped due to consecutive network/REST errors.');
          clearInterval(interval);
          return;
        }
        fetchStats();
      }, 10000); // Poll every 10s

      // Listen for sync events (v3.6.24)
      const handleSync = (e) => {
        if (e.detail && (e.detail.featureKey === featureKey || e.detail.featureKey === featureKey.toLowerCase())) {
          fetchStats();
        }
      };
      window.addEventListener('vapt-refresh-stats', handleSync);

      return () => {
        clearInterval(interval);
        window.removeEventListener('vapt-refresh-stats', handleSync);
      };
    }, [featureKey]);

    if (!stats) return null;

    return el('div', {
      className: 'vapt-rate-limit-monitor',
      style: {
        padding: '12px',
        background: '#f1f5f9',
        border: '1px solid #cbd5e1',
        borderRadius: '6px',
        marginBottom: '20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }
    }, [
      el('div', { style: { display: 'flex', gap: '20px' } }, [
        el('div', null, [
          el('div', { style: { fontSize: '10px', textTransform: 'uppercase', color: '#64748b', fontWeight: '700' } }, __('Active Blocks (IPs)', 'vaptguard')),
          el('div', { style: { fontSize: '18px', fontWeight: '800', color: stats.active_ips > 0 ? '#ef4444' : '#10b981' } }, stats.active_ips)
        ])
        // Total Attempts removed as requested (redundant with Verification results - v3.6.24)
      ]),
      el('div', null, [
        el(Button, {
          isSecondary: true,
          isSmall: true,
          isDestructive: true,
          onClick: resetStats,
          isBusy: resetting,
          disabled: resetting || stats.active_ips === 0,
          style: { height: '32px' }
        }, __('Reset Counter', 'vaptguard'))
      ])
    ]);
  };

  const GeneratedInterface = ({ feature, onUpdate, isGuidePanel = false, hideMonitor = false, hideOpNotes = false, hideProtocol = false, globalProtection = true, showTechnicalTrace = false, showVerificationDetails = true }) => {
    const isWorkbench = window.location.search.includes('page=vaptguard-workbench');
    vaptLog.log('GeneratedInterface Render:', { key: feature?.key, controls: feature?.generated_schema?.controls, isGuidePanel });
    let schema = useMemo(() => {
      if (!feature.generated_schema) return {};
      if (typeof feature.generated_schema === 'object') return feature.generated_schema;
      try {
        return JSON.parse(feature.generated_schema);
      } catch (e) {
        vaptLog.warn('Failed to parse generated_schema:', e);
        return {};
      }
    }, [feature.generated_schema]);

    // 🛡️ Resilience: Auto-Convert Legacy "manual" type (v3.6.15)
    if (schema && schema.type === 'manual') {
      schema = {
        controls: [
          { type: 'header', label: __('Implementation Status', 'vaptguard') },
          { type: 'toggle', label: __('Enable Feature', 'vaptguard'), key: 'feat_enabled', default: true },
          { type: 'info', label: __('Manual Implementation Required', 'vaptguard'), content: schema.instruction || __('Please refer to the manual verification protocol.', 'vaptguard') }
        ],
        enforcement: { driver: 'manual', mappings: {} },
        _instructions: schema.instruction
      };
    }

    const currentData = useMemo(() => {
      if (!feature.implementation_data) return {};
      if (typeof feature.implementation_data === 'object') return feature.implementation_data;
      try {
        return JSON.parse(feature.implementation_data);
      } catch (e) {
        vaptLog.warn('Failed to parse implementation_data:', e);
        return {};
      }
    }, [feature.implementation_data]);
    const [localAlert, setLocalAlert] = useState(null);
    const [statusMap, setStatusMap] = useState({});
    const timeoutsRef = useRef({});

    if (!schema || !schema.controls || !Array.isArray(schema.controls)) {
      return el('div', { style: { padding: '20px', textAlign: 'center', color: '#999', fontStyle: 'italic' } },
        __('No functional controls defined for this implementation.', 'vaptguard')
      );
    }

    const isRemovalContext = (key, currentVal) => {
      const status = statusMap[key];
      if (!status) return false;
      return toBool(currentVal) && (status.message === __("Removing...", "vaptguard") || status.message === __("Removed Successfully", "vaptguard"));
    };

    const isActivelyEnforced = globalProtection ?
      ((feature.normalized_status || feature.status || 'draft').toLowerCase() === 'release' ?
        (feature.is_enforced != 0) : (feature.is_enforced == 1))
      : false;

    // Derived flags for rendering logic
    const isRateLimit = ['RISK-033', 'RISK-039'].includes(feature.key || feature.id) || !!feature.is_rate_limit;

    const handleChange = (key, val) => {
      const newData = { ...currentData, [key]: val };
      if (typeof onUpdate === 'function') {
        onUpdate(newData);
      }
    };

    const renderControl = (control, index) => {
      const { type, label, key, help, options, rows, action } = control;
      const value = currentData[key] !== undefined ? currentData[key] : (control.default || '');
      const uniqueKey = key || `ctrl-${index}`;
      const isEnforced = isActivelyEnforced;
      // const conditionalTypes = ['info', 'html', 'warning', 'alert'];

      // if (conditionalTypes.includes(type) && isEnforced) return null; // Removed per user request v3.3.9

      switch (type) {
        case 'test_action':
          return el(TestRunnerControl, { key: uniqueKey, control, featureData: currentData, featureKey: feature.key || feature.id, globalProtection: globalProtection, showTechnicalTrace: showTechnicalTrace, showVerificationDetails: showVerificationDetails });

        case 'button':
          return el('div', { key: uniqueKey, style: { marginBottom: '15px' } }, [
            el(Button, {
              isSecondary: true,
              onClick: () => {
                if (action === 'reset_validation_logs') setLocalAlert({ message: __('Reset signal sent.', 'vaptguard'), type: 'success' });
              }
            }, safeRender(label)),
            help && el('p', { style: { margin: '5px 0 0', fontSize: '12px', color: '#666' } }, safeRender(help))
          ]);

        case 'toggle':
          const mapping = (schema.enforcement?.mappings || {})[key] || (schema.client_deployment?.enforcement?.mappings || {})[key];
          const isDevelop = (feature.status || '').toLowerCase() === 'develop' || (feature.normalized_status || '').toLowerCase() === 'develop';
          const isSuperAdmin = window.vaptguardSettings?.isSuper || false;

          // Enhanced Driver Detection for Tooltip Accuracy
          const activeDriver = schema.enforcement?.driver || schema.client_deployment?.enforcement?.driver || 'hook';
          const activeTarget = schema.enforcement?.target || schema.client_deployment?.enforcement?.target || 'root';

          const isEnforced = toBool(value);
          const vSettings = window.vaptguardSettings || {};

          const getShortPath = (fullPath) => {
            if (!fullPath) return '';
            let pathStr = fullPath.replace(/\\/g, '/');
            let absPath = (vSettings.abspath || '').replace(/\\/g, '/');
            let pluginPath = (vSettings.pluginPath || '').replace(/\\/g, '/');

            if (absPath && pathStr.toLowerCase().startsWith(absPath.toLowerCase())) {
              return './' + pathStr.substring(absPath.length).replace(/^[\\\/]/, '');
            }
            if (pluginPath && pathStr.toLowerCase().startsWith(pluginPath.toLowerCase())) {
              const pluginBase = pluginPath.split(/[\\\/]/).filter(Boolean).pop();
              return pluginBase + '/' + pathStr.substring(pluginPath.length).replace(/^[\\\/]/, '');
            }
            return pathStr;
          };

          const statusHeader = isEnforced ?
            el('div', { style: { color: '#22c55e', background: '#f0fdf4', padding: '6px 10px', borderRadius: '4px', fontWeight: '800', marginBottom: '10px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #bbf7d0' } }, [
              el(Icon, { icon: 'saved', size: 14 }),
              __('STATUS: ACTIVE & INJECTED', 'vaptguard')
            ]) :
            el('div', { style: { color: '#ef4444', background: '#fef2f2', padding: '6px 10px', borderRadius: '4px', fontWeight: '800', marginBottom: '10px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #fecaca' } }, [
              el(Icon, { icon: 'no-alt', size: 14 }),
              __('STATUS: INACTIVE / REMOVED', 'vaptguard')
            ]);

          return el('div', { id: control.id, key: uniqueKey, style: { marginBottom: '0' } }, [
            el(ToggleControl, {
              disabled: globalProtection === false,
              label: el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [
                el('strong', { style: { fontSize: '12px', color: '#334155' } }, safeRender(label)),
                el(Tooltip, {
                  text: el('div', { style: { padding: '12px', maxWidth: '450px', maxHeight: '500px', overflowY: 'auto', background: '#1e293b', borderRadius: '8px' } }, [
                    el('div', { style: { fontWeight: '700', marginBottom: '12px', fontSize: '11px', textTransform: 'uppercase', color: '#94a3b8', borderBottom: '1px solid #334155', paddingBottom: '6px', letterSpacing: '0.05em' } }, __('Technical Trace & Enforcement', 'vaptguard')),
                    statusHeader,
                    feature.platform_implementations && Object.keys(feature.platform_implementations).length > 0 ?
                      Object.entries(feature.platform_implementations)
                        .filter(([name, impl]) => {
                          const n = name.toLowerCase();
                          const d = activeDriver.toLowerCase();
                          if (d === 'htaccess') return n.includes('htaccess') || n.includes('apache');
                          if (d === 'config' || d === 'wp_config' || d === 'wp-config') return n.includes('config');
                          if (d === 'nginx') return n.includes('nginx');
                          if (d === 'cloudflare') return n.includes('cloudflare');
                          if (d === 'iis') return n.includes('iis');
                          if (d === 'hook' || d === 'php_functions' || d === 'wordpress') return n.includes('hook') || n.includes('functions') || n.includes('wordpress');
                          return true;
                        })
                        .map(([name, impl], idx) => {
                          let code = impl.wrapped_code || impl.code || (schema.enforcement?.mappings && schema.enforcement?.mappings[key]);
                          if (!code) return null;

                          let targetFile = impl.target_file || (activeDriver === 'htaccess' ? '.htaccess' : (activeDriver.includes('config') ? 'wp-config.php' : 'root'));
                          if (activeDriver === 'hook' || activeDriver === 'php_functions') targetFile = 'vapt-functions.php';

                          let fullPath = '';
                          if (targetFile === 'wp-config.php') fullPath = (vSettings.abspath || '') + 'wp-config.php';
                          else if (targetFile === '.htaccess') fullPath = (vSettings.abspath || '') + '.htaccess';
                          else if (targetFile === 'vapt-functions.php') fullPath = (vSettings.pluginPath || '') + 'vapt-functions.php';
                          else if (targetFile === 'web.config') fullPath = (vSettings.abspath || '') + 'web.config';
                          else if (targetFile.includes('vapt-nginx-rules')) fullPath = (vSettings.uploadPath || '') + '/vapt-nginx-rules.conf';

                          const displayPath = fullPath ? getShortPath(fullPath) : targetFile;
                          let displayName = name;

                          return el('div', { key: idx, style: { marginBottom: '15px' } }, [
                            el('div', { style: { fontSize: '10px', color: '#94a3b8', marginBottom: '6px', display: 'flex', flexDirection: 'column', gap: '2px' } }, [
                              el('div', { style: { fontFamily: 'monospace', color: '#38bdf8', fontSize: '11px', wordBreak: 'break-all', fontWeight: '700' } }, displayPath)
                            ]),
                            el('pre', { style: { margin: 0, fontSize: '9px', background: '#0f172a', color: isEnforced ? '#e2e8f0' : '#475569', padding: '12px', borderRadius: '6px', overflowX: 'auto', border: '1px solid #334155', whiteSpace: 'pre-wrap', borderLeft: isEnforced ? '3px solid #22c55e' : '3px solid #ef4444' } }, code)
                          ]);
                        }) :
                      (mapping ? el('div', [
                        el('div', { style: { fontSize: '10px', color: '#94a3b8', marginBottom: '6px' } }, [
                          el('div', { style: { fontFamily: 'monospace', color: '#38bdf8', fontSize: '11px', wordBreak: 'break-all', fontWeight: '700' } }, (activeDriver === 'htaccess' ? './.htaccess' : (activeDriver.includes('config') ? './wp-config.php' : (activeDriver === 'hook' || activeDriver === 'php_functions' ? 'VAPT-Secure/vapt-functions.php' : './' + activeTarget))))
                        ]),
                        el('pre', { style: { margin: 0, fontSize: '9px', background: '#0f172a', color: isEnforced ? '#e2e8f0' : '#475569', padding: '10px', borderRadius: '6px', overflowX: 'auto', border: '1px solid #334155', whiteSpace: 'pre-wrap' } }, mapping)
                      ]) : el('em', { style: { color: '#64748b', fontSize: '11px' } }, __('No technical code mapping defined for this control.', 'vaptguard')))
                  ])
                }, el(Icon, { icon: 'info-outline', size: 14, style: { color: '#94a3b8', cursor: 'help' } }))
              ]),
              help: safeRender(control.description || help),
              checked: toBool(value),
              onChange: (val) => {
                const isRemoval = toBool(value) && !val;
                const progressMsg = isRemoval ? __("Removing...", "vaptguard") : __("Applying...", "vaptguard");
                const successMsg = isRemoval ? __("Removed Successfully", "vaptguard") : __("Code Injected Successfully", "vaptguard");

                if (timeoutsRef.current[key]) {
                  timeoutsRef.current[key].forEach(clearTimeout);
                }
                timeoutsRef.current[key] = [];

                setStatusMap(prev => ({ ...prev, [key]: { message: progressMsg, type: "info" } }));
                handleChange(key, val);

                const t1 = setTimeout(() => {
                  setStatusMap(prev => ({ ...prev, [key]: { message: successMsg, type: "success" } }));
                  const t2 = setTimeout(() => {
                    setStatusMap(prev => {
                      const nu = { ...prev };
                      delete nu[key];
                      return nu;
                    });
                    delete timeoutsRef.current[key];
                  }, 2000);
                  if (timeoutsRef.current[key]) timeoutsRef.current[key].push(t2);
                }, 600);
                timeoutsRef.current[key].push(t1);
              }
            }),
            // 🛡️ Localized Status Pill (v3.13.12) / Inhibited Status (v3.14.0)
            !globalProtection && el('div', {
              style: {
                marginTop: '-8px',
                marginBottom: '8px',
                marginLeft: '35px',
                display: 'flex'
              }
            }, el('span', {
              style: {
                fontSize: '10px',
                fontWeight: '600',
                padding: '2px 8px',
                borderRadius: '12px',
                background: '#f1f5f9',
                color: '#64748b',
                border: '1px dashed #cbd5e1',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }
            }, [
              el(Icon, { icon: 'warning', size: 12 }),
              __('Inhibited (Master Switch OFF)', 'vaptguard')
            ])),
            statusMap[key] && el('div', {
              style: {
                marginTop: '-8px',
                marginBottom: '8px',
                marginLeft: '35px',
                display: 'flex'
              }
            }, el('span', {
              style: {
                fontSize: '10px',
                fontWeight: '600',
                padding: '2px 8px',
                borderRadius: '12px',
                background: statusMap[key].type === 'success' ? '#ecfdf5' : (isRemovalContext(key, value) ? '#fef2f2' : '#f0f9ff'),
                color: statusMap[key].type === 'success' ? '#059669' : (isRemovalContext(key, value) ? '#b91c1c' : '#0369a1'),
                border: `1px solid ${statusMap[key].type === 'success' ? '#10b981' : (isRemovalContext(key, value) ? '#f87171' : '#0ea5e9')}`,
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }
            }, [
              el(Icon, { icon: statusMap[key].type === 'success' ? 'yes' : 'update', size: 12 }),
              statusMap[key].message
            ])),
            // 🛡️ Visual Indicator for Code Addition (v3.13.15 Enhanced)
            globalProtection && toBool(value) && el('div', {
              style: {
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                background: '#ecfdf5',
                color: '#059669',
                borderRadius: '12px',
                fontSize: '10px',
                fontWeight: '600',
                marginTop: '-8px',
                marginBottom: '8px',
                marginLeft: '35px',
                border: '1px solid #10b981',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
              }
            }, [
              el(Icon, { icon: 'editor-code', size: 12 }),
              __('Active Protection Confirmed', 'vaptguard')
            ])
          ]);

        case 'input':
          return el('div', { id: control.id || `vapt-input-wrapper-${uniqueKey}`, key: uniqueKey, style: { marginBottom: '15px', padding: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px' } }, [
            el(TextControl, {
              label: el('strong', null, safeRender(label)),
              help: safeRender(help),
              value: value ? value.toString() : '',
              onChange: (val) => handleChange(key, val),
              __nextHasNoMarginBottom: true,
              __next40pxDefaultSize: true
            })
          ]);

        case 'select':
          return el(SelectControl, {
            key: uniqueKey,
            label: safeRender(label),
            help: safeRender(help),
            value: value,
            options: (options || []).map(o => ({ label: safeRender(o.label || o), value: o.value !== undefined ? o.value : o })),
            onChange: (val) => handleChange(key, val)
          });

        case 'textarea':
        case 'code':
          return el('div', { id: control.id || `vapt-text-wrapper-${uniqueKey}`, key: uniqueKey, style: { marginBottom: '10px' } }, [
            el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' } }, [
              el('label', { style: { fontSize: '12px', fontWeight: '600', color: '#334155' } }, safeRender(label)),
              help && el(Tooltip, { text: safeRender(help) }, el(Icon, { icon: 'info-outline', size: 14, style: { color: '#94a3b8', cursor: 'help' } }))
            ]),
            el(TextareaControl, {
              value: value,
              rows: rows || (type === 'code' ? 4 : 3),
              onChange: (val) => handleChange(key, val),
              placeholder: value ? '' : __('No data available.', 'vaptguard'),
              __nextHasNoMarginBottom: true,
              style: type === 'code' ? { fontFamily: 'monospace', fontSize: '11px', background: '#f8fafc' } : { fontSize: '12px' }
            })
          ]);

        case 'header':
          return el('h3', { id: control.id || `vapt-header-${uniqueKey}`, key: uniqueKey, style: { fontSize: '14px', fontWeight: '700', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', marginTop: '8px', marginBottom: '8px', color: '#1e293b' } }, safeRender(label));

        case 'section':
          return el('h4', { id: control.id || `vapt-section-${uniqueKey}`, key: uniqueKey, style: { fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b', marginTop: '12px', marginBottom: '6px', letterSpacing: '0.025em' } }, safeRender(label));

        case 'risk_indicators':
          return el('div', { id: control.id || `vapt-risks-${uniqueKey}`, key: uniqueKey, style: { padding: '10px 0' } }, [
            label && el('strong', { style: { display: 'block', fontSize: '11px', color: '#991b1b', marginBottom: '5px', textTransform: 'uppercase' } }, safeRender(label)),
            el('ul', { style: { margin: 0, paddingLeft: '18px', color: '#b91c1c', fontSize: '12px', listStyleType: 'disc' } },
              (control.risks || control.items || []).map((r, i) => el('li', { key: i, style: { marginBottom: '4px' } }, safeRender(r))))
          ]);

        case 'assurance_badges':
          return el('div', { id: control.id || `vapt-badges-${uniqueKey}`, key: uniqueKey, style: { display: 'flex', gap: '8px', flexWrap: 'wrap', padding: '10px 0', marginTop: '10px', borderTop: '1px solid #fed7aa' } },
            (control.badges || control.items || []).map((b, i) => el('span', { key: i, style: { display: 'flex', alignItems: 'center', background: '#ffffff', color: '#166534', padding: '4px 10px', borderRadius: '15px', fontSize: '12px', border: '1px solid #bbf7d0', fontWeight: '600', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' } }, [
              el('span', { style: { marginRight: '6px', fontSize: '14px' } }, '🛡️'),
              safeRender(b)
            ]))
          );

        case 'test_checklist':
        case 'evidence_list':
          return el('div', { id: control.id || `vapt-list-wrapper-${uniqueKey}`, key: uniqueKey, style: { marginBottom: '10px' } }, [
            label && el('strong', { style: { display: 'block', fontSize: '12px', color: '#334155', marginBottom: '6px' } }, safeRender(label)),
            el('ol', { style: { margin: 0, paddingLeft: '20px', color: '#475569', fontSize: '12px' } },
              (control.items || control.tests || control.checklist || control.evidence || []).map((item, i) => el('li', { key: i, style: { marginBottom: '4px' } }, safeRender(item))))
          ]);

        case 'info':
        case 'html':
          return el('div', {
            id: control.id || `vapt-info-${uniqueKey}`,
            key: uniqueKey,
            style: {
              padding: '16px 20px',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderTop: '3px solid #0ea5e9',
              borderRadius: '8px',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
              fontSize: '12.5px',
              color: '#334155',
              marginBottom: '15px',
              lineHeight: '1.6'
            },
            dangerouslySetInnerHTML: { __html: control.content || control.html || label }
          });

        case 'warning':
        case 'alert':
          const alertType = (label || 'info').toLowerCase();
          const alertMap = {
            success: { icon: 'yes', color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
            warning: { icon: 'warning', color: '#9a3412', bg: '#fff7ed', border: '#fed7aa' },
            error: { icon: 'no', color: '#991b1b', bg: '#fef2f2', border: '#fecaca' },
            info: { icon: 'info', color: '#0c4a6e', bg: '#f0f9ff', border: '#bae6fd' },
            tip: { icon: 'lightbulb', color: '#3f6212', bg: '#f7fee7', border: '#d9f99d' },
            alert: { icon: 'warning', color: '#9a3412', bg: '#fff7ed', border: '#fed7aa' }
          };
          const style = alertMap[alertType] || alertMap.info;
          return el('div', {
            id: control.id || `vapt-alert-${uniqueKey}`,
            key: uniqueKey,
            style: {
              display: 'flex',
              gap: '10px',
              padding: '12px',
              background: style.bg,
              borderLeft: `4px solid ${style.color}`,
              borderTop: `1px solid ${style.border}`,
              borderRight: `1px solid ${style.border}`,
              borderBottom: `1px solid ${style.border}`,
              borderRadius: '4px',
              fontSize: '13px',
              color: style.color,
              marginBottom: '15px',
              alignItems: 'center'
            }
          }, [
            el(Icon, { icon: style.icon, size: 20, style: { flexShrink: 0 } }),
            el('div', {
              style: { lineHeight: '1.5' },
              dangerouslySetInnerHTML: { __html: control.message || control.content || label }
            })
          ]);

        case 'remediation_steps':
        case 'evidence_uploader':
          return null;

        default:
          return null;
      }
    };

    const verificationTypes = ['verification_action', 'automated_test', 'test_action', 'risk_indicators', 'assurance_badges'];
    const guideTypes = ['test_checklist', 'evidence_list', 'remediation_steps', 'evidence_uploader'];

    const mainControlsRaw = schema.controls.filter(c => {
      const isVerification = verificationTypes.includes(c.type);
      const isGuide = guideTypes.includes(c.type);

      // 🧹 Visibility Logic (Schema-Driven)
      if (c.visibility && c.visibility.condition === 'has_content') {
        const val = currentData[c.key];
        const hasContent = val && val.toString().trim().length > 0;
        if (!hasContent && c.visibility.fallback === 'hide') return false;
      }

      // 🧹 Legacy / Key-Based Suppression (v3.3.40 fallback)
      if (['textarea', 'code', 'input', 'html', 'info'].includes(c.type)) {
        const val = currentData[c.key];
        const hasContent = val && val.toString().trim().length > 0;

        // Legacy: Always hide these specific keys if empty
        const legacyKeys = ['operational_notes', 'manual_protocol', 'implementation_notes'];
        if (!hasContent && (legacyKeys.includes(c.key) || c.key?.includes('note') || c.key?.includes('protocol'))) {
          return false;
        }
      }

      // Hide empty Guide items
      if (isGuide) {
        if (['test_checklist', 'evidence_list'].includes(c.type)) {
          const items = c.items || c.tests || c.checklist || c.evidence || [];
          if (items.length === 0) return false;
        }
      }

      if (isGuidePanel) {
        return isGuide;
      } else {
        if (isVerification || isGuide) return false;

        if (c.type === 'section') {
          const label = (c.label || '').toLowerCase();
          const redundantLabels = [
            'verification',
            'automated verification',
            'functional verification',
            'manual verification guidelines',
            'threat coverage',
            'verification & assurance'
          ];
          if (redundantLabels.some(rl => label.includes(rl))) return false;
        }
        return true;
      }
    });

    // Orphan Logic (v3.3.10) - Remove headers/sections if they contain zero functional children
    const mainControls = mainControlsRaw.filter((c, i) => {
      if (['header', 'section'].includes(c.type)) {
        const nextContent = mainControlsRaw.slice(i + 1).find(nc => !['header', 'section', 'divider', 'group'].includes(nc.type));
        return !!nextContent;
      }
      return true;
    });

    const riskControls = schema.controls.filter(c => c.type === 'risk_indicators');
    const badgeControls = schema.controls.filter(c => c.type === 'assurance_badges');
    const otherVerificationControls = schema.controls.filter(c => {
      const isVerification = verificationTypes.includes(c.type);
      if (!isVerification) return false;
      
      if (c.type === 'risk_indicators' || c.type === 'assurance_badges' || c.type === 'verification_action' || c.type === 'automated_test') {
        return false;
      }
      
      // 🛡️ Hide "Active Protection Probe" from Client Dashboard (v2.5.21)
      if (!isWorkbench && c.key === 'verify_active_protection') return false;
      
      return true;
    });

    const getBadgeIcon = (text) => {
      const t = (text || '').toString().toLowerCase();
      if (t.includes('prevent') || t.includes('block')) return '🛡️';
      if (t.includes('detect') || t.includes('log')) return '👁️';
      if (t.includes('limit') || t.includes('rate')) return '⚡';
      if (t.includes('secure') || t.includes('safe')) return '🔒';
      if (t.includes('complian') || t.includes('audit')) return '📋';
      return '✅';
    };

    // If all controls are hidden, return null to avoid rendering empty wrappers
    if (mainControls.length === 0 && riskControls.length === 0 && badgeControls.length === 0 && otherVerificationControls.length === 0) {
      // Still show monitor if explicitly asked and present
      if (isRateLimit && !hideMonitor) {
        return el('div', { className: 'vapt-generated-interface' }, el(RateLimitMonitor, { featureKey: feature.key || feature.id }));
      }
      return null;
    }

    const metadata = schema.metadata || {};

    let opNotes = feature.operational_notes || schema.operational_notes;

    // 🛡️ Logic to handle "Implementation Details" visibility and styling (v2.5.19)
    let processedNotes = opNotes;
    let detailElement = null;
    
    if (typeof opNotes === 'string') {
        const marker = 'Implementation Details:';
        const markerIndex = opNotes.indexOf(marker);
        
        if (markerIndex !== -1) {
            // Found implementation details
            if (!isWorkbench) {
                // Client Dashboard: Strip them out
                processedNotes = opNotes.substring(0, markerIndex).trim().replace(/\n+$/, '');
            } else {
                // Workbench: Extract for styling and keep the rest as processedNotes
                processedNotes = opNotes.substring(0, markerIndex).trim().replace(/\n+$/, '');
                const detailContent = opNotes.substring(markerIndex + marker.length).trim();
                
                detailElement = el('div', {
                    style: {
                        marginTop: '14px',
                        fontSize: '12px'
                    }
                }, [
                    el('strong', {
                        style: {
                            fontWeight: '800',
                            color: '#1e293b',
                            textTransform: 'uppercase',
                            fontSize: '10px',
                            letterSpacing: '0.05em',
                            display: 'block',
                            marginBottom: '6px'
                        }
                    }, __('Implementation Details:', 'vaptguard')),
                    el('div', { style: { color: '#4b5563' } }, detailContent)
                ]);
            }
        }
    }

    const protocolData = feature.manual_protocol || schema.manual_protocol;

    // 🛡️ Robust Protocol Parsing (v3.12.19)
    let protocolSteps = null;
    if (protocolData) {
      const parsed = (typeof protocolData === 'string' ? JSON.parse(protocolData) : protocolData);
      if (Array.isArray(parsed)) {
        protocolSteps = parsed;
      } else if (parsed && Array.isArray(parsed.steps)) {
        protocolSteps = parsed.steps;
      } else if (parsed) {
        protocolSteps = [parsed];
      }
    }

    // 🛡️ Helper: Convert URLs to clickable links (v3.12.21)
    const linkify = (text) => {
      if (!text || typeof text !== 'string') return text;

      // 1. Handle Markdown Links first: [label](url) (v3.13.15)
      const mdRegex = /\[([^\]]+)\]\((https?:\/\/[^\s#?)]+[^)]*)\)/g;
      let parts = [];
      let lastIndex = 0;
      let match;

      while ((match = mdRegex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          parts.push(text.substring(lastIndex, match.index));
        }
        parts.push(el('a', {
          key: 'md-' + match.index,
          href: match[2],
          target: '_blank',
          rel: 'noopener noreferrer',
          style: { color: '#2563eb', textDecoration: 'underline' }
        }, match[1]));
        lastIndex = mdRegex.lastIndex;
      }

      if (lastIndex < text.length) {
        const remaining = text.substring(lastIndex);
        // 2. Handle raw URLs in the remaining text (excluding what was already matched)
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const rawParts = remaining.split(urlRegex);
        rawParts.forEach((part, i) => {
          if (part.match(urlRegex)) {
            parts.push(el('a', {
              key: 'raw-' + i,
              href: part,
              target: '_blank',
              rel: 'noopener noreferrer',
              style: { color: '#2563eb', textDecoration: 'underline' }
            }, part));
          } else {
            parts.push(part);
          }
        });
      }

      return parts.length > 0 ? parts : text;
    };

    return el('div', { className: 'vapt-generated-interface', style: { display: 'flex', flexDirection: 'column', gap: '20px' } }, [

      // 🛡️ Operational Notes (v3.12.18) - Card UI Transition (v2.4.3)
      !hideOpNotes && opNotes && el('div', {
        className: 'vapt-op-notes-card',
        id: 'vapt-op-notes-container',
        style: {
          padding: '16px 20px',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderTop: '3px solid #0d9488',
          borderRadius: '8px',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
          fontSize: '13px',
          color: '#334155',
          lineHeight: '1.6',
          marginBottom: '20px'
        }
      }, [
        el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', color: '#0d9488', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' } }, [
          el(Icon, { icon: 'info', size: 16 }),
          __('Business Impact & Security Benefit', 'vaptguard')
        ]),
        el('div', { style: { color: '#475569' } }, [
          typeof processedNotes === 'string' ? linkify(processedNotes) : JSON.stringify(processedNotes),
          detailElement
        ])
      ]),

      // Functional Controls Panel

      // Functional Controls Panel

      // Live Rate Limit Monitor
      mainControls.length > 0 && el('div', { className: 'vapt-functional-panel', style: { background: '#fff', borderRadius: '8px', padding: '0' } }, [
        el('div', { style: { display: 'flex', flexDirection: 'column', gap: '15px' } }, mainControls.map(renderControl)),
      ]),

      // Live Rate Limit Monitor (Moved below controls v3.3.45)
      isRateLimit && !hideMonitor && el(RateLimitMonitor, { featureKey: feature.key || feature.id }),

      (feature.include_verification_guidance == 1 || feature.include_verification_guidance === true || feature.include_verification_guidance === undefined) && (riskControls.length > 0 || otherVerificationControls.length > 0) && el('div', {
        className: 'vapt-threat-panel',
        style: {
          background: '#fff7ed',
          border: '1px solid #fed7aa',
          borderRadius: '8px',
          padding: '15px'
        }
      }, [
        el('h4', { style: { margin: '0 0 10px 0', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', color: '#9a3412' } }, __('Threat Coverage', 'vaptguard')),
        riskControls.map(renderControl),
        otherVerificationControls.map(renderControl)
      ]),

      (feature.include_verification_guidance == 1 || feature.include_verification_guidance === true || feature.include_verification_guidance === undefined) && badgeControls.length > 0 && el('div', {
        className: 'vapt-badges-row',
        style: { display: 'flex', flexWrap: 'wrap', gap: '10px' }
      },
        badgeControls.map(c =>
          (c.badges || c.items || []).map((b, i) => {
            const label = typeof b === 'object' ? (b.label || JSON.stringify(b)) : b;
            return el('span', { key: i, style: { display: 'flex', alignItems: 'center', background: '#ffffff', color: '#166534', padding: '6px 12px', borderRadius: '20px', fontSize: '12px', border: '1px solid #bbf7d0', fontWeight: '600', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' } }, [
              el('span', { style: { marginRight: '6px', fontSize: '14px' } }, getBadgeIcon(label)),
              label
            ]);
          }))
      ),

      // 🛡️ Manual Verification Protocol (v3.12.18) - Collapsible (v3.12.20)
      !hideProtocol && (feature.include_manual_protocol == 1 || feature.include_manual_protocol === true || feature.include_manual_protocol === undefined) && protocolSteps && el('details', {
        className: 'vapt-protocol-panel',
        open: false, // Default collapsed
        style: {
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          padding: '15px'
        }
      }, [
        el('summary', { style: { fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', color: '#334155', cursor: 'pointer', outline: 'none' } }, __('Manual Verification Protocol', 'vaptguard')),
        el('ol', { style: { margin: '15px 0 0 0', paddingLeft: '20px', fontSize: '12px', color: '#475569' } },
          (Array.isArray(protocolSteps) ? protocolSteps : [protocolSteps]).map((s, i) => {
            let stepText = typeof s === 'object' ? (s.action || s.description || s.step || JSON.stringify(s)) : s;
            // 🛡️ Enhanced Numbering Cleanup (v3.13.14): Handles "1. ", "Step 1: ", "1) ", etc.
            stepText = stepText.replace(/^(Step\s*\d+[:\s]*|\d+[\.\)]\s*)+/i, '');
            return el('li', { key: i, style: { marginBottom: '6px' } }, linkify(stepText));
          })
        )
      ]),

      localAlert && el(Modal, {
        title: localAlert.type === 'error' ? __('Error', 'vaptguard') : __('Notice', 'vaptguard'),
        onRequestClose: () => setLocalAlert(null),
        style: { maxWidth: '400px' }
      }, [
        el('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '15px' } }, [
          localAlert.type === 'success' && el(Icon, { icon: 'yes', size: 24, style: { color: 'green', background: '#dcfce7', borderRadius: '50%', padding: '4px' } }),
          el('p', { style: { fontSize: '14px', color: '#1f2937', margin: 0 } }, safeRender(localAlert.message))
        ]),
        el('div', { style: { textAlign: 'right' } },
          el(Button, { isPrimary: true, onClick: () => setLocalAlert(null) }, __('OK', 'vaptguard'))
        )
      ])

    ]);
  };

  window.vaptguard_GeneratedInterface = GeneratedInterface;
})();

