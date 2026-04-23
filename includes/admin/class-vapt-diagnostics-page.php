<?php

if (! defined('ABSPATH')) {
    exit;
}

/**
 * Admin diagnostics screen for runtime and build visibility checks.
 */
if (!class_exists('VAPTGUARD_Diagnostics_Page')) {
class VAPTGUARD_Diagnostics_Page
{
    /**
     * Render diagnostics page.
     *
     * @return void
     */
    public static function render()
    {
        if (!current_user_can('manage_options')) {
            wp_die(__('You do not have permission to access diagnostics.', 'vaptguard'));
        }

        if (!function_exists('is_vaptguard_superadmin') || !is_vaptguard_superadmin(false)) {
            wp_die(__('Diagnostics is available to superadmin only.', 'vaptguard'));
        }

        $host = isset($_SERVER['HTTP_HOST']) ? sanitize_text_field(wp_unslash($_SERVER['HTTP_HOST'])) : '';
        $is_client_build = defined('VAPTGUARD_CLIENT_BUILD') && VAPTGUARD_CLIENT_BUILD;
        $is_domain_locked = defined('VAPTGUARD_DOMAIN_LOCKED') && VAPTGUARD_DOMAIN_LOCKED;
        $locked_domain = defined('VAPTGUARD_LOCKED_DOMAIN') ? VAPTGUARD_LOCKED_DOMAIN : '';

        $domain_match = null;
        if ($locked_domain !== '' && class_exists('VAPTGUARD_Build')) {
            $domain_match = VAPTGUARD_Build::verify_domain_lock($locked_domain);
        }

        $rest_routes = rest_get_server()->get_routes();
        $admin_routes = array(
            '/vaptguard/v1/build/generate',
            '/vaptguard/v1/build/save-config',
            '/vaptguard/v1/build/sync-config',
            '/vaptguard/v1/domains/update',
            '/vaptguard/v1/domains/features',
            '/vaptguard/v1/domains/delete',
            '/vaptguard/v1/domains/batch-delete',
        );

        ?>
        <div class="wrap">
            <h1><?php esc_html_e('VAPTGuard Diagnostics', 'vaptguard'); ?></h1>
            <p><?php esc_html_e('Runtime checks for build mode, domain lock, and sensitive route exposure.', 'vaptguard'); ?></p>

            <table class="widefat striped" style="max-width: 1000px;">
                <tbody>
                    <?php self::row(__('Plugin Version', 'vaptguard'), defined('VAPTGUARD_VERSION') ? VAPTGUARD_VERSION : 'unknown'); ?>
                    <?php self::row(__('Client Build Mode', 'vaptguard'), $is_client_build ? 'ON' : 'OFF'); ?>
                    <?php self::row(__('Domain Lock Mode', 'vaptguard'), $is_domain_locked ? 'ON' : 'OFF'); ?>
                    <?php self::row(__('Current Host', 'vaptguard'), $host !== '' ? $host : 'n/a'); ?>
                    <?php self::row(__('Locked Domain', 'vaptguard'), $locked_domain !== '' ? $locked_domain : 'n/a'); ?>
                    <?php self::row(__('Domain Match', 'vaptguard'), $domain_match === null ? 'n/a' : ($domain_match ? 'YES' : 'NO')); ?>
                    <?php self::row(__('Active Data File', 'vaptguard'), defined('VAPTGUARD_ACTIVE_DATA_FILE') ? VAPTGUARD_ACTIVE_DATA_FILE : 'n/a'); ?>
                </tbody>
            </table>

            <h2 style="margin-top:24px;"><?php esc_html_e('Sensitive REST Routes', 'vaptguard'); ?></h2>
            <table class="widefat striped" style="max-width: 1000px;">
                <thead>
                    <tr>
                        <th><?php esc_html_e('Route', 'vaptguard'); ?></th>
                        <th><?php esc_html_e('Registered', 'vaptguard'); ?></th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($admin_routes as $route) : ?>
                        <tr>
                            <td><code><?php echo esc_html($route); ?></code></td>
                            <td><?php echo isset($rest_routes[$route]) ? 'YES' : 'NO'; ?></td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <?php
    }

    /**
     * Render one two-cell row.
     *
     * @param string $label Label.
     * @param string $value Value.
     * @return void
     */
    private static function row($label, $value)
    {
        ?>
        <tr>
            <th style="width:280px;"><?php echo esc_html($label); ?></th>
            <td><?php echo esc_html((string) $value); ?></td>
        </tr>
        <?php
    }
}
}
