<?php
if (!defined('ABSPATH')) {
    exit;
}

class VAPTGUARD_Lifecycle {

    /**
     * Runs on plugin activation
     * Creates DB tables, registers cron events, runs baseline self-check
     */
    public static function on_activate(): void {
        self::create_tables();
        VAPTGUARD_Cron::register();
        if(class_exists('VAPTGUARD_Self_Check')) {
            VAPTGUARD_Self_Check::run('plugin_activate');
        }
    }

    /**
     * Runs on plugin deactivation (plugin is disabled but NOT removed)
     * Removes .htaccess rules, deregisters cron. Data is PRESERVED.
     */
    public static function on_deactivate(): void {
        // 1. Run self-check first — captures current state for audit log
        if(class_exists('VAPTGUARD_Self_Check')) {
            $result = VAPTGUARD_Self_Check::run('plugin_deactivate');
        }

        // 2. Auto-correct will have removed .htaccess rules if check found them
        //    Confirm final state
        $htaccess_path = ABSPATH . '.htaccess';
        if ( file_exists($htaccess_path) ) {
            $content = file_get_contents($htaccess_path);
            if ( strpos($content, '# BEGIN VAPTGUARD-') !== false ) {
                // Force remove if auto-correct didn't catch it
                $clean = preg_replace('/\n?# BEGIN VAPTGUARD-.*?# END VAPTGUARD-[^\n]*\n?/s', '', $content);
                file_put_contents($htaccess_path, $clean);
            }
        }

        // 3. Deregister cron events
        VAPTGUARD_Cron::deregister();

        // 4. Mark all features as deactivated (not deleted — data preserved)
        update_option('vaptguardguard_active_features', []);
        update_option('vaptguardguard_plugin_status', 'deactivated');
    }

    /**
     * Runs when plugin is deleted from the site (Plugins > Delete)
     * Full cleanup: tables, options, generated files, .htaccess rules
     */
    public static function on_uninstall(): void {
        global $wpdb;

        // 1. Run full self-check to capture pre-uninstall state
        if(class_exists('VAPTGUARD_Self_Check')) {
            VAPTGUARD_Self_Check::run('plugin_uninstall');
        }

        // 2. Remove all .htaccess rules (no backup — full uninstall)
        $htaccess_path = ABSPATH . '.htaccess';
        if ( file_exists($htaccess_path) ) {
            $content = file_get_contents($htaccess_path);
            $clean   = preg_replace('/\n?# BEGIN VAPTGUARD-.*?# END VAPTGUARD-[^\n]*\n?/s', '', $content);
            file_put_contents($htaccess_path, $clean);
        }

        // 3. Drop all VAPTGUARD database tables
        $tables = $wpdb->get_results("SHOW TABLES LIKE '{$wpdb->prefix}vaptguardguard_%'", ARRAY_N);
        foreach ( array_column($tables, 0) as $table ) {
            $wpdb->query("DROP TABLE IF EXISTS `{$table}`");
        }

        // 4. Delete all plugin options
        $options = $wpdb->get_col(
            "SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE 'vaptguardguard_%'"
        );
        foreach ( $options as $option ) {
            delete_option($option);
        }

        // 5. Remove generated config files
        if(defined('VAPTGUARDSECURE_PATH')) {
            $generated = VAPTGUARDSECURE_PATH . 'data/generated/';
            if ( is_dir($generated) ) {
                self::recursive_remove_directory($generated);
            }
        }

        // 6. Deregister cron (safety — should already be gone from deactivation)
        if(class_exists('VAPTGUARD_Cron')) {
            VAPTGUARD_Cron::deregister();
        }
    }

    /**
     * Create plugin database tables
     */
    private static function create_tables(): void {
        global $wpdb;
        $charset = $wpdb->get_charset_collate();

        $sql_features = "CREATE TABLE IF NOT EXISTS {$wpdb->prefix}vaptguardguard_features (
            id           BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            feature_id   VARCHAR(100)        NOT NULL,
            status       VARCHAR(20)         NOT NULL DEFAULT 'draft',
            created_at   DATETIME            NOT NULL,
            updated_at   DATETIME            NOT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY   feature_id (feature_id)
        ) {$charset};";

        $sql_audit = "CREATE TABLE IF NOT EXISTS {$wpdb->prefix}vaptguardguard_audit_log (
            id                  BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            timestamp           DATETIME            NOT NULL,
            trigger_event       VARCHAR(100)        NOT NULL,
            user_id             BIGINT(20) UNSIGNED NOT NULL DEFAULT 0,
            ip_address          VARCHAR(45)         NOT NULL DEFAULT '',
            overall_status      VARCHAR(20)         NOT NULL,
            checks_passed       SMALLINT            NOT NULL DEFAULT 0,
            checks_failed       SMALLINT            NOT NULL DEFAULT 0,
            checks_warning      SMALLINT            NOT NULL DEFAULT 0,
            corrections_applied SMALLINT            NOT NULL DEFAULT 0,
            details             LONGTEXT,
            PRIMARY KEY         (id),
            KEY                 trigger_event (trigger_event),
            KEY                 timestamp (timestamp)
        ) {$charset};";

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        dbDelta($sql_features);
        dbDelta($sql_audit);
    }

    private static function recursive_remove_directory( string $path ): void {
        if ( ! is_dir($path) ) { return; }
        $items = array_diff(scandir($path), ['.', '..']);
        foreach ( $items as $item ) {
            $full = $path . DIRECTORY_SEPARATOR . $item;
            is_dir($full) ? self::recursive_remove_directory($full) : unlink($full);
        }
        rmdir($path);
    }
}



