<?php
/**
 * VAPTGUARD Migrations
 *
 * Versioned database migration system for VAPT Secure plugin.
 * Consolidates scattered ALTER TABLE statements into ordered, idempotent migrations.
 *
 * @package VAPT-Secure
 * @since 2.6.2
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Class VAPTGUARD_Migrations
 */
class VAPTGUARD_Migrations
{
    /**
     * @var string Migration tracking table name
     */
    private static $migration_table = 'vaptguard_migrations';

    /**
     * Initialize the migration system.
     *
     * Creates the migration tracking table if it doesn't exist.
     */
    public static function init()
    {
        global $wpdb;
        $table_name = $wpdb->prefix . self::$migration_table;
        $charset_collate = $wpdb->get_charset_collate();

        $sql = "CREATE TABLE IF NOT EXISTS {$table_name} (
            migration_id VARCHAR(100) NOT NULL,
            applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (migration_id)
        ) {$charset_collate};";

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        dbDelta($sql);
    }

    /**
     * Run all pending migrations.
     *
     * Executes migrations in order, skipping already applied ones.
     *
     * @return array Results of migration execution
     */
    public static function run_all()
    {
        self::init();
        $pending = self::get_pending_migrations();
        $results = [];

        foreach ($pending as $migration) {
            $result = self::run_migration($migration);
            $results[$migration] = $result;
        }

        return $results;
    }

    /**
     * Get list of all defined migrations.
     *
     * @return array Migration IDs in execution order
     */
    private static function get_defined_migrations()
    {
        return [
            '001_create_domains_table',
            '002_create_domain_features_table',
            '003_create_feature_status_table',
            '004_create_feature_meta_table',
            '005_create_feature_history_table',
            '006_create_domain_builds_table',
            '007_create_security_events_table',
            '008_add_is_enabled_to_feature_meta',
            '009_add_is_enforced_to_feature_meta',
            '010_add_active_enforcer_to_feature_meta',
            '011_add_wireframe_url_to_feature_meta',
            '012_add_generated_schema_to_feature_meta',
            '013_add_implementation_data_to_feature_meta',
            '014_add_dev_instruct_to_feature_meta',
            '015_add_is_adaptive_deployment_to_feature_meta',
            '016_add_override_schema_to_feature_meta',
            '017_add_override_impl_data_to_feature_meta',
            '018_add_manual_expiry_to_domains',
            '019_add_assigned_to_to_feature_status',
            '020_normalize_status_enum_to_title_case',
            '021_add_license_scope_to_domains',
            '022_add_installation_limit_to_domains',
            '023_add_id_pk_to_domains',
            '024_add_include_verification_engine_to_meta',
            '025_add_include_verification_guidance_to_meta',
            '026_add_include_manual_protocol_to_meta',
            '027_add_include_operational_notes_to_meta',
        ];
    }

    /**
     * Get list of pending migrations.
     *
     * @return array Migration IDs that haven't been applied yet
     */
    private static function get_pending_migrations()
    {
        global $wpdb;
        $table_name = $wpdb->prefix . self::$migration_table;
        $all_migrations = self::get_defined_migrations();

        // Get applied migrations
        $applied = $wpdb->get_col("SELECT migration_id FROM {$table_name}");
        $applied = array_flip($applied);

        // Return only pending migrations
        $pending = [];
        foreach ($all_migrations as $migration) {
            if (!isset($applied[$migration])) {
                $pending[] = $migration;
            }
        }

        return $pending;
    }

    /**
     * Execute a specific migration.
     *
     * @param string $migration_id Migration identifier
     * @return bool Success status
     */
    private static function run_migration($migration_id)
    {
        global $wpdb;
        
        // Call the migration method
        $method_name = 'migration_' . $migration_id;
        if (method_exists(__CLASS__, $method_name)) {
            try {
                call_user_func([__CLASS__, $method_name]);
                
                // Record migration as applied
                $table_name = $wpdb->prefix . self::$migration_table;
                $wpdb->insert($table_name, [
                    'migration_id' => $migration_id,
                    'applied_at' => current_time('mysql'),
                ]);
                
                return true;
            } catch (Exception $e) {
                error_log("VAPTGUARD Migration Error ({$migration_id}): " . $e->getMessage());
                return false;
            }
        }
        
        error_log("VAPTGUARD Migration Not Found: {$migration_id}");
        return false;
    }

    /**
     * Migration 001: Create domains table
     */
    private static function migration_001_create_domains_table()
    {
        global $wpdb;
        $charset_collate = $wpdb->get_charset_collate();
        $table_name = $wpdb->prefix . 'vaptguard_domains';

        $sql = "CREATE TABLE IF NOT EXISTS {$table_name} (
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
        ) {$charset_collate};";

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        dbDelta($sql);
    }

    /**
     * Migration 002: Create domain features table
     */
    private static function migration_002_create_domain_features_table()
    {
        global $wpdb;
        $charset_collate = $wpdb->get_charset_collate();
        $table_name = $wpdb->prefix . 'vaptguard_domain_features';

        $sql = "CREATE TABLE IF NOT EXISTS {$table_name} (
            id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            domain_id BIGINT(20) UNSIGNED NOT NULL,
            feature_key VARCHAR(100) NOT NULL,
            enabled TINYINT(1) DEFAULT 0,
            PRIMARY KEY  (id),
            KEY domain_id (domain_id)
        ) {$charset_collate};";

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        dbDelta($sql);
    }

    /**
     * Migration 003: Create feature status table
     */
    private static function migration_003_create_feature_status_table()
    {
        global $wpdb;
        $charset_collate = $wpdb->get_charset_collate();
        $table_name = $wpdb->prefix . 'vaptguard_feature_status';

        $sql = "CREATE TABLE IF NOT EXISTS {$table_name} (
            feature_key VARCHAR(100) NOT NULL,
            status ENUM('Draft', 'Develop', 'Test', 'Release') DEFAULT 'Draft',
            implemented_at DATETIME DEFAULT NULL,
            assigned_to BIGINT(20) UNSIGNED DEFAULT NULL,
            PRIMARY KEY  (feature_key)
        ) {$charset_collate};";

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        dbDelta($sql);
    }

    /**
     * Migration 004: Create feature meta table
     */
    private static function migration_004_create_feature_meta_table()
    {
        global $wpdb;
        $charset_collate = $wpdb->get_charset_collate();
        $table_name = $wpdb->prefix . 'vaptguard_feature_meta';

        $sql = "CREATE TABLE IF NOT EXISTS {$table_name} (
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
        ) {$charset_collate};";

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        dbDelta($sql);
    }

    /**
     * Migration 005: Create feature history table
     */
    private static function migration_005_create_feature_history_table()
    {
        global $wpdb;
        $charset_collate = $wpdb->get_charset_collate();
        $table_name = $wpdb->prefix . 'vaptguard_feature_history';

        $sql = "CREATE TABLE IF NOT EXISTS {$table_name} (
            id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            feature_key VARCHAR(100) NOT NULL,
            old_status VARCHAR(50),
            new_status VARCHAR(50),
            user_id BIGINT(20) UNSIGNED,
            note TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY  (id),
            KEY feature_key (feature_key)
        ) {$charset_collate};";

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        dbDelta($sql);
    }

    /**
     * Migration 006: Create domain builds table
     */
    private static function migration_006_create_domain_builds_table()
    {
        global $wpdb;
        $charset_collate = $wpdb->get_charset_collate();
        $table_name = $wpdb->prefix . 'vaptguard_domain_builds';

        $sql = "CREATE TABLE IF NOT EXISTS {$table_name} (
            id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            domain VARCHAR(255) NOT NULL,
            version VARCHAR(50) NOT NULL,
            features TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY  (id),
            KEY domain (domain)
        ) {$charset_collate};";

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        dbDelta($sql);
    }

    /**
     * Migration 007: Create security events table
     */
    private static function migration_007_create_security_events_table()
    {
        global $wpdb;
        $charset_collate = $wpdb->get_charset_collate();
        $table_name = $wpdb->prefix . 'vaptguard_security_events';

        $sql = "CREATE TABLE IF NOT EXISTS {$table_name} (
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
        ) {$charset_collate};";

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        dbDelta($sql);
    }

    /**
     * Migration 008: Add is_enabled column to feature meta
     */
    private static function migration_008_add_is_enabled_to_feature_meta()
    {
        global $wpdb;
        $table_name = $wpdb->prefix . 'vaptguard_feature_meta';
        
        $column = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s AND COLUMN_NAME = %s",
            DB_NAME, $table_name, 'is_enabled'
        ));
        
        if (empty($column)) {
            $wpdb->query("ALTER TABLE {$table_name} ADD COLUMN is_enabled TINYINT(1) DEFAULT 0");
        }
    }

    /**
     * Migration 009: Add is_enforced column to feature meta
     */
    private static function migration_009_add_is_enforced_to_feature_meta()
    {
        global $wpdb;
        $table_name = $wpdb->prefix . 'vaptguard_feature_meta';
        
        $column = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s AND COLUMN_NAME = %s",
            DB_NAME, $table_name, 'is_enforced'
        ));
        
        if (empty($column)) {
            $wpdb->query("ALTER TABLE {$table_name} ADD COLUMN is_enforced TINYINT(1) DEFAULT 0");
        }
    }

    /**
     * Migration 010: Add active_enforcer column to feature meta
     */
    private static function migration_010_add_active_enforcer_to_feature_meta()
    {
        global $wpdb;
        $table_name = $wpdb->prefix . 'vaptguard_feature_meta';
        
        $column = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s AND COLUMN_NAME = %s",
            DB_NAME, $table_name, 'active_enforcer'
        ));
        
        if (empty($column)) {
            $wpdb->query("ALTER TABLE {$table_name} ADD COLUMN active_enforcer VARCHAR(100) DEFAULT NULL");
        }
    }

    /**
     * Migration 011: Add wireframe_url column to feature meta
     */
    private static function migration_011_add_wireframe_url_to_feature_meta()
    {
        global $wpdb;
        $table_name = $wpdb->prefix . 'vaptguard_feature_meta';
        
        $column = $wpdb->get_results($wpdb->prepare(
            "SHOW COLUMNS FROM {$table_name} LIKE %s", 'wireframe_url'
        ));
        
        if (empty($column)) {
            $wpdb->query("ALTER TABLE {$table_name} ADD COLUMN wireframe_url TEXT DEFAULT NULL");
        }
    }

    /**
     * Migration 012: Add generated_schema column to feature meta
     */
    private static function migration_012_add_generated_schema_to_feature_meta()
    {
        global $wpdb;
        $table_name = $wpdb->prefix . 'vaptguard_feature_meta';
        
        $column = $wpdb->get_results($wpdb->prepare(
            "SHOW COLUMNS FROM {$table_name} LIKE %s", 'generated_schema'
        ));
        
        if (empty($column)) {
            $wpdb->query("ALTER TABLE {$table_name} ADD COLUMN generated_schema LONGTEXT DEFAULT NULL");
        }
    }

    /**
     * Migration 013: Add implementation_data column to feature meta
     */
    private static function migration_013_add_implementation_data_to_feature_meta()
    {
        global $wpdb;
        $table_name = $wpdb->prefix . 'vaptguard_feature_meta';
        
        $column = $wpdb->get_results($wpdb->prepare(
            "SHOW COLUMNS FROM {$table_name} LIKE %s", 'implementation_data'
        ));
        
        if (empty($column)) {
            $wpdb->query("ALTER TABLE {$table_name} ADD COLUMN implementation_data LONGTEXT DEFAULT NULL");
        }
    }

    /**
     * Migration 014: Add dev_instruct column to feature meta
     */
    private static function migration_014_add_dev_instruct_to_feature_meta()
    {
        global $wpdb;
        $table_name = $wpdb->prefix . 'vaptguard_feature_meta';
        
        $column = $wpdb->get_results($wpdb->prepare(
            "SHOW COLUMNS FROM {$table_name} LIKE %s", 'dev_instruct'
        ));
        
        if (empty($column)) {
            $wpdb->query("ALTER TABLE {$table_name} ADD COLUMN dev_instruct LONGTEXT DEFAULT NULL");
        }
    }

    /**
     * Migration 015: Add is_adaptive_deployment column to feature meta
     */
    private static function migration_015_add_is_adaptive_deployment_to_feature_meta()
    {
        global $wpdb;
        $table_name = $wpdb->prefix . 'vaptguard_feature_meta';
        
        $column = $wpdb->get_results($wpdb->prepare(
            "SHOW COLUMNS FROM {$table_name} LIKE %s", 'is_adaptive_deployment'
        ));
        
        if (empty($column)) {
            $wpdb->query("ALTER TABLE {$table_name} ADD COLUMN is_adaptive_deployment TINYINT(1) DEFAULT 0");
        }
    }

    /**
     * Migration 016: Add override_schema column to feature meta
     */
    private static function migration_016_add_override_schema_to_feature_meta()
    {
        global $wpdb;
        $table_name = $wpdb->prefix . 'vaptguard_feature_meta';
        
        $column = $wpdb->get_results($wpdb->prepare(
            "SHOW COLUMNS FROM {$table_name} LIKE %s", 'override_schema'
        ));
        
        if (empty($column)) {
            $wpdb->query("ALTER TABLE {$table_name} ADD COLUMN override_schema LONGTEXT DEFAULT NULL");
        }
    }

    /**
     * Migration 017: Add override_implementation_data column to feature meta
     */
    private static function migration_017_add_override_impl_data_to_feature_meta()
    {
        global $wpdb;
        $table_name = $wpdb->prefix . 'vaptguard_feature_meta';
        
        $column = $wpdb->get_results($wpdb->prepare(
            "SHOW COLUMNS FROM {$table_name} LIKE %s", 'override_implementation_data'
        ));
        
        if (empty($column)) {
            $wpdb->query("ALTER TABLE {$table_name} ADD COLUMN override_implementation_data LONGTEXT DEFAULT NULL");
        }
    }

    /**
     * Migration 018: Add manual_expiry_date column to domains
     */
    private static function migration_018_add_manual_expiry_to_domains()
    {
        global $wpdb;
        $table_name = $wpdb->prefix . 'vaptguard_domains';
        
        $column = $wpdb->get_results($wpdb->prepare(
            "SHOW COLUMNS FROM {$table_name} LIKE %s", 'manual_expiry_date'
        ));
        
        if (empty($column)) {
            $wpdb->query("ALTER TABLE {$table_name} ADD COLUMN manual_expiry_date DATETIME DEFAULT NULL");
        }
    }

    /**
     * Migration 019: Add assigned_to column to feature status
     */
    private static function migration_019_add_assigned_to_to_feature_status()
    {
        global $wpdb;
        $table_name = $wpdb->prefix . 'vaptguard_feature_status';
        
        $column = $wpdb->get_results($wpdb->prepare(
            "SHOW COLUMNS FROM {$table_name} LIKE %s", 'assigned_to'
        ));
        
        if (empty($column)) {
            $wpdb->query("ALTER TABLE {$table_name} ADD COLUMN assigned_to BIGINT(20) UNSIGNED DEFAULT NULL");
        }
    }

    /**
     * Migration 020: Normalize status ENUM to title case
     */
    private static function migration_020_normalize_status_enum_to_title_case()
    {
        global $wpdb;
        $table_name = $wpdb->prefix . 'vaptguard_feature_status';
        
        // Modify ENUM definition
        $wpdb->query("ALTER TABLE {$table_name} MODIFY COLUMN status ENUM('Draft', 'Develop', 'Release') DEFAULT 'Draft'");
        
        // Update existing lowercase statuses
        $wpdb->query("UPDATE {$table_name} SET status = 'Draft' WHERE status IN ('draft', 'available')");
        $wpdb->query("UPDATE {$table_name} SET status = 'Develop' WHERE status IN ('develop', 'in_progress', 'test', 'Test')");
        $wpdb->query("UPDATE {$table_name} SET status = 'Release' WHERE status IN ('release', 'implemented')");
    }

    /**
     * Migration 021: Add license_scope column to domains
     */
    private static function migration_021_add_license_scope_to_domains()
    {
        global $wpdb;
        $table_name = $wpdb->prefix . 'vaptguard_domains';
        
        $column = $wpdb->get_results($wpdb->prepare(
            "SHOW COLUMNS FROM {$table_name} LIKE %s", 'license_scope'
        ));
        
        if (empty($column)) {
            $wpdb->query("ALTER TABLE {$table_name} ADD COLUMN license_scope VARCHAR(50) DEFAULT 'single'");
        }
    }

    /**
     * Migration 022: Add installation_limit column to domains
     */
    private static function migration_022_add_installation_limit_to_domains()
    {
        global $wpdb;
        $table_name = $wpdb->prefix . 'vaptguard_domains';
        
        $column = $wpdb->get_results($wpdb->prepare(
            "SHOW COLUMNS FROM {$table_name} LIKE %s", 'installation_limit'
        ));
        
        if (empty($column)) {
            $wpdb->query("ALTER TABLE {$table_name} ADD COLUMN installation_limit INT DEFAULT 1");
        }
    }

    /**
     * Migration 023: Add id primary key to domains
     */
    private static function migration_023_add_id_pk_to_domains()
    {
        global $wpdb;
        $table_name = $wpdb->prefix . 'vaptguard_domains';
        
        $column = $wpdb->get_results($wpdb->prepare(
            "SHOW COLUMNS FROM {$table_name} LIKE %s", 'id'
        ));
        
        if (empty($column)) {
            // Add id column and set as primary key
            $wpdb->query("ALTER TABLE {$table_name} DROP PRIMARY KEY");
            $wpdb->query("ALTER TABLE {$table_name} ADD COLUMN id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT FIRST, ADD PRIMARY KEY (id)");
        } else {
            // Ensure id is primary key
            $pk_check = $wpdb->get_row($wpdb->prepare(
                "SHOW KEYS FROM {$table_name} WHERE Key_name = %s", 'PRIMARY'
            ));
            if (!$pk_check || $pk_check->Column_name !== 'id') {
                $wpdb->query("ALTER TABLE {$table_name} DROP PRIMARY KEY");
                $wpdb->query("ALTER TABLE {$table_name} MODIFY COLUMN id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT, ADD PRIMARY KEY (id)");
            }
        }
    }

    /**
     * Migration 024: Add include_verification_engine column to feature meta
     */
    private static function migration_024_add_include_verification_engine_to_meta()
    {
        global $wpdb;
        $table_name = $wpdb->prefix . 'vaptguard_feature_meta';
        
        $column = $wpdb->get_results($wpdb->prepare(
            "SHOW COLUMNS FROM {$table_name} LIKE %s", 'include_verification_engine'
        ));
        
        if (empty($column)) {
            $wpdb->query("ALTER TABLE {$table_name} ADD COLUMN include_verification_engine TINYINT(1) DEFAULT 0");
        }
    }

    /**
     * Migration 025: Add include_verification_guidance column to feature meta
     */
    private static function migration_025_add_include_verification_guidance_to_meta()
    {
        global $wpdb;
        $table_name = $wpdb->prefix . 'vaptguard_feature_meta';
        
        $column = $wpdb->get_results($wpdb->prepare(
            "SHOW COLUMNS FROM {$table_name} LIKE %s", 'include_verification_guidance'
        ));
        
        if (empty($column)) {
            $wpdb->query("ALTER TABLE {$table_name} ADD COLUMN include_verification_guidance TINYINT(1) DEFAULT 1");
        }
    }

    /**
     * Migration 026: Add include_manual_protocol column to feature meta
     */
    private static function migration_026_add_include_manual_protocol_to_meta()
    {
        global $wpdb;
        $table_name = $wpdb->prefix . 'vaptguard_feature_meta';
        
        $column = $wpdb->get_results($wpdb->prepare(
            "SHOW COLUMNS FROM {$table_name} LIKE %s", 'include_manual_protocol'
        ));
        
        if (empty($column)) {
            $wpdb->query("ALTER TABLE {$table_name} ADD COLUMN include_manual_protocol TINYINT(1) DEFAULT 1");
        }
    }

    /**
     * Migration 027: Add include_operational_notes column to feature meta
     */
    private static function migration_027_add_include_operational_notes_to_meta()
    {
        global $wpdb;
        $table_name = $wpdb->prefix . 'vaptguard_feature_meta';
        
        $column = $wpdb->get_results($wpdb->prepare(
            "SHOW COLUMNS FROM {$table_name} LIKE %s", 'include_operational_notes'
        ));
        
        if (empty($column)) {
            $wpdb->query("ALTER TABLE {$table_name} ADD COLUMN include_operational_notes TINYINT(1) DEFAULT 1");
        }
    }
}

