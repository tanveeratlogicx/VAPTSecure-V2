<?php

/**
 * VAPTGUARD_Config_Cleaner: Shared utility for cleaning VAPT rules from config files
 * 
 * Centralizes the config file cleaning logic to avoid duplication between
 * the License Manager (when handling expired licenses) and the Enforcer
 * (when rebuilding or removing protections).
 */

if (!defined('ABSPATH')) { exit; }

class VAPTGUARD_Config_Cleaner
{
    /**
     * Clean all configuration files of VAPT rules
     * 
     * Used when:
     * - License expires (called from License Manager)
     * - Removing all protections (called from Enforcer)
     * - Rebuilding with $remove_only = true (called from Enforcer)
     * 
     * @return array Results of cleaning operations
     */
    public static function clean_all()
    {
        $results = array(
            'htaccess' => self::clean_htaccess(),
            'wp_config' => self::clean_wp_config(),
            'php_functions' => self::clean_php_functions(),
            'nginx' => self::clean_nginx(),
            'iis' => self::clean_iis(),
            'caddy' => self::clean_caddy(),
        );

        $success_count = count(array_filter($results));
        error_log(sprintf(
            '[VAPTGuard] Config cleaning complete. %d/%d files cleaned.',
            $success_count,
            count($results)
        ));

        return $results;
    }

    /**
     * Clean .htaccess file of VAPT rules
     * 
     * @return bool True if successful (or file doesn't exist)
     */
    public static function clean_htaccess()
    {
        $htaccess = ABSPATH . '.htaccess';
        
        if (!file_exists($htaccess)) {
            return true;
        }

        if (!is_writable($htaccess)) {
            error_log('[VAPTGuard] Cannot clean .htaccess: file not writable');
            return false;
        }

        $content = file_get_contents($htaccess);
        if ($content === false) {
            error_log('[VAPTGuard] Cannot clean .htaccess: failed to read file');
            return false;
        }

        // Remove VAPT blocks (both single and multi-line)
        $content = preg_replace('/# BEGIN VAPT[^\n]*\n.*?# END VAPT[^\n]*/s', '', $content);
        $content = preg_replace('/# BEGIN VAPT-RISK[^\n]*\n.*?# END VAPT-RISK[^\n]*/s', '', $content);
        
        // Clean up extra newlines
        $content = preg_replace('/\n{3,}/', "\n\n", $content);

        $result = file_put_contents($htaccess, $content);
        
        if ($result !== false) {
            error_log('[VAPTGuard] Cleaned .htaccess');
            return true;
        }
        
        error_log('[VAPTGuard] Failed to write cleaned .htaccess');
        return false;
    }

    /**
     * Clean wp-config.php file of VAPT rules
     * 
     * @return bool True if successful (or file doesn't exist)
     */
    public static function clean_wp_config()
    {
        $wp_config = ABSPATH . 'wp-config.php';
        
        // Try alternate location if not in ABSPATH
        if (!file_exists($wp_config)) {
            $wp_config = dirname(ABSPATH) . '/wp-config.php';
        }
        
        if (!file_exists($wp_config)) {
            return true;
        }

        if (!is_writable($wp_config)) {
            error_log('[VAPTGuard] Cannot clean wp-config.php: file not writable');
            return false;
        }

        $content = file_get_contents($wp_config);
        if ($content === false) {
            error_log('[VAPTGuard] Cannot clean wp-config.php: failed to read file');
            return false;
        }

        // Remove VAPT blocks (both PHP comments and line comments)
        $content = preg_replace('/\/\/ BEGIN VAPT[^\n]*\n.*?\/\/ END VAPT[^\n]*/s', '', $content);
        $content = preg_replace('/\/\* BEGIN VAPT[^\n]*\*\/.*?\/\* END VAPT[^\n]*\*\//s', '', $content);
        
        // Clean up extra newlines
        $content = preg_replace('/\n{3,}/', "\n\n", $content);

        $result = file_put_contents($wp_config, $content);
        
        if ($result !== false) {
            error_log('[VAPTGuard] Cleaned wp-config.php');
            return true;
        }
        
        error_log('[VAPTGuard] Failed to write cleaned wp-config.php');
        return false;
    }

    /**
     * Clean vapt-functions.php file
     * 
     * @return bool True if successful
     */
    public static function clean_php_functions()
    {
        $vapt_func = vaptguard_PATH . 'vapt-functions.php';
        
        if (!file_exists($vapt_func)) {
            return true;
        }

        if (!is_writable($vapt_func)) {
            error_log('[VAPTGuard] Cannot clean vapt-functions.php: file not writable');
            return false;
        }

        // Write minimal stub file indicating license expired
        $content = "<?php\n\n/**\n * VAPT Secure Functions\n * License Expired - Functions Disabled\n */\n\nif (!defined('ABSPATH')) { exit; }\n\n";
        
        $result = file_put_contents($vapt_func, $content);
        
        if ($result !== false) {
            error_log('[VAPTGuard] Cleaned vapt-functions.php');
            return true;
        }
        
        error_log('[VAPTGuard] Failed to write cleaned vapt-functions.php');
        return false;
    }

    /**
     * Clean nginx.conf file of VAPT rules
     * 
     * @return bool True if successful (or file doesn't exist)
     */
    public static function clean_nginx()
    {
        $nginx_conf = ABSPATH . 'nginx.conf';
        
        if (!file_exists($nginx_conf)) {
            return true;
        }

        if (!is_writable($nginx_conf)) {
            error_log('[VAPTGuard] Cannot clean nginx.conf: file not writable');
            return false;
        }

        $content = file_get_contents($nginx_conf);
        if ($content === false) {
            error_log('[VAPTGuard] Cannot clean nginx.conf: failed to read file');
            return false;
        }

        $content = preg_replace('/# BEGIN VAPT[^\n]*\n.*?# END VAPT[^\n]*/s', '', $content);
        $content = preg_replace('/\n{3,}/', "\n\n", $content);

        $result = file_put_contents($nginx_conf, $content);
        
        if ($result !== false) {
            error_log('[VAPTGuard] Cleaned nginx.conf');
            return true;
        }
        
        error_log('[VAPTGuard] Failed to write cleaned nginx.conf');
        return false;
    }

    /**
     * Clean web.config file (IIS) of VAPT rules
     * 
     * @return bool True if successful (or file doesn't exist)
     */
    public static function clean_iis()
    {
        $web_config = ABSPATH . 'web.config';
        
        if (!file_exists($web_config)) {
            return true;
        }

        if (!is_writable($web_config)) {
            error_log('[VAPTGuard] Cannot clean web.config: file not writable');
            return false;
        }

        $content = file_get_contents($web_config);
        if ($content === false) {
            error_log('[VAPTGuard] Cannot clean web.config: failed to read file');
            return false;
        }

        $content = preg_replace('/<!-- BEGIN VAPT[^\n]*-->.*?<!-- END VAPT[^\n]*-->/s', '', $content);
        $content = preg_replace('/\n{3,}/', "\n\n", $content);

        $result = file_put_contents($web_config, $content);
        
        if ($result !== false) {
            error_log('[VAPTGuard] Cleaned web.config');
            return true;
        }
        
        error_log('[VAPTGuard] Failed to write cleaned web.config');
        return false;
    }

    /**
     * Clean Caddyfile of VAPT rules
     * 
     * @return bool True if successful (or file doesn't exist)
     */
    public static function clean_caddy()
    {
        $caddyfile = ABSPATH . 'Caddyfile';
        
        if (!file_exists($caddyfile)) {
            return true;
        }

        if (!is_writable($caddyfile)) {
            error_log('[VAPTGuard] Cannot clean Caddyfile: file not writable');
            return false;
        }

        $content = file_get_contents($caddyfile);
        if ($content === false) {
            error_log('[VAPTGuard] Cannot clean Caddyfile: failed to read file');
            return false;
        }

        $content = preg_replace('/# BEGIN VAPT[^\n]*\n.*?# END VAPT[^\n]*/s', '', $content);
        $content = preg_replace('/\n{3,}/', "\n\n", $content);

        $result = file_put_contents($caddyfile, $content);
        
        if ($result !== false) {
            error_log('[VAPTGuard] Cleaned Caddyfile');
            return true;
        }
        
        error_log('[VAPTGuard] Failed to write cleaned Caddyfile');
        return false;
    }
}


