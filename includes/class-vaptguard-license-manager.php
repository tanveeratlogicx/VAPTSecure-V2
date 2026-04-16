<?php

/**
 * VAPTGUARD_License_Manager: Handles license validation, expiration, and restoration
 * 
 * Manages the lifecycle of domain licenses including:
 * - License validation on plugin load
 * - Graceful degradation when license expires
 * - Settings preservation using WordPress transients
 * - Automatic restoration when license is renewed
 */

if (!defined('ABSPATH')) { exit; }

class VAPTGUARD_License_Manager
{
    const CACHE_PREFIX = 'vaptguard_license_cache_';
    const GRACE_PERIOD = 1296000; // 15 days in seconds (15 * 24 * 60 * 60)
    const CACHE_DURATION = 30 * DAY_IN_SECONDS; // 30 days

    /**
     * Initialize the license manager
     */
    public static function init()
    {
        // Check license on every admin page load
        add_action('admin_init', array(__CLASS__, 'check_license_status'));
        
        // Check license on frontend (less frequently for performance)
        if (!is_admin()) {
            add_action('init', array(__CLASS__, 'check_license_status'), 5);
        }
        
        // Add admin notice for expired licenses
        add_action('admin_notices', array(__CLASS__, 'admin_notices'));
        
        // AJAX handler for manual restore
        add_action('wp_ajax_vaptguard_restore_from_cache', array(__CLASS__, 'ajax_restore_from_cache'));
    }

    /**
     * Check license status for current domain
     * 
     * @return string Status: 'valid', 'expired', 'renewed', 'invalid', 'not_found'
     */
    public static function check_license_status()
    {
        $domain = parse_url(get_site_url(), PHP_URL_HOST);
        if (empty($domain)) {
            return 'not_found';
        }

        // Check if we're in grace period (license was previously expired)
        $in_grace = get_transient(self::CACHE_PREFIX . $domain . '_grace');
        if ($in_grace) {
            // Check if license has been renewed
            $status = self::check_domain_license($domain);
            if ($status === 'valid') {
                // License renewed! Restore from cache
                self::restore_from_cache($domain);
            }
            return $status;
        }

        // Normal license check
        return self::check_domain_license($domain);
    }

    /**
     * Validate license for a specific domain
     * 
     * @param string $domain Domain name to check
     * @return string Status: 'valid', 'expired', 'invalid', 'not_found'
     */
    public static function check_domain_license($domain)
    {
        global $wpdb;
        
        $table = $wpdb->prefix . 'vaptguard_domains';
        
        // Check if domain exists
        $row = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM $table WHERE domain = %s",
            $domain
        ));

        if (!$row) {
            return 'not_found';
        }

        // Check if domain is enabled
        if (!$row->is_enabled) {
            return 'invalid';
        }

        // Check expiration date
        if (empty($row->manual_expiry_date) || $row->manual_expiry_date === '0000-00-00 00:00:00') {
            // No expiry date means perpetual license
            return 'valid';
        }

        $expiry_ts = strtotime($row->manual_expiry_date);
        $today_ts = strtotime(date('Y-m-d 00:00:00'));

        if ($expiry_ts < $today_ts) {
            // License has expired - check auto-renewal
            if ($row->auto_renew) {
                $renewed = self::auto_renew_license($domain, $row);
                if ($renewed) {
                    return 'renewed';
                }
            }
            return 'expired';
        }

        return 'valid';
    }

    /**
     * Auto-renew license if enabled
     * 
     * @param string $domain Domain name
     * @param object $domain_row Domain database row
     * @return bool True if renewal was successful
     */
    private static function auto_renew_license($domain, $domain_row)
    {
        global $wpdb;
        
        $license_type = $domain_row->license_type ?: 'standard';
        
        // Determine renewal duration based on license type
        $duration = '+30 days';
        $days = 30;
        
        if ($license_type === 'pro') {
            $duration = '+1 year';
            $days = 365;
        } elseif ($license_type === 'developer') {
            $duration = '+100 years';
            $days = 36500;
        }

        // Calculate new expiry date
        $current_expiry = strtotime($domain_row->manual_expiry_date);
        $new_expiry = strtotime($duration, $current_expiry);
        $new_expiry_date = date('Y-m-d 00:00:00', $new_expiry);

        // Update database
        $result = $wpdb->update(
            $wpdb->prefix . 'vaptguard_domains',
            array(
                'manual_expiry_date' => $new_expiry_date,
                'renewals_count' => $domain_row->renewals_count + 1
            ),
            array('domain' => $domain),
            array('%s', '%d'),
            array('%s')
        );

        if ($result !== false) {
            // Update renewal history
            $history = !empty($domain_row->renewal_history) ? json_decode($domain_row->renewal_history, true) : array();
            $history[] = array(
                'date_added' => current_time('mysql'),
                'duration_days' => $days,
                'license_type' => $license_type,
                'source' => 'auto'
            );
            
            $wpdb->update(
                $wpdb->prefix . 'vaptguard_domains',
                array('renewal_history' => json_encode($history)),
                array('domain' => $domain),
                array('%s'),
                array('%s')
            );
            
            return true;
        }

        return false;
    }

    /**
     * Handle expired license - save settings and remove protections
     * 
     * @param string $domain Domain name
     */
    public static function handle_expired_license($domain)
    {
        // Check if already handled (prevent duplicate processing)
        $already_handled = get_transient(self::CACHE_PREFIX . $domain . '_expired_handled');
        if ($already_handled) {
            return;
        }

        // 1. Save current settings to transient cache
        self::save_settings_to_cache($domain);

        // 2. Remove all protections
        self::remove_all_protections($domain);

        // 3. Set grace period flag
        set_transient(self::CACHE_PREFIX . $domain . '_grace', true, self::GRACE_PERIOD);
        
        // 4. Mark as handled to prevent duplicate processing
        set_transient(self::CACHE_PREFIX . $domain . '_expired_handled', true, self::GRACE_PERIOD);

        // 5. Log the event
        error_log(sprintf(
            '[VAPTGuard] License expired for domain %s. Settings saved to cache, protections removed.',
            $domain
        ));
    }

    /**
     * Save current settings to transient cache
     * 
     * @param string $domain Domain name
     */
    private static function save_settings_to_cache($domain)
    {
        global $wpdb;

        // Get domain ID
        $domain_id = $wpdb->get_var($wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}vaptguard_domains WHERE domain = %s",
            $domain
        ));

        if (!$domain_id) {
            return;
        }

        // Get all domain features
        $features = $wpdb->get_results($wpdb->prepare(
            "SELECT feature_key, enabled FROM {$wpdb->prefix}vaptguard_domain_features WHERE domain_id = %d",
            $domain_id
        ), ARRAY_A);

        // Get current enforcement state
        $enforcement_state = get_option('vaptguard_global_protection', 1);

        // Get all feature meta for restoration
        $feature_meta = $wpdb->get_results(
            "SELECT feature_key, is_enabled, generated_schema, implementation_data, override_schema, override_implementation_data, is_adaptive_deployment 
             FROM {$wpdb->prefix}vaptguard_feature_meta",
            ARRAY_A
        );

        // Get feature status
        $feature_status = $wpdb->get_results(
            "SELECT feature_key, status FROM {$wpdb->prefix}vaptguard_feature_status",
            ARRAY_A
        );

        // Compile cache data
        $cache_data = array(
            'features' => $features,
            'enforcement_state' => $enforcement_state,
            'feature_meta' => $feature_meta,
            'feature_status' => $feature_status,
            'saved_at' => current_time('mysql'),
            'domain' => $domain,
            'domain_id' => $domain_id
        );

        // Save to transient
        set_transient(
            self::CACHE_PREFIX . $domain . '_settings',
            $cache_data,
            self::CACHE_DURATION
        );
    }

    /**
     * Remove all VAPT protections from the site
     * 
     * @param string $domain Domain name
     */
    private static function remove_all_protections($domain)
    {
        // 1. Disable global enforcement
        update_option('vaptguard_global_protection', 0);

        // 2. Clear enforcement cache
        delete_transient('vaptguard_active_enforcements');

        // 3. Clean all configuration files using shared utility
        if (class_exists('VAPTGUARD_Config_Cleaner')) {
            VAPTGUARD_Config_Cleaner::clean_all();
        } else {
            // Fallback: Use enforcer's clean method if available
            if (class_exists('VAPTGUARD_Enforcer')) {
                VAPTGUARD_Enforcer::clean_all_config_files();
            }
        }

        // 4. Log the removal
        error_log(sprintf(
            '[VAPTGuard] All protections removed for domain %s',
            $domain
        ));
    }

    /**
     * Restore settings from cache when license is renewed
     * 
     * @param string $domain Domain name
     * @return bool True if restoration was successful
     */
    public static function restore_from_cache($domain)
    {
        $cache_key = self::CACHE_PREFIX . $domain . '_settings';
        $cached = get_transient($cache_key);

        if (!$cached) {
            error_log("[VAPTGuard] No cached settings found for domain: $domain");
            return false;
        }

        global $wpdb;

        try {
            // 1. Restore domain features
            if (!empty($cached['features'])) {
                $domain_id = $wpdb->get_var($wpdb->prepare(
                    "SELECT id FROM {$wpdb->prefix}vaptguard_domains WHERE domain = %s",
                    $domain
                ));

                if ($domain_id) {
                    foreach ($cached['features'] as $feature) {
                        $wpdb->replace(
                            $wpdb->prefix . 'vaptguard_domain_features',
                            array(
                                'domain_id' => $domain_id,
                                'feature_key' => $feature['feature_key'],
                                'enabled' => $feature['enabled']
                            ),
                            array('%d', '%s', '%d')
                        );
                    }
                }
            }

            // 2. Restore feature meta
            if (!empty($cached['feature_meta'])) {
                foreach ($cached['feature_meta'] as $meta) {
                    $wpdb->replace(
                        $wpdb->prefix . 'vaptguard_feature_meta',
                        array(
                            'feature_key' => $meta['feature_key'],
                            'is_enabled' => $meta['is_enabled'],
                            'generated_schema' => $meta['generated_schema'],
                            'implementation_data' => $meta['implementation_data'],
                            'override_schema' => $meta['override_schema'],
                            'override_implementation_data' => $meta['override_implementation_data'],
                            'is_adaptive_deployment' => $meta['is_adaptive_deployment']
                        ),
                        array('%s', '%d', '%s', '%s', '%s', '%s', '%d')
                    );
                }
            }

            // 3. Restore feature status
            if (!empty($cached['feature_status'])) {
                foreach ($cached['feature_status'] as $status) {
                    $wpdb->replace(
                        $wpdb->prefix . 'vaptguard_feature_status',
                        array(
                            'feature_key' => $status['feature_key'],
                            'status' => $status['status']
                        ),
                        array('%s', '%s')
                    );
                }
            }

            // 4. Restore enforcement state
            if (isset($cached['enforcement_state'])) {
                update_option('vaptguard_global_protection', $cached['enforcement_state']);
            }

            // 5. Rebuild protections
            delete_transient('vaptguard_active_enforcements');
            
            if (class_exists('VAPTGUARD_Enforcer')) {
                VAPTGUARD_Enforcer::rebuild_all(false);
            }

            // 6. Clear cache
            delete_transient($cache_key);
            delete_transient(self::CACHE_PREFIX . $domain . '_grace');
            delete_transient(self::CACHE_PREFIX . $domain . '_expired_handled');

            // 7. Log restoration
            error_log(sprintf(
                '[VAPTGuard] Settings restored for domain %s from cache',
                $domain
            ));

            return true;

        } catch (Exception $e) {
            error_log(sprintf(
                '[VAPTGuard] Error restoring settings for domain %s: %s',
                $domain,
                $e->getMessage()
            ));
            return false;
        }
    }

    /**
     * Display admin notices for license status
     */
    public static function admin_notices()
    {
        $domain = parse_url(get_site_url(), PHP_URL_HOST);
        if (empty($domain)) {
            return;
        }

        // Check grace period status
        $in_grace = get_transient(self::CACHE_PREFIX . $domain . '_grace');
        $expired_handled = get_transient(self::CACHE_PREFIX . $domain . '_expired_handled');

        if ($in_grace && $expired_handled) {
            // License was expired, now in grace period
            echo '<div class="notice notice-warning is-dismissible">';
            echo '<p><strong>VAPT Secure License Notice:</strong></p>';
            echo '<p>Your license has expired. All security protections have been temporarily disabled.</p>';
            echo '<p>Your settings have been saved and will be automatically restored when you renew your license.</p>';
            echo '<p><a href="' . admin_url('admin.php?page=vaptguard-domain-admin') . '">Manage Licenses</a></p>';
            echo '</div>';
        }

        // Check for cached settings available for manual restore
        $cached = get_transient(self::CACHE_PREFIX . $domain . '_settings');
        if ($cached && !empty($cached['saved_at'])) {
            echo '<div class="notice notice-info is-dismissible vapt-license-cache-notice">';
            echo '<p><strong>VAPT Secure Backup Available:</strong></p>';
            echo '<p>A backup of your settings from ' . esc_html($cached['saved_at']) . ' is available.</p>';
            echo '<p><button class="button button-primary" onclick="vaptguard_restore_cache()">Restore Settings</button></p>';
            echo '<script>
                function vaptguard_restore_cache() {
                    if (confirm("Restore settings from cache? This will re-enable all protections.")) {
                        jQuery.post(ajaxurl, {
                            action: "vaptguard_restore_from_cache",
                            domain: "' . esc_js($domain) . '",
                            nonce: "' . wp_create_nonce('vaptguard_restore_cache') . '"
                        }, function(response) {
                            if (response.success) {
                                location.reload();
                            } else {
                                alert("Failed to restore settings: " + response.data.message);
                            }
                        });
                    }
                }
            </script>';
            echo '</div>';
        }
    }

    /**
     * AJAX handler for manual restore from cache
     */
    public static function ajax_restore_from_cache()
    {
        check_ajax_referer('vaptguard_restore_cache', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error(array('message' => 'Permission denied'));
        }

        $domain = isset($_POST['domain']) ? sanitize_text_field($_POST['domain']) : '';
        
        if (empty($domain)) {
            wp_send_json_error(array('message' => 'Missing domain'));
        }

        $result = self::restore_from_cache($domain);
        
        if ($result) {
            wp_send_json_success(array('message' => 'Settings restored successfully'));
        } else {
            wp_send_json_error(array('message' => 'No cached settings found or restoration failed'));
        }
    }

    /**
     * Get license status for a domain (public method)
     * 
     * @param string $domain Domain name
     * @return array Status information
     */
    public static function get_license_info($domain)
    {
        global $wpdb;
        
        $row = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}vaptguard_domains WHERE domain = %s",
            $domain
        ));

        if (!$row) {
            return array(
                'status' => 'not_found',
                'message' => 'Domain not found in license system'
            );
        }

        $status = self::check_domain_license($domain);
        $in_grace = get_transient(self::CACHE_PREFIX . $domain . '_grace');
        $has_cache = (bool) get_transient(self::CACHE_PREFIX . $domain . '_settings');

        return array(
            'status' => $status,
            'domain' => $domain,
            'license_id' => $row->license_id,
            'license_type' => $row->license_type,
            'expiry_date' => $row->manual_expiry_date,
            'is_enabled' => (bool) $row->is_enabled,
            'auto_renew' => (bool) $row->auto_renew,
            'renewals_count' => $row->renewals_count,
            'in_grace_period' => $in_grace,
            'has_cached_settings' => $has_cache
        );
    }

    /**
     * Manually trigger license check and handle expiration
     * 
     * @return array Result of license check
     */
    public static function force_license_check()
    {
        $domain = parse_url(get_site_url(), PHP_URL_HOST);
        $status = self::check_domain_license($domain);

        if ($status === 'expired') {
            self::handle_expired_license($domain);
        }

        return array(
            'domain' => $domain,
            'status' => $status,
            'handled' => ($status === 'expired')
        );
    }

    /**
     * Clear all license-related transients for a domain
     * 
     * @param string $domain Domain name
     */
    public static function clear_cache($domain)
    {
        delete_transient(self::CACHE_PREFIX . $domain . '_settings');
        delete_transient(self::CACHE_PREFIX . $domain . '_grace');
        delete_transient(self::CACHE_PREFIX . $domain . '_expired_handled');
    }
}

// Initialize the license manager
VAPTGUARD_License_Manager::init();
