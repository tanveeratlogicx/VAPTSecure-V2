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
        // Intentionally no-op.
        //
        // The canonical admin asset loader lives in vaptguard_enqueue_admin_assets()
        // so the domain admin page does not pay the cost of duplicate bundle loading.
        // Keep this hook in place for backward compatibility with older bootstrap paths.
        return;
    }


    public function admin_page()
    {
        wp_die(__('The VAPT Auditor has been removed.', 'vaptguard'));
    }
}


