<?php

/**
 * VAPTGUARD_Enforcer: The Global Security Hammer
 * 
 * Acts as a generic dispatcher that routes enforcement requests to specific drivers
 * (Htaccess, Hooks, etc.) based on the feature's generated_schema.
 */

if (!defined('ABSPATH')) { exit;
}

class VAPTGUARD_Enforcer
{
    private static function normalize_status($status)
    {
        if (class_exists('VAPTGUARD_DB') && method_exists('VAPTGUARD_DB', 'normalize_status')) {
            return VAPTGUARD_DB::normalize_status($status);
        }

        $status = strtolower(trim((string) $status));
        $map = array(
            'draft'   => 'Draft',
            'develop' => 'Develop',
            'test'    => 'Test',
            'release' => 'Release',
        );

        return isset($map[$status]) ? $map[$status] : 'Draft';
    }

    private static function normalize_status_key($status)
    {
        return strtolower(self::normalize_status($status));
    }

    private static function debug_log($message)
    {
        if (defined('WP_DEBUG') && WP_DEBUG) {
            error_log($message);
        }
    }

    public static function init()
    {
        // Listen for workbench saves
        add_action('vaptguard_feature_saved', array(__CLASS__, 'dispatch_enforcement'), 10, 2);

        // Apply PHP-based hooks at runtime
        self::runtime_enforcement();
    }

    /**
     * Applies all active 'hook' based enforcements on every request
     */
    public static function runtime_enforcement()
    {
        $cache_key = 'vaptguard_active_enforcements';
        $enforced = get_transient($cache_key);

        if (false === $enforced) {
            global $wpdb;
            $table = $wpdb->prefix . 'vaptguard_feature_meta';
            $is_global = VAPTGUARD_DB::get_global_enforcement();

            if ($is_global) {
                $enforced = $wpdb->get_results(
                    "
          SELECT m.*, s.status 
          FROM $table m
          LEFT JOIN {$wpdb->prefix}vaptguard_feature_status s ON m.feature_key = s.feature_key
          WHERE s.status IN ('develop', 'release', 'test')
          AND (m.is_enforced = 1 OR m.is_enabled = 1)
        ", 'ARRAY_A'
                );
            } else {
                // [v3.13.20] Global is OFF: Total Kill Switch (Return Nothing)
                $enforced = array();
            }
            set_transient($cache_key, $enforced, HOUR_IN_SECONDS);
        }
        
        vapt_debug("Found " . count($enforced) . " enforced features in runtime enforcement");

        if (empty($enforced)) { return;
        }

        include_once VAPTGUARD_PATH . 'includes/enforcers/class-vaptguard-hook-driver.php';

        // [v3.13.27] Load external PHP functions files for php_functions enforcer
        self::load_php_functions_file();

        foreach ($enforced as $meta) {
            $feature_key = $meta['feature_key'];

            // [v2.7.0] Restricted Mode Validation
            if (!vaptguard_is_feature_allowed($feature_key)) {
                vapt_debug("Feature $feature_key skipped: Not allowed in Restricted Mode");
                continue;
            }

            $status = self::normalize_status_key(isset($meta['status']) ? $meta['status'] : 'Draft');

            // Override Logic
            $use_override_schema = in_array($status, ['test', 'release']) && !empty($meta['override_schema']);
            $raw_schema = $use_override_schema ? $meta['override_schema'] : $meta['generated_schema'];
            $schema = !empty($raw_schema) ? json_decode($raw_schema, true) : array();

            $use_override_impl = in_array($status, ['test', 'release']) && !empty($meta['override_implementation_data']);
            $raw_impl = $use_override_impl ? $meta['override_implementation_data'] : $meta['implementation_data'];
            $impl_data = !empty($raw_impl) ? json_decode($raw_impl, true) : array();

            $driver = isset($schema['enforcement']['driver']) ? $schema['enforcement']['driver'] : '';

            // [v3.13.27] Skip htaccess for PHP Functions features (use hook instead)
            if ($driver === 'htaccess' && !empty($schema['enforcement']['mappings'])) {
                $mappings = $schema['enforcement']['mappings'];
                foreach ($mappings as $key => $value) {
                    $val_to_test = is_string($value) ? $value : '';
                    if (strpos($val_to_test, 'add_action(') !== false 
                        || strpos($val_to_test, 'add_filter(') !== false 
                        || strpos($val_to_test, 'function ') !== false
                    ) {
                        vapt_debug("Skipping htaccess for $feature_key - using hook driver instead");
                        $driver = 'hook';
                        $schema['enforcement']['driver'] = 'hook';
                        break;
                    }
                }
            }

            // Hook driver is universally shared for PHP-based fallback rules
            // [v2.0.5] Include config/wp-config to ensure enforcement markers (headers) are registered
            if ($driver === 'hook' || $driver === 'universal' || $driver === 'htaccess' || $driver === 'config' || $driver === 'wp-config' || $driver === 'wp_config') {
                if (class_exists('VAPTGUARD_Hook_Driver')) {
                    VAPTGUARD_Hook_Driver::apply($impl_data, $schema, $meta['feature_key']);
                }
            }
        }
    }

    /**
     * [v3.13.27] Load external PHP functions file if it exists
     * Handles php_functions enforcer which writes to external files
     */
    private static function load_php_functions_file()
    {
        // Check for local bundled version
        $bundled_path = VAPTGUARD_PATH . 'vapt-functions.php';
        if (file_exists($bundled_path)) {
            include_once $bundled_path;
            vapt_debug("Loaded bundled vapt-functions.php");
        }
    }

    /**
     * Entry point for enforcement after a feature is saved.
     * Always triggers a rebuild so toggling OFF also removes rules from config files.
     */
    public static function dispatch_enforcement($key, $data)
    {
        // Clear runtime cache so changes apply instantly
        delete_transient('vaptguard_active_enforcements');

        $meta = VAPTGUARD_DB::get_feature_meta($key);
        if (!$meta) { 
            self::debug_log("VAPT ENFORCER: No meta found for {$key}, skipping dispatch");
            return;
        }
        
        self::debug_log("VAPT ENFORCER: Dispatching enforcement for {$key}, is_enabled={$meta['is_enabled']}, is_enforced={$meta['is_enforced']}, is_adaptive={$meta['is_adaptive_deployment']}");

        // Fetch Status for Context
        global $wpdb;
        $status_row = $wpdb->get_row($wpdb->prepare("SELECT status FROM {$wpdb->prefix}vaptguard_feature_status WHERE feature_key = %s", $key));
        $status = self::normalize_status_key($status_row ? $status_row->status : 'Draft');
        $meta['status'] = $status;

        // Override Logic
        $use_override_schema = in_array($status, ['test', 'release']) && !empty($meta['override_schema']);
        $raw_schema = $use_override_schema ? $meta['override_schema'] : $meta['generated_schema'];
        $schema = !empty($raw_schema) ? json_decode($raw_schema, true) : array();
        
        self::debug_log("VAPT ENFORCER: Schema has enforcement=" . (isset($schema['enforcement']) ? 'YES' : 'NO') . ", driver=" . ($schema['enforcement']['driver'] ?? 'none'));

        // [FIX v1.4.0] Always rebuild even if this feature has no enforcement block.
        // This ensures that toggling OFF removes previously written rules from config files.
        if (empty($schema['enforcement'])) {
            self::debug_log("VAPT ENFORCER: No enforcement block, rebuilding all config files for {$key}");
            $server = isset($_SERVER['SERVER_SOFTWARE']) ? strtolower($_SERVER['SERVER_SOFTWARE']) : '';
            if (strpos($server, 'nginx') !== false) {
                self::rebuild_nginx();
            } else {
                self::rebuild_htaccess();
            }
            self::rebuild_config();
            self::rebuild_php_functions();
            return;
        }

        // [v4.0.0] Adaptive Deployment Orchestration
        // [FIX v4.0.x] Use !== '0' instead of !empty() to handle string/int comparison properly
        $is_adaptive = $meta['is_adaptive_deployment'] ?? null;
        if ($is_adaptive !== null && $is_adaptive !== '0' && $is_adaptive !== 0 && $is_adaptive !== false) {
            include_once VAPTGUARD_PATH . 'includes/class-vaptguard-deployment-orchestrator.php';
            $orchestrator = new VAPTGUARD_Deployment_Orchestrator();

            // Resolve implementation data for toggle intelligence
            $impl_data = self::resolve_impl($meta);

            // Use profile from settings if available, else default to auto_detect
            $profile = get_option('vaptguard_deployment_profile', 'auto_detect');
            $results = $orchestrator->orchestrate($key, $schema, $profile, $impl_data);

            self::debug_log("VAPT: Adaptive Deployment for {$key} results: " . json_encode($results));
            
            // [FIX v4.0.x] After adaptive orchestration, also rebuild all targets to ensure consistency
            // This handles cases where adaptive deployment might miss certain files
            self::rebuild_all();
            return;
        }

        $driver_name = $schema['enforcement']['driver'];

        // [FIX v4.0.x] Enhanced driver dispatch with comprehensive file coverage
        // Dispatch to the correct driver based on enforcement type
        switch ($driver_name) {
            case 'htaccess':
                // UNIVERSAL FIX: Rebuild based on Server Type
                $server = isset($_SERVER['SERVER_SOFTWARE']) ? strtolower($_SERVER['SERVER_SOFTWARE']) : '';

                if (strpos($server, 'nginx') !== false) {
                    self::rebuild_nginx();
                } elseif (strpos($server, 'iis') !== false || strpos($server, 'windows') !== false) {
                    self::rebuild_iis();
                } else {
                    // Default to Apache/.htaccess
                    self::rebuild_htaccess();
                }
                self::rebuild_config();
                break;
                
            case 'nginx':
                self::rebuild_nginx();
                self::rebuild_htaccess(); // Also write PHP fallback
                break;
                
            case 'iis':
                self::rebuild_iis();
                break;
                
            case 'caddy':
                self::rebuild_caddy();
                break;
                
            case 'cloudflare':
                self::rebuild_cloudflare();
                break;
                
            case 'config':
            case 'wp_config':
            case 'wp-config':
                self::rebuild_config();
                self::rebuild_htaccess(); // Also write header fallbacks
                break;
                
            case 'hook':
            case 'php_functions':
            case 'universal':
            default:
                // [FIX v4.0.x] Hook/PHP functions should also trigger htaccess/wp-config
                // for header-based protection as fallback
                self::debug_log("VAPT ENFORCER: Driver is {$driver_name}, triggering rebuild_php_functions, rebuild_htaccess, rebuild_config");
                self::rebuild_php_functions();
                self::rebuild_htaccess();
                self::rebuild_config();
                break;
        }
        
        self::debug_log("VAPT ENFORCER: Dispatch complete for {$key}");
    }

    /**
     * Rebuilds Nginx Rules File
     */
    private static function rebuild_nginx()
    {
        include_once VAPTGUARD_PATH . 'includes/enforcers/class-vaptguard-nginx-driver.php';
        if (!class_exists('VAPTGUARD_Nginx_Driver')) { return;
        }

        $features = self::get_enforced_features();

        // [ENHANCEMENT] Filter by Active Data Files (v3.12.0)
        $active_keys = self::get_active_file_keys();
        if (!empty($active_keys)) {
            $features = array_filter(
                $features, function ($feat) use ($active_keys) {
                    // [FIX] Always allow XML-RPC regardless of key mismatch (v3.12.13)
                    if (strpos($feat['feature_key'], 'xml-rpc') !== false || strpos($feat['feature_key'], 'xmlrpc') !== false || $feat['feature_key'] === 'RISK-016-001') {
                        return true;
                    }
                    return in_array($feat['feature_key'], $active_keys);
                }
            );
        }

        $all_rules = [];

        foreach ($features as $meta) {
            $schema = self::resolve_schema($meta);
            $impl = self::resolve_impl($meta);
            $driver = $schema['enforcement']['driver'] ?? '';

            if ($driver === 'nginx' || $driver === 'htaccess' || $driver === 'universal') {
                $rules = VAPTGUARD_Nginx_Driver::generate_rules($impl, $schema);
                if ($rules && is_array($rules)) { $all_rules = array_merge($all_rules, $rules);
                }
            }
        }

        VAPTGUARD_Nginx_Driver::write_batch($all_rules);
    }

    /**
     * Rebuilds IIS Config
     */
    private static function rebuild_iis()
    {
        include_once VAPTGUARD_PATH . 'includes/enforcers/class-vaptguard-iis-driver.php';
        if (!class_exists('VAPTGUARD_IIS_Driver')) { return;
        }

        $features = self::get_enforced_features();

        // [ENHANCEMENT] Filter by Active Data Files (v3.12.0)
        $active_keys = self::get_active_file_keys();
        if (!empty($active_keys)) {
            $features = array_filter(
                $features, function ($feat) use ($active_keys) {
                    // [FIX] Always allow XML-RPC regardless of key mismatch (v3.12.13)
                    if (strpos($feat['feature_key'], 'xml-rpc') !== false || strpos($feat['feature_key'], 'xmlrpc') !== false || $feat['feature_key'] === 'RISK-016-001') {
                        return true;
                    }
                    return in_array($feat['feature_key'], $active_keys);
                }
            );
        }

        $all_rules = [];

        foreach ($features as $meta) {
            $schema = self::resolve_schema($meta);
            $impl = self::resolve_impl($meta);
            $driver = $schema['enforcement']['driver'] ?? '';

            if ($driver === 'iis' || $driver === 'htaccess' || $driver === 'universal') {
                $rules = VAPTGUARD_IIS_Driver::generate_rules($impl, $schema);
                if ($rules && is_array($rules)) { $all_rules = array_merge($all_rules, $rules);
                }
            }
        }

        VAPTGUARD_IIS_Driver::write_batch($all_rules);
    }

    /**
     * Rebuilds Caddy Rules File
     */
    private static function rebuild_caddy()
    {
        include_once VAPTGUARD_PATH . 'includes/enforcers/class-vaptguard-caddy-driver.php';
        if (!class_exists('VAPTGUARD_Caddy_Driver')) { return;
        }

        $features = self::get_enforced_features();

        // [ENHANCEMENT] Filter by Active Data Files (v3.12.0)
        $active_keys = self::get_active_file_keys();
        if (!empty($active_keys)) {
            $features = array_filter(
                $features, function ($feat) use ($active_keys) {
                    // [FIX] Always allow XML-RPC regardless of key mismatch (v3.12.13)
                    if (strpos($feat['feature_key'], 'xml-rpc') !== false || strpos($feat['feature_key'], 'xmlrpc') !== false || $feat['feature_key'] === 'RISK-016-001') {
                        return true;
                    }
                    return in_array($feat['feature_key'], $active_keys);
                }
            );
        }

        $all_rules = [];

        foreach ($features as $meta) {
            $schema = self::resolve_schema($meta);
            $impl = self::resolve_impl($meta);
            $driver = $schema['enforcement']['driver'] ?? '';

            if ($driver === 'caddy' || $driver === 'htaccess' || $driver === 'universal') {
                $rules = VAPTGUARD_Caddy_Driver::generate_rules($impl, $schema);
                if ($rules && is_array($rules)) { $all_rules = array_merge($all_rules, $rules);
                }
            }
        }

        VAPTGUARD_Caddy_Driver::write_batch($all_rules);
    }

    /**
     * Rebuilds Cloudflare (Interface/API Meta)
     */
    private static function rebuild_cloudflare()
    {
        // Cloudflare enforcement is currently informational/manual via the dashboard instructions.
        // In future versions, this would trigger an API sync.
        self::debug_log('VAPT: Cloudflare rebuild triggered (Informational - Manual Action required in Dashboard)');
    }

    // Helper to fetch enforced features (DRY)
    private static function get_enforced_features()
    {
        global $wpdb;
        $table = $wpdb->prefix . 'vaptguard_feature_meta';
        $is_global = VAPTGUARD_DB::get_global_enforcement();

        if ($is_global) {
            // [FIX v4.0.x] Check both is_enabled and is_enforced for toggle compatibility
            // is_enforced is the traditional flag, is_enabled is synced from the toggle
            $rows = $wpdb->get_results(
                "
        SELECT m.*, s.status 
        FROM $table m 
        LEFT JOIN {$wpdb->prefix}vaptguard_feature_status s ON m.feature_key = s.feature_key 
        WHERE (m.is_enforced = 1 OR m.is_enabled = 1)
      ", ARRAY_A
            );

            if (!is_array($rows)) {
                return array();
            }

            $filtered = array();
            foreach ($rows as $row) {
                $row['status'] = self::normalize_status(isset($row['status']) ? $row['status'] : 'Draft');
                if (in_array(self::normalize_status_key($row['status']), array('develop', 'test', 'release'), true)) {
                    $filtered[] = $row;
                }
            }

            return $filtered;
        } else {
            // [v3.13.20] Global is OFF: Total Kill Switch
            return array();
        }
    }

    // Helpers for Schema/Impl Resolution
    private static function resolve_schema($meta)
    {
        $status = self::normalize_status_key(isset($meta['status']) ? $meta['status'] : 'Draft');
        $raw = (in_array($status, array('test', 'release'), true) && !empty($meta['override_schema'])) ? $meta['override_schema'] : $meta['generated_schema'];
        $schema = $raw ? json_decode($raw, true) : [];

        // [v4.0.0] Adaptive Schema Resolution
        if (!isset($schema['enforcement']) || (isset($schema['enforcement']['driver']) && $schema['enforcement']['driver'] === 'hook' && empty($schema['enforcement']['mappings']))) {
            if (isset($schema['client_deployment']['enforcement'])) {
                $schema['enforcement'] = $schema['client_deployment']['enforcement'];
            }
        }

        // [v3.12.5] Inject feature key if missing
        if (!isset($schema['feature_key']) && isset($meta['feature_key'])) {
            $schema['feature_key'] = $meta['feature_key'];
        }

        return $schema;
    }

    private static function resolve_impl($meta)
    {
        $status = self::normalize_status_key(isset($meta['status']) ? $meta['status'] : 'Draft');
        $raw = (in_array($status, array('test', 'release'), true) && !empty($meta['override_implementation_data'])) ? $meta['override_implementation_data'] : $meta['implementation_data'];
        return $raw ? json_decode($raw, true) : [];
    }

    /**
     * Rebuilds .htaccess files by aggregating rules from ALL enabled features.
     */
    private static function rebuild_htaccess()
    {
        self::debug_log('VAPT: rebuild_htaccess called');
        
        include_once VAPTGUARD_PATH . 'includes/enforcers/class-vaptguard-htaccess-driver.php';
        if (!class_exists('VAPTGUARD_Htaccess_Driver')) { 
            self::debug_log('VAPT: Htaccess Driver not found, skipping rebuild');
            return;
        }

        $enforced_features = self::get_enforced_features();

        // [ENHANCEMENT] Filter by Active Data Files (v3.12.0)
        // [FIX v1.4.0] Only apply key filter when we actually have active keys - prevents
        // silently dropping all features when the active file resolves to an empty key list.
        $active_keys = self::get_active_file_keys();
        if (!empty($active_keys)) {
            $enforced_features = array_filter(
                $enforced_features, function ($feat) use ($active_keys) {
                    // [FIX] Always allow XML-RPC regardless of key mismatch (v3.12.13)
                    if (strpos($feat['feature_key'], 'xml-rpc') !== false || strpos($feat['feature_key'], 'xmlrpc') !== false || $feat['feature_key'] === 'RISK-016-001') {
                        return true;
                    }
                    return in_array($feat['feature_key'], $active_keys);
                }
            );
        }

        // Group rules by target
        $targets_rules = array(
        'root' => array(),
        'uploads' => array()
        );

        foreach ($enforced_features as $meta) {
            $schema = self::resolve_schema($meta);
            $impl_data = self::resolve_impl($meta);
            $driver = isset($schema['enforcement']['driver']) ? $schema['enforcement']['driver'] : '';
            $target = isset($schema['enforcement']['target']) ? $schema['enforcement']['target'] : 'root';

            // .htaccess
            if ($target === '.htaccess') {
                $target = 'root';
            }

            if ($driver === 'htaccess' || $driver === 'universal') {
                $feature_rules = VAPTGUARD_Htaccess_Driver::generate_rules($impl_data, $schema);
                if (!empty($feature_rules)) {
                    if (!isset($targets_rules[$target])) {
                        $targets_rules[$target] = array();
                    }
                    if (isset($targets_rules[$target]) && is_array($feature_rules)) {
                        $targets_rules[$target] = array_merge($targets_rules[$target], $feature_rules);
                    }
                }
            }
        }

        // Write batch for each target
        foreach ($targets_rules as $target => $rules) {
            VAPTGUARD_Htaccess_Driver::write_batch($rules, $target);
        }
    }

    /**
     * Rebuilds all wp-config.php rules across active features
     */
    public static function rebuild_config()
    {
        include_once VAPTGUARD_PATH . 'includes/enforcers/class-vaptguard-config-driver.php';
        if (!class_exists('VAPTGUARD_Config_Driver')) { return;
        }

        $enforced_features = self::get_enforced_features();

        // [ENHANCEMENT] Filter by Active Data Files (v3.12.0)
        // [FIX v1.4.0] Only apply key filter when we actually have active keys.
        $active_keys = self::get_active_file_keys();
        if (!empty($active_keys)) {
            $enforced_features = array_filter(
                $enforced_features, function ($feat) use ($active_keys) {
                    // [FIX] Always allow XML-RPC regardless of key mismatch (v3.12.13)
                    if (strpos($feat['feature_key'], 'xml-rpc') !== false || strpos($feat['feature_key'], 'xmlrpc') !== false || $feat['feature_key'] === 'RISK-016-001') {
                        return true;
                    }
                    return in_array($feat['feature_key'], $active_keys);
                }
            );
        }

        $all_rules = array();

        if (!empty($enforced_features)) {
            foreach ($enforced_features as $meta) {
                $schema = self::resolve_schema($meta);
                $impl_data = self::resolve_impl($meta);
                $driver = $schema['enforcement']['driver'] ?? '';

                if ($driver === 'config' || $driver === 'wp-config' || $driver === 'wp_config' || $driver === 'universal') {
                    $feature_rules = VAPTGUARD_Config_Driver::generate_rules($impl_data, $schema);
                    if (!empty($feature_rules)) {
                        $all_rules[] = "// Rule for: " . ($meta['feature_key']);
                        if (is_array($feature_rules)) {
                            $all_rules = array_merge($all_rules, $feature_rules);
                        }
                    }
                }
            }
        }

        $write_res = VAPTGUARD_Config_Driver::write_batch($all_rules);
        if ($write_res) {
            self::debug_log("VAPT: Rebuilt wp-config.php with " . count($all_rules) . " rules.");
        } else {
            self::debug_log("VAPT: Failed to rebuild wp-config.php. Check permissions.");
        }
        return $write_res;
    }

    /**
     * Rebuilds all enforcements across all active drivers
     *
     * @param bool $remove_only If true, removes all VAPT rules instead of rebuilding
     */
    public static function rebuild_all($remove_only = false)
    {
        // [v4.0.1] Always purge the enforcement cache FIRST so get_enforced_features()
        // reads fresh DB data — especially critical when called from transition_feature on reset.
        delete_transient('vaptguard_active_enforcements');
    
        if ($remove_only) {
            // Remove all VAPT rules from configuration files
            self::clean_all_config_files();
            return;
        }
    
        self::rebuild_htaccess();
        self::rebuild_config();
        self::rebuild_nginx();
        self::rebuild_iis();
        self::rebuild_caddy();
        self::rebuild_php_functions();
        delete_transient('vaptguard_active_enforcements');
    }
    
    /**
     * Clean all configuration files of VAPT rules
     * Used when license expires or when removing protections
     * 
     * Delegates to the shared Config Cleaner utility to avoid code duplication
     * with the License Manager.
     * 
     * @return array Results of cleaning operations
     */
    public static function clean_all_config_files()
    {
        // Use shared Config Cleaner if available
        if (class_exists('VAPTGUARD_Config_Cleaner')) {
            return VAPTGUARD_Config_Cleaner::clean_all();
        }
        
        // Fallback: perform basic cleaning inline
        return self::legacy_clean_all_config_files();
    }
    
    /**
     * Legacy config cleaning implementation (fallback)
     * Kept for backward compatibility if Config Cleaner is not loaded
     * 
     * @return array Results of cleaning operations
     */
    private static function legacy_clean_all_config_files()
    {
        $results = array();
        
        // Clean .htaccess
        $htaccess = ABSPATH . '.htaccess';
        if (file_exists($htaccess) && is_writable($htaccess)) {
            $content = file_get_contents($htaccess);
            $content = preg_replace('/# BEGIN VAPTGuard[^\n]*\n.*?# END VAPTGuard[^\n]*/s', '', $content);
            $content = preg_replace('/# BEGIN VAPTGuard-RISK[^\n]*\n.*?# END VAPTGuard-RISK[^\n]*/s', '', $content);
            $content = preg_replace('/\n{3,}/', "\n\n", $content);
            $results['htaccess'] = (bool) file_put_contents($htaccess, $content);
        } else {
            $results['htaccess'] = !file_exists($htaccess);
        }
    
        // Clean wp-config.php
        $wp_config = ABSPATH . 'wp-config.php';
        if (file_exists($wp_config) && is_writable($wp_config)) {
            $content = file_get_contents($wp_config);
            $content = preg_replace('/\/\/ BEGIN VAPT[^\n]*\n.*?\/\/ END VAPTGuard[^\n]*/s', '', $content);
            $content = preg_replace('/\/\* BEGIN VAPT[^\n]*\*\/.*?\/\* END VAPTGuard[^\n]*\*\//s', '', $content);
            $content = preg_replace('/\n{3,}/', "\n\n", $content);
            $results['wp_config'] = (bool) file_put_contents($wp_config, $content);
        } else {
            $results['wp_config'] = !file_exists($wp_config);
        }
    
        // Clean vapt-functions.php
        $vapt_func = VAPTGUARD_PATH . 'vapt-functions.php';
        if (file_exists($vapt_func) && is_writable($vapt_func)) {
            $content = "<?php\n\n/**\n * VAPT Secure Functions\n * License Expired - Functions Disabled\n */\n\nif (!defined('ABSPATH')) { exit; }\n\n";
            $results['php_functions'] = (bool) file_put_contents($vapt_func, $content);
        } else {
            $results['php_functions'] = !file_exists($vapt_func);
        }
    
        // Clean nginx.conf if exists
        $nginx_conf = ABSPATH . 'nginx.conf';
        if (file_exists($nginx_conf) && is_writable($nginx_conf)) {
            $content = file_get_contents($nginx_conf);
            $content = preg_replace('/# BEGIN VAPTGuard[^\n]*\n.*?# END VAPTGuard[^\n]*/s', '', $content);
            $results['nginx'] = (bool) file_put_contents($nginx_conf, $content);
        } else {
            $results['nginx'] = true;
        }
    
        // Clean web.config if exists (IIS)
        $web_config = ABSPATH . 'web.config';
        if (file_exists($web_config) && is_writable($web_config)) {
            $content = file_get_contents($web_config);
            $content = preg_replace('/<!-- BEGIN VAPTGuard[^\n]*-->.*?<!-- END VAPTGuard[^\n]*-->/s', '', $content);
            $results['iis'] = (bool) file_put_contents($web_config, $content);
        } else {
            $results['iis'] = true;
        }
    
        // Clean Caddyfile if exists
        $caddyfile = ABSPATH . 'Caddyfile';
        if (file_exists($caddyfile) && is_writable($caddyfile)) {
            $content = file_get_contents($caddyfile);
            $content = preg_replace('/# BEGIN VAPTGuard[^\n]*\n.*?# END VAPTGuard[^\n]*/s', '', $content);
            $results['caddy'] = (bool) file_put_contents($caddyfile, $content);
        } else {
            $results['caddy'] = true;
        }
        
        return $results;
    }

    /**
     * [v4.0.1] Rebuilds vapt-functions.php via VAPTGUARD_PHP_Driver
     */
    public static function rebuild_php_functions()
    {
        include_once VAPTGUARD_PATH . 'includes/enforcers/class-vaptguard-php-driver.php';
        if (!class_exists('VAPTGUARD_PHP_Driver')) { return;
        }

        $enforced_features = self::get_enforced_features();
        $active_keys = self::get_active_file_keys();
    
        if (!empty($active_keys)) {
            $enforced_features = array_filter(
                $enforced_features, function ($feat) use ($active_keys) {
                    // [FIX] Always allow XML-RPC regardless of key mismatch (v3.12.13)
                    if (strpos($feat['feature_key'], 'xml-rpc') !== false || strpos($feat['feature_key'], 'xmlrpc') !== false || $feat['feature_key'] === 'RISK-016-001') {
                        return true;
                    }
                    return in_array($feat['feature_key'], $active_keys);
                }
            );
        }

        $all_rules = array();
        foreach ($enforced_features as $meta) {
            $schema = self::resolve_schema($meta);
            $impl_data = self::resolve_impl($meta);
            $driver = $schema['enforcement']['driver'] ?? '';

            if ($driver === 'php_functions' || $driver === 'hook' || $driver === 'universal') {
                $feature_rules = VAPTGUARD_PHP_Driver::generate_rules($impl_data, $schema);
                if (!empty($feature_rules) && is_array($feature_rules)) {
                    $all_rules = array_merge($all_rules, $feature_rules);
                }
            }
        }

        return VAPTGUARD_PHP_Driver::write_batch($all_rules);
    }

    /**
     * Helper to fetch all feature keys present in the currently active data files.
     */
    private static function get_active_file_keys()
    {
        $active_files_raw = defined('VAPTGUARD_ACTIVE_DATA_FILE') ? VAPTGUARD_ACTIVE_DATA_FILE : get_option('vaptguard_active_feature_file', '');
        $files = array_filter(explode(',', $active_files_raw));
        $keys = [];

        foreach ($files as $file) {
            $path = VAPTGUARD_PATH . 'data/' . sanitize_file_name(trim($file));
            if (file_exists($path)) {
                $content = file_get_contents($path);
                $data = json_decode($content, true);
                if ($data) {
                    $features = $data['risk_catalog'] ?? $data['features'] ?? $data['wordpress_vapt'] ?? $data['risk_interfaces'] ?? null;

                    if ($features && (is_array($features) || is_object($features))) {
                        foreach ($features as $k => $v) {
                            if (is_array($v) || is_object($v)) {
                                  $keys[] = $v['risk_id'] ?? $v['id'] ?? $v['key'] ?? (is_string($k) ? $k : '');
                            }
                        }
                    } else {
                        // Flat Object structure (v1.1)
                        foreach ($data as $k => $v) {
                            if (is_array($v) && (isset($v['risk_id']) || isset($v['id']) || isset($v['key']))) {
                                $keys[] = $v['risk_id'] ?? $v['id'] ?? $v['key'] ?? $k;
                            } else if (preg_match('/^RISK-\d+/', $k)) {
                                // Heuristic: If key looks like RISK-NNN, it's a feature
                                $keys[] = $k;
                            }
                        }
                    }
                }
            }
        }
        return array_unique(array_filter($keys));
    }

    /**
     * Robustly extract implementation code from a mapping.
     * Handles strings, arrays, and JSON-encoded platform objects.
     * 
     * [v1.4.0] Support for v1.2/v2.0 Schema-First Architecture Platform Objects.
     */
    public static function extract_code_from_mapping($directive, $platform = 'htaccess')
    {
        if (empty($directive)) { return '';
        }

        // If it's a JSON string, decode it first
        if (is_string($directive) && strpos(trim($directive), '{') === 0) {
            $decoded = json_decode($directive, true);
            if (json_last_error() === JSON_ERROR_NONE) {
                $directive = $decoded;
            }
        }

        if (is_array($directive)) {
            // 1. Check for specific platform keys
            $platform_keys = [
            $platform,
            '.' . ltrim($platform, '.'), // .htaccess
            str_replace('-', '_', $platform), // wp_config
            str_replace('_', '-', $platform), // wp-config
            ];

            foreach ($platform_keys as $pK) {
                if (isset($directive[$pK])) {
                    $inner = $directive[$pK];
                    return is_array($inner) ? ($inner['code'] ?? '') : $inner;
                }
            }

            // 1b. Robust Iteration (Handle leading/trailing whitespace in keys)
            foreach ($directive as $k => $v) {
                $tk = trim((string)$k);
                foreach ($platform_keys as $pK) {
                    if ($tk === $pK) {
                        return is_array($v) ? ($v['code'] ?? '') : $v;
                    }
                }
            }

            // 2. Fallback to generic 'code' field
            if (isset($directive['code'])) {
                return $directive['code'];
            }

            // 3. Fallback to first non-array element (v3.12.5 legacy)
            foreach ($directive as $v) {
                if (is_string($v) && strlen($v) > 0) { return $v;
                }
            }
        }

        return is_string($directive) ? $directive : '';
    }
}


