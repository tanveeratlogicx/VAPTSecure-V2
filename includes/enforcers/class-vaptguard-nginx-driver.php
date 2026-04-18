<?php

/**
 * VAPTGUARD_Nginx_Driver
 * Handles enforcement of rules for Nginx via a generated include file.
 */

if (!defined('ABSPATH')) { exit;
}

class VAPTGUARD_Nginx_Driver implements VAPTGUARD_Driver_Interface
{
    /**
     * Generates a list of valid Nginx directives based on the provided data and schema.
     *
     * @param  array $data   Implementation data (user inputs)
     * @param  array $schema Feature schema containing enforcement mappings
     * @return array List of valid Nginx directives
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
                // [v1.4.1] Support for v1.1/v2.0 rich mappings (Platform Objects)
                $directive = VAPTGUARD_Enforcer::extract_code_from_mapping($directive, 'nginx');
                if (empty($directive)) { continue;
                }

                $nginx_rule = self::translate_to_nginx($key, $directive);

                if ($nginx_rule) {
                    $rules[] = $nginx_rule;
                }
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
            $wrapped_rules[] = "add_header X-VAPT-Feature \"$feature_key\" always; # Marker for verify";
            $wrapped_rules[] = "# END VAPT $feature_key";

            return $wrapped_rules;
        }

        return array(); // Return empty array if no rules were generated
    }

    /**
     * 🔍 VERIFICATION LOGIC (v3.6.19)
     */
    public static function verify($key, $impl_data, $schema)
    {
        $upload_dir = wp_upload_dir();
        $file_path = $upload_dir['basedir'] . '/vapt-nginx-rules.conf';

        if (!file_exists($file_path)) {
            return false;
        }

        $content = file_get_contents($file_path);
        return (strpos($content, "X-VAPT-Feature \"$key\"") !== false);
    }

    /**
     * Translates common VAPT keys/Apache directives to Nginx syntax.
     */
    private static function translate_to_nginx($key, $directive)
    {
        // 1. Headers
        // Apache: Header set X-Frame-Options "SAMEORIGIN"
        // Nginx: add_header X-Frame-Options "SAMEORIGIN" always;
        if (strpos($directive, 'Header set') !== false) {
            $clean = str_replace(['Header set ', '"'], ['', ''], $directive);
            $parts = explode(' ', $clean, 2);
            if (count($parts) == 2) {
                return 'add_header ' . $parts[0] . ' "' . $parts[1] . '" always;';
            }
        }

        // 2. Directory Listing
        // Apache: Options -Indexes
        // Nginx: autoindex off;
        if (strpos($directive, 'Options -Indexes') !== false) {
            return 'autoindex off;';
        }

        // 3. Block Files (xmlrpc, etc)
        // Apache: <Files xmlrpc.php> ... </Files>
        // Nginx: location = /xmlrpc.php { deny all; }
        if ($key === 'block_xmlrpc') {
            return 'location = /xmlrpc.php { deny all; return 403; }';
        }

        // 4. Block Dot Files
        if ($key === 'block_sensitive_files') {
            return 'location ~ /\. { deny all; return 403; }';
        }

        // 5. Generic File Blocking (regex)
        // Apache: <FilesMatch ...>
        // Nginx: location ~ ...
        if (strpos($directive, '<Files') !== false) {
            // Fallback: convert common file blocks manually if known
            if (strpos($directive, 'debug.log') !== false) {
                return 'location ~ /debug\.log$ { deny all; return 403; }';
            }
        }

        return null;
    }

    /**
     * Writes a complete batch of Nginx rules to the target file.
     *
     * @param array  $rules  Flat array of all nginx rules to write
     * @param string $target Target location identifier (not used for nginx driver)
     * @return bool Success status
     */
    public static function write_batch($rules, $target = 'root')
    {
        $all_rules_array = $rules;
        $upload_dir = wp_upload_dir();
        $file_path = $upload_dir['basedir'] . '/vapt-nginx-rules.conf';

        $content = "# VAPT Secure - Auto Generated Nginx Rules\n";
        $content .= "# Include this file in your nginx.conf server block.\n";
        $content .= "# Last Updated: " . date('Y-m-d H:i:s') . "\n\n";

        $content .= implode("\n", $all_rules_array);

        $result = @file_put_contents($file_path, $content);

        if ($result !== false) {
            // Set a persistent option to verify file matches current state?
            // Or just transient for admin notice?
            set_transient('vaptguard_nginx_rules_updated', $file_path, HOUR_IN_SECONDS * 24);
            return true;
        }

        return false;
    }

    /**
     * Cleans/removes all VAPT rules from the nginx rules file.
     *
     * @param string $target Target location (unused for nginx, kept for interface compatibility)
     * @return bool Success status
     */
    public static function clean($target = 'root')
    {
        $upload_dir = wp_upload_dir();
        $file_path = $upload_dir['basedir'] . '/vapt-nginx-rules.conf';

        if (!file_exists($file_path)) {
            return true; // Nothing to clean
        }

        // Write empty content (just header)
        $content = "# VAPT Secure - Auto Generated Nginx Rules\n";
        $content .= "# Include this file in your nginx.conf server block.\n";
        $content .= "# Last Updated: " . date('Y-m-d H:i:s') . "\n";
        $content .= "# All rules have been cleaned.\n";

        $result = @file_put_contents($file_path, $content);
        return $result !== false;
    }
}


