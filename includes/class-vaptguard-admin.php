<?php

/**
 * VAPT Admin Interface
 */

if (! defined('ABSPATH')) {
    exit;
}

class VAPTGUARD_Admin
{

    public function __construct()
    {
        add_action('admin_menu', array($this, 'add_admin_menu'));
        add_action('admin_enqueue_scripts', array($this, 'enqueue_scripts'));
        add_action('admin_notices', array($this, 'show_nginx_notice'));
    }

    public function show_nginx_notice()
    {
        if (!is_vaptguard_superadmin()) { return;
        }

        $server = isset($_SERVER['SERVER_SOFTWARE']) ? strtolower($_SERVER['SERVER_SOFTWARE']) : '';
        if (strpos($server, 'nginx') === false) { return;
        }

        $upload_dir = wp_upload_dir();
        $rules_file = $upload_dir['basedir'] . '/vapt-nginx-rules.conf';

        if (file_exists($rules_file)) {
            $include_path = $rules_file;
            ?>
      <div class="notice notice-info is-dismissible">
        <p><strong>VAPT Nginx Configuration (Action Required)</strong></p>
        <p>To apply VAPT security rules on Nginx, you must include the generated rules file in your main <code>nginx.conf</code> server block:</p>
        <code style="display:block; padding:10px; background:#fff; margin:5px 0;">include <?php echo esc_html($include_path); ?>;</code>
        <p><em>After adding this line, restart Nginx to apply changes.</em></p>
      </div>
            <?php
        }
    }



    public function add_admin_menu()
    {
    }

    public function enqueue_scripts($hook)
    {
        $allowed_hooks = array(
            'toplevel_page_vaptguard',
            'vaptguard_page_vaptguard-workbench',
            'vaptguard_page_vaptguard-domain-admin',
        );
        if (!in_array($hook, $allowed_hooks, true)) {
            return;
        }

        // 1. Enqueue module dependencies
        wp_enqueue_script('vaptguard-interface-generator', VAPTGUARD_URL . 'assets/js/modules/interface-generator.js', array(), VAPTGUARD_VERSION, true);
        wp_enqueue_script('vaptguard-generated-interface-ui', VAPTGUARD_URL . 'assets/js/modules/generated-interface.js', array('wp-element', 'wp-components'), VAPTGUARD_VERSION, true);

        // 2. Enqueue admin-modules (Phase 2)
        wp_enqueue_script('vaptguard-admin-logger', VAPTGUARD_URL . 'assets/js/admin-modules/logger.js', array(), VAPTGUARD_VERSION, true);
        wp_enqueue_script('vaptguard-admin-api-fetch-hotpatch', VAPTGUARD_URL . 'assets/js/admin-modules/api-fetch-hotpatch.js', array('wp-api-fetch', 'vaptguard-admin-logger'), VAPTGUARD_VERSION, true);
        wp_enqueue_script('vaptguard-admin-modals', VAPTGUARD_URL . 'assets/js/admin-modules/modals.js', array('vaptguard-admin-logger'), VAPTGUARD_VERSION, true);
        wp_enqueue_script('vaptguard-admin-field-mapping', VAPTGUARD_URL . 'assets/js/admin-modules/field-mapping.js', array('vaptguard-admin-logger'), VAPTGUARD_VERSION, true);
        wp_enqueue_script('vaptguard-admin-design-modal', VAPTGUARD_URL . 'assets/js/admin-modules/design-modal.js', array('wp-api-fetch', 'vaptguard-admin-modals'), VAPTGUARD_VERSION, true);
        wp_enqueue_script('vaptguard-admin-domains', VAPTGUARD_URL . 'assets/js/admin-modules/domains.js', array('wp-api-fetch', 'vaptguard-admin-logger'), VAPTGUARD_VERSION, true);

        // 3. Enqueue Workbench Script (Phase 3)
        wp_enqueue_script(
            'vaptguard-workbench-js',
            VAPTGUARD_URL . 'assets/js/workbench.js',
            array(
                'wp-element', 'wp-components', 'wp-api-fetch', 'wp-i18n',
                'vaptguard-interface-generator', 'vaptguard-generated-interface-ui',
                'vaptguard-admin-logger', 'vaptguard-admin-api-fetch-hotpatch'
            ),
            VAPTGUARD_VERSION,
            true
        );

        // Enqueue Client Dashboard Script
        wp_enqueue_script(
            'vaptguard-client-js',
            VAPTGUARD_URL . 'assets/js/client.js',
            array('wp-element', 'wp-components', 'wp-api-fetch', 'wp-i18n'),
            VAPTGUARD_VERSION,
            true
        );

        // 4. Enqueue Admin Dashboard Script with full dependency block
        wp_enqueue_script(
            'vaptguard-admin-js',
            VAPTGUARD_URL . 'assets/js/admin.js',
            array(
                'wp-element', 'wp-components', 'wp-api-fetch', 'wp-i18n',
                'vaptguard-interface-generator', 'vaptguard-generated-interface-ui',
                'vaptguard-admin-logger', 'vaptguard-admin-api-fetch-hotpatch',
                'vaptguard-admin-modals', 'vaptguard-admin-field-mapping',
                'vaptguard-admin-design-modal', 'vaptguard-admin-domains',
            ),
            VAPTGUARD_VERSION,
            true
        );

        wp_enqueue_style('vaptguard-admin-css', VAPTGUARD_URL . 'assets/css/admin.css', array('wp-components'), VAPTGUARD_VERSION);

        wp_localize_script(
            'vaptguard-admin-js', 'vaptguardSettings', array(
            'root' => esc_url_raw(rest_url()),
            'homeUrl' => esc_url_raw(home_url()),
            'nonce' => wp_create_nonce('wp_rest'),
            'isSuper' => is_vaptguard_superadmin(),
            'pluginVersion' => VAPTGUARD_VERSION
            )
        );

        wp_localize_script(
            'vaptguard-admin-js', 'vaptguard_ajax', array(
            'ajax_url' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('vaptguard_scan_nonce')
            )
        );
    }


    public function admin_page()
    {
        wp_die(__('The VAPT Auditor has been removed.', 'vaptguard'));
    }
}


