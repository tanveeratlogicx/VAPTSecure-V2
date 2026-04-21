<?php

/**
 * Database Helper Class for VAPTGuard Pro
 */

if (! defined('ABSPATH')) {
    exit;
}

class VAPTGUARD_DB
{
    /**
     * Normalize a status value to the canonical DB form.
     */
    public static function normalize_status($status)
    {
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
     * Normalize a status value to the canonical lookup key.
     */
    public static function normalize_status_key($status)
    {
        return strtolower(self::normalize_status($status));
    }

    /**
     * Get all feature statuses
     */
    public static function get_feature_statuses()
    {
        global $wpdb;
        $table = $wpdb->prefix . 'vaptguard_feature_status';
        $results = $wpdb->get_results("SELECT feature_key, status FROM $table", ARRAY_A);

        $statuses = array();
        if (!is_array($results)) {
            return $statuses;
        }

        foreach ($results as $row) {
            if (!is_array($row) || empty($row['feature_key'])) {
                continue;
            }

            $statuses[$row['feature_key']] = self::normalize_status($row['status'] ?? 'Draft');
        }
        return $statuses;
    }

    /**
     * Update feature status with timestamp
     */
    public static function update_feature_status($key, $status)
    {
        global $wpdb;
        $table = $wpdb->prefix . 'vaptguard_feature_status';

        $status = self::normalize_status($status);
        $data = array(
            'feature_key' => $key,
            'status'      => $status,
        );

        if ($status === 'Release') {
            $data['implemented_at'] = current_time('mysql');
        } else {
            $data['implemented_at'] = null;
        }

        return $wpdb->replace(
            $table,
            $data,
            array('%s', '%s', '%s')
        );
    }

    /**
     * Get a single feature record (status + timestamps)
     */
    public static function get_feature($key)
    {
        global $wpdb;
        $table = $wpdb->prefix . 'vaptguard_feature_status';
        return $wpdb->get_row($wpdb->prepare("SELECT * FROM $table WHERE feature_key = %s", $key), OBJECT);
    }

    /**
     * Get feature status including implemented_at
     */
    public static function get_feature_statuses_full()
    {
        global $wpdb;
        $table = $wpdb->prefix . 'vaptguard_feature_status';
        $rows = $wpdb->get_results("SELECT * FROM $table", ARRAY_A);
        foreach ($rows as &$row) {
            $row['status'] = self::normalize_status($row['status']);
        }
        return $rows;
    }

    /**
     * Get feature metadata
     */
    public static function get_feature_meta($key)
    {
        global $wpdb;
        $table = $wpdb->prefix . 'vaptguard_feature_meta';
        return $wpdb->get_row($wpdb->prepare("SELECT * FROM $table WHERE feature_key = %s", $key), ARRAY_A);
    }

    /**
     * Update feature metadata/toggles
     */
    public static function update_feature_meta($key, $data)
    {
        global $wpdb;
        $table = $wpdb->prefix . 'vaptguard_feature_meta';

        // Define Strict Column-Format Mapping (Must match DB Schema in vaptguard.php)
        $schema_map = array(
        'feature_key'                   => '%s',
        'category'                      => '%s',
        'test_method'                   => '%s',
        'verification_steps'            => '%s',
        'include_test_method'           => '%d',
        'include_verification'          => '%d',
        'include_verification_engine'   => '%d',
        'include_verification_guidance' => '%d',
        'include_manual_protocol'       => '%d',
        'include_operational_notes'     => '%d',
        'wireframe_url'                 => '%s',
        'generated_schema'              => '%s',
        'implementation_data'           => '%s',
        'dev_instruct'                  => '%s',
        'is_adaptive_deployment'        => '%d',
        'override_schema'               => '%s',
        'override_implementation_data'  => '%s',
        'is_enabled'                    => '%d',
        'is_enforced'                   => '%d',
        'active_enforcer'               => '%s'
        );

        // Filter data against actual database columns (Self-Healing)
        $existing_cols = $wpdb->get_col("DESCRIBE $table", 0);
        $final_data = array('feature_key' => $key);
        $formats = array('%s');

        foreach ($schema_map as $col => $fmt) {
            if ($col === 'feature_key') { continue;
            }
            if (isset($data[$col]) && in_array($col, $existing_cols)) {
                $final_data[$col] = $data[$col];
                $formats[] = $fmt;
            }
        }

        // Fetch existing to merge (but only for columns that exist)
        $existing = self::get_feature_meta($key);
        if ($existing) {
            foreach ($existing as $k => $v) {
                if (!isset($final_data[$k]) && in_array($k, $existing_cols)) {
                    $final_data[$k] = $v;
                    $formats[] = isset($schema_map[$k]) ? $schema_map[$k] : '%s';
                }
            }
        } else {
            // If no existing record, apply defaults for columns not provided in $data
            foreach ($schema_map as $col => $fmt) {
                if ($col === 'feature_key') { continue; // Already handled
                }
                if (!isset($final_data[$col]) && in_array($col, $existing_cols)) {
                    // Set default based on type
                    $final_data[$col] = ($fmt === '%d') ? 0 : null;
                    // Special defaults
                    if (in_array($col, ['include_verification_guidance', 'include_manual_protocol', 'include_operational_notes'])) {
                        $final_data[$col] = 1;
                    }
                }
                $formats[] = $fmt;
            }
        }

        return $wpdb->replace(
            $table,
            $final_data,
            $formats
        );
    }

    /**
     * Get all domains
     */
    public static function get_domains()
    {
        global $wpdb;
        $table = $wpdb->prefix . 'vaptguard_domains';
        return $wpdb->get_results("SELECT * FROM $table", ARRAY_A);
    }

    /**
     * Add or update domain
     */
    public static function update_domain($domain, $is_wildcard = 0, $is_enabled = 1, $id = null, $license_id = '', $license_type = 'standard', $manual_expiry_date = null, $auto_renew = 0, $renewals_count = 0, $renewal_history = null, $license_scope = 'single', $installation_limit = 1)
    {
        global $wpdb;
        $table = $wpdb->prefix . 'vaptguard_domains';

        // [SAFETY] Check if essential columns exist
        $id_col = $wpdb->get_results($wpdb->prepare("SHOW COLUMNS FROM $table LIKE %s", 'id'));
        if (empty($id_col)) {
            error_log('[VAPTGuard] "id" column missing in domains table. Attempting to add...');
            $wpdb->query("ALTER TABLE $table DROP PRIMARY KEY");
            $wpdb->query("ALTER TABLE $table ADD COLUMN id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT FIRST, ADD PRIMARY KEY (id)");
        }

        $renewal_col = $wpdb->get_results($wpdb->prepare("SHOW COLUMNS FROM $table LIKE %s", 'renewal_history'));
        if (empty($renewal_col)) {
            $wpdb->query("ALTER TABLE $table ADD COLUMN renewal_history TEXT DEFAULT NULL AFTER renewals_count");
        }

        $scope_col = $wpdb->get_results($wpdb->prepare("SHOW COLUMNS FROM $table LIKE %s", 'license_scope'));
        if (empty($scope_col)) {
            $wpdb->query("ALTER TABLE $table ADD COLUMN license_scope VARCHAR(50) DEFAULT 'single'");
        }

        $limit_col = $wpdb->get_results($wpdb->prepare("SHOW COLUMNS FROM $table LIKE %s", 'installation_limit'));
        if (empty($limit_col)) {
            $wpdb->query("ALTER TABLE $table ADD COLUMN installation_limit INT DEFAULT 1");
        }

        $domain = trim($domain);

        // Check for existing record to preserve first_activated_at
        if ($id) {
            $existing = $wpdb->get_row($wpdb->prepare("SELECT * FROM $table WHERE id = %d", $id));
        } else {
            // Case insensitive lookup for domain name
            $existing = $wpdb->get_row($wpdb->prepare("SELECT * FROM $table WHERE LOWER(domain) = LOWER(%s)", $domain));
        }

        $first_activated_at = $existing ? $existing->first_activated_at : null;

        // Only set first_activated_at if it's new and we have a license
        if (!$first_activated_at && $license_id) {
            $first_activated_at = current_time('mysql');
        }

        $data = array(
        'domain'             => $domain,
        'is_wildcard'        => $is_wildcard,
        'is_enabled'         => $is_enabled,
        'license_id'         => $license_id,
        'license_type'       => $license_type,
        'first_activated_at' => $first_activated_at,
        'manual_expiry_date' => $manual_expiry_date,
        'auto_renew'         => $auto_renew,
        'renewals_count'     => $renewals_count,
        'renewal_history'    => is_array($renewal_history) ? json_encode($renewal_history) : $renewal_history,
        'license_scope'      => $license_scope,
        'installation_limit' => intval($installation_limit),
        );

        $formats = array('%s', '%d', '%d', '%s', '%s', '%s', '%s', '%d', '%d', '%s', '%s', '%d');

        if ($existing) {
            error_log('[VAPTGuard] DB Found Existing Record (ID: ' . $existing->id . '). Updating...');
            $success = $wpdb->update($table, $data, array('id' => $existing->id), $formats, array('%d'));
            if ($success === false) {
                error_log('[VAPTGuard] DB Update Error: ' . $wpdb->last_error);
                return false;
            }
            return $existing->id;
        } else {
            error_log('[VAPTGuard] DB No Record Found. Inserting new domain: ' . $domain);
            $success = $wpdb->insert($table, $data, $formats);
            if ($success === false) {
                error_log('[VAPTGuard] DB Insert Error: ' . $wpdb->last_error);
                return false;
            }
            $new_id = $wpdb->insert_id;
            error_log('[VAPTGuard] DB Insert Success. New ID: ' . $new_id);
            return $new_id;
        }
    }

    /**
     * Record a build
     */
    public static function record_build($domain, $version, $features)
    {
        global $wpdb;
        $table = $wpdb->prefix . 'vaptguard_domain_builds';

        return $wpdb->insert(
            $table,
            array(
            'domain'    => $domain,
            'version'   => $version,
            'features'  => maybe_serialize($features),
            'timestamp' => current_time('mysql'),
            ),
            array('%s', '%s', '%s', '%s')
        );
    }

    /**
     * Get build history for a domain
     */
    public static function get_build_history($domain = '')
    {
        global $wpdb;
        $table = $wpdb->prefix . 'vaptguard_domain_builds';
        if ($domain) {
            return $wpdb->get_results($wpdb->prepare("SELECT * FROM $table WHERE domain = %s ORDER BY timestamp DESC", $domain), ARRAY_A);
        }
        return $wpdb->get_results("SELECT * FROM $table ORDER BY timestamp DESC", ARRAY_A);
    }

    /**
     * Delete a domain and its features
     */
    public static function delete_domain($domain_id)
    {
        global $wpdb;
        $wpdb->delete($wpdb->prefix . 'vaptguard_domains', array('id' => $domain_id), array('%d'));
        $wpdb->delete($wpdb->prefix . 'vaptguard_domain_features', array('domain_id' => $domain_id), array('%d'));
        return true;
    }
    /**
     * Delete multiple domains and their features
     */
    public static function batch_delete_domains($domain_ids)
    {
        global $wpdb;
        if (empty($domain_ids) || !is_array($domain_ids)) { return false;
        }

        $ids_string = implode(',', array_map('intval', $domain_ids));

        $wpdb->query("DELETE FROM {$wpdb->prefix}vaptguard_domains WHERE id IN ($ids_string)");
        $wpdb->query("DELETE FROM {$wpdb->prefix}vaptguard_domain_features WHERE domain_id IN ($ids_string)");

        return true;
    }
    /**
     * Log a security event
     */
    public static function log_security_event($feature_key, $event_type, $details = array())
    {
        global $wpdb;
        $table = $wpdb->prefix . 'vaptguard_security_events';

        return $wpdb->insert(
            $table,
            array(
            'feature_key' => $feature_key,
            'event_type'  => $event_type,
            'ip_address'  => self::get_real_ip(),
            'request_uri' => $_SERVER['REQUEST_URI'],
            'details'     => json_encode($details),
            'created_at'  => current_time('mysql'),
            ),
            array('%s', '%s', '%s', '%s', '%s', '%s')
        );
    }

    /**
     * Get recent security events
     */
    public static function get_security_events($limit = 50, $offset = 0)
    {
        global $wpdb;
        $table = $wpdb->prefix . 'vaptguard_security_events';
        return $wpdb->get_results($wpdb->prepare("SELECT * FROM $table ORDER BY created_at DESC LIMIT %d OFFSET %d", $limit, $offset), ARRAY_A);
    }

    /**
     * Get security stats summary
     */
    public static function get_security_stats_summary()
    {
        global $wpdb;
        $table = $wpdb->prefix . 'vaptguard_security_events';

        $total_blocks = $wpdb->get_var("SELECT COUNT(*) FROM $table");
        $blocks_24h = $wpdb->get_var("SELECT COUNT(*) FROM $table WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)");

        $top_risk = $wpdb->get_row("SELECT feature_key, COUNT(*) as count FROM $table GROUP BY feature_key ORDER BY count DESC LIMIT 1", ARRAY_A);

        $active_features = $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->prefix}vaptguard_feature_status WHERE status IN ('Release', 'Develop', 'Test')");

        return array(
        'total_blocks' => (int) $total_blocks,
        'blocks_24h'   => (int) $blocks_24h,
        'top_risk'     => $top_risk ? $top_risk['feature_key'] : __('None', 'vaptguard'),
        'active_enforcements' => (int) $active_features
        );
    }

    /**
     * Get global enforcement status
     */
    public static function get_global_enforcement()
    {
        return (bool) get_option('vaptguard_global_protection', 1);
    }

    /**
     * Update global enforcement status
     */
    public static function update_global_enforcement($enabled)
    {
        return update_option('vaptguard_global_protection', (int) $enabled);
    }

    /**
     * Helper to get real IP
     */
    private static function get_real_ip()
    {
        if (!empty($_SERVER['HTTP_CF_CONNECTING_IP'])) { return $_SERVER['HTTP_CF_CONNECTING_IP'];
        }
        if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
            $ips = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']);
            return trim($ips[0]);
        }
        return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    }
}


