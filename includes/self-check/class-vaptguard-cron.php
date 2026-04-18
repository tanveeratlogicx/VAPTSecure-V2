<?php
if (!defined('ABSPATH')) {
    exit;
}

class VAPTGUARD_Cron {

    /**
     * Register all VAPTGUARDSecure scheduled events on plugin activation
     */
    public static function register(): void {
        // Daily health check — fires every 24 hours
        if ( ! wp_next_scheduled('vaptguardguard_daily_self_check') ) {
            wp_schedule_event( time(), 'daily', 'vaptguardguard_daily_self_check' );
        }

        // License validation — fires every 12 hours
        if ( ! wp_next_scheduled('vaptguardguard_license_check') ) {
            wp_schedule_event( time(), 'twicedaily', 'vaptguardguard_license_check' );
        }
    }

    /**
     * Remove all scheduled events on plugin deactivation
     */
    public static function deregister(): void {
        wp_clear_scheduled_hook('vaptguardguard_daily_self_check');
        wp_clear_scheduled_hook('vaptguardguard_license_check');
    }

    /**
     * Wire up cron action callbacks
     * Called once during plugin bootstrap
     */
    public static function init(): void {
        add_action('vaptguardguard_daily_self_check', [ __CLASS__, 'run_daily_health_check' ] );
        add_action('vaptguardguard_license_check',    [ __CLASS__, 'run_license_check'       ] );
    }

    public static function run_daily_health_check(): void {
        if(class_exists('VAPTGUARD_Self_Check')) {
            VAPTGUARD_Self_Check::run('daily_health_check');
        }
    }

    public static function run_license_check(): void {
        $status = get_option('vaptguardguard_license_status');
        $expiry = get_option('vaptguardguard_license_expiry');

        if ( $expiry && strtotime($expiry) < time() && $status !== 'expired' ) {
            update_option('vaptguardguard_license_status', 'expired');
            do_action('vaptguardguard_license_expired');
        }
    }
}



