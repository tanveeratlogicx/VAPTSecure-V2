<?php

/**
 * VAPTGUARD_PHP_Driver
 * Handles management of centralized vapt-functions.php file
 */

if (!defined('ABSPATH')) { exit;
}

class VAPTGUARD_PHP_Driver implements VAPTGUARD_Driver_Interface
{
    /**
     * Generates valid PHP code blocks for vapt-functions.php
     */
    public static function generate_rules($data, $schema)
    {
        $enf_config = isset($schema['enforcement']) ? $schema['enforcement'] : array();
        $rules = array();
        $mappings = isset($enf_config['mappings']) ? $enf_config['mappings'] : array();
    
        // Check toggle state (v4.0.0 Adaptive logic)
        $is_enabled = true;
        if (isset($data['feat_enabled'])) {
            $is_enabled = filter_var($data['feat_enabled'], FILTER_VALIDATE_BOOLEAN);
        } elseif (isset($data['enabled'])) {
            $is_enabled = filter_var($data['enabled'], FILTER_VALIDATE_BOOLEAN);
        }
    
        if (!$is_enabled) {
            return [];
        }

        $feature_key = $schema['feature_key'] ?? 'unknown';

        // 1. Try to find the actual code from schema/mappings or implementation data
        $resolved_code = '';
    
        // Check platform implementations first (V2.0 Architecture)
        if (isset($schema['platform_implementations']['PHP Functions'])) {
            $impl = $schema['platform_implementations']['PHP Functions'];
            if (!empty($impl['code'])) { $resolved_code = $impl['code'];
            } elseif (!empty($impl['wrapped_code'])) { $resolved_code = $impl['wrapped_code'];
            } elseif (!empty($impl['code_ref'])) { $resolved_code = self::resolve_pattern_code($impl['code_ref'], 'php_functions');
            }
        }

        // Fallback to mappings
        if (empty($resolved_code) || $resolved_code === '/* Managed via PHP hooks */') {
            foreach ($mappings as $key => $m_data) {
                if (!empty($data[$key])) {
                    if (is_array($m_data) && isset($m_data['code_ref'])) {
                        $resolved_code = self::resolve_pattern_code($m_data['code_ref'], 'php_functions');
                    } else {
                        $resolved_code = VAPTGUARD_Enforcer::extract_code_from_mapping($m_data, 'hook');
                    }
                }
            }
        }

        // Final Fallback: Direct lookup by feature key if we still have nothing or just the placeholder
        if (empty($resolved_code) || $resolved_code === '/* Managed via PHP hooks */' || $resolved_code === '// Managed via PHP hooks') {
            $resolved_code = self::resolve_pattern_code($feature_key, 'php_functions');
        }

        if (!empty($resolved_code) && $resolved_code !== '/* Managed via PHP hooks */') {
            $rules[] = "// BEGIN VAPT $feature_key";
            $rules[] = $resolved_code;
            $rules[] = "// END VAPT $feature_key";
        }

        return $rules;
    }

    /**
     * Resolves machine-executable code from the Enforcer Pattern Library
     */
    private static function resolve_pattern_code($ref, $platform)
    {
        static $library = null;
        if ($library === null) {
            $path = VAPTGUARD_PATH . 'data/enforcer_pattern_library_v2.0.json';
            if (file_exists($path)) {
                $library = json_decode(file_get_contents($path), true);
                if (!$library) { error_log("VAPT Error: Failed to decode pattern library at $path");
                }
            } else {
                error_log("VAPT Error: Pattern library missing at $path");
                $library = [];
            }
        }

        if (preg_match('/RISK-\d+/', $ref, $matches)) {
            $risk_id = $matches[0];
            $patterns = $library['patterns'] ?? [];
            if (isset($patterns[$risk_id])) {
                $p = $patterns[$risk_id];
              
                // 1. Check for the specific platform (e.g., 'php_functions')
                if (isset($p[$platform])) {
                    $code = $p[$platform]['code'] ?? $p[$platform]['wrapped_code'] ?? '';
                    if ($code) { return $code;
                    }
                }
              
                // 2. Fallback: check all enforcer types for anything containing 'code'
                foreach ($p as $enforcer) {
                    if (is_array($enforcer) && isset($enforcer['code'])) {
                        // Only if it looks like PHP
                        if (strpos($enforcer['code'], 'function') !== false || strpos($enforcer['code'], 'add_action') !== false) {
                            return $enforcer['code'];
                        }
                    }
                }
            } else {
                error_log("VAPT Error: Risk $risk_id not found in pattern library.");
            }
        }

        return '';
    }

    /**
     * Writes a complete batch of PHP rules to vapt-functions.php
     *
     * @param array  $rules  Flat array of all PHP rules to write
     * @param string $target Target location identifier (not used for PHP driver)
     * @return bool Success status
     */
    public static function write_batch($rules, $target = 'root')
    {
        $all_rules_array = $rules;
        $path = VAPTGUARD_PATH . 'vapt-functions.php';
    
        $start_marker = "// BEGIN VAPT SECURITY RULES";
        $end_marker = "// END VAPT SECURITY RULES";

        $vapt_block = "";
        if (!empty($all_rules_array)) {
            $vapt_block = $start_marker . "\n" . implode("\n\n", $all_rules_array) . "\n" . $end_marker;
        }

        if (!file_exists($path)) {
            if (empty($all_rules_array)) { return true;
            }
            $dir = dirname($path);
            if (!is_dir($dir)) { wp_mkdir_p($dir);
            }
            @file_put_contents($path, "<?php\n\n/**\n * VAPT Secure: Centralized PHP Protections\n */\n\nif (!defined('ABSPATH')) exit;\n\n");
        }

        if (!is_writable($path)) { return false;
        }

        $content = file_get_contents($path);
    
        if (strpos($content, $start_marker) !== false && strpos($content, $end_marker) !== false) {
            $pattern = "/" . preg_quote($start_marker, '/') . ".*?" . preg_quote($end_marker, '/') . "/is";
            $content = preg_replace($pattern, $vapt_block, $content);
        } else {
            $content = rtrim($content) . "\n\n" . $vapt_block . "\n";
        }

        $content = preg_replace("/(\r?\n){3,}/", "$1$1", $content);
        @file_put_contents($path, $content);

        return true;
    }

    /**
     * Cleans/removes all VAPT rules from the PHP functions file.
     *
     * @param string $target Target location (unused for PHP driver, kept for interface compatibility)
     * @return bool Success status
     */
    public static function clean($target = 'root')
    {
        return self::write_batch([]);
    }
}


