<?php
/**
 * Debug logging helper functions
 *
 * Provides conditional logging based on VAPTGUARD_DEBUG constant
 * Only errors are logged by default; other levels require debug mode
 */

if (!defined('ABSPATH')) {
    exit; // Exit if accessed directly
}

// Debug Mode Control - set in wp-config.php or vaptguard.php
if (!defined('VAPTGUARD_DEBUG')) {
    define('VAPTGUARD_DEBUG', false);
}

/**
 * Conditional debug logging
 * 
 * @param string $message The message to log
 * @param string $level The log level (debug, info, warning, error)
 * @param mixed $data Optional data to include in log
 */
if (!function_exists('vaptguard_log')) {
    function vaptguard_log($message, $level = 'debug', $data = null) {
        if (!defined('VAPTGUARD_DEBUG') || (!VAPTGUARD_DEBUG && $level !== 'error')) {
            return;
        }
        $prefix = '[VAPTGuard]';
        $log_message = sprintf('%s %s: %s', $prefix, strtoupper($level), $message);
        if ($data !== null) {
            $log_message .= ' ' . (is_array($data) || is_object($data) ? json_encode($data) : (string)$data);
        }
        if (function_exists('error_log')) {
            error_log($log_message);
        }
    }
}

if (!function_exists('vaptguard_debug')) {
    function vaptguard_debug($message, $data = null) { vaptguard_log($message, 'debug', $data); }
}

if (!function_exists('vaptguard_info')) {
    function vaptguard_info($message, $data = null) { vaptguard_log($message, 'info', $data); }
}

if (!function_exists('vaptguard_warning')) {
    function vaptguard_warning($message, $data = null) { vaptguard_log($message, 'warning', $data); }
}

if (!function_exists('vaptguard_error')) {
    function vaptguard_error($message, $data = null) { vaptguard_log($message, 'error', $data); }
}

