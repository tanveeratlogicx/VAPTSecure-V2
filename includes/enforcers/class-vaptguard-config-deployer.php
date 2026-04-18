<?php

/**
 * VAPTGUARD_Config_Deployer: Adaptive wp-config.php Deployment
 */

if (!defined('ABSPATH')) { exit;
}

class VAPTGUARD_Config_Deployer implements VAPTGUARD_Driver_Interface
{
    /**
     * Static wrapper for generate_rules - delegates to config driver
     */
    public static function generate_rules($impl_data, $schema)
    {
        return VAPTGUARD_Config_Driver::generate_rules($impl_data, $schema);
    }

    /**
     * Static wrapper for write_batch - delegates to config driver
     */
    public static function write_batch($rules, $target = 'root')
    {
        return VAPTGUARD_Config_Driver::write_batch($rules);
    }

    /**
     * Static wrapper for clean - delegates to config driver
     */
    public static function clean($target = 'root')
    {
        return VAPTGUARD_Config_Driver::clean();
    }

    // Instance methods below...
    public function can_deploy()
    {
        $paths = [];
        if (defined('ABSPATH')) {
            $base = rtrim(ABSPATH, DIRECTORY_SEPARATOR);
            
            // Standard location
            $paths[] = $base . DIRECTORY_SEPARATOR . 'wp-config.php';
            
            // One level above ABSPATH (WP standard for security)
            $paths[] = dirname($base) . DIRECTORY_SEPARATOR . 'wp-config.php';
            
            // [v3.13.31] Special: Home URL detection for subdirectory installs
            if (function_exists('get_home_path')) {
                $home = rtrim(get_home_path(), DIRECTORY_SEPARATOR);
                if (!empty($home) && !in_array($home . DIRECTORY_SEPARATOR . 'wp-config.php', $paths)) {
                    $paths[] = $home . DIRECTORY_SEPARATOR . 'wp-config.php';
                    $paths[] = dirname($home) . DIRECTORY_SEPARATOR . 'wp-config.php';
                }
            }
        }

        foreach (array_unique($paths) as $path) {
            if (@file_exists($path) && @is_writable($path)) {
                return true;
            }
        }

        return false;
    }

    public function deploy($risk_id, $implementation, $is_enabled = true)
    {
        if (!$this->can_deploy()) {
            return new WP_Error('vapt_deploy_failed', 'wp-config.php is not writable.');
        }

        // Since wp-config.php is managed as a batch by VAPTGUARD_Config_Driver,
        // we don't write individual rules here. Instead, we trigger a global rebuild.
        // The Config Driver will pull the latest meta and write all active rules.
    
        include_once VAPTGUARD_PATH . 'includes/class-vaptguard-enforcer.php';
        $result = VAPTGUARD_Enforcer::rebuild_config();

        return $result ? ['status' => 'rebuild_triggered', 'platform' => 'wp_config'] : new WP_Error('vapt_rebuild_failed', 'Failed to rebuild wp-config.php');
    }

    public function undeploy($risk_id)
    {
        // Same as deploy, trigger a rebuild which will effectively remove it if disabled
        include_once VAPTGUARD_PATH . 'includes/class-vaptguard-enforcer.php';
        return VAPTGUARD_Enforcer::rebuild_config();
    }
}


