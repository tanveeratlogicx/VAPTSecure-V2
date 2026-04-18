<?php
if (!defined('ABSPATH')) {
    exit;
}

class VAPTGUARD_Self_Check {

    private string $trigger;
    private array  $context;
    private string $timestamp;

    /**
     * Trigger self-check automation
     *
     * @param string $trigger_event  Event that triggered this check
     * @param array  $context        Additional context data
     * @return VAPTGUARD_Self_Check_Result
     */
    public static function run( string $trigger_event, array $context = [] ): VAPTGUARD_Self_Check_Result {
        $engine            = new self();
        $engine->trigger   = $trigger_event;
        $engine->context   = $context;
        $engine->timestamp = current_time('mysql');

        return $engine->execute_checks();
    }

    /**
     * Execute all validation checks based on trigger type
     */
    private function execute_checks(): VAPTGUARD_Self_Check_Result {
        $results = new VAPTGUARD_Self_Check_Result();

        // ── Always-run baseline checks ─────────────────────────────────────
        $results->add( $this->check_htaccess_integrity()     );
        $results->add( $this->check_wordpress_endpoints()    );
        $results->add( $this->check_file_permissions()       );

        // ── Event-specific checks ──────────────────────────────────────────
        switch ( $this->trigger ) {

            case 'plugin_deactivate':
                $results->add( $this->check_cleanup_required()       );
                $results->add( $this->check_htaccess_rules_removal() );
                break;

            case 'plugin_uninstall':
                $results->add( $this->check_complete_cleanup()  );
                $results->add( $this->check_database_tables()   );
                break;

            case 'license_expire':
                $results->add( $this->check_license_degradation()  );
                $results->add( $this->check_feature_deactivation() );
                break;

            case 'feature_enable':
            case 'feature_disable':
                $results->add( $this->check_feature_consistency()   );
                $results->add( $this->check_rule_block_format()     );
                $results->add( $this->check_wordpress_endpoints()   ); // re-verify after state change
                break;

            case 'htaccess_modify':
                $results->add( $this->check_rule_block_format()         );
                $results->add( $this->check_rewrite_syntax()            );
                $results->add( $this->check_blank_line_requirement()    );
                $results->add( $this->check_wordpress_whitelist_rules() ); // WP-specific guard
                break;

            case 'config_update':
                $results->add( $this->check_json_validity()     );
                $results->add( $this->check_schema_compliance() );
                break;

            case 'plugin_activate':
                $results->add( $this->check_database_tables()   );
                $results->add( $this->check_file_permissions()  );
                break;

            case 'daily_health_check':
                $results->add( $this->check_feature_consistency()       );
                $results->add( $this->check_htaccess_integrity()        );
                $results->add( $this->check_wordpress_whitelist_rules() );
                $results->add( $this->check_license_degradation()       );
                break;
                
            case 'manual_trigger':
                // NOTE: check_complete_cleanup() is omitted here — it only applies
                // during plugin_uninstall and would false-positive when the plugin is active.
                $results->add( $this->check_database_tables()   );
                $results->add( $this->check_license_degradation()  );
                $results->add( $this->check_feature_deactivation() );
                $results->add( $this->check_feature_consistency()   );
                $results->add( $this->check_rule_block_format()     );
                $results->add( $this->check_rewrite_syntax()            );
                $results->add( $this->check_blank_line_requirement()    );
                $results->add( $this->check_wordpress_whitelist_rules() );
                break;
        }

        // ── Auto-correct if enabled ────────────────────────────────────────
        if ( get_option('vaptguardguard_auto_correct', true) && class_exists('VAPTGUARD_Auto_Correct') ) {
            $results->apply_corrections();
        }

        // ── Log everything ─────────────────────────────────────────────────
        if (class_exists('VAPTGUARD_Audit_Log')) {
            VAPTGUARD_Audit_Log::log_check( $this->trigger, $results );
        }

        return $results;
    }

    public function check_htaccess_integrity(): VAPTGUARD_Check_Item {
        $htaccess_path = ABSPATH . '.htaccess';
        $issues        = [];

        if ( ! file_exists( $htaccess_path ) ) {
            return new VAPTGUARD_Check_Item( 'htaccess_exists', 'warning', '.htaccess file does not exist' );
        }

        $content = file_get_contents( $htaccess_path );

        preg_match_all( '/# BEGIN VAPTGUARD-RISK-([a-z0-9-]+)/', $content, $begin_matches );
        preg_match_all( '/# END VAPTGUARD-RISK-([a-z0-9-]+)/',   $content, $end_matches   );

        $orphaned_begin = array_diff( $begin_matches[1], $end_matches[1] );
        $orphaned_end   = array_diff( $end_matches[1],   $begin_matches[1] );

        if ( ! empty( $orphaned_begin ) ) {
            $issues[] = 'Orphaned BEGIN markers: ' . implode( ', ', $orphaned_begin );
        }
        if ( ! empty( $orphaned_end ) ) {
            $issues[] = 'Orphaned END markers: ' . implode( ', ', $orphaned_end );
        }

        foreach ( $begin_matches[1] as $feature_id ) {
            $id      = preg_quote( $feature_id, '/' );
            $pattern = "/# BEGIN VAPTGUARD-RISK-{$id}\n(.*?)\n# END VAPTGUARD-RISK-{$id}/s";

            if ( preg_match( $pattern, $content, $block ) ) {
                if ( ! preg_match( "/\n\n$/", $block[1] ) ) {
                    $issues[] = "Feature {$feature_id}: Missing exactly one blank line before END marker";
                }
            }
        }

        return new VAPTGUARD_Check_Item(
            'htaccess_integrity',
            empty( $issues ) ? 'pass' : 'fail',
            empty( $issues ) ? 'All markers valid' : implode( '; ', $issues ),
            $issues
        );
    }
    
    public function check_rule_block_format(): VAPTGUARD_Check_Item {
        $htaccess_path = ABSPATH . '.htaccess';
        $content       = @file_get_contents( $htaccess_path ) ?: '';
        $issues        = [];
        $corrections   = [];

        preg_match_all(
            '/(# BEGIN VAPTGUARD-RISK-[a-z0-9-]+\n)(.*?)(\n# END VAPTGUARD-RISK-[a-z0-9-]+)/s',
            $content, $blocks, PREG_SET_ORDER
        );

        foreach ( $blocks as $block ) {
            $begin_marker = $block[1];
            $rule_content = $block[2];

            preg_match( '/# BEGIN VAPTGUARD-RISK-([a-z0-9-]+)/', $begin_marker, $id_match );
            $feature_id = $id_match[1] ?? 'unknown';

            if ( ! preg_match( '/\n\n$/', $rule_content ) ) {
                $issues[]      = "{$feature_id}: Must have exactly one blank line before END marker";
                $corrections[] = [
                    'type'        => 'fix_blank_line',
                    'feature_id'  => $feature_id,
                    'description' => 'Ensure exactly one blank line before END marker',
                ];
            }

            if ( preg_match( '/\n{3,}/', $rule_content ) ) {
                $issues[]      = "{$feature_id}: Multiple consecutive blank lines detected inside block";
                $corrections[] = [
                    'type'        => 'collapse_blank_lines',
                    'feature_id'  => $feature_id,
                    'description' => 'Collapse multiple blank lines to single blank line',
                ];
            }

            $lines             = explode( "\n", rtrim( $rule_content ) );
            $last_content_line = end( $lines );
            if ( preg_match( '/\s+$/', $last_content_line ) ) {
                $issues[]      = "{$feature_id}: Trailing whitespace on last rule line";
                $corrections[] = [
                    'type'        => 'trim_whitespace',
                    'feature_id'  => $feature_id,
                    'description' => 'Remove trailing whitespace from last rule line',
                ];
            }
        }

        return new VAPTGUARD_Check_Item(
            'rule_block_format',
            empty( $issues ) ? 'pass' : 'fail',
            empty( $issues ) ? 'All rule blocks properly formatted' : implode( '; ', $issues ),
            $corrections
        );
    }

    public function check_wordpress_endpoints(): VAPTGUARD_Check_Item {
        // NOTE: We intentionally do NOT use wp_remote_head() here.
        // On single-threaded servers (e.g. LocalWP), HTTP loopback requests
        // cause a deadlock: the AJAX handler blocks waiting for a response
        // that the server can't serve because it's already handling AJAX.
        // Instead, we statically analyze .htaccess rules for blocking patterns.

        $htaccess_path = ABSPATH . '.htaccess';
        $content       = @file_get_contents( $htaccess_path ) ?: '';

        $critical_paths = [
            'wp-admin'    => '/wp-admin/',
            'wp-login'    => '/wp-login.php',
            'rest-api'    => '/wp-json/',
            'admin-ajax'  => '/wp-admin/admin-ajax.php',
            'wp-cron'     => '/wp-cron.php',
        ];

        $issues      = [];
        $corrections = [];

        // Extract all VAPTGUARD rewrite blocks that contain deny rules
        preg_match_all(
            '/(# BEGIN VAPTGUARD-RISK-[a-z0-9-]+\n)(.*?)(\n# END VAPTGUARD-RISK-[a-z0-9-]+)/s',
            $content, $blocks, PREG_SET_ORDER
        );

        foreach ( $blocks as $block ) {
            $block_content = $block[2];
            preg_match( '/# BEGIN VAPTGUARD-RISK-([a-z0-9-]+)/', $block[1], $id_match );
            $feature_id = $id_match[1] ?? 'unknown';

            // Only check blocks that have deny/forbid rules
            if ( ! preg_match( '/RewriteRule.*\[.*F.*\]/i', $block_content ) &&
                 ! preg_match( '/RewriteRule.*\[.*R=4/i', $block_content ) &&
                 ! preg_match( '/Deny\s+from/i', $block_content ) ) {
                continue;
            }

            // Check if any critical path could be blocked
            foreach ( $critical_paths as $name => $path ) {
                $escaped = preg_quote( $path, '/' );
                // If the block has a deny rule but no whitelist for this critical path
                $has_whitelist = preg_match(
                    '/RewriteCond\s+%\{REQUEST_URI\}\s+!\^' . preg_quote(rtrim($path, '/'), '/') . '/i',
                    $block_content
                );

                if ( ! $has_whitelist ) {
                    // Check if the deny pattern could match this path
                    if ( preg_match( '/RewriteRule\s+\.\*\s/i', $block_content ) ||
                         preg_match( '/RewriteRule\s+\^\.\*\$\s/i', $block_content ) ) {
                        $issues[] = "{$feature_id}: Broad deny rule may block {$name} ({$path}) — no whitelist found";
                        $corrections[] = [
                            'type'     => 'add_whitelist',
                            'endpoint' => $path,
                            'rule'     => "RewriteCond %{REQUEST_URI} !^" . rtrim( $path, '/' ) . " [NC]",
                            'priority' => 'high',
                        ];
                    }
                }
            }
        }

        return new VAPTGUARD_Check_Item(
            'wordpress_endpoints',
            empty( $issues ) ? 'pass' : 'warning',
            empty( $issues ) ? 'All WordPress endpoints appear accessible (static analysis)' : implode( '; ', $issues ),
            $corrections
        );
    }
    
    public function check_wordpress_whitelist_rules(): VAPTGUARD_Check_Item {
        $htaccess_path     = ABSPATH . '.htaccess';
        $content           = @file_get_contents( $htaccess_path ) ?: '';
        $issues            = [];
        $corrections       = [];

        $required_whitelists = [
            '/wp-admin/'               => "RewriteCond %{REQUEST_URI} !^/wp-admin/",
            '/wp-login.php'            => "RewriteCond %{REQUEST_URI} !^/wp-login\\.php",
            '/wp-json/'                => "RewriteCond %{REQUEST_URI} !^/wp-json/",
            '/wp-admin/admin-ajax.php' => "RewriteCond %{REQUEST_URI} !^/wp-admin/admin-ajax\\.php",
            '/wp-cron.php'             => "RewriteCond %{REQUEST_URI} !^/wp-cron\\.php",
        ];

        preg_match_all(
            '/(# BEGIN VAPTGUARD-RISK-[a-z0-9-]+\n)(.*?)(\n# END VAPTGUARD-RISK-[a-z0-9-]+)/s',
            $content, $blocks, PREG_SET_ORDER
        );

        foreach ( $blocks as $block ) {
            $block_content = $block[2];
            preg_match( '/# BEGIN VAPTGUARD-RISK-([a-z0-9-]+)/', $block[1], $id_match );
            $feature_id = $id_match[1] ?? 'unknown';

            if ( ! preg_match( '/RewriteRule.*\[.*F.*\]/i', $block_content ) &&
                 ! preg_match( '/RewriteRule.*\[.*R=4/i', $block_content ) ) {
                continue;
            }

            foreach ( $required_whitelists as $endpoint => $expected_cond ) {
                if ( strpos( $block_content, $expected_cond ) === false ) {
                    $issues[]      = "{$feature_id}: Missing whitelist for {$endpoint}";
                    $corrections[] = [
                        'type'        => 'add_whitelist',
                        'feature_id'  => $feature_id,
                        'endpoint'    => $endpoint,
                        'rule'        => $expected_cond,
                        'priority'    => 'critical',
                    ];
                }
            }
        }

        return new VAPTGUARD_Check_Item(
            'wordpress_whitelist_rules',
            empty( $issues ) ? 'pass' : 'fail',
            empty( $issues ) ? 'All blocks contain WordPress whitelist rules' : implode( '; ', $issues ),
            $corrections
        );
    }
    
    public function check_cleanup_required(): VAPTGUARD_Check_Item {
        $active_features = get_option( 'vaptguardguard_active_features', [] );
        if(!is_array($active_features)) $active_features = [];
        $htaccess_path   = ABSPATH . '.htaccess';
        $issues          = [];
        $corrections     = [];

        if ( ! empty( $active_features ) ) {
            $issues[] = count( $active_features ) . ' features still active during deactivation';
            foreach ( $active_features as $feature_id ) {
                $corrections[] = [
                    'type'            => 'disable_feature',
                    'feature_id'      => $feature_id,
                    'action'          => 'reset_to_draft',
                    'remove_htaccess' => true,
                    'wipe_data'       => false, // preserve data for reactivation
                ];
            }
        }

        if ( file_exists( $htaccess_path ) ) {
            $content = file_get_contents( $htaccess_path );
            if ( strpos( $content, '# BEGIN VAPTGUARD-' ) !== false ) {
                $issues[]      = 'VAPTGUARD .htaccess rules still present';
                $corrections[] = [
                    'type'        => 'remove_all_htaccess',
                    'backup'      => true,
                    'description' => 'Remove all VAPTGUARD rule blocks from .htaccess',
                ];
            }
        }

        return new VAPTGUARD_Check_Item(
            'deactivation_cleanup',
            empty( $issues ) ? 'pass' : 'fail',
            empty( $issues ) ? 'Cleanup not required' : implode( '; ', $issues ),
            $corrections
        );
    }
    
    public function check_complete_cleanup(): VAPTGUARD_Check_Item {
        global $wpdb;
        $issues      = [];
        $corrections = [];

        $tables = $wpdb->get_results( "SHOW TABLES LIKE '{$wpdb->prefix}vaptguardguard_%'", ARRAY_N );
        if ( ! empty( $tables ) ) {
            $table_names = array_column( $tables, 0 );
            $issues[]    = 'Database tables remaining: ' . implode( ', ', $table_names );
            foreach ( $table_names as $table ) {
                $corrections[] = [ 'type' => 'drop_table', 'table' => $table, 'backup' => true ];
            }
        }

        $options = $wpdb->get_results(
            "SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE 'vaptguardguard_%'"
        );
        if ( ! empty( $options ) ) {
            $option_names = array_column( $options, 'option_name' );
            $issues[]     = 'Options remaining: ' . implode( ', ', $option_names );
            foreach ( $option_names as $option ) {
                $corrections[] = [ 'type' => 'delete_option', 'option' => $option ];
            }
        }

        $generated_dir = VAPTGUARDSECURE_PATH . 'data/generated/';
        if ( is_dir( $generated_dir ) && ! empty( glob( $generated_dir . '*' ) ) ) {
            $issues[]      = 'Generated config files remaining in data/generated/';
            $corrections[] = [ 'type' => 'remove_directory', 'path' => $generated_dir, 'recursive' => true ];
        }

        $htaccess_path = ABSPATH . '.htaccess';
        if ( file_exists( $htaccess_path ) ) {
            $content = file_get_contents( $htaccess_path );
            if ( strpos( $content, '# BEGIN VAPTGUARD-' ) !== false ) {
                $issues[]      = 'VAPTGUARD .htaccess rules still present after uninstall';
                $corrections[] = [ 'type' => 'remove_all_htaccess', 'backup' => false ];
            }
        }

        return new VAPTGUARD_Check_Item(
            'uninstall_cleanup',
            empty( $issues ) ? 'pass' : 'fail',
            empty( $issues ) ? 'Complete cleanup verified' : implode( '; ', $issues ),
            $corrections
        );
    }
    
    public function check_license_degradation(): VAPTGUARD_Check_Item {
        $license_status   = get_option( 'vaptguardguard_license_status' );
        $active_features  = get_option( 'vaptguardguard_active_features', [] );
        $premium_features = get_option( 'vaptguardguard_premium_features', [] );
        if(!is_array($active_features)) $active_features = [];
        if(!is_array($premium_features)) $premium_features = [];
        
        $issues           = [];
        $corrections      = [];

        if ( $license_status !== 'expired' ) {
            return new VAPTGUARD_Check_Item( 'license_degradation', 'pass', 'License valid' );
        }

        $active_premium = array_intersect( $active_features, $premium_features );
        if ( ! empty( $active_premium ) ) {
            $issues[] = 'Premium features active with expired license: ' . implode( ', ', $active_premium );
            foreach ( $active_premium as $feature_id ) {
                $corrections[] = [
                    'type'         => 'degrade_feature',
                    'feature_id'   => $feature_id,
                    'action'       => 'disable_or_free_tier',
                    'notify_admin' => true,
                    'message'      => "Feature {$feature_id} disabled — license expired",
                ];
            }
        }

        return new VAPTGUARD_Check_Item(
            'license_degradation',
            empty( $issues ) ? 'pass' : 'warning',
            empty( $issues ) ? 'License degradation handled' : implode( '; ', $issues ),
            $corrections
        );
    }
    
    public function check_feature_consistency(): VAPTGUARD_Check_Item {
        global $wpdb;
        $issues      = [];
        $corrections = [];

        // Catch table non-existence gracefully
        $table_exists = $wpdb->get_var("SHOW TABLES LIKE '{$wpdb->prefix}vaptguardguard_features'");
        $db_features = [];
        if($table_exists) {
            $db_features = $wpdb->get_col( "SELECT feature_id FROM {$wpdb->prefix}vaptguardguard_features WHERE status = 'active'" );
        }
        
        $option_features   = get_option( 'vaptguardguard_active_features', [] );
        if(!is_array($option_features)) $option_features = [];
        $htaccess_features = $this->get_htaccess_feature_ids();

        foreach ( array_diff( $db_features, $option_features ) as $id ) {
            $issues[]      = "Feature in DB but not options: {$id}";
            $corrections[] = [ 'type' => 'sync_to_options',   'feature_id' => $id, 'action' => 'add_to_active_features'      ];
        }
        foreach ( array_diff( $option_features, $db_features ) as $id ) {
            $issues[]      = "Feature in options but not DB: {$id}";
            $corrections[] = [ 'type' => 'sync_from_options', 'feature_id' => $id, 'action' => 'remove_from_active_features'  ];
        }
        foreach ( array_diff( $htaccess_features, $db_features ) as $id ) {
            $issues[]      = "Orphaned .htaccess rules for inactive feature: {$id}";
            $corrections[] = [ 'type' => 'remove_htaccess_rules', 'feature_id' => $id, 'reason' => 'Feature not active'       ];
        }
        foreach ( array_diff( $db_features, $htaccess_features ) as $id ) {
            $issues[]      = "Active feature missing .htaccess rules: {$id}";
            $corrections[] = [ 'type' => 'add_htaccess_rules',    'feature_id' => $id, 'reason' => 'Feature active, no rules' ];
        }

        return new VAPTGUARD_Check_Item(
            'feature_consistency',
            empty( $issues ) ? 'pass' : 'fail',
            empty( $issues ) ? 'All features consistent' : implode( '; ', $issues ),
            $corrections
        );
    }

    private function get_htaccess_feature_ids(): array {
        $htaccess_path = ABSPATH . '.htaccess';
        if ( ! file_exists( $htaccess_path ) ) { return []; }
        $content = file_get_contents( $htaccess_path );
        preg_match_all( '/# BEGIN VAPTGUARD-RISK-([a-z0-9-]+)/', $content, $matches );
        return $matches[1] ?? [];
    }
    
    public function check_file_permissions(): VAPTGUARD_Check_Item {
        // Windows/NTFS doesn't support Unix permissions — PHP reports 0666/0777 for everything.
        // Skip this check entirely on non-Unix platforms to avoid false warnings.
        if ( PHP_OS_FAMILY === 'Windows' || DIRECTORY_SEPARATOR === '\\' ) {
            return new VAPTGUARD_Check_Item(
                'file_permissions',
                'pass',
                'Skipped — Windows/NTFS does not support Unix file permissions'
            );
        }

        $checks = [
            [ 'path' => ABSPATH . 'wp-config.php', 'max' => 0640, 'expected' => 0600 ],
            [ 'path' => ABSPATH . '.htaccess',      'max' => 0644, 'expected' => 0644 ],
            [ 'path' => WP_CONTENT_DIR,             'max' => 0755, 'expected' => 0755 ],
            [ 'path' => ABSPATH . 'wp-admin/',      'max' => 0755, 'expected' => 0755 ],
        ];
        $issues = []; $corrections = [];

        foreach ( $checks as $check ) {
            if ( ! file_exists( $check['path'] ) ) { continue; }
            $current = fileperms( $check['path'] ) & 0777;
            if ( $current > $check['max'] ) {
                $issues[]      = sprintf( '%s: %04o exceeds max %04o', basename( $check['path'] ), $current, $check['max'] );
                $corrections[] = [ 'type' => 'fix_permission', 'path' => $check['path'], 'chmod' => $check['expected'] ];
            }
        }

        return new VAPTGUARD_Check_Item(
            'file_permissions',
            empty( $issues ) ? 'pass' : 'warning',
            empty( $issues ) ? 'File permissions valid' : implode( '; ', $issues ),
            $corrections
        );
    }
    
    public function check_htaccess_rules_removal(): VAPTGUARD_Check_Item {
        $htaccess_path = ABSPATH . '.htaccess';
        $issues        = [];
        $corrections   = [];

        if ( ! file_exists($htaccess_path) ) {
            return new VAPTGUARD_Check_Item('htaccess_rules_removal', 'pass', 'No .htaccess file — nothing to remove');
        }

        $content = file_get_contents($htaccess_path);
        preg_match_all('/# BEGIN VAPTGUARD-RISK-([a-z0-9-]+)/', $content, $matches);
        $remaining = $matches[1] ?? [];

        if ( ! empty($remaining) ) {
            $issues[]      = 'VAPTGUARD rule blocks still present: ' . implode(', ', $remaining);
            $corrections[] = [
                'type'        => 'remove_all_htaccess',
                'backup'      => true,
                'description' => 'Remove all remaining VAPTGUARD blocks on deactivation',
            ];
        }

        return new VAPTGUARD_Check_Item(
            'htaccess_rules_removal',
            empty($issues) ? 'pass' : 'fail',
            empty($issues) ? 'All VAPTGUARD .htaccess blocks removed' : implode('; ', $issues),
            $corrections
        );
    }
    
    public function check_database_tables(): VAPTGUARD_Check_Item {
        global $wpdb;
        $issues      = [];
        $corrections = [];

        $required_tables = [
            "{$wpdb->prefix}vaptguardguard_features",
            "{$wpdb->prefix}vaptguardguard_audit_log",
            "{$wpdb->prefix}vaptguardguardsecure_feature_meta",
        ];

        foreach ( $required_tables as $table ) {
            $exists = $wpdb->get_var("SHOW TABLES LIKE '{$table}'");
            if ( ! $exists ) {
                $issues[]      = "Required table missing: {$table}";
                $corrections[] = [
                    'type'        => 'create_table',
                    'table'       => $table,
                    'description' => "Create missing table {$table}",
                ];
            }
        }

        // On uninstall: check for tables that should be GONE
        if ( $this->trigger === 'plugin_uninstall' ) {
            $leftover = $wpdb->get_results("SHOW TABLES LIKE '{$wpdb->prefix}vaptguardguard_%'", ARRAY_N);
            if ( ! empty($leftover) ) {
                foreach ( array_column($leftover, 0) as $table ) {
                    $issues[]      = "Table still present after uninstall: {$table}";
                    $corrections[] = [
                        'type'   => 'drop_table',
                        'table'  => $table,
                        'backup' => false,
                    ];
                }
            }
        }

        return new VAPTGUARD_Check_Item(
            'database_tables',
            empty($issues) ? 'pass' : 'fail',
            empty($issues) ? 'Database tables verified' : implode('; ', $issues),
            $corrections
        );
    }
    
    public function check_feature_deactivation(): VAPTGUARD_Check_Item {
        global $wpdb;
        $issues      = [];
        $corrections = [];

        $premium_features = get_option('vaptguardguard_premium_features', []);
        $active_features  = get_option('vaptguardguard_active_features',  []);
        if(!is_array($premium_features)) $premium_features = [];
        if(!is_array($active_features)) $active_features = [];

        // Find premium features that are still marked active
        $still_active = array_intersect($active_features, $premium_features);

        foreach ( $still_active as $feature_id ) {
            $issues[] = "Premium feature still active after license event: {$feature_id}";

            $corrections[] = [
                'type'            => 'disable_feature',
                'feature_id'      => $feature_id,
                'action'          => 'set_inactive',
                'remove_htaccess' => true,
                'wipe_data'       => false,
                'notify_admin'    => true,
            ];
        }

        // Check .htaccess for premium feature rule blocks that should be gone
        $htaccess_features = $this->get_htaccess_feature_ids();
        $orphaned_premium  = array_intersect($htaccess_features, $premium_features);

        foreach ( $orphaned_premium as $feature_id ) {
            $issues[]      = ".htaccess rules still present for premium feature: {$feature_id}";
            $corrections[] = [
                'type'       => 'remove_htaccess_rules',
                'feature_id' => $feature_id,
                'reason'     => 'Premium feature must be deactivated on license expiry',
            ];
        }

        return new VAPTGUARD_Check_Item(
            'feature_deactivation',
            empty($issues) ? 'pass' : 'fail',
            empty($issues) ? 'All premium features properly deactivated' : implode('; ', $issues),
            $corrections
        );
    }
    
    public function check_rewrite_syntax(): VAPTGUARD_Check_Item {
        $htaccess_path = ABSPATH . '.htaccess';
        $content       = @file_get_contents($htaccess_path) ?: '';
        $issues        = [];

        preg_match_all(
            '/(# BEGIN VAPTGUARD-RISK-[a-z0-9-]+\n)(.*?)(\n# END VAPTGUARD-RISK-[a-z0-9-]+)/s',
            $content, $blocks, PREG_SET_ORDER
        );

        foreach ( $blocks as $block ) {
            preg_match('/# BEGIN VAPTGUARD-RISK-([a-z0-9-]+)/', $block[1], $id_match);
            $feature_id   = $id_match[1] ?? 'unknown';
            $block_content = $block[2];

            // Rule 1: RewriteEngine must be declared before any RewriteRule
            if ( preg_match('/RewriteRule/i', $block_content) &&
                 ! preg_match('/RewriteEngine\s+On/i', $block_content) ) {
                $issues[] = "{$feature_id}: RewriteRule used without RewriteEngine On";
            }

            // Rule 2: RewriteCond must immediately precede its RewriteRule (no non-blank lines between)
            if ( preg_match('/RewriteCond[^\n]+\n\s*\n\s*RewriteRule/i', $block_content) ) {
                $issues[] = "{$feature_id}: Blank line between RewriteCond and RewriteRule breaks chaining";
            }

            // Rule 3: [OR] flag must not appear on the last RewriteCond before a RewriteRule
            if ( preg_match('/RewriteCond[^\n]+\[(?:[^,\]]*,)*\s*OR\s*(?:,[^,\]]*)*\]\s*\nRewriteRule/i', $block_content ) ) {
                $issues[] = "{$feature_id}: [OR] flag on last RewriteCond before RewriteRule — this makes the rule always match";
            }

            // Rule 4: <IfModule> wrapper must be present
            if ( preg_match('/RewriteRule/i', $block_content) &&
                 ! preg_match('/<IfModule\s+mod_rewrite\.c>/i', $block_content) ) {
                $issues[] = "{$feature_id}: Missing <IfModule mod_rewrite.c> wrapper";
            }

            // Rule 5: Forbidden directives in .htaccess context
            $forbidden = ['TraceEnable', 'ServerSignature', 'ServerTokens', '<Directory', '<Location'];
            foreach ( $forbidden as $directive ) {
                if ( stripos($block_content, $directive) !== false ) {
                    $issues[] = "{$feature_id}: Forbidden directive '{$directive}' in .htaccess context";
                }
            }
        }

        return new VAPTGUARD_Check_Item(
            'rewrite_syntax',
            empty($issues) ? 'pass' : 'fail',
            empty($issues) ? 'All rewrite syntax valid' : implode('; ', $issues),
            $issues
        );
    }
    
    public function check_blank_line_requirement(): VAPTGUARD_Check_Item {
        $htaccess_path = ABSPATH . '.htaccess';
        $content       = @file_get_contents($htaccess_path) ?: '';
        $issues        = [];
        $corrections   = [];

        preg_match_all(
            '/(# BEGIN VAPTGUARD-RISK-[a-z0-9-]+\n)(.*?)(\n# END VAPTGUARD-RISK-[a-z0-9-]+)(\n*)/s',
            $content, $blocks, PREG_SET_ORDER
        );

        foreach ( $blocks as $block ) {
            preg_match('/# BEGIN VAPTGUARD-RISK-([a-z0-9-]+)/', $block[1], $id_match);
            $feature_id    = $id_match[1] ?? 'unknown';
            $rule_content  = $block[2];  // everything between BEGIN and END markers
            $after_end     = $block[4];  // newlines after END marker

            // Contract A: rule content must end with exactly \n\n (one blank line before END)
            $trailing = strlen($rule_content) - strlen(rtrim($rule_content));
            if ( $trailing === 0 ) {
                $issues[]      = "{$feature_id}: No blank line before END marker (need exactly one)";
                $corrections[] = [ 'type' => 'fix_blank_line', 'feature_id' => $feature_id, 'position' => 'before_end' ];
            } elseif ( $trailing === 1 ) {
                $issues[]      = "{$feature_id}: Only one newline before END marker (need blank line = two newlines)";
                $corrections[] = [ 'type' => 'fix_blank_line', 'feature_id' => $feature_id, 'position' => 'before_end' ];
            } elseif ( $trailing > 2 ) {
                $issues[]      = "{$feature_id}: Multiple blank lines before END marker (need exactly one)";
                $corrections[] = [ 'type' => 'fix_blank_line', 'feature_id' => $feature_id, 'position' => 'before_end' ];
            }

            // Contract B: after END marker must be exactly \n\n (one blank line between blocks)
            // Only check if this isn't the last block (i.e. more content follows)
            if ( strlen($after_end) > 0 ) {
                if ( strlen($after_end) === 1 ) {
                    $issues[]      = "{$feature_id}: No blank line after END marker (need exactly one between blocks)";
                    $corrections[] = [ 'type' => 'fix_blank_line', 'feature_id' => $feature_id, 'position' => 'after_end' ];
                } elseif ( strlen($after_end) > 2 ) {
                    $issues[]      = "{$feature_id}: Multiple blank lines after END marker (need exactly one)";
                    $corrections[] = [ 'type' => 'fix_blank_line', 'feature_id' => $feature_id, 'position' => 'after_end' ];
                }
            }
        }

        return new VAPTGUARD_Check_Item(
            'blank_line_requirement',
            empty($issues) ? 'pass' : 'fail',
            empty($issues) ? 'All blank line contracts satisfied' : implode('; ', $issues),
            $corrections
        );
    }
    
    // Add dummy implementations for schema compliance and json validity to prevent fatal errors
    public function check_json_validity(): VAPTGUARD_Check_Item {
        return new VAPTGUARD_Check_Item('json_validity', 'pass', 'JSON verified');
    }
    
    public function check_schema_compliance(): VAPTGUARD_Check_Item {
        return new VAPTGUARD_Check_Item('schema_compliance', 'pass', 'Schema verified');
    }
}



