<?php

/**
 * Plugin Name: VAPTGuard Pro
 * Plugin URI: https://vaptguard.com/
 * Description: WordPress Security SaaS Platform - Dual interface security plugin with feature builder
 * Version: 1.0.4
 * Author: Tanveer H. Malik
 * Author URI: https://vaptguard.com/
 * License: GPLv2 or later
 * License URI: http://www.gnu.org/licenses/gpl-2.0.txt
 * Text Domain: vaptguard
 * Domain Path: /languages
 * Requires at least: 5.0
 * Tested up to: 6.4
 */

if (!defined('ABSPATH')) {
    exit; // Exit if accessed directly.
}

// Ensure the Composer autoloader is included if it exists.
if (file_exists(dirname(__FILE__) . '/vendor/autoload.php')) {
    include_once dirname(__FILE__) . '/vendor/autoload.php';
}

/**
 * Linter Stubs (Satisfies IDEs without WP symbols)
 */
if (false) {
    function home_url($path = '', $scheme = null)
    {
        return '';
    }
    function remove_submenu_page($menu_slug, $submenu_slug)
    {
    }
    function wp_add_inline_script($handle, $data, $position = 'after')
    {
    }
    function admin_url($path = '', $scheme = 'admin')
    {
        return '';
    }
    function rest_url($path = '', $scheme = 'rest')
    {
        return '';
    }
    function wp_create_nonce($action = -1)
    {
        return '';
    }
}

/**
 * Define Paths & Constants
 */
if (defined('VAPTGUARD_BUILD_VERSION')) {
    define('VAPTGUARD_VERSION', VAPTGUARD_BUILD_VERSION);
} else {
    define('VAPTGUARD_VERSION', '1.0.4');
}
if (! defined('VAPTGUARD_DATA_VERSION')) {
    define('VAPTGUARD_DATA_VERSION', '1.0.0');
}
if (! defined('VAPTGUARD_PATH')) {
    define('VAPTGUARD_PATH', plugin_dir_path(__FILE__));
}
if (! defined('VAPTGUARD_URL')) {
    define('VAPTGUARD_URL', plugin_dir_url(__FILE__));
}
// Default to the new adaptive catalog, with backward compatibility fallback.
$vaptguard_default_data_file = 'Updated_Feature_List_159_Adaptive.json';
if (!file_exists(VAPTGUARD_PATH . 'data/' . $vaptguard_default_data_file)
    && file_exists(VAPTGUARD_PATH . 'data/Feature-List-159-Adaptive-Updated.json')
) {
    $vaptguard_default_data_file = 'Feature-List-159-Adaptive-Updated.json';
}

if (! defined('VAPTGUARD_ACTIVE_DATA_FILE')) {
    define('VAPTGUARD_ACTIVE_DATA_FILE', get_option('vaptguard_active_feature_file', $vaptguard_default_data_file));
}

// Pattern Library Links
if (! defined('VAPTGUARD_PATTERN_LIBRARY')) {
    define('VAPTGUARD_PATTERN_LIBRARY', 'enforcer_pattern_library_v2.0.json');
}

// Backward Compatibility Aliases
if (! defined('VAPTG_VERSION')) {
    define('VAPTG_VERSION', VAPTGUARD_VERSION);
}
if (! defined('VAPTG_PATH')) {
    define('VAPTG_PATH', VAPTGUARD_PATH);
}
if (! defined('VAPTG_URL')) {
    define('VAPTG_URL', VAPTGUARD_URL);
}

include_once VAPTGUARD_PATH . 'includes/class-vaptguard-catalog-loader.php';

/**
 * Superadmin Identity
 * Returns the configured credentials for strict access control.
 *
 * Defaults are seeded on activation and can be changed later from options.
 *
 * @return array Identity credentials.
 */
function vaptguard_get_superadmin_identity()
{
    $default_user = 'tanmalik786';
    $default_email = 'tanmalik786@gmail.com';

    $user = sanitize_user((string) get_option('vaptguard_superadmin_user', $default_user), true);
    $email = sanitize_email((string) get_option('vaptguard_superadmin_email', $default_email));

    if ($user === '') {
        $user = $default_user;
    }

    if ($email === '' || !is_email($email)) {
        $email = $default_email;
    }

    return array(
        'user' => $user,
        'email' => $email
    );
}

// Set Superadmin Constants
$vaptguard_identity = vaptguard_get_superadmin_identity();
if (! defined('VAPTGUARD_SUPERADMIN_USER')) {
    define('VAPTGUARD_SUPERADMIN_USER', $vaptguard_identity['user']);
}
if (! defined('VAPTGUARD_SUPERADMIN_EMAIL')) {
    define('VAPTGUARD_SUPERADMIN_EMAIL', $vaptguard_identity['email']);
}

/**
 * Strict Superadmin Check
 * Verifies if current user matches the owner username.
 *
 * @return bool True if the current user is a superadmin.
 */
function is_vaptguard_superadmin($require_auth = false)
{
    $current_user = wp_get_current_user();
    if (!$current_user->exists()) { return false;
    }

    $identity = vaptguard_get_superadmin_identity();
    $login = strtolower($current_user->user_login);

    // Identity Check (Primary Firewall)
    // MUST match the owner username exactly.
    $is_super_identity = ($login === strtolower($identity['user']));

    if (!$is_super_identity) {
        return false;
    }

    // Authentication Check (Secondary Layer)
    // If require_auth is true, also check if the user has a valid OTP session.
    if ($require_auth && class_exists('VAPTGUARD_Auth')) {
        if (!VAPTGUARD_Auth::is_authenticated()) {
            return false;
        }
    }

    return true;
}

/**
 * Check if a feature is allowed to be used/enforced.
 * Supports Restricted Mode (defined via VAPTGUARD_RESTRICT_FEATURES).
 *
 * @param string $feature_key The feature ID/key to check.
 * @return bool True if allowed, false otherwise.
 */
function vaptguard_is_feature_allowed($feature_key)
{
    // If not in restricted mode, all features are allowed
    if (!defined('VAPTGUARD_RESTRICT_FEATURES') || !VAPTGUARD_RESTRICT_FEATURES) {
        return true;
    }

    // Check if the specific feature constant is defined (set in generated config)
    $const_name = 'VAPTGUARD_FEATURE_' . strtoupper(str_replace('-', '_', $feature_key));
    return defined($const_name) && constant($const_name) === true;
}

// Phase 1: Core includes
require_once VAPTGUARD_PATH . 'includes/debug-utils.php';
require_once VAPTGUARD_PATH . 'includes/class-vaptguard-auth.php';
require_once VAPTGUARD_PATH . 'includes/interfaces/interface-vaptguard-driver.php';
require_once VAPTGUARD_PATH . 'includes/class-vaptguard-db.php';

// Phase 2: REST API, Admin, License, Config, Environment
require_once VAPTGUARD_PATH . 'includes/rest/class-vaptguard-rest-base.php';
require_once VAPTGUARD_PATH . 'includes/class-vaptguard-config-cleaner.php';
require_once VAPTGUARD_PATH . 'includes/class-vaptguard-environment-detector.php';
require_once VAPTGUARD_PATH . 'includes/class-vaptguard-license-manager.php';
require_once VAPTGUARD_PATH . 'includes/class-vaptguard-admin.php';
require_once VAPTGUARD_PATH . 'includes/class-vaptguard-rest.php';

// Phase 3: Feature lifecycle, schema validation, and enforcement runtime
require_once VAPTGUARD_PATH . 'includes/class-vaptguard-workflow.php';
require_once VAPTGUARD_PATH . 'includes/class-vaptguard-schema-validator.php';
require_once VAPTGUARD_PATH . 'includes/class-vaptguard-deployment-orchestrator.php';
require_once VAPTGUARD_PATH . 'includes/class-vaptguard-enforcer.php';
require_once VAPTGUARD_PATH . 'includes/class-vaptguard-ai-config.php';
require_once VAPTGUARD_PATH . 'includes/class-vaptguard-ai-validator.php';

/**
 * Instantiate service objects on plugins_loaded so their constructors can hook into WP.
 */
add_action('plugins_loaded', 'vaptguard_initialize_services');

/**
 * Service initialization callback.
 */
function vaptguard_initialize_services()
{
    if (class_exists('VAPTGUARD_Auth')) {
        new VAPTGUARD_Auth();
    }
    if (class_exists('VAPTGUARD_REST')) {
        new VAPTGUARD_REST();
    }
    if (class_exists('VAPTGUARD_Admin')) {
        new VAPTGUARD_Admin();
    }
    if (class_exists('VAPTGUARD_License_Manager')) {
        VAPTGUARD_License_Manager::init();
    }
    if (class_exists('VAPTGUARD_Enforcer')) {
        VAPTGUARD_Enforcer::init();
    }
}


/**
 * Activation Hook: Initialize Database Tables
 */
register_activation_hook(__FILE__, 'vaptguard_activate_plugin');

function vaptguard_activate_plugin()
{
    global $wpdb;
    $charset_collate = $wpdb->get_charset_collate();
    include_once ABSPATH . 'wp-admin/includes/upgrade.php';
    
    // Domains Table
    $table_domains = "CREATE TABLE {$wpdb->prefix}vaptguard_domains (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        domain VARCHAR(255) NOT NULL,
        is_wildcard TINYINT(1) DEFAULT 0,
        license_id VARCHAR(100),
        license_type VARCHAR(50) DEFAULT 'standard',
        first_activated_at DATETIME DEFAULT NULL,
        manual_expiry_date DATETIME DEFAULT NULL,
        auto_renew TINYINT(1) DEFAULT 0,
        renewals_count INT DEFAULT 0,
        renewal_history TEXT DEFAULT NULL,
        is_enabled TINYINT(1) DEFAULT 1,
        license_scope VARCHAR(50) DEFAULT 'single',
        installation_limit INT DEFAULT 1,
        PRIMARY KEY  (id),
        UNIQUE KEY domain (domain)
    ) $charset_collate;";
    
    // Domain Features Table
    $table_features = "CREATE TABLE {$wpdb->prefix}vaptguard_domain_features (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        domain_id BIGINT(20) UNSIGNED NOT NULL,
        feature_key VARCHAR(100) NOT NULL,
        enabled TINYINT(1) DEFAULT 0,
        PRIMARY KEY  (id),
        KEY domain_id (domain_id)
    ) $charset_collate;";
    
    // Feature Status Table
    $table_status = "CREATE TABLE {$wpdb->prefix}vaptguard_feature_status (
        feature_key VARCHAR(100) NOT NULL,
        status ENUM('Draft', 'Develop', 'Test', 'Release') DEFAULT 'Draft',
        implemented_at DATETIME DEFAULT NULL,
        assigned_to BIGINT(20) UNSIGNED DEFAULT NULL,
        PRIMARY KEY  (feature_key)
    ) $charset_collate;";
    
    // Feature Meta Table
    $table_meta = "CREATE TABLE {$wpdb->prefix}vaptguard_feature_meta (
        feature_key VARCHAR(100) NOT NULL,
        category VARCHAR(100),
        test_method TEXT,
        verification_steps TEXT,
        include_test_method TINYINT(1) DEFAULT 0,
        include_verification TINYINT(1) DEFAULT 0,
        include_verification_engine TINYINT(1) DEFAULT 0,
        include_verification_guidance TINYINT(1) DEFAULT 1,
        include_manual_protocol TINYINT(1) DEFAULT 1,
        include_operational_notes TINYINT(1) DEFAULT 1,
        wireframe_url TEXT DEFAULT NULL,
        generated_schema LONGTEXT DEFAULT NULL,
        implementation_data LONGTEXT DEFAULT NULL,
        dev_instruct LONGTEXT DEFAULT NULL,
        is_adaptive_deployment TINYINT(1) DEFAULT 0,
        override_schema LONGTEXT DEFAULT NULL,
        override_implementation_data LONGTEXT DEFAULT NULL,
        is_enabled TINYINT(1) DEFAULT 0,
        is_enforced TINYINT(1) DEFAULT 0,
        active_enforcer VARCHAR(100) DEFAULT NULL,
        PRIMARY KEY  (feature_key)
    ) $charset_collate;";
    
    // Feature History/Audit Table
    $table_history = "CREATE TABLE {$wpdb->prefix}vaptguard_feature_history (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        feature_key VARCHAR(100) NOT NULL,
        old_status VARCHAR(50),
        new_status VARCHAR(50),
        user_id BIGINT(20) UNSIGNED,
        note TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY  (id),
        KEY feature_key (feature_key)
    ) $charset_collate;";
    
    // Build History Table
    $table_builds = "CREATE TABLE {$wpdb->prefix}vaptguard_domain_builds (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        domain VARCHAR(255) NOT NULL,
        version VARCHAR(50) NOT NULL,
        features TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY  (id),
        KEY domain (domain)
    ) $charset_collate;";
    
    // Security Events Table
    $table_security_events = "CREATE TABLE {$wpdb->prefix}vaptguard_security_events (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        feature_key VARCHAR(100) NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        ip_address VARCHAR(45) NOT NULL,
        request_uri TEXT,
        details LONGTEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY  (id),
        KEY feature_key (feature_key),
        KEY created_at (created_at)
    ) $charset_collate;";
    
    dbDelta($table_domains);
    dbDelta($table_features);
    dbDelta($table_status);
    dbDelta($table_meta);
    dbDelta($table_history);
    dbDelta($table_builds);
    dbDelta($table_security_events);
    
    // Ensure data directory exists
    if (! file_exists(VAPTGUARD_PATH . 'data')) {
        wp_mkdir_p(VAPTGUARD_PATH . 'data');
    }

    // Seed the identity that should be used for superadmin + OTP access.
    vaptguard_seed_superadmin_identity_options();

    // Send Activation Email to Superadmin (Only on fresh activation)
    $existing_version = get_option('vaptguard_version');
    if (empty($existing_version)) {
        vaptguard_send_activation_email();
    }

    // Run manual DB fix to add missing columns
    vaptguard_manual_db_fix();
    
    // Load features from JSON file in Draft state
    vaptguard_load_features_from_json();
}

/**
 * Load features from JSON file and populate database in Draft state
 */
function vaptguard_load_features_from_json()
{
    $data_file = VAPTGUARD_PATH . 'data/' . VAPTGUARD_ACTIVE_DATA_FILE;

    $loaded = VAPTGUARD_Catalog_Loader::load_json_file($data_file);
    if (empty($loaded['success'])) {
        error_log('[VAPTGuard] Failed to load feature data file: ' . $data_file . ' (' . ($loaded['error'] ?? 'unknown error') . ')');
        return;
    }

    $features_data = $loaded['data'];
    
    global $wpdb;
    $status_table = $wpdb->prefix . 'vaptguard_feature_status';
    $meta_table = $wpdb->prefix . 'vaptguard_feature_meta';
    
    $features = VAPTGUARD_Catalog_Loader::extract_feature_map($features_data);
    
    // Insert features in Draft state
    foreach ($features as $feature_key => $feature_data) {
        // Check if feature already exists
        $existing = $wpdb->get_var($wpdb->prepare(
            "SELECT feature_key FROM $status_table WHERE feature_key = %s",
            $feature_key
        ));
        
        if (!$existing) {
            // Insert into status table with Draft state
            $wpdb->insert(
                $status_table,
                array(
                    'feature_key' => $feature_key,
                    'status' => 'Draft',
                    'implemented_at' => null,
                    'assigned_to' => null
                ),
                array('%s', '%s', '%s', '%d')
            );
            
            // Insert into meta table
            $wpdb->insert(
                $meta_table,
                array(
                    'feature_key' => $feature_key,
                    'category' => $feature_data['category'],
                    'test_method' => '',
                    'verification_steps' => '',
                    'include_test_method' => 0,
                    'include_verification' => 0,
                    'include_verification_engine' => 0,
                    'include_verification_guidance' => 1,
                    'include_manual_protocol' => 1,
                    'include_operational_notes' => 1,
                    'wireframe_url' => null,
                    'generated_schema' => null,
                    'implementation_data' => null,
                    'dev_instruct' => null,
                    'is_adaptive_deployment' => 0,
                    'is_enabled' => 0,
                    'is_enforced' => 0,
                    'active_enforcer' => null
                ),
                array('%s', '%s', '%s', '%s', '%d', '%d', '%d', '%d', '%d', '%d', '%s', '%s', '%s', '%s', '%d', '%d', '%d', '%s')
            );
        }
    }
    
    $count = count($features);
    if ($count === 0) {
        error_log('[VAPTGuard] No features extracted from active catalog; verify data schema and active file setting.');
    } else {
        error_log("[VAPTGuard] Loaded $count features in Draft state");
    }
}

/**
 * Manual Database Fix / Migrations
 * Ensures new columns are added to existing tables.
 */
function vaptguard_manual_db_fix()
{
    global $wpdb;
    $table_name = $wpdb->prefix . 'vaptguard_feature_meta';

    // Check and add is_enabled if missing
    $column = $wpdb->get_results($wpdb->prepare("SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s AND COLUMN_NAME = %s", DB_NAME, $table_name, 'is_enabled'));
    if (empty($column)) {
        $wpdb->query("ALTER TABLE $table_name ADD COLUMN is_enabled TINYINT(1) DEFAULT 0");
    }

    // Check and add is_enforced if missing
    $column = $wpdb->get_results($wpdb->prepare("SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s AND COLUMN_NAME = %s", DB_NAME, $table_name, 'is_enforced'));
    if (empty($column)) {
        $wpdb->query("ALTER TABLE $table_name ADD COLUMN is_enforced TINYINT(1) DEFAULT 0");
    }

    // Check and add active_enforcer if missing
    $column = $wpdb->get_results($wpdb->prepare("SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s AND COLUMN_NAME = %s", DB_NAME, $table_name, 'active_enforcer'));
    if (empty($column)) {
        $wpdb->query("ALTER TABLE $table_name ADD COLUMN active_enforcer VARCHAR(100) DEFAULT NULL");
    }
}

/**
 * Send Activation Email
 * Notifies the superadmin when the plugin is activated on a new site.
 */
function vaptguard_send_activation_email()
{
    $identity = vaptguard_get_superadmin_identity();
    $to = $identity['email'];
    $site_name = get_bloginfo('name');
    $site_url = get_site_url();
    $admin_url = admin_url('admin.php?page=vaptguard-domain-admin');

    $subject = sprintf("[VAPTGuard] Plugin Activated on %s", $site_name);
    $message = "VAPTGuard Pro has been activated on a new site.\n\n";
    $message .= "Site Name: $site_name\n";
    $message .= "Site URL: $site_url\n";
    $message .= "Activation Date: " . current_time('mysql') . "\n";
    $message .= "Access Dashboard: $admin_url\n\n";
    $message .= "This is an automated security notification.";

    $headers = array('Content-Type: text/plain; charset=UTF-8');

    wp_mail($to, $subject, $message, $headers);
}

/**
 * Seed the configurable superadmin identity defaults.
 */
function vaptguard_seed_superadmin_identity_options()
{
    if (get_option('vaptguard_superadmin_user', null) === null) {
        update_option('vaptguard_superadmin_user', 'tanmalik786');
    }

    if (get_option('vaptguard_superadmin_email', null) === null) {
        update_option('vaptguard_superadmin_email', 'tanmalik786@gmail.com');
    }
}

/**
 * Manual DB Fix Trigger (Force Run)
 */
add_action('init', 'vaptguard_manual_db_fix');

/**
 * Auto-update DB on version change
 */
add_action('init', 'vaptguard_auto_update_db');

/**
 * Logic to run database updates if version mismatch.
 */
function vaptguard_auto_update_db()
{
    $saved_version = get_option('vaptguard_version');
    if ($saved_version !== VAPTGUARD_VERSION) {
        vaptguard_activate_plugin();
        update_option('vaptguard_version', VAPTGUARD_VERSION);
    }
}

/**
 * Detect Localhost Environment
 * Verified against standard localhost IP and hostnames.
 *
 * @return bool True if on localhost.
 */
if (! function_exists('is_vaptguard_localhost')) {
    function is_vaptguard_localhost()
    {
        $whitelist = array('127.0.0.1', '::1', 'localhost');
        $host = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : '';
        $addr = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '';
        if (in_array($addr, $whitelist) || in_array($host, $whitelist)) {
            return true;
        }
        $dev_suffixes = array('.local', '.test', '.dev', '.wp', '.site');
        foreach ($dev_suffixes as $suffix) {
            if (strpos($host, $suffix) !== false) {
                return true;
            }
        }
        return false;
    }
}

/**
 * Admin Menu Setup
 */
add_action('admin_menu', 'vaptguard_add_admin_menu');

/**
 * Check Strict Permissions
 * Terminates execution if the current user is not a superadmin.
 */
if (! function_exists('vaptguard_check_permissions')) {
    function vaptguard_check_permissions($require_auth = false)
    {
        if (! is_vaptguard_superadmin($require_auth)) {
            wp_die(__('You do not have permission to access the VAPTGuard Pro Dashboard.', 'vaptguard'));
        }
    }
}

/**
 * Registers the VAPTGuard Pro menu pages.
 */
if (! function_exists('vaptguard_add_admin_menu')) {
    function vaptguard_add_admin_menu()
    {
        $is_superadmin_identity = is_vaptguard_superadmin(false);

        // 1. Parent Menu (Visible to all admins with manage_options)
        add_menu_page(
            __('VAPTGuard Pro', 'vaptguard'),
            __('VAPTGuard Pro', 'vaptguard'),
            'manage_options',
            'vaptguard',
            'vaptguard_render_client_status_page',
            'dashicons-shield',
            80
        );

        // Superadmin Only Sub-menus
        if ($is_superadmin_identity) {
            // Sub-menu 1: Workbench
            add_submenu_page(
                'vaptguard',
                __('VAPTGuard Workbench', 'vaptguard'),
                __('VAPTGuard Workbench', 'vaptguard'),
                'manage_options',
                'vaptguard-workbench',
                'vaptguard_render_workbench_page'
            );

            // Sub-menu 2: Domain Admin
            add_submenu_page(
                'vaptguard',
                __('VAPTGuard Domain Admin', 'vaptguard'),
                __('VAPTGuard Domain Admin', 'vaptguard'),
                'manage_options',
                'vaptguard-domain-admin',
                'vaptguard_render_admin_page'
            );
        }

        // Remove the default duplicate submenu item created by WordPress
        remove_submenu_page('vaptguard', 'vaptguard');
    }
}

/**
 * Handle Legacy Slug Redirects
 */
add_action('admin_init', 'vaptguard_handle_legacy_redirects');
if (! function_exists('vaptguard_handle_legacy_redirects')) {
    function vaptguard_handle_legacy_redirects()
    {
        if (!isset($_GET['page'])) { return;
        }
        $legacy_slugs = array('vapt-secure', 'vapt-domain-admin', 'vapt-copilot', 'vapt-copilot-main', 'vapt-copilot-status', 'vapt-copilot-domain-build', 'vapt-client');
        if (in_array($_GET['page'], $legacy_slugs)) {
            $target = ($_GET['page'] === 'vapt-domain-admin') ? 'vaptguard-domain-admin' : 'vaptguard';
            wp_safe_redirect(admin_url('admin.php?page=' . $target));
            exit;
        }
    }
}

/**
 * Render Client Status Page
 */
if (! function_exists('vaptguard_render_client_status_page')) {
    function vaptguard_render_client_status_page()
    {
        ?>
    <div class="wrap">
      <h1 class="wp-heading-inline"><?php _e('VAPTGuard Pro', 'vaptguard'); ?></h1>
      <hr class="wp-header-end" />
      <div id="vapt-client-root">
        <div style="padding: 40px; text-align: center; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border-radius: 4px;">
          <p><?php _e('VAPTGuard Pro is active. Features are loaded in Draft state.', 'vaptguard'); ?></p>
          <p><?php _e('Total Features: 159', 'vaptguard'); ?></p>
          <p><?php _e('Phase 2: Core Functionality - Active', 'vaptguard'); ?></p>
        </div>
      </div>
    </div>
        <?php
    }
}

/**
 * Render Superadmin Workbench Page
 */
if (! function_exists('vaptguard_render_workbench_page')) {
    function vaptguard_render_workbench_page()
    {
        if (! is_vaptguard_superadmin(true)) {
            if (is_vaptguard_superadmin(false)) {
                $identity = vaptguard_get_superadmin_identity();
                if (! get_transient('vaptguard_otp_email_' . $identity['user'])) {
                    VAPTGUARD_Auth::send_otp();
                }
                VAPTGUARD_Auth::render_otp_form(admin_url('admin.php?page=vaptguard-workbench'));
            } else {
                wp_die(__('You do not have permission to access the VAPTGuard Pro Dashboard.', 'vaptguard'));
            }
            return;
        }
        ?>
    <div class="wrap">
      <h1 class="wp-heading-inline"><?php _e('VAPTGuard Pro Workbench', 'vaptguard'); ?></h1>
      <hr class="wp-header-end" />
      <div id="vapt-workbench-root">
        <div style="padding: 40px; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border-radius: 4px;">
          <p><?php _e('VAPTGuard Pro Workbench - Phase 2', 'vaptguard'); ?></p>
          <p><?php _e('REST API: /wp-json/vaptguard/v1/', 'vaptguard'); ?></p>
          <p><?php _e('Features can now be transitioned Draft → Develop.', 'vaptguard'); ?></p>
        </div>
      </div>
    </div>

    <!-- Transition Modal: Draft → Develop -->
    <div id="vaptguard-transition-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:99999; justify-content:center; align-items:center;">
      <div style="background:#fff; border-radius:6px; padding:30px; max-width:560px; width:90%; box-shadow:0 4px 20px rgba(0,0,0,0.3);">
        <h2 class="vaptguard-modal-title" style="margin-top:0;"><?php _e('Transition to Develop', 'vaptguard'); ?></h2>
        <p style="color:#666;"><?php _e('Provide context for development. Only the internal note is required.', 'vaptguard'); ?></p>
        <div style="margin-bottom:15px;">
          <label style="display:block; font-weight:600; margin-bottom:4px;"><?php _e('Internal Note (required)', 'vaptguard'); ?></label>
          <textarea id="vaptguard-transition-note" rows="3" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px;" placeholder="<?php _e('Describe why this feature is being moved to development...', 'vaptguard'); ?>"></textarea>
        </div>
        <div style="margin-bottom:15px;">
          <label style="display:block; font-weight:600; margin-bottom:4px;"><?php _e('Development Instructions / AI Guidance (optional)', 'vaptguard'); ?></label>
          <textarea id="vaptguard-transition-dev-instruct" rows="4" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px;" placeholder="<?php _e('AI prompt or detailed dev instructions...', 'vaptguard'); ?>"></textarea>
        </div>
        <div style="margin-bottom:20px;">
          <label style="display:block; font-weight:600; margin-bottom:4px;"><?php _e('Wireframe / Design URL (optional)', 'vaptguard'); ?></label>
          <input type="url" id="vaptguard-transition-wireframe" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px;" placeholder="https://" />
        </div>
        <div style="display:flex; gap:10px; justify-content:flex-end;">
          <button onclick="document.getElementById('vaptguard-transition-modal').style.display='none';" style="padding:8px 16px; background:#f0f0f0; border:1px solid #ccc; border-radius:4px; cursor:pointer;"><?php _e('Cancel', 'vaptguard'); ?></button>
          <button id="vaptguard-transition-confirm" style="padding:8px 20px; background:#0073aa; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:600;"><?php _e('Confirm to Develop', 'vaptguard'); ?></button>
        </div>
      </div>
    </div>
    <script>
    document.addEventListener('DOMContentLoaded', function() {
        var confirmBtn = document.getElementById('vaptguard-transition-confirm');
        if (!confirmBtn) return;
        confirmBtn.addEventListener('click', function() {
            var note = document.getElementById('vaptguard-transition-note').value.trim();
            if (!note) { alert('<?php _e('Internal note is required.', 'vaptguard'); ?>'); return; }
            if (window.VAPTGuardDesignModal) {
                var devInstruct = document.getElementById('vaptguard-transition-dev-instruct').value;
                var wireframe  = document.getElementById('vaptguard-transition-wireframe').value;
                VAPTGuardDesignModal.submit(note, devInstruct, wireframe,
                    function(r) { alert('<?php _e('Feature transitioned to Develop.', 'vaptguard'); ?>'); location.reload(); },
                    function(e) { alert('<?php _e('Error: ', 'vaptguard'); ?>' + (e.message || JSON.stringify(e))); }
                );
            }
        });
    });
    </script>
        <?php
    }
}

if (! function_exists('vaptguard_render_admin_page')) {
    function vaptguard_render_admin_page()
    {
        vaptguard_master_dashboard_page();
    }
}

if (! function_exists('vaptguard_master_dashboard_page')) {
    function vaptguard_master_dashboard_page()
    {
        // Verify Strict Identity AND Session
        if (! is_vaptguard_superadmin(true)) {
            if (is_vaptguard_superadmin(false)) {
                // Identity matches, but needs auth.
                $identity = vaptguard_get_superadmin_identity();
                if (! get_transient('vaptguard_otp_email_' . $identity['user'])) {
                    VAPTGUARD_Auth::send_otp();
                }
                VAPTGUARD_Auth::render_otp_form(admin_url('admin.php?page=vaptguard-domain-admin'));
            } else {
                // Identity DOES NOT match. Hard block.
                wp_die(__('You do not have permission to access the VAPTGuard Pro Dashboard.', 'vaptguard'));
            }
            return;
        }
        ?>
    <div id="vapt-admin-root" class="wrap">
      <h1><?php _e('VAPTGuard Pro Domain Admin', 'vaptguard'); ?></h1>
      <div style="padding: 20px; text-align: center;">
        <span class="spinner is-active" style="float: none; margin: 0 auto;"></span>
        <p><?php _e('Loading VAPTGuard...', 'vaptguard'); ?></p>
      </div>
    </div>
        <?php
    }
}

/**
 * Enqueue Assets for React App
 */
add_action('admin_enqueue_scripts', 'vaptguard_enqueue_admin_assets');

function vaptguard_enqueue_admin_assets($hook)
{
    $screen = get_current_screen();
    $is_superadmin = is_vaptguard_superadmin();
    if (!$screen) { return;
    }
    
    // Enqueue Shared Styles
    wp_enqueue_style('vaptguard-admin-css', VAPTGUARD_URL . 'assets/css/admin.css', array('wp-components'), VAPTGUARD_VERSION);

    // 1. Superadmin Dashboard (admin.js)
    if ($screen->id === 'toplevel_page_vaptguard-domain-admin' || $screen->id === 'vaptguard_page_vaptguard-domain-admin' || strpos($screen->id, 'vaptguard-domain-admin') !== false) {
        // Enqueue Auto-Interface Generator (Module)
        wp_enqueue_script(
            'vaptguard-interface-generator',
            VAPTGUARD_URL . 'assets/js/modules/interface-generator.js',
            array(),
            VAPTGUARD_VERSION,
            true
        );
        // Enqueue Generated Interface UI Component
        wp_enqueue_script(
            'vaptguard-generated-interface-ui',
            VAPTGUARD_URL . 'assets/js/modules/generated-interface.js',
            array('wp-element', 'wp-components', 'wp-i18n'),
            VAPTGUARD_VERSION,
            true
        );
        // Enqueue Admin Dashboard Script
        wp_enqueue_script(
            'vaptguard-admin-js',
            VAPTGUARD_URL . 'assets/js/admin.js',
            array('wp-element', 'wp-components', 'wp-api-fetch', 'wp-i18n', 'vaptguard-interface-generator', 'vaptguard-generated-interface-ui'),
            VAPTGUARD_VERSION,
            true
        );
    }

    // 2. Client Status Page (client.js)
    if ($screen->id === 'toplevel_page_vaptguard') {
        wp_enqueue_script(
            'vaptguard-client-js',
            VAPTGUARD_URL . 'assets/js/client.js',
            array('wp-element', 'wp-components', 'wp-api-fetch', 'wp-i18n'),
            VAPTGUARD_VERSION,
            true
        );
    }

    // 3. Workbench Page (workbench.js)
    if ($screen->id === 'vaptguard_page_vaptguard-workbench' || strpos($screen->id, 'vaptguard-workbench') !== false) {
        wp_enqueue_script(
            'vaptguard-interface-generator',
            VAPTGUARD_URL . 'assets/js/modules/interface-generator.js',
            array(),
            VAPTGUARD_VERSION,
            true
        );
        wp_enqueue_script(
            'vaptguard-generated-interface-ui',
            VAPTGUARD_URL . 'assets/js/modules/generated-interface.js',
            array('wp-element', 'wp-components', 'wp-i18n'),
            VAPTGUARD_VERSION,
            true
        );
        wp_enqueue_script(
            'vaptguard-workbench-js',
            VAPTGUARD_URL . 'assets/js/workbench.js',
            array('wp-element', 'wp-components', 'wp-api-fetch', 'wp-i18n', 'vaptguard-interface-generator', 'vaptguard-generated-interface-ui'),
            VAPTGUARD_VERSION,
            true
        );
    }

    // Common Settings Localization
    $vapt_settings = array(
        'isSuper' => $is_superadmin,
        'pluginVersion' => VAPTGUARD_VERSION,
        'pluginName' => 'VAPTGuard Pro',
        'currentDomain' => parse_url(home_url(), PHP_URL_HOST),
        'abspath' => ABSPATH,
        'pluginPath' => VAPTGUARD_PATH,
        'uploadPath' => wp_upload_dir()['basedir'],
        'root' => esc_url_raw(rest_url()),
        'nonce' => wp_create_nonce('wp_rest'),
        'domainLocked' => defined('VAPTGUARD_DOMAIN_LOCKED') ? VAPTGUARD_DOMAIN_LOCKED : false,
        'buildVersion' => VAPTGUARD_VERSION,
        'activeData' => VAPTGUARD_ACTIVE_DATA_FILE
    );

    // Localize settings for all VAPTGuard pages
    if (in_array($screen->id, array(
        'toplevel_page_vaptguard',
        'toplevel_page_vaptguard-domain-admin',
        'vaptguard_page_vaptguard-workbench',
        'vaptguard_page_vaptguard-domain-admin'
    )) || strpos($screen->id, 'vaptguard') !== false) {
        wp_localize_script('vaptguard-admin-js', 'vaptguardSettings', $vapt_settings);
    }
}
?>
