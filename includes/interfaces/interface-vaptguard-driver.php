<?php

/**
 * VAPTGUARD_Driver_Interface
 * 
 * Contract for all enforcement drivers in VAPTGuard Pro.
 * Implementing this interface ensures consistent behavior across
 * all driver implementations (htaccess, nginx, php, config, etc.)
 * 
 * @since 1.0.0
 * @package VAPTGuard_Pro
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Interface VAPTGUARD_Driver_Interface
 * 
 * Defines the required methods for all enforcement drivers.
 * New drivers (Cloudflare Workers, AWS WAF, etc.) can implement
 * this interface without modifying core code.
 */
interface VAPTGUARD_Driver_Interface
{
    /**
     * Generates a list of rules based on the provided implementation data and schema.
     *
     * @param array $impl_data Implementation data (user inputs)
     * @param array $schema    Feature schema containing enforcement mappings
     * @return array List of rules/directives for the target platform
     */
    public static function generate_rules($impl_data, $schema);

    /**
     * Writes a complete batch of rules to the target location.
     *
     * @param array  $rules  Flat array of all rules to write
     * @param string $target Target location identifier (e.g., 'root', 'uploads')
     * @return bool Success status
     */
    public static function write_batch($rules, $target = 'root');

    /**
     * Cleans/removes all rules managed by this driver from the target location.
     *
     * @param string $target Target location identifier (e.g., 'root', 'uploads')
     * @return bool Success status
     */
    public static function clean($target = 'root');
}
