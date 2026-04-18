// VAPT Builder - Auto-Interface Generator
// Analyzes remediation text and returns a UI Schema for the dashboard.

// Debug mode control - set to true to enable console logs for debugging
var VAPTGuard_DEBUG = window.VAPTGuard_DEBUG || false;

// Helper function for conditional logging
var vaptguardLog = window.vaptguardLog || {
  log: (...args) => VAPTGuard_DEBUG && console.log('[VAPTGuard]', ...args),
  warn: (...args) => VAPTGuard_DEBUG && console.warn('[VAPTGuard]', ...args),
  error: (...args) => console.error('[VAPTGuard]', ...args), // Always show errors
  debug: (...args) => VAPTGuard_DEBUG && console.debug('[VAPTGuard]', ...args),
  info: (...args) => VAPTGuard_DEBUG && console.info('[VAPTGuard]', ...args)
};

(function () {
  vaptguardLog.log('Interface Generator Loaded v3.6.11-FIXED'); // Verify cache bust
  const InterfaceGenerator = {

    /**
     * Main entry point to generate a schema from a feature's remediation text.
     * @param {string} remediationText 
     * @param {string} customInstruction Optional user-provided context
     * @returns {object} Schema object { controls, enforcement, _instructions }
     */
    generate: function (remediationText, customInstruction = '') {
      const fullInstruction = customInstruction
        ? customInstruction + '\n\n--- Original Remediation ---\n' + remediationText
        : remediationText || 'No specific remediation tracking provided.';

      // Base Structure
      const baseSchema = {
        controls: [
          { type: 'header', label: 'Implementation Status' },
          { type: 'toggle', label: 'Enable Feature', key: 'feat_enabled', default: true }
        ],
        enforcement: {
          driver: 'manual', // Default to manual unless specific code is found
          mappings: {}
        },
        _instructions: fullInstruction
      };

      if (!remediationText) return baseSchema;

      // 1. Check for wp-config.php modifications
      // Pattern: "Add to wp-config.php: `CODE`" or similar
      const wpConfigMatch = remediationText.match(/wp-config\.php.*?:?\s*`([^`]+)`/i);
      if (wpConfigMatch) {
        const code = wpConfigMatch[1].trim();
        baseSchema.controls.push({
          type: 'info',
          label: 'wp-config.php Requirement',
          content: `Add the following to your wp-config.php:\n\n<code>${code}</code>`
        });
        // wp-config is usually manual or file-based, keeping driver as manual for safety unless we have a specific file driver
        return baseSchema;
      }

      // 2. Check for .htaccess modifications
      // Pattern: "Add `CODE` to .htaccess" or ".htaccess.*?:?\s*`([^`]+)`"
      const htaccessMatch = remediationText.match(/\.htaccess.*?:?\s*`([^`]+)`/i) ||
        remediationText.match(/Add\s*`([^`]+)`\s*to\s*\.htaccess/i);

      if (htaccessMatch) {
        const rule = htaccessMatch[1].trim();
        baseSchema.enforcement.driver = 'htaccess';
        baseSchema.enforcement.target = 'root';
        baseSchema.enforcement.mappings = {
          'feat_enabled': rule
        };
        // Add a read-only view of the rule
        baseSchema.controls.push({
          type: 'code',
          label: 'Generated .htaccess Rule',
          default: rule,
          readOnly: true
        });
        return baseSchema;
      }

      // 3. Check for specific numeric inputs (heuristics)
      // Pattern: "min X chars" or "X minutes"
      const minLengthMatch = remediationText.match(/min(?:imum)?\s*(\d+)\s*char/i);
      if (minLengthMatch) {
        baseSchema.controls.push({
          type: 'input',
          inputType: 'number',
          key: 'min_length',
          label: 'Minimum Character Length',
          default: parseInt(minLengthMatch[1], 10)
        });
        // Update enforcement to use this key if it were a real hook, 
        // but for now we keep manual/hook driver placeholder
        baseSchema.enforcement.driver = 'hook';
        baseSchema.enforcement.mappings = { 'feat_enabled': 'vaptguard_enforce_min_length' };
        return baseSchema;
      }

      // 4. Fallback: Manual Instruction
      // Already set up in baseSchema
      baseSchema.controls.push({
        type: 'info',
        label: 'Manual Implementation Required',
        content: 'Please refer to the implementation guide in the side panel.'
      });

      return baseSchema;
    }
  };

  // Expose to global scope
  window.VAPTGUARD_Generator = InterfaceGenerator;
})();