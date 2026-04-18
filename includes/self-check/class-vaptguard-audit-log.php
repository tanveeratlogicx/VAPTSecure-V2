<?php
if (!defined('ABSPATH')) {
    exit;
}

class VAPTGUARD_Audit_Log {

    const TABLE_NAME = 'vaptguardguard_audit_log';

    /**
     * Returns the current datetime string in GMT+5 (Asia/Karachi),
     * regardless of the WordPress site timezone setting.
     */
    private static function now(): string {
        try {
            $dt = new DateTime( 'now', new DateTimeZone( 'Asia/Karachi' ) );
            return $dt->format( 'Y-m-d H:i:s' );
        } catch ( Exception $e ) {
            return current_time( 'mysql' ); // fallback
        }
    }

    public static function log_check( string $trigger, VAPTGUARD_Self_Check_Result $results ): int {
        global $wpdb;

        $table = $wpdb->prefix . self::TABLE_NAME;

        // Ensure the audit log table exists before inserting
        if ( ! $wpdb->get_var( "SHOW TABLES LIKE '{$table}'" ) ) {
            if ( class_exists( 'VAPTGUARD_Lifecycle' ) ) {
                VAPTGUARD_Lifecycle::on_activate();
            }
            // Re-check after attempted creation
            if ( ! $wpdb->get_var( "SHOW TABLES LIKE '{$table}'" ) ) {
                error_log( '[VAPTGUARDSecure] Audit log table missing and could not be created.' );
                return 0;
            }
        }

        $wpdb->insert( $table, [
            'timestamp'           => self::now(),
            'trigger_event'       => $trigger,
            'user_id'             => get_current_user_id() ? get_current_user_id() : 0,
            'ip_address'          => sanitize_text_field( $_SERVER['REMOTE_ADDR'] ?? 'cli' ),
            'overall_status'      => $results->get_overall_status(),
            'checks_passed'       => $results->get_passed_count(),
            'checks_failed'       => $results->get_failed_count(),
            'checks_warning'      => $results->get_warning_count(),
            'corrections_applied' => count( $results->get_applied_corrections() ),
            'details'             => json_encode( $results->get_all_results() ),
        ] );

        if ( $results->has_critical_failures() ) {
            self::notify_admin( $trigger, $results );
        }

        return (int) $wpdb->insert_id;
    }

    private static function notify_admin( string $trigger, VAPTGUARD_Self_Check_Result $results ): void {
        $site_name = get_bloginfo('name');
        $site_url  = get_site_url();
        $admin_url = admin_url('admin.php?page=vaptguardguardsecure-diagnostics');

        wp_mail(
            get_option('admin_email'),
            "[VAPTGUARDSecure] Critical Issue on {$site_name}",
            implode("\n", [
                "A critical issue was detected during the '{$trigger}' self-check.",
                "",
                "Site:                 {$site_url}",
                "Failed Checks:        " . $results->get_failed_count(),
                "Warnings:             " . $results->get_warning_count(),
                "Corrections Applied:  " . count( $results->get_applied_corrections() ),
                "",
                "Review the audit log: {$admin_url}",
                "Time (GMT+5):         " . self::now(),
            ])
        );
    }
}



