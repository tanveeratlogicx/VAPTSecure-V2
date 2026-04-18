<?php

/**
 * VAPTGUARD_Nginx_Deployer: Adaptive Nginx Deployment
 */

if (!defined('ABSPATH')) { exit;
}

class VAPTGUARD_Nginx_Deployer implements VAPTGUARD_Driver_Interface
{
    /**
     * Static wrapper for generate_rules - delegates to nginx driver
     */
    public static function generate_rules($impl_data, $schema)
    {
        return VAPTGUARD_Nginx_Driver::generate_rules($impl_data, $schema);
    }

    /**
     * Static wrapper for write_batch - delegates to nginx driver
     */
    public static function write_batch($rules, $target = 'root')
    {
        return VAPTGUARD_Nginx_Driver::write_batch($rules);
    }

    /**
     * Static wrapper for clean - delegates to nginx driver
     */
    public static function clean($target = 'root')
    {
        $upload_dir = wp_upload_dir();
        $file_path = $upload_dir['basedir'] . '/vapt-nginx-rules.conf';
        if (file_exists($file_path)) {
            return @unlink($file_path);
        }
        return true;
    }

    // Instance methods below...
    private $nginx_rules_path;

    public function __construct()
    {
        // v4.0 standard: Nginx rules go to a dedicated file meant for manual include
        $this->nginx_rules_path = VAPTGUARD_PATH . 'data/vapt-nginx-protection.conf';
    }

    public function can_deploy()
    {
        // Check if directory is writable for rule generation
        $dir = dirname($this->nginx_rules_path);
        return is_writable($dir);
    }

    public function deploy($risk_id, $implementation, $is_enabled = true)
    {
        if (!$this->can_deploy()) {
            return new WP_Error('vapt_deploy_failed', 'Nginx rules directory is not writable.');
        }

        $rules = $this->extract_rules($implementation);
        if (empty($rules)) {
            return new WP_Error('vapt_no_rules', 'No Nginx rules found in implementation.');
        }

        // Ensure global whitelist variable is defined
        $this->ensure_global_config();

        return $this->update_rules_file($risk_id, $rules, $is_enabled);
    }

    private function extract_rules($implementation)
    {
        if (isset($implementation['nginx'])) {
            $inner = $implementation['nginx'];
            return is_array($inner) ? ($inner['code'] ?? '') : $inner;
        }

        if (class_exists('VAPTGUARD_Enforcer')) {
            return VAPTGUARD_Enforcer::extract_code_from_mapping($implementation, 'nginx');
        }

        return '';
    }

    private function update_rules_file($risk_id, $rules, $is_enabled = true)
    {
        $content = file_exists($this->nginx_rules_path) ? file_get_contents($this->nginx_rules_path) : "# VAPT Nginx Protections - Generated at " . date('Y-m-d H:i:s') . "\n";

        $status_suffix = $is_enabled ? ' - ACTIVE' : ' - DISABLED';
        $start_marker = "# BEGIN VAPT PROTECTION: {$risk_id}";
        $end_marker = "# END VAPT PROTECTION: {$risk_id}";

        // Handle content neutralization if disabled
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

        // Regex to match existing block with any suffix
        $pattern = "/" . preg_quote($start_marker, '/') . ".*?" . preg_quote($end_marker, '/') . "/s";
        $content = preg_replace($pattern, '', $content);

        // Add new block
        $final_start_marker = $start_marker . $status_suffix;
        $new_block = "\n{$final_start_marker}\n{$rules}\n{$end_marker}\n";
        $content .= $new_block;

        $result = file_put_contents($this->nginx_rules_path, trim($content) . "\n", LOCK_EX);

        return $result !== false ? ['status' => 'deployed', 'platform' => 'nginx_config', 'file' => $this->nginx_rules_path] : new WP_Error('vapt_write_error', 'Failed to write Nginx rules file.');
    }

    private function ensure_global_config()
    {
        $content = file_exists($this->nginx_rules_path) ? file_get_contents($this->nginx_rules_path) : "";
    
        $start_marker = "# BEGIN VAPT GLOBAL WHITELIST";
        $end_marker = "# END VAPT GLOBAL WHITELIST";
    
        if (strpos($content, $start_marker) !== false) { return;
        }

        $global_config = "{$start_marker}\n# Centralized whitelisting variable\nset \$vapt_whitelist 0;\nif (\$request_uri ~* \"^/wp-admin/|/wp-json/wp/v2/|/wp-json/vaptguard/v1/|/admin-ajax\\.php$|/wp-login\\.php$\") {\n    set \$vapt_whitelist 1;\n}\n{$end_marker}\n";

        $content = $global_config . "\n" . $content;
        file_put_contents($this->nginx_rules_path, trim($content) . "\n", LOCK_EX);
    }

    public function undeploy($risk_id)
    {
        if (!file_exists($this->nginx_rules_path)) { return true;
        }

        $content = file_get_contents($this->nginx_rules_path);
        $start_marker = "# BEGIN VAPT PROTECTION: {$risk_id}";
        $end_marker = "# END VAPT PROTECTION: {$risk_id}";

        $pattern = "/" . preg_quote($start_marker, '/') . ".*?" . preg_quote($end_marker, '/') . "/s";
        $new_content = preg_replace($pattern, '', $content);

        if ($new_content !== $content) {
            return file_put_contents($this->nginx_rules_path, trim($new_content) . "\n", LOCK_EX);
        }

        return true;
    }
}


