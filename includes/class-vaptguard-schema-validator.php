<?php

/**
 * VAPTGUARD_Schema_Validator
 * 
 * Handles schema validation, sanitization, and analysis for VAPT Secure.
 * Extracted from REST class to enable shared usage by REST controllers
 * and the Build generator.
 * 
 * @since 4.1.0
 * @package VAPT_Secure
 */

if (!defined('ABSPATH')) {
    exit;
}

class VAPTGUARD_Schema_Validator
{
    /**
     * Cached pattern library for code resolution
     *
     * @var array|null
     */
    private static $cached_pattern_library = null;

    /**
     * Get cached pattern library
     *
     * @return array
     */
    private static function get_cached_pattern_library()
    {
        if (self::$cached_pattern_library === null) {
            $pattern_lib_path = VAPTGUARD_PATH . 'data/enforcer_pattern_library_v2.0.json';
            if (file_exists($pattern_lib_path)) {
                self::$cached_pattern_library = json_decode(file_get_contents($pattern_lib_path), true);
            } else {
                self::$cached_pattern_library = array();
            }
        }
        return self::$cached_pattern_library;
    }

    /**
     * 🛡️ INTELLIGENT ENFORCEMENT STRATEGY (v3.3.9)
     * Analyzes the schema and automatically corrects driver selection 
     * if it detects physical file targets being handled by PHP hooks.
     *
     * @param array  $schema      The feature schema
     * @param string $feature_key The feature key
     * @return array Modified schema with corrected enforcement strategy
     */
    public static function analyze_enforcement_strategy($schema, $feature_key)
    {
        if (!isset($schema['enforcement'])) {
            // 🛡️ Adaptive Awareness (v4.0.0): Check for client_deployment block first
            if (isset($schema['client_deployment']['enforcement'])) {
                $schema['enforcement'] = $schema['client_deployment']['enforcement'];
            } else {
                $schema['enforcement'] = [
                    'driver' => 'hook',
                    'mappings' => []
                ];
            }
        } else {
            // [v4.0.1] Even if it exists, if it is 'hook' and empty, check for adaptive alternative
            if (($schema['enforcement']['driver'] ?? '') === 'hook' && empty($schema['enforcement']['mappings']) && isset($schema['client_deployment']['enforcement'])) {
                $schema['enforcement'] = $schema['client_deployment']['enforcement'];
            }
        }

        $driver = $schema['enforcement']['driver'] ?? 'hook';
        $mappings = $schema['enforcement']['mappings'] ?? array();

        $physical_file_patterns = [
            'readme.html',
            'license.txt',
            'xmlrpc.php',
            'wp-config.php',
            '.env',
            'wp-links-opml.php',
            'debug.log',
            '.htaccess'
        ];

        $block_indicators = ['<Files', 'Require all', 'Deny from', 'Order allow,deny', 'Options -Indexes'];

        $needs_htaccess = false;
        foreach ($mappings as $key => $value) {
            $val_to_test = '';
            if (is_string($value)) {
                $val_to_test = $value;
            } elseif (is_array($value)) {
                // v1.1 rich mapping detection - Generalize for multi-server (v4.0.2)
                $web_server_keys = ['.htaccess', 'nginx', 'iis', 'caddy', 'web_server'];
                foreach ($web_server_keys as $server_key) {
                    if (isset($value[$server_key])) {
                        $needs_htaccess = true;
                        $inner = $value[$server_key];
                        $val_to_test = is_array($inner) ? ($inner['code'] ?? '') : $inner;
                        break;
                    }
                }
            }

            if (!$val_to_test) {
                continue;
            }

            // Check for physical file mentions or Apache/Nginx directives in mappings
            $web_server_indicators = array_merge($block_indicators, ['location ', 'proxy_pass', 'fastcgi_pass', '<configuration', '<system.webServer']);

            foreach ($physical_file_patterns as $file) {
                if (stripos($val_to_test, $file) !== false) {
                    $needs_htaccess = true;
                    break 2;
                }
            }

            foreach ($web_server_indicators as $indicator) {
                if (stripos($val_to_test, $indicator) !== false) {
                    $needs_htaccess = true;
                    break 2;
                }
            }
        }

        // Auto-Correct if driver is 'hook' but needs 'htaccess' or 'wp-config'
        if ($needs_htaccess && $driver === 'hook') {
            error_log("VAPT Intelligence: Auto-switching driver to 'htaccess' for feature $feature_key based on physical file target.");
            $schema['enforcement']['driver'] = 'htaccess';
            $schema['enforcement']['target'] = $schema['enforcement']['target'] ?? 'root';
            $driver = 'htaccess'; // Update local variable for subsequent logic
        }

        // [v3.13.2] Auto-Correct for wp-config constants
        $needs_config = false;
        foreach ($mappings as $key => $value) {
            $val_to_test = '';
            if (is_string($value)) {
                $val_to_test = $value;
            } elseif (is_array($value)) {
                if (isset($value['wp-config.php']) || isset($value['wp_config'])) {
                    $needs_config = true;
                } elseif (isset($value['config'])) {
                    $val_to_test = is_array($value['config']) ? ($value['config']['code'] ?? '') : $value['config'];
                }
            }

            if (stripos($val_to_test, 'define(') !== false || stripos($val_to_test, 'wp-config') !== false) {
                $needs_config = true;
            }
        }

        if ($needs_config && $driver === 'hook') {
            error_log("VAPT Intelligence: Auto-switching driver to 'config' for feature $feature_key based on wp-config constants.");
            $schema['enforcement']['driver'] = 'config';
            $driver = 'config';
        }

        return $schema;
    }

    /**
     * Auto-fix common schema issues before validation.
     *
     * @param array $schema The schema array to sanitize
     * @return array Sanitized schema
     */
    public static function sanitize_and_fix_schema($schema)
    {
        if (!isset($schema['controls']) || !is_array($schema['controls'])) {
            return $schema;
        }

        $no_key_types = ['button', 'info', 'alert', 'section', 'group', 'divider', 'html', 'header', 'label', 'evidence_uploader', 'risk_indicators', 'assurance_badges', 'remediation_steps', 'test_checklist', 'evidence_list'];

        foreach ($schema['controls'] as $index => &$control) {
            if (!is_array($control)) {
                continue;
            }

            // Map 'dropdown' to 'select' for backward compatibility
            if (isset($control['type']) && $control['type'] === 'dropdown') {
                $control['type'] = 'select';
            }

            // Fix missing key
            if (empty($control['key']) && !empty($control['type']) && !in_array($control['type'], $no_key_types)) {
                // Try to find a meaningful ID
                $base = $control['id'] ?? ($control['component_id'] ?? 'control');
                $control['key'] = sanitize_key($base . '_' . $index . '_' . wp_generate_password(4, false));
            }
        }

        return $schema;
    }

    /**
     * Validates the feature schema structure.
     *
     * @param array $schema The schema array to validate
     * @return true|WP_Error True if valid, WP_Error otherwise
     */
    public static function validate_schema($schema)
    {
        if (!is_array($schema)) {
            return new WP_Error('invalid_schema', 'Schema must be an object/array', array('status' => 400));
        }

        if (!isset($schema['controls']) || !is_array($schema['controls'])) {
            return new WP_Error(
                'invalid_schema',
                'Schema must have a "controls" array',
                array('status' => 400)
            );
        }

        foreach ($schema['controls'] as $index => $control) {
            if (!is_array($control)) {
                return new WP_Error(
                    'invalid_schema',
                    sprintf('Control at index %d must be an object', $index),
                    array('status' => 400)
                );
            }

            if (empty($control['type'])) {
                return new WP_Error(
                    'invalid_schema',
                    sprintf('Control at index %d must have a "type" field', $index),
                    array('status' => 400)
                );
            }

            $no_key_types = ['button', 'info', 'alert', 'section', 'group', 'divider', 'html', 'header', 'label', 'evidence_uploader', 'risk_indicators', 'assurance_badges', 'remediation_steps', 'test_checklist', 'evidence_list'];
            if (empty($control['key']) && !in_array($control['type'], $no_key_types)) {
                return new WP_Error(
                    'invalid_schema',
                    sprintf('Control at index %d must have a "key" field', $index),
                    array('status' => 400)
                );
            }

            $valid_types = ['toggle', 'input', 'select', 'textarea', 'code', 'test_action', 'button', 'info', 'alert', 'section', 'group', 'divider', 'html', 'header', 'label', 'password', 'evidence_uploader', 'risk_indicators', 'assurance_badges', 'remediation_steps', 'test_checklist', 'evidence_list'];
            if (!in_array($control['type'], $valid_types)) {
                return new WP_Error(
                    'invalid_schema',
                    sprintf(
                        'Control at index %d has invalid type "%s". Valid types: %s',
                        $index,
                        $control['type'],
                        implode(', ', $valid_types)
                    ),
                    array('status' => 400)
                );
            }

            if ($control['type'] === 'test_action') {
                if (empty($control['test_logic'])) {
                    return new WP_Error(
                        'invalid_schema',
                        sprintf(
                            'Test action control "%s" must have a "test_logic" field',
                            $control['key'] ?? $index
                        ),
                        array('status' => 400)
                    );
                }
            }
        }

        if (isset($schema['enforcement'])) {
            if (!is_array($schema['enforcement'])) {
                return new WP_Error(
                    'invalid_schema',
                    'Enforcement section must be an object',
                    array('status' => 400)
                );
            }

            if (empty($schema['enforcement']['driver'])) {
                return new WP_Error(
                    'invalid_schema',
                    'Enforcement must specify a "driver" (hook or htaccess)',
                    array('status' => 400)
                );
            }

            $valid_drivers = ['hook', 'htaccess', 'universal', 'manual', 'config', 'wp-config'];
            if (!in_array($schema['enforcement']['driver'], $valid_drivers)) {
                return new WP_Error(
                    'invalid_schema',
                    sprintf(
                        'Invalid enforcement driver "%s". Valid drivers: %s',
                        $schema['enforcement']['driver'],
                        implode(', ', $valid_drivers)
                    ),
                    array('status' => 400)
                );
            }

            if ($schema['enforcement']['driver'] === 'htaccess' && empty($schema['enforcement']['target'])) {
                return new WP_Error(
                    'invalid_schema',
                    'Htaccess driver must specify a "target" (root or uploads)',
                    array('status' => 400)
                );
            }

            if (isset($schema['enforcement']['mappings']) && !is_array($schema['enforcement']['mappings'])) {
                return new WP_Error(
                    'invalid_schema',
                    'Enforcement mappings must be an object/array',
                    array('status' => 400)
                );
            }
        }

        return true;
    }

    /**
     * 🛡️ IMPLEMENTATION VALIDATOR (v3.6.19)
     * Validates user-provided implementation settings against the feature's JSON schema.
     *
     * @param array $data   Implementation data to validate
     * @param array $schema Feature schema to validate against
     * @return true|WP_Error True if valid, WP_Error otherwise
     */
    public static function validate_implementation_data($data, $schema)
    {
        if (!isset($schema['controls']) || !is_array($schema['controls'])) {
            return true; // No controls to validate against (dynamic features)
        }

        if (!is_array($data)) {
            return new WP_Error('invalid_impl_data', 'Implementation data must be an object/array', array('status' => 400));
        }

        foreach ($schema['controls'] as $control) {
            $key = $control['key'] ?? null;
            if (!$key) {
                continue;
            }

            if (!isset($data[$key])) {
                // Only error if it's marked as required (non-existent field currently, but for future proofing)
                if (!empty($control['required'])) {
                    return new WP_Error('missing_field', sprintf('Missing required field: %s', $key), array('status' => 400));
                }
                continue;
            }

            $value = $data[$key];
            $type = $control['type'] ?? 'text';

            switch ($type) {
                case 'toggle':
                    if (!is_bool($value) && $value !== 0 && $value !== 1 && $value !== '0' && $value !== '1') {
                        return new WP_Error('invalid_type', sprintf('Field %s must be a boolean/toggle', $key), array('status' => 400));
                    }
                    break;

                case 'input':
                case 'password':
                    if ($control['input_type'] === 'number') {
                        if (!is_numeric($value)) {
                            return new WP_Error('invalid_type', sprintf('Field %s must be numeric', $key), array('status' => 400));
                        }
                        if (isset($control['min']) && (float)$value < (float)$control['min']) {
                            return new WP_Error('out_of_range', sprintf('Field %s is below minimum (%s)', $key, $control['min']), array('status' => 400));
                        }
                        if (isset($control['max']) && (float)$value > (float)$control['max']) {
                            return new WP_Error('out_of_range', sprintf('Field %s is above maximum (%s)', $key, $control['max']), array('status' => 400));
                        }
                    }
                    break;

                case 'select':
                    if (isset($control['options'])) {
                        $valid_values = array_map(
                            function ($opt) {
                                return is_array($opt) ? $opt['value'] : $opt;
                            },
                            $control['options']
                        );
                        if (!in_array($value, $valid_values)) {
                            return new WP_Error('invalid_option', sprintf('Field %s contains an invalid option', $key), array('status' => 400));
                        }
                    }
                    break;

                case 'code':
                case 'textarea':
                    if (!is_string($value) && $value !== null) {
                        return new WP_Error('invalid_type', sprintf('Field %s must be a string', $key), array('status' => 400));
                    }
                    break;
            }
        }

        return true;
    }

    /**
     * Translate URL placeholders in schema to fully qualified URLs (v3.12.17)
     *
     * @param array $schema The schema array
     * @return array The schema with translated URLs
     */
    public static function translate_url_placeholders($schema)
    {
        $site_url = get_site_url();
        $home_url = get_home_url();
        $admin_url = get_admin_url();

        $replacements = array(
            '{{site_url}}' => $site_url,
            '{{home_url}}' => $home_url,
            '{{admin_url}}' => $admin_url,
        );

        // Recursively walk through the schema and replace placeholders
        array_walk_recursive(
            $schema,
            function (&$value) use ($replacements) {
                if (is_string($value)) {
                    $value = str_replace(array_keys($replacements), array_values($replacements), $value);
                }
            }
        );

        return $schema;
    }
}




