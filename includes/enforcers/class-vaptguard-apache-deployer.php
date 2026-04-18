<?php

/**
 * VAPTGUARD_Apache_Deployer: Adaptive .htaccess Deployment
 */

if (!defined('ABSPATH')) { exit;
}

class VAPTGUARD_Apache_Deployer implements VAPTGUARD_Driver_Interface
{
    /**
     * Static wrapper for generate_rules - delegates to htaccess driver
     */
    public static function generate_rules($impl_data, $schema)
    {
        return VAPTGUARD_Htaccess_Driver::generate_rules($impl_data, $schema);
    }

    /**
     * Static wrapper for write_batch - delegates to htaccess driver
     */
    public static function write_batch($rules, $target = 'root')
    {
        return VAPTGUARD_Htaccess_Driver::write_batch($rules, $target);
    }

    /**
     * Static wrapper for clean - delegates to htaccess driver
     */
    public static function clean($target = 'root')
    {
        return VAPTGUARD_Htaccess_Driver::clean($target);
    }

    // Instance methods below...
    private $htaccess_path;

    public function __construct()
    {
        // Path resolution is now dynamic per deployment
    }

    private function resolve_target_path($target)
    {
        if ($target === 'uploads') {
            $upload_dir = wp_upload_dir();
            $this->htaccess_path = $upload_dir['basedir'] . '/.htaccess';
        } else {
            $this->htaccess_path = ABSPATH . '.htaccess';
        }
    }

    public function can_deploy()
    {
        return is_writable($this->htaccess_path) || (!file_exists($this->htaccess_path) && is_writable(ABSPATH));
    }

    public function deploy($risk_id, $implementation, $is_enabled = true)
    {
        $target = $implementation['target'] ?? 'root';
        $this->resolve_target_path($target);

        if (!$this->can_deploy()) {
            return new WP_Error('vapt_deploy_failed', sprintf('.htaccess is not writable at target: %s', $target));
        }

        $rules = trim($this->extract_rules($implementation));
        
        error_log("VAPT APACHE DEPLOYER: Extracted rules for {$risk_id}: " . strlen($rules) . " chars, enabled=" . ($is_enabled ? 'true' : 'false'));
    
        // 🛡️ SECURITY GUARD: Validate rules before writing (v4.0.1)
        $validation = $this->validate_rules($rules);
        if (is_wp_error($validation)) {
            error_log("VAPT: Rejecting deployment for $risk_id - " . $validation->get_error_message());
            return $validation;
        }
        
        // [FIX v4.0.x] Skip writing if rules are empty - prevents empty markers
        if (empty($rules)) {
            error_log("VAPT APACHE DEPLOYER: No rules extracted for {$risk_id}, skipping write");
            // Try to undeploy any existing rules for this risk_id
            $this->undeploy($risk_id, $target);
            return ['status' => 'skipped', 'platform' => 'apache_htaccess', 'reason' => 'no_rules_extracted'];
        }
    
        // If rules are empty and we are NOT enabled, it means we should undeploy
        if (empty($rules) && !$is_enabled) {
            $removed = $this->undeploy($risk_id, $target);
            return $removed ? ['status' => 'undeployed', 'platform' => 'apache_htaccess'] : new WP_Error('vapt_undeploy_failed', 'Failed to remove rules from .htaccess');
        }

        // Ensure global whitelist exists before deploying individual rules
        $this->ensure_global_whitelist();

        return $this->write_rules($risk_id, $rules, $is_enabled);
    }

    private function extract_rules($implementation)
    {
        // Try the standard format from platform_matrix
        if (isset($implementation['rules'])) {
            $rules = is_array($implementation['rules']) ? implode("\n", $implementation['rules']) : $implementation['rules'];
        } elseif (isset($implementation['code'])) {
            // 🛡️ Compatibility: Support 'code' field (v3.13.14)
            $rules = is_array($implementation['code']) ? implode("\n", $implementation['code']) : $implementation['code'];
        } elseif (class_exists('VAPTGUARD_Enforcer')) {
            // Fallback to legacy extraction logic
            $rules = VAPTGUARD_Enforcer::extract_code_from_mapping($implementation, 'htaccess');
        } else {
            $rules = '';
        }

        // [GLOBAL FIX] Defensively wrap bare Header directives in <IfModule mod_headers.c>
        // This prevents 500 Internal Server Errors when mod_headers is not loaded.
        // The pattern library should already wrap these, but this is a safety net.
        $rules = $this->ensure_ifmodule_header_wrapper($rules);

        return $rules;
    }

    /**
     * Wraps bare Apache `Header` directives in <IfModule mod_headers.c>.
     * Safe to call multiple times — skips blocks already wrapped.
     *
     * @param  string $rules Raw .htaccess rules
     * @return string        Rules with Header directives safely wrapped
     */
    private function ensure_ifmodule_header_wrapper($rules)
    {
        if (empty($rules)) {
            return $rules;
        }

        // If already wrapped, don't double-wrap
        if (stripos($rules, '<IfModule mod_headers') !== false) {
            return $rules;
        }

        // Check if any bare Header directives exist
        if (!preg_match('/^\s*Header\s+/im', $rules)) {
            return $rules;
        }

        // Split into lines and group Header directives into a single IfModule block
        $lines = explode("\n", $rules);
        $header_lines = [];
        $other_lines  = [];

        foreach ($lines as $line) {
            if (preg_match('/^\s*Header\s+/i', $line)) {
                $header_lines[] = '    ' . trim($line);
            } else {
                // Flush collected header lines before adding this non-header line
                if (!empty($header_lines)) {
                    $other_lines[] = "<IfModule mod_headers.c>";
                    foreach ($header_lines as $hl) {
                        $other_lines[] = $hl;
                    }
                    $other_lines[] = "</IfModule>";
                    $header_lines  = [];
                }
                $other_lines[] = $line;
            }
        }

        // Flush any remaining header lines
        if (!empty($header_lines)) {
            $other_lines[] = "<IfModule mod_headers.c>";
            foreach ($header_lines as $hl) {
                $other_lines[] = $hl;
            }
            $other_lines[] = "</IfModule>";
        }

        return implode("\n", $other_lines);
    }


    private function write_rules($risk_id, $rules, $is_enabled = true)
    {
        $content = file_exists($this->htaccess_path) ? file_get_contents($this->htaccess_path) : '';

        $status_suffix = $is_enabled ? ' - ACTIVE' : ' - DISABLED';
        $start_marker = "# BEGIN VAPT PROTECTION: {$risk_id}";
        $end_marker = "# END VAPT PROTECTION: {$risk_id}";

        // Handle content neutralization (comment out) if disabled
        if (!$is_enabled) {
            $lines = explode("\n", trim($rules));
            $rules = implode(
                "\n", array_map(
                    function ($l) {
                        $l = trim($l);
                        if ($l === '') { return '';
                        }
                        return '# ' . ltrim($l, '# ');
                    }, $lines
                )
            );
        }

        // Regex to match existing block with any suffix (- ACTIVE, - DISABLED or none)
        $pattern = "/" . preg_quote($start_marker, '/') . ".*?" . preg_quote($end_marker, '/') . "/s";
        $content = preg_replace($pattern, '', $content);

        // Add new block with refined markers
        $final_start_marker = $start_marker . $status_suffix;
        $new_block = "\n{$final_start_marker}\n{$rules}\n{$end_marker}\n";

        // Insert after Global Whitelist or WordPress markers
        if (strpos($content, '# END VAPT GLOBAL WHITELIST') !== false) {
            $content = str_replace('# END VAPT GLOBAL WHITELIST', "# END VAPT GLOBAL WHITELIST\n" . $new_block, $content);
        } elseif (strpos($content, '# BEGIN WordPress') !== false) {
            $content = str_replace('# BEGIN WordPress', $new_block . '# BEGIN WordPress', $content);
        } else {
            $content = $new_block . $content;
        }

        // [v3.13.28] Tidy content: Collapse redundant blank lines
        $content = preg_replace("/\n\s*\n(\s*\n)+/", "\n\n", $content);

        $result = file_put_contents($this->htaccess_path, trim($content) . "\n", LOCK_EX);

        return $result !== false ? ['status' => 'deployed', 'platform' => 'apache_htaccess'] : new WP_Error('vapt_write_error', 'Failed to write to .htaccess');
    }

    private function ensure_global_whitelist()
    {
        $content = file_exists($this->htaccess_path) ? file_get_contents($this->htaccess_path) : '';
    
        $start_marker = "# BEGIN VAPT GLOBAL WHITELIST";
        $end_marker = "# END VAPT GLOBAL WHITELIST";
    
        if (strpos($content, $start_marker) !== false) { return;
        }

        $whitelist_rules = "{$start_marker}\n<IfModule mod_rewrite.c>\n    RewriteEngine On\n    RewriteCond %{REQUEST_URI} ^/wp-admin/ [OR]\n    RewriteCond %{REQUEST_URI} ^/wp-json/wp/v2/ [OR]\n    RewriteCond %{REQUEST_URI} ^/wp-json/vaptguard/v1/ [OR]\n    RewriteCond %{REQUEST_URI} /admin-ajax\\.php$ [OR]\n    RewriteCond %{REQUEST_URI} /wp-login\\.php$\n    RewriteRule ^ - [E=VAPT_WHITELIST:1]\n</IfModule>\n{$end_marker}\n";

        if (strpos($content, '# BEGIN WordPress') !== false) {
            $content = str_replace('# BEGIN WordPress', $whitelist_rules . "\n# BEGIN WordPress", $content);
        } else {
            $content = $whitelist_rules . "\n" . $content;
        }

        // [v3.13.28] Tidy content: Collapse redundant blank lines
        $content = preg_replace("/\n\s*\n(\s*\n)+/", "\n\n", $content);

        file_put_contents($this->htaccess_path, trim($content) . "\n", LOCK_EX);
    }

    public function undeploy($risk_id, $target = 'root')
    {
        $this->resolve_target_path($target);
        if (!file_exists($this->htaccess_path)) { return true;
        }

        $content = file_get_contents($this->htaccess_path);
        $start_marker = "# BEGIN VAPT PROTECTION: {$risk_id}";
        $end_marker = "# END VAPT PROTECTION: {$risk_id}";

        // Use regex to match block regardless of suffix
        $pattern = "/" . preg_quote($start_marker, '/') . ".*?" . preg_quote($end_marker, '/') . "/s";
        $new_content = preg_replace($pattern, '', $content);

        if ($new_content !== $content) {
            return file_put_contents($this->htaccess_path, trim($new_content) . "\n", LOCK_EX);
        }

        return true;
    }

    /**
     * Validates that the rules are likely valid Apache directives and NOT PHP code.
     * 
     * @param  string $rules
     * @return bool|WP_Error
     */
    private function validate_rules($rules)
    {
        if (empty($rules)) { return true;
        }

        // Reject PHP-specific patterns
        $php_patterns = [
        '/define\s*\(/i',
        '/add_action\s*\(/i',
        '/add_filter\s*\(/i',
        '/function\s+[a-zA-Z_]+/i',
        '/<\?php/i',
        '/\$[a-zA-Z_]+[a-zA-Z0-9_]*\s*=/i', // assignments like $var = ...
        ];

        foreach ($php_patterns as $pattern) {
            if (preg_match($pattern, $rules)) {
                return new WP_Error('vapt_invalid_rules', 'Detected PHP code in .htaccess ruleset. Deployment blocked for security.');
            }
        }

        // basic check for common apache directives (whitelist approach for extra safety?)
        // For now, just blacklisting PHP is the most important fix for this issue.

        return true;
    }
}


