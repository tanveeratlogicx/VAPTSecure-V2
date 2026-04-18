<?php

/**
 * VAPTGUARD_Caddy_Driver
 * Handles enforcement of rules for Caddy via generated Caddyfile snippets.
 */

if (!defined('ABSPATH')) { exit;
}

class VAPTGUARD_Caddy_Driver implements VAPTGUARD_Driver_Interface
{
    /**
     * Generates a list of valid Caddy directives based on the provided data and schema.
     */
    public static function generate_rules($data, $schema)
    {
        // 🛡️ TWO-WAY DEACTIVATION (v3.6.19)
        $is_enabled = isset($data['enabled']) ? (bool)$data['enabled'] : true;
        if (!$is_enabled) {
            return array();
        }

        $enf_config = isset($schema['enforcement']) ? $schema['enforcement'] : array();
        $rules = array();
        $mappings = isset($enf_config['mappings']) ? $enf_config['mappings'] : array();

        foreach ($mappings as $key => $directive) {
            if (!empty($data[$key])) {
                // [v1.4.1] Support for v2.0 rich mappings (Platform Objects)
                $directive = VAPTGUARD_Enforcer::extract_code_from_mapping($directive, 'caddy');
                if (empty($directive)) { continue;
                }

                // For Caddy, we primarily rely on direct mappings as translation is complex
                $rules[] = $directive;
            }
        }

        if (!empty($rules)) {
            $feature_key = isset($schema['feature_key']) ? $schema['feature_key'] : 'unknown';
            $title = isset($schema['title']) ? $schema['title'] : '';

            $wrapped_rules = array();
            $wrapped_rules[] = "# BEGIN VAPT $feature_key" . ($title ? " \u2014 $title" : "");
            foreach ($rules as $rule) {
                $wrapped_rules[] = $rule;
            }
            $wrapped_rules[] = "# VAPT-Feature: $feature_key"; // Marker for verify
            $wrapped_rules[] = "# END VAPT $feature_key";

            return $wrapped_rules;
        }

        return array();
    }

    /**
     * 🔍 VERIFICATION LOGIC
     */
    public static function verify($key, $impl_data, $schema)
    {
        $upload_dir = wp_upload_dir();
        $file_path = $upload_dir['basedir'] . '/vapt-caddy-rules.conf';

        if (!file_exists($file_path)) {
            return false;
        }

        $content = file_get_contents($file_path);
        return (strpos($content, "VAPT-Feature: $key") !== false);
    }

    /**
     * Writes batch to vapt-caddy-rules.conf
     *
     * @param array  $rules  Flat array of all caddy rules to write
     * @param string $target Target location identifier (not used for caddy driver)
     * @return bool Success status
     */
    public static function write_batch($rules, $target = 'root')
    {
        $all_rules_array = $rules;
        $upload_dir = wp_upload_dir();
        $file_path = $upload_dir['basedir'] . '/vapt-caddy-rules.conf';

        $content = "# VAPT Secure - Auto Generated Caddy Rules\n";
        $content .= "# Import this file in your Caddyfile site block.\n";
        $content .= "# Last Updated: " . date('Y-m-d H:i:s') . "\n\n";

        $content .= implode("\n", $all_rules_array);

        return @file_put_contents($file_path, $content) !== false;
    }

    /**
     * Cleans/removes all VAPT rules from the Caddy rules file.
     *
     * @param string $target Target location (unused for caddy driver, kept for interface compatibility)
     * @return bool Success status
     */
    public static function clean($target = 'root')
    {
        $upload_dir = wp_upload_dir();
        $file_path = $upload_dir['basedir'] . '/vapt-caddy-rules.conf';

        if (!file_exists($file_path)) {
            return true; // Nothing to clean
        }

        // Write empty content (just header)
        $content = "# VAPT Secure - Auto Generated Caddy Rules\n";
        $content .= "# Import this file in your Caddyfile site block.\n";
        $content .= "# Last Updated: " . date('Y-m-d H:i:s') . "\n";
        $content .= "# All rules have been cleaned.\n";

        return @file_put_contents($file_path, $content) !== false;
    }
}


