<?php

/**
 * Base REST Controller for VAPT Secure
 */

if (! defined('ABSPATH')) {
    exit;
}

abstract class VAPTGUARD_REST_Base
{
    protected static $cached_pattern_library = null;

    /**
     * Normalize a status value to the canonical title-case form.
     */
    protected static function normalize_status($status)
    {
        if (class_exists('VAPTGUARD_Workflow')) {
            return VAPTGUARD_Workflow::normalize_status($status);
        }

        $status = strtolower(trim((string) $status));
        $map = array(
            'available'   => 'Draft',
            'draft'       => 'Draft',
            'develop'     => 'Develop',
            'in_progress' => 'Develop',
            'testing'     => 'Test',
            'test'        => 'Test',
            'implemented' => 'Release',
            'release'     => 'Release',
        );

        return isset($map[$status]) ? $map[$status] : ucfirst($status);
    }

    /**
     * Whether verbose debug logging should be emitted.
     */
    protected static function is_debug_enabled()
    {
        return defined('WP_DEBUG') && WP_DEBUG;
    }

    /**
     * Emit a debug log only when debug mode is enabled.
     */
    protected static function debug_log($message)
    {
        if (self::is_debug_enabled()) {
            error_log($message);
        }
    }

    protected static function get_cached_pattern_library()
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

    public function check_permission()
    {
        $is_super = is_vaptguard_superadmin();
        if (!$is_super) {
            $uid = get_current_user_id();
            $user = get_userdata($uid);
            $login = $user ? $user->user_login : 'unknown';
            error_log("VAPTGUARD_REST: check_permission FAILED for user ID $uid ($login). Superadmin status required.");
        }
        return $is_super;
    }

    public function check_read_permission()
    {
        $is_super = is_vaptguard_superadmin();
        $can_manage = current_user_can('manage_options');
        $uid = get_current_user_id();
        $user = get_userdata($uid);
        $login = $user ? $user->user_login : 'unknown';

        // Debug logging
        error_log("VAPTGUARD_REST: check_read_permission - User ID: $uid ($login), is_super: " . ($is_super ? 'true' : 'false') . ", can_manage: " . ($can_manage ? 'true' : 'false'));

        if (!$is_super && !$can_manage) {
            error_log("VAPTGUARD_REST: check_read_permission FAILED for user ID $uid ($login). 'manage_options' capability required.");
        }
        return $is_super || $can_manage;
    }

    protected static function analyze_enforcement_strategy($schema, $feature_key)
    {
        $driver = isset($schema['driver']) ? $schema['driver'] : 'unknown';
        $mappings = isset($schema['mappings']) ? $schema['mappings'] : [];

        // Initialize strategy analysis
        $strategy_analysis = [
            'driver' => $driver,
            'is_hook_based' => false,
            'is_config_based' => false,
            'is_network_based' => false,
            'recommended_platforms' => [],
        ];

        // Check if mappings contain action hook patterns or function definitions
        $hook_patterns = ['add_action', 'add_filter', 'wp_add_inline_script', 'wp_enqueue_script', 'wp_enqueue_style'];
        $has_hook = false;
        foreach ($mappings as $map) {
            if (isset($map['action_hook']) || isset($map['filter_hook'])) {
                $has_hook = true;
                break;
            }
            if (isset($map['code'])) {
                foreach ($hook_patterns as $pattern) {
                    if (strpos($map['code'], $pattern) !== false) {
                        $has_hook = true;
                        break 2;
                    }
                }
            }
        }

        $strategy_analysis['is_hook_based'] = $has_hook;

        // Check for config file patterns
        $config_patterns = ['.htaccess', 'nginx.conf', 'web.config', 'php.ini', 'httpd.conf'];
        $has_config = false;
        foreach ($mappings as $map) {
            if (isset($map['target_file'])) {
                foreach ($config_patterns as $pattern) {
                    if (strpos($map['target_file'], $pattern) !== false) {
                        $has_config = true;
                        break 2;
                    }
                }
            }
        }

        $strategy_analysis['is_config_based'] = $has_config;

        // Check for network/DNS patterns
        $network_patterns = ['DNS', 'firewall', 'WAF', 'CDN', 'Cloudflare', 'traffic', 'network'];
        $has_network = false;
        foreach ($mappings as $map) {
            if (isset($map['type'])) {
                foreach ($network_patterns as $pattern) {
                    if (stripos($map['type'], $pattern) !== false) {
                        $has_network = true;
                        break 2;
                    }
                }
            }
        }

        $strategy_analysis['is_network_based'] = $has_network;

        // Determine recommended platforms based on mappings
        $platform_hints = [];
        foreach ($mappings as $map) {
            if (isset($map['platform'])) {
                $platform_hints[] = strtolower($map['platform']);
            }
            if (isset($map['driver'])) {
                $platform_hints[] = strtolower($map['driver']);
            }
        }

        $platform_hints = array_unique($platform_hints);
        $valid_platforms = ['apache', 'nginx', 'iis', 'caddy', 'php-fpm', 'cloudflare', 'generic'];

        foreach ($platform_hints as $hint) {
            if (in_array($hint, $valid_platforms)) {
                $strategy_analysis['recommended_platforms'][] = $hint;
            }
        }

        // If no specific platforms found but has config patterns, suggest web servers
        if (empty($strategy_analysis['recommended_platforms']) && $has_config) {
            $strategy_analysis['recommended_platforms'] = ['apache', 'nginx', 'iis', 'caddy'];
        }

        return $strategy_analysis;
    }

    protected static function sanitize_and_fix_schema($schema)
    {
        if (!is_array($schema)) {
            return $schema;
        }

        // Ensure required top-level fields exist
        $required_fields = ['key', 'name', 'description', 'driver', 'mappings'];
        foreach ($required_fields as $field) {
            if (!isset($schema[$field])) {
                $schema[$field] = '';
            }
        }

        // Ensure mappings is an array
        if (!is_array($schema['mappings'])) {
            $schema['mappings'] = [];
        }

        // Sanitize each mapping
        foreach ($schema['mappings'] as &$mapping) {
            if (!is_array($mapping)) {
                $mapping = [];
                continue;
            }

            // Ensure mapping has required fields
            $mapping_fields = ['type', 'description', 'implementation'];
            foreach ($mapping_fields as $field) {
                if (!isset($mapping[$field])) {
                    $mapping[$field] = '';
                }
            }

            // Ensure implementation_data exists if needed
            if (isset($mapping['implementation']) && $mapping['implementation'] === 'data') {
                if (!isset($mapping['implementation_data'])) {
                    $mapping['implementation_data'] = [];
                }
            }
        }

        return $schema;
    }

    protected static function validate_schema($schema)
    {
        $errors = [];

        if (!is_array($schema)) {
            return ['valid' => false, 'errors' => ['Schema must be an array']];
        }

        // Check required fields
        $required_fields = ['key', 'name', 'description', 'driver'];
        foreach ($required_fields as $field) {
            if (!isset($schema[$field]) || empty(trim($schema[$field]))) {
                $errors[] = "Missing or empty required field: $field";
            }
        }

        // Validate key format
        if (isset($schema['key']) && !preg_match('/^[a-zA-Z0-9_-]+$/', $schema['key'])) {
            $errors[] = "Invalid key format. Only letters, numbers, underscores, and hyphens allowed.";
        }

        // Validate driver
        $valid_drivers = ['hook', 'apache', 'nginx', 'iis', 'caddy', 'php-fpm', 'cloudflare', 'generic'];
        if (isset($schema['driver']) && !in_array($schema['driver'], $valid_drivers)) {
            $errors[] = "Invalid driver. Must be one of: " . implode(', ', $valid_drivers);
        }

        // Validate mappings
        if (isset($schema['mappings'])) {
            if (!is_array($schema['mappings'])) {
                $errors[] = "Mappings must be an array";
            } else {
                foreach ($schema['mappings'] as $index => $mapping) {
                    if (!is_array($mapping)) {
                        $errors[] = "Mapping at index $index must be an array";
                        continue;
                    }

                    // Check mapping required fields
                    if (!isset($mapping['type']) || empty(trim($mapping['type']))) {
                        $errors[] = "Mapping at index $index missing 'type'";
                    }

                    if (!isset($mapping['description']) || empty(trim($mapping['description']))) {
                        $errors[] = "Mapping at index $index missing 'description'";
                    }

                    if (!isset($mapping['implementation']) || empty(trim($mapping['implementation']))) {
                        $errors[] = "Mapping at index $index missing 'implementation'";
                    }
                }
            }
        }

        return [
            'valid' => empty($errors),
            'errors' => $errors
        ];
    }

    protected static function validate_implementation_data($data, $schema)
    {
        $errors = [];

        if (!is_array($data)) {
            return ['valid' => false, 'errors' => ['Implementation data must be an array']];
        }

        // Check if data matches schema structure
        if (isset($schema['mappings'])) {
            foreach ($schema['mappings'] as $index => $mapping) {
                if (isset($mapping['implementation']) && $mapping['implementation'] === 'data') {
                    $mapping_key = isset($mapping['key']) ? $mapping['key'] : "mapping_$index";
                    
                    if (!isset($data[$mapping_key])) {
                        $errors[] = "Missing implementation data for mapping: $mapping_key";
                    } elseif (!is_array($data[$mapping_key])) {
                        $errors[] = "Implementation data for mapping $mapping_key must be an array";
                    }
                }
            }
        }

        return [
            'valid' => empty($errors),
            'errors' => $errors
        ];
    }

    protected static function translate_url_placeholders($schema)
    {
        if (!is_array($schema) || !isset($schema['mappings'])) {
            return $schema;
        }

        foreach ($schema['mappings'] as &$mapping) {
            if (!is_array($mapping)) {
                continue;
            }

            // Replace placeholders in code
            if (isset($mapping['code'])) {
                $mapping['code'] = str_replace(
                    ['{{SITE_URL}}', '{{HOME_URL}}'],
                    [home_url(), home_url()],
                    $mapping['code']
                );
            }

            // Replace placeholders in target_file
            if (isset($mapping['target_file'])) {
                $mapping['target_file'] = str_replace(
                    ['{{ABSPATH}}', '{{WP_CONTENT_DIR}}'],
                    [ABSPATH, WP_CONTENT_DIR],
                    $mapping['target_file']
                );
            }

            // Replace placeholders in implementation_data
            if (isset($mapping['implementation_data']) && is_array($mapping['implementation_data'])) {
                array_walk_recursive($mapping['implementation_data'], function (&$value) {
                    if (is_string($value)) {
                        $value = str_replace(
                            ['{{SITE_URL}}', '{{HOME_URL}}', '{{ABSPATH}}', '{{WP_CONTENT_DIR}}'],
                            [home_url(), home_url(), ABSPATH, WP_CONTENT_DIR],
                            $value
                        );
                    }
                });
            }
        }

        return $schema;
    }
}
