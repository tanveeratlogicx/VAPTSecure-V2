<?php

/**
 * VAPTGUARD_Htaccess_Driver
 * Handles enforcement of rules into .htaccess
 */

if (!defined('ABSPATH')) { exit;
}

class VAPTGUARD_Htaccess_Driver implements VAPTGUARD_Driver_Interface
{
    /**
     * Whitelist of allowed .htaccess directives for security
     * Prevents injection of dangerous PHP/Server directives
     */
    private static $allowed_directives = [
    'Options',
    'Header',
    'Files',
    'FilesMatch',
    'IfModule',
    'Order',
    'Deny',
    'Allow',
    'Directory',
    'DirectoryMatch',
    'Require'
    ];

    /**
     * Dangerous patterns that should never be allowed
     */
    private static $dangerous_patterns = [
    '/php_value/i',
    '/php_admin_value/i',
    '/SetEnvIf.*passthrough/i',
    '/RewriteRule.*passthrough/i',
    '/RewriteRule.*exec/i',
    '/<FilesMatch.*\.php/i',
    '/php_flag\s/i',
    '/AddHandler.*php/i',
    '/Action\s/i',
    '/SetHandler\s/i'
    ];

    /**
     * Generates a list of valid .htaccess rules based on the provided data and schema.
     * Does NOT write to file.
     *
     * @param  array $data   Implementation data (user inputs)
     * @param  array $schema Feature schema containing enforcement mappings
     * @return array List of .htaccess directives (or DISABLED markers)
     */
    public static function generate_rules($data, $schema)
    {
        $enf_config = isset($schema['enforcement']) ? $schema['enforcement'] : array();

        // 🛡️ TWO-WAY DEACTIVATION (v3.13.20 - Intelligent Detection)
        // [FIX v4.0.x] Check multiple toggle key formats including feat_enabled, enabled, and auto-generated keys
        $is_enabled = true;
        
        // Check common toggle keys in priority order
        if (isset($data['feat_enabled'])) {
            $is_enabled = (bool)filter_var($data['feat_enabled'], FILTER_VALIDATE_BOOLEAN);
        } elseif (isset($data['enabled'])) {
            $is_enabled = (bool)filter_var($data['enabled'], FILTER_VALIDATE_BOOLEAN);
        } else {
            // Check auto-generated risk-specific toggle keys
            $risk_key = $schema['risk_id'] ?? $schema['id'] ?? $schema['feature_key'] ?? '';
            $risk_suffix = str_replace('-', '_', strtolower($risk_key));
            $auto_key = "vapt_risk_{$risk_suffix}_enabled";
            if (isset($data[$auto_key])) {
                $is_enabled = (bool)filter_var($data[$auto_key], FILTER_VALIDATE_BOOLEAN);
            } else {
                // If 'enabled' is missing, check if any mapped toggle is set to false
                $mappings = $enf_config['mappings'] ?? array();
                foreach ($mappings as $key => $directive) {
                    if (isset($data[$key]) && ($data[$key] === false || $data[$key] === 0 || $data[$key] === '0')) {
                        // If the primary enforcement mapping is a toggle and it's OFF, consider feature disabled
                        $is_enabled = false;
                        break;
                    }
                }
            }
        }

        if (!$is_enabled) {
            // [FIX v4.0.x] Return empty array to strip rules completely (removed DISABLED marker clutter)
            return array();
        }

        $enf_config = isset($schema['enforcement']) ? $schema['enforcement'] : array();
        $rules = array();
        $mappings = isset($enf_config['mappings']) ? $enf_config['mappings'] : array();



        // 1. Iterate mappings and bind data
        // [v3.12.14] Case-Insensitive Key Match to handle sanitized (lowercase) control keys
        $data_keys = array_keys($data);
        $data_keys_lower = array_map('strtolower', $data_keys);
        $data_map = array_combine($data_keys_lower, $data);

        foreach ($mappings as $key => $directive) {
            $key_lower = strtolower($key);
            if (!empty($data_map[$key_lower])) {
                // [v1.4.0] Support for v1.1/v2.0 rich mappings (Platform Objects)
                $directive = VAPTGUARD_Enforcer::extract_code_from_mapping($directive, 'htaccess');
                if (empty($directive)) { continue;
                }

                // [ENHANCEMENT] Variable Substitution (v3.12.0)
                $directive = self::substitute_variables($directive);

                // [v3.12.4] Fix literal \n escaping
                $directive = str_replace('\n', "\n", $directive);

                // [v3.12.7] Strip VAPTBuilder RISK-XXX comments
                $directive = preg_replace('/^#\s*VAPTBuilder\s+RISK-\d+:.*$/m', '', $directive);

                // [v1.8.x] Strip # BEGIN VAPT / # END VAPT pattern library markers from injected code
                $directive = preg_replace('/^#\s*(BEGIN|END)\s+VAPT\s+\S+\s*$/mi', '', $directive);
                $directive = trim($directive);

                $processed_directive = self::prepare_directive($directive);
                $validation = self::validate_htaccess_directive($processed_directive);

                if ($validation['valid']) {
                    $rules[] = $processed_directive;
                } else {
                    error_log(
                        sprintf(
                            'VAPT: Invalid .htaccess directive rejected for feature %s (key: %s). Reason: %s',
                            $schema['feature_key'] ?? 'unknown',
                            $key,
                            $validation['reason']
                        )
                    );
                }
            }
        }

        // 2. Wrap collected rules in a marker comment for verification
        if (!empty($rules)) {
            $feature_key = isset($schema['feature_key']) ? $schema['feature_key'] : 'unknown';

            $header_block = "<IfModule mod_headers.c>\n  Header set X-VAPT-Enforced \"htaccess\"\n</IfModule>";
            $id_marker = "# {$feature_key}";

            // [FIX v3.12.14] Join marker and header with single \n to avoid blank line after marker
            $combined_header = $id_marker . "\n" . $header_block;

            // Prepend combined header
            $rules = array_merge(
                [$combined_header],
                $rules
            );
        }

        return $rules;
    }

    /**
     * 🔍 VERIFICATION LOGIC (v3.12.6 - Enhanced Debug)
     * Physically checks the .htaccess file for the feature marker.
     */
    public static function verify($key, $impl_data, $schema)
    {
        $target_key = $schema['enforcement']['target'] ?? 'root';
        $htaccess_path = ABSPATH . '.htaccess';
        if ($target_key === 'uploads') {
            $upload_dir = wp_upload_dir();
            $htaccess_path = $upload_dir['basedir'] . '/.htaccess';
        }

        error_log("VAPT VERIFY: Checking for feature '$key' in $htaccess_path");

        if (!file_exists($htaccess_path)) {
            error_log("VAPT VERIFY: File does not exist: $htaccess_path");
            return false;
        }

        $content = file_get_contents($htaccess_path);
        $search_string = $key;
        $found = (strpos($content, $search_string) !== false);

        error_log("VAPT VERIFY: Looking for ID '$search_string' - " . ($found ? 'FOUND' : 'NOT FOUND'));

        // Look for the specific feature hash within our VAPT block
        return $found;
    }

    /**
     * Writes a complete batch of .htaccess rules, replacing the previous VAPT block.
     *
     * @param  array  $rules  Flat array of all .htaccess rules to write
     * @param  string $target 'root' or 'uploads'
     * @return bool Success status
     */
    public static function write_batch($rules, $target = 'root')
    {
        $all_rules_array = $rules;
        $target_key = $target;
        $log = "[Htaccess Batch Write " . date('Y-m-d H:i:s') . "] Writing " . count($all_rules_array) . " rules.\n";

        $htaccess_path = ABSPATH . '.htaccess';
        if ($target_key === 'root') {
            // [FIX v3.13.23] Use get_home_path if available for accurate Apache root detection
            if (function_exists('get_home_path')) {
                $htaccess_path = get_home_path() . '.htaccess';
            } else {
                $htaccess_path = ABSPATH . '.htaccess';
            }
        } elseif ($target_key === 'uploads') {
            $upload_dir = wp_upload_dir();
            $htaccess_path = $upload_dir['basedir'] . '/.htaccess';
        }

        // Ensure directory exists
        $dir = dirname($htaccess_path);
        if (!is_dir($dir)) {
            wp_mkdir_p($dir);
        }

        // Read existing content
        $content = "";
        if (file_exists($htaccess_path)) {
            $content = file_get_contents($htaccess_path);
        }

        // Prepare new VAPT block
        $start_marker = "# BEGIN VAPT SECURITY RULES";
        $end_marker = "# END VAPT SECURITY RULES";
        $rules_string = "";

        if (!empty($all_rules_array)) {
            $has_rewrite = false;
            foreach ($all_rules_array as $rule) {
                if (stripos($rule, 'RewriteCond') !== false || stripos($rule, 'RewriteRule') !== false || stripos($rule, 'RewriteEngine') !== false) {
                    $has_rewrite = true;
                    break;
                }
            }

            $header = $start_marker . "\n";
            // [FIX v3.12.14] Wrap global RewriteEngine in IfModule for safety
            if ($has_rewrite) {
                $header .= "<IfModule mod_rewrite.c>\n    RewriteEngine On\n    RewriteBase /\n</IfModule>\n";
            }
            // [FIX v3.12.14] Ensure blank line after block header
            $header .= "\n";

            // [v3.12.16] Consolidate rules before writing
            $consolidated_rules = self::consolidate_rules($all_rules_array);

            $rules_string = "\n" . $header . implode("\n\n", $consolidated_rules) . "\n" . $end_marker . "\n";
        }

        // Replace or Append
        // 1. Remove old block if exists (supporting both old/new markers)
        // [FIX v3.13.15] Robust string slicing instead of unreliable regex
        $start_marker_full = "# BEGIN VAPT SECURITY RULES";
        $end_marker_full = "# END VAPT SECURITY RULES";
        $legacy_start = "# BEGIN VAPTC SECURITY RULES";
        $legacy_end = "# END VAPTC SECURITY RULES";

        $new_content = $content;

        // [v3.13.16] Safeguard: Detect if WordPress block is present before stripping
        $had_wp_block = (strpos($content, "# BEGIN WordPress") !== false);

        // Check for new markers (Recursive Removal v4.0.1)
        while (($start_pos = strpos($new_content, $start_marker_full)) !== false && 
           ($end_pos = strpos($new_content, $end_marker_full)) !== false && 
           $end_pos > $start_pos) {
            $before = substr($new_content, 0, $start_pos);
            $after = substr($new_content, $end_pos + strlen($end_marker_full));
            $new_content = $before . $after;
        }

        // Check for legacy markers (Recursive Removal v4.0.1)
        while (($l_start_pos = strpos($new_content, $legacy_start)) !== false && 
           ($l_end_pos = strpos($new_content, $legacy_end)) !== false && 
           $l_end_pos > $l_start_pos) {
            $before = substr($new_content, 0, $l_start_pos);
            $after = substr($new_content, $l_end_pos + strlen($legacy_end));
            $new_content = $before . $after;
        }

        $new_content = trim($new_content);

        // [v3.13.16] Restore WP block if it was lost during stripping (likely due to nested markers)
        // [ENHANCEMENT v3.13.23] Proactive Self-Healing: Always restore if missing from root .htaccess to prevent 403s
        if ($target_key === 'root' && strpos($new_content, "# BEGIN WordPress") === false) {
            if ($had_wp_block) {
                error_log("VAPT: detected accidental removal of WordPress block during .htaccess strip. Restoring.");
            } else {
                error_log("VAPT: WordPress block missing from root .htaccess. Proactively restoring to prevent 403 Forbidden errors.");
            }
            $wp_default = "\n# BEGIN WordPress\n# The directives (lines) between \"BEGIN WordPress\" and \"END WordPress\" are\n# dynamically generated, and should only be modified via WordPress filters.\n# Any changes to the directives between these markers will be overwritten.\n<IfModule mod_rewrite.c>\nRewriteEngine On\nRewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]\nRewriteBase /\nRewriteRule ^index\.php$ - [L]\nRewriteCond %{REQUEST_FILENAME} !-f\nRewriteCond %{REQUEST_FILENAME} !-d\nRewriteRule . /index.php [L]\n</IfModule>\n# END WordPress\n";
            $new_content .= $wp_default;
        }

        if (!empty($rules_string)) {
            // Append or Insert
            // [FIX v3.12.23] Place VAPT Rules BEFORE WordPress Core Block
            if ($target_key === 'root') {
                if (strpos($new_content, "# BEGIN WordPress") !== false) {
                    $parts = explode("# BEGIN WordPress", $new_content, 2);
                    $new_content = trim($parts[0]) . "\n\n" . trim($rules_string) . "\n\n# BEGIN WordPress" . ($parts[1] ?? "");
                } else {
                    $new_content = trim($rules_string) . "\n\n" . $new_content;
                }
            } else {
                $new_content = trim($rules_string) . "\n\n" . $new_content;
            }
        }

        // [v3.13.28] Tidy content: Collapse redundant blank lines (ensure max 1 empty line between blocks)
        $new_content = preg_replace("/\n\s*\n(\s*\n)+/", "\n\n", $new_content);

        // Write
        if ($new_content !== $content || !file_exists($htaccess_path)) {
            // Safety Backup
            if (file_exists($htaccess_path)) {
                @copy($htaccess_path, $htaccess_path . '.bak');
            }

            $result = @file_put_contents($htaccess_path, trim($new_content) . "\n", LOCK_EX);
            if ($result !== false) {
                $log .= "Write SUCCESS: " . strlen($new_content) . " bytes written to $htaccess_path. Backup created.\n";
                delete_transient('vaptguard_active_enforcements');
            } else {
                $error = error_get_last();
                $error_msg = isset($error['message']) ? $error['message'] : 'Unknown filesystem error';
                $log .= "Write FAILURE: Could not write to $htaccess_path. Error: $error_msg. Check file permissions.\n";
                error_log("VAPT: Failed to write .htaccess to $htaccess_path. Error: $error_msg");
                set_transient('vaptguard_htaccess_write_error_' . time(), "Failed to update .htaccess file: $error_msg", 300);
                return false;
            }
        } else {
            $log .= "No changes detected. Write skipped.\n";
        }

        // Persistent Log
        $debug_file = WP_CONTENT_DIR . '/vapt-htaccess-debug.txt';
        @file_put_contents($debug_file, $log, FILE_APPEND | LOCK_EX);

        return true;
    }

    /**
     * Legacy method for single-feature enforcement.
     * Now proxies to generate + write, BUT logic warns this is partial.
     * Kept for signature compatibility.
     */
    public static function enforce($data, $schema)
    {
        // Note: Direct calling of this will overwrite the file with ONLY this feature's rules.
        // This should only be used if we are sure we want that, or during testing.
        //Ideally, we should trigger a full rebuild from Enforcer instead.
        $rules = self::generate_rules($data, $schema);
        self::write_batch($rules, isset($schema['enforcement']['target']) ? $schema['enforcement']['target'] : 'root');
    }

    /**
     * Automatically wraps directives in <IfModule> if they are not already wrapped.
     * This is a safety measure to prevent server crashes if an Apache module is missing.
     * [v3.12.6] Enhanced formatting with proper indentation and spacing
     */
    /**
     * Automatically wraps directives in <IfModule> if they are not already wrapped.
     * [v3.12.16] Enhanced formatting with 4-space indentation and expanded wrappers.
     */
    private static function prepare_directive($directive)
    {
        $directive = trim($directive);
        if (empty($directive)) { return $directive;
        }

        // [FIX v3.12.13] Only strip IfModule if it's a single, simple block.
        if (stripos($directive, '<IfModule') === 0 && substr_count(strtolower($directive), '<ifmodule') === 1) {
            if (preg_match('/^<IfModule.*?>\s*(.*?)\s*<\/IfModule>$/is', $directive, $matches)) {
                $directive = trim($matches[1]);
            }
        }

        // Never wrap <Files> or <FilesMatch> blocks — they are self-contextualizing.
        if (preg_match('/^\s*<Files(Match)?\s+/i', $directive)) {
            return $directive;
        }

        // Wrap mod_headers directives
        if (!preg_match('/<IfModule\s+mod_headers\.c>/i', $directive) && preg_match('/^\s*Header\s+/im', $directive)) {
            return "<IfModule mod_headers.c>\n    $directive\n</IfModule>";
        }

        // Wrap mod_rewrite directives
        if (!preg_match('/<IfModule\s+mod_rewrite\.c>/i', $directive) && preg_match('/^\s*(RewriteEngine|RewriteCond|RewriteRule)\s+/im', $directive)) {
            $lines = explode("\n", $directive);
            $formatted_lines = [];
            foreach ($lines as $line) {
                $trimmed = trim($line);
                if (empty($trimmed)) { continue;
                }
                $formatted_lines[] = "    " . $trimmed;
            }
            return "<IfModule mod_rewrite.c>\n" . implode("\n", $formatted_lines) . "\n</IfModule>";
        }

        // Wrap access control (mod_access_compat or mod_authz_core)
        if (!preg_match('/<IfModule\s+(mod_authz_core\.c|mod_access_compat\.c)>/i', $directive) && preg_match('/^\s*(Order|Deny|Allow|Require)\s+/im', $directive)) {
            // We'll wrap in a generic way or let consolidation handle it.
            // For now, let's wrap in mod_authz_core for modern Apache, or just mod_version if we wanted to be fancy.
            // Pragmattically, just wrapping in mod_authz_core for Require, or mod_access_compat for Order/Deny.
            if (preg_match('/^\s*Require\s+/im', $directive)) {
                return "<IfModule mod_authz_core.c>\n    $directive\n</IfModule>";
            } else {
                return "<IfModule mod_access_compat.c>\n    $directive\n</IfModule>";
            }
        }

        return $directive;
    }

    /**
     * [v3.12.16] Consolidates adjacent or similar IfModule blocks and deduplicates headers.
     */
    private static function consolidate_rules($rules)
    {
        $modules = [];
        $others = [];
        $headers = [];
        $vaptguard_ids = [];

        foreach ($rules as $rule) {
            // Extract Risk ID marker if present at the start of rule (# RISK-XXX)
            if (preg_match('/^# (RISK-\S+)/i', $rule, $id_match)) {
                if (!in_array($id_match[1], $vaptguard_ids)) {
                    $vaptguard_ids[] = $id_match[1];
                }
                // Remove the ID line from the rule for further processing
                $rule = trim(preg_replace('/^# RISK-\S+/i', '', $rule));
            }

            // [FIX v3.13.15] More robust IfModule detection to avoid mangling multi-block rules
            // Only attempt to consolidate if it's a SINGLE IfModule block
            if (substr_count(strtolower($rule), '<ifmodule') === 1 && preg_match('/^<IfModule\s+([^>]+)>\s*(.*?)\s*<\/IfModule>$/is', $rule, $matches)) {
                $module = trim($matches[1]);
                $content = trim($matches[2]);

                if ($module === 'mod_headers.c') {
                    $header_lines = explode("\n", $content);
                    foreach ($header_lines as $h_line) {
                        $h_line = trim($h_line);
                        if (empty($h_line)) { continue;
                        }
                        // Deduplicate headers
                        if (!in_array($h_line, $headers)) {
                            $headers[] = $h_line;
                        }
                    }
                } else {
                    if (!isset($modules[$module])) { $modules[$module] = [];
                    }
                    $modules[$module][] = $content;
                }
            } elseif (!empty($rule)) {
                $others[] = $rule;
            }
        }

        $final_rules = [];

        // 1. Add VAPTIDs at the top (joined to next element with only one \n)
        $ids_and_first = "";
        if (!empty($vaptguard_ids)) {
            $ids_and_first = "# " . implode(", ", $vaptguard_ids) . "\n";
        }

        // 2. Add mod_headers
        if (!empty($headers)) {
            $h_block = "<IfModule mod_headers.c>\n";
            foreach ($headers as $h) {
                $h_block .= "    " . $h . "\n";
            }
            $h_block .= "</IfModule>";

            if ($ids_and_first !== "") {
                $final_rules[] = $ids_and_first . $h_block;
                $ids_and_first = "";
            } else {
                $final_rules[] = $h_block;
            }
        }

        // 3. Add other modules
        foreach ($modules as $mod => $contents) {
            $m_block = "<IfModule $mod>\n";
            foreach ($contents as $c) {
                $lines = explode("\n", $c);
                foreach ($lines as $l) {
                    $l = trim($l);
                    if (empty($l)) { continue;
                    }
                    $m_block .= "    " . $l . "\n";
                }
                $m_block .= "\n"; // Feature gap
            }
            $m_block = trim($m_block) . "\n</IfModule>";

            if ($ids_and_first !== "") {
                $final_rules[] = $ids_and_first . $m_block;
                $ids_and_first = "";
            } else {
                $final_rules[] = $m_block;
            }
        }

        // If still have IDs (unlikely if rules existed), add them
        if ($ids_and_first !== "") {
            $final_rules[] = trim($ids_and_first);
        }

        return array_merge($final_rules, $others);
    }

    /**
     * Substitutes template variables like {{site_url}} with actual values.
     */
    private static function substitute_variables($directive)
    {
        $site_url = get_site_url();
        $home_url = get_home_url();
        $admin_url = get_admin_url();

        $replacements = [
        '{{site_url}}' => $site_url,
        '{{home_url}}' => $home_url,
        '{{admin_url}}' => $admin_url,
        '{{domain}}'   => parse_url($site_url, PHP_URL_HOST),
        ];

        return str_replace(array_keys($replacements), array_values($replacements), $directive);
    }

    private static function validate_htaccess_directive($directive)
    {
        if (empty($directive) || !is_string($directive)) {
            return ['valid' => false, 'reason' => 'Directive must be a non-empty string'];
        }

        foreach (self::$dangerous_patterns as $pattern) {
            if (preg_match($pattern, $directive)) {
                return [
                'valid' => false,
                'reason' => sprintf('Contains dangerous pattern: %s', $pattern)
                ];
            }
        }

        // [FIX] Refine PHP detection to allow PHP filenames in legitimate tags (v3.12.13)
        if (preg_match('/<\?php|<\?=|<script\s+language=["\']php["\']/i', $directive)) {
            return ['valid' => false, 'reason' => 'Contains PHP-related tags'];
        }

        if (preg_match('/[<>{}]/', $directive) && !preg_match('/<(?:IfModule|Files|Directory|FilesMatch|DirectoryMatch)/i', $directive)) {
            return ['valid' => false, 'reason' => 'Contains unescaped special characters'];
        }

        if (strlen($directive) > 4096) {
            return ['valid' => false, 'reason' => 'Directive exceeds maximum length (4096 characters)'];
        }

        return ['valid' => true, 'reason' => ''];
    }

    /**
     * Cleans/removes all VAPT rules from the .htaccess file.
     *
     * @param string $target Target location ('root' or 'uploads')
     * @return bool Success status
     */
    public static function clean($target = 'root')
    {
        // Simply call write_batch with empty array to strip all VAPT rules
        return self::write_batch([], $target);
    }
}


