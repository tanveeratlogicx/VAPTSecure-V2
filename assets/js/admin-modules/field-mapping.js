/**
 * VAPTGuard Field Mapping
 * Handles include/exclude field mapping configuration for features.
 */
window.VAPTGuardFieldMapping = window.VAPTGuardFieldMapping || {
    defaults: {
        include_test_method: false,
        include_verification: false,
        include_verification_engine: false,
        include_verification_guidance: true,
        include_manual_protocol: true,
        include_operational_notes: true
    },
    getMapping: function(featureKey) {
        var stored = localStorage.getItem('vaptguard_mapping_' + featureKey);
        return stored ? JSON.parse(stored) : this.defaults;
    },
    setMapping: function(featureKey, mapping) {
        localStorage.setItem('vaptguard_mapping_' + featureKey, JSON.stringify(mapping));
    }
};