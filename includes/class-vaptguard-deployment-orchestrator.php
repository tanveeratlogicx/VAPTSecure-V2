<?php

/**
 * VAPTGUARD_Deployment_Orchestrator: Grade A+ Orchestration Logic
 * 
 * Coordinates multi-platform deployment based on environment detection.
 * Implements the v4.0.0 Deployment Engine.
 */

if (!defined('ABSPATH')) { exit;
}

class VAPTGUARD_Deployment_Orchestrator
{
    private $detector;
    private $deployers = [];
    private $deployment_log = [];

    private static function debug_log($message)
    {
        if (defined('WP_DEBUG') && WP_DEBUG) {
            error_log($message);
        }
    }

    public function __construct()
    {
        include_once VAPTGUARD_PATH . 'includes/class-vaptguard-environment-detector.php';
        $this->detector = new VAPTGUARD_Environment_Detector();

        $this->init_deployers();
    }

    private function init_deployers()
    {
        include_once VAPTGUARD_PATH . 'includes/enforcers/class-vaptguard-apache-deployer.php';
        include_once VAPTGUARD_PATH . 'includes/enforcers/class-vaptguard-nginx-deployer.php';
        include_once VAPTGUARD_PATH . 'includes/enforcers/class-vaptguard-php-deployer.php';
        include_once VAPTGUARD_PATH . 'includes/enforcers/class-vaptguard-config-deployer.php';

        $this->deployers = [
        'apache_htaccess' => new VAPTGUARD_Apache_Deployer(),
        'nginx_config'    => new VAPTGUARD_Nginx_Deployer(),
        'php_functions'   => new VAPTGUARD_PHP_Deployer(),
        'wp_config'       => new VAPTGUARD_Config_Deployer()
        ];
    }

    /**
     * Orchestrates deployment for a specific feature
     * 
     * @param string $risk_id
     * @param array  $schema    The interface schema (v3.2+)
     * @param string $profile   auto_detect|maximum|conservative
     * @param array  $impl_data User toggle inputs from workbench
     */
    public function orchestrate($risk_id, $schema, $profile = 'auto_detect', $impl_data = [])
    {
        $env = $this->detector->detect();
        $results = [];

        // 1. Resolve Platform Matrix
        $platform_matrix = $schema['platform_matrix'] ?? $this->derive_matrix_from_legacy($schema, $impl_data);
        
        self::debug_log("VAPT ORCHESTRATOR: Processing {$risk_id} with profile={$profile}, targets=" . count($platform_matrix));

        // 2. Select Targets
        $targets = $this->resolve_targets($profile, $env, $platform_matrix);
        
        self::debug_log("VAPT ORCHESTRATOR: Selected targets for {$risk_id}: " . implode(', ', $targets));

        // 3. Execute Deployment
        foreach ($targets as $platform) {
            if (isset($this->deployers[$platform]) && isset($platform_matrix[$platform])) {
                $deployer = $this->deployers[$platform];
                // 2.1 Calculate toggle state (v4.0.0 Adaptive logic)
                $is_enabled = true;
                $risk_suffix = str_replace('-', '_', strtolower($risk_id));
                $auto_key = "vapt_risk_{$risk_suffix}_enabled";

                if (isset($impl_data['feat_enabled'])) {
                    $is_enabled = filter_var($impl_data['feat_enabled'], FILTER_VALIDATE_BOOLEAN);
                } elseif (isset($impl_data['enabled'])) {
                    $is_enabled = filter_var($impl_data['enabled'], FILTER_VALIDATE_BOOLEAN);
                } elseif (isset($impl_data[$auto_key])) {
                    $is_enabled = filter_var($impl_data[$auto_key], FILTER_VALIDATE_BOOLEAN);
                }
                
                self::debug_log("VAPT ORCHESTRATOR: Deploying {$risk_id} to {$platform}, enabled=" . ($is_enabled ? 'true' : 'false'));

                $implementation = $platform_matrix[$platform];
                $res = $deployer->deploy($risk_id, $implementation, $is_enabled);
                if (is_wp_error($res)) {
                    $results[$platform] = [
                    'success' => false,
                    'error' => $res->get_error_message()
                    ];
                    self::debug_log("VAPT ORCHESTRATOR: Deploy failed for {$risk_id} -> {$platform}: " . $res->get_error_message());
                } else {
                    $results[$platform] = array_merge(['success' => true], $res);
                    self::debug_log("VAPT ORCHESTRATOR: Deploy success for {$risk_id} -> {$platform}");
                }
            } else {
                self::debug_log("VAPT ORCHESTRATOR: Skipping {$platform} - no deployer or no implementation matrix");
            }
        }

        // 4. Update Deployment History
        $this->log_deployment($risk_id, $results, $env, $profile);

        return $results;
    }

    /**
     * Priority order for enforcer selection (highest to lowest)
     * Based on performance, reliability, and security effectiveness
     */
    private $priority_order = [
        'cloudflare_edge',  // Edge-level protection, highest priority
        'nginx_config',     // Native Nginx configuration
        'apache_htaccess',   // Apache .htaccess
        'caddy_native',     // Caddy native config
        'iis_config',       // IIS web.config
        'php_functions',    // PHP runtime enforcement
        'wp_config',        // WordPress config (always included if available)
        'server_cron',      // Cron-based enforcement
        'fail2ban'          // Fail2ban integration
    ];

    /**
     * Check if a platform is compatible with current environment capabilities
     */
    private function is_platform_compatible($platform, $env)
    {
        $capabilities = $env['capabilities'] ?? [];
        
        $compatibility_map = [
            'cloudflare_edge' => ['cloudflare_proxy'],
            'nginx_config'    => ['nginx'],
            'apache_htaccess' => ['apache', 'mod_rewrite', 'allowoverride'],
            'caddy_native'    => ['caddy'],
            'iis_config'      => ['iis'],
            'php_functions'   => ['php'],
            'wp_config'       => ['wordpress'],
            'server_cron'     => ['cron'],
            'fail2ban'        => ['fail2ban']
        ];

        $required = $compatibility_map[$platform] ?? [];
        
        // Platform is compatible if all required capabilities are present
        foreach ($required as $cap) {
            if (!in_array($cap, $capabilities)) {
                return false;
            }
        }
        
        return true;
    }

    /**
     * Select best enforcer based on priority and compatibility
     */
    private function select_best_enforcer($matrix, $env)
    {
        $available = array_keys($matrix);
        
        // Filter by compatibility
        $compatible = array_filter($available, function($platform) use ($env) {
            return $this->is_platform_compatible($platform, $env);
        });
        
        if (empty($compatible)) {
            return null;
        }
        
        // Sort by priority order
        usort($compatible, function($a, $b) {
            $pos_a = array_search($a, $this->priority_order);
            $pos_b = array_search($b, $this->priority_order);
            
            // If not in priority list, put at end
            if ($pos_a === false) $pos_a = PHP_INT_MAX;
            if ($pos_b === false) $pos_b = PHP_INT_MAX;
            
            return $pos_a - $pos_b;
        });
        
        return $compatible[0];
    }

    private function resolve_targets($profile, $env, $matrix)
    {
        $targets = [];
        $optimal = $env['optimal_platform'];

        switch ($profile) {
        case 'maximum_protection':
            // Deploy to all available platforms defined in the matrix
            $targets = array_keys($matrix);
            break;

        case 'conservative':
            // Only deploy to PHP and .htaccess if safe and compatible
            if (isset($matrix['php_functions']) && $this->is_platform_compatible('php_functions', $env)) {
                $targets[] = 'php_functions';
            }
            if ($optimal === 'apache_htaccess' && isset($matrix['apache_htaccess']) && $this->is_platform_compatible('apache_htaccess', $env)) {
                $targets[] = 'apache_htaccess';
            }
            break;

        case 'auto_detect':
        default:
            // Primary: Use intelligent priority-based selection
            $best = $this->select_best_enforcer($matrix, $env);
            if ($best) {
                $targets[] = $best;
            }

            // Fallback: If optimal platform is different from best, include it too
            if ($optimal && $optimal !== $best && isset($matrix[$optimal]) && $this->is_platform_compatible($optimal, $env)) {
                $targets[] = $optimal;
            }

            // Always include PHP if defined and not already selected (for runtime enforcement)
            if (!in_array('php_functions', $targets) && isset($matrix['php_functions']) && $this->is_platform_compatible('php_functions', $env)) {
                $targets[] = 'php_functions';
            }

            // Always include wp_config if defined (Core configuration persists regardless of optimal server platform)
            if (isset($matrix['wp_config'])) {
                $targets[] = 'wp_config';
            }
            break;
        }

        return array_unique($targets);
    }

    private function derive_matrix_from_legacy($schema, $impl_data = [])
    {
        $matrix = [];
        $enforcement = $schema['enforcement'] ?? [];

        // [v4.0.0] Adaptive Bridge logic
        if (empty($enforcement) || (isset($enforcement['driver']) && $enforcement['driver'] === 'hook' && empty($enforcement['mappings']))) {
            if (isset($schema['client_deployment']['enforcement'])) {
                $enforcement = $schema['client_deployment']['enforcement'];
            }
        }

        $driver = $enforcement['driver'] ?? 'hook';
        $mappings = $enforcement['mappings'] ?? [];
        $target = $enforcement['target'] ?? 'root';

        if (empty($mappings)) { 
            self::debug_log("VAPT ORCHESTRATOR: No mappings found in schema for derive_matrix");
            return $matrix;
        }

        // Check toggle state (v4.0.0 Adaptive logic)
        $is_enabled = true;
        if (isset($impl_data['feat_enabled'])) {
            $is_enabled = filter_var($impl_data['feat_enabled'], FILTER_VALIDATE_BOOLEAN);
        } elseif (isset($impl_data['enabled'])) {
            $is_enabled = filter_var($impl_data['enabled'], FILTER_VALIDATE_BOOLEAN);
        }

        // Map legacy drivers to v4.0 platforms
        if ($driver === 'htaccess') {
            include_once VAPTGUARD_PATH . 'includes/class-vaptguard-enforcer.php';
            
            // [FIX v4.0.x] Iterate through each mapping and extract platform-specific code
            $extracted_rules = [];
            foreach ($mappings as $mapping_key => $directive) {
                // Skip toggle-like keys that aren't actual directives
                if (in_array(strtolower($mapping_key), ['feat_enabled', 'enabled', 'risk_id', 'id', 'key'])) {
                    continue;
                }
                
                // Extract htaccess code from this mapping
                $code = VAPTGUARD_Enforcer::extract_code_from_mapping($directive, 'htaccess');
                if (!empty($code)) {
                    $extracted_rules[] = $code;
                }
            }
            
            $raw_code = implode("\n\n", array_filter($extracted_rules));
            
            // Perform variable substitution
            $site_url = function_exists('get_site_url') ? get_site_url() : '';
            $replacements = [
            '{{site_url}}' => $site_url,
            '{{home_url}}' => function_exists('get_home_url') ? get_home_url() : '',
            '{{admin_url}}' => function_exists('get_admin_url') ? get_admin_url() : '',
            '{{domain}}'   => parse_url($site_url, PHP_URL_HOST) ?? '',
            ];
            $raw_code = str_replace(array_keys($replacements), array_values($replacements), $raw_code);
            
            self::debug_log("VAPT ORCHESTRATOR: Extracted htaccess rules length: " . strlen($raw_code));

            if (!empty($raw_code)) {
                $matrix['apache_htaccess'] = ['rules' => $raw_code, 'target' => $target];
            }
            // Also provide a PHP fallback for mixed environments
            $matrix['php_functions'] = ['code' => '/* Managed via htaccess redirect */'];
        } elseif ($driver === 'nginx') {
            // [FIX v4.0.x] Extract nginx code from each mapping
            $extracted_rules = [];
            foreach ($mappings as $mapping_key => $directive) {
                if (in_array(strtolower($mapping_key), ['feat_enabled', 'enabled'])) continue;
                $code = VAPTGUARD_Enforcer::extract_code_from_mapping($directive, 'nginx');
                if (!empty($code)) {
                    $extracted_rules[] = $code;
                }
            }
            $rules = implode("\n", array_filter($extracted_rules));
            if (!empty($rules)) {
                $matrix['nginx_config'] = ['rules' => $rules];
            }
            $matrix['php_functions'] = ['code' => '/* Managed via nginx config */'];
        } elseif ($driver === 'wp-config' || $driver === 'config' || $driver === 'wp_config') {
            // [FIX v4.0.x] Extract wp-config code from each mapping
            $extracted_code = [];
            foreach ($mappings as $mapping_key => $directive) {
                if (in_array(strtolower($mapping_key), ['feat_enabled', 'enabled'])) continue;
                $code = VAPTGUARD_Enforcer::extract_code_from_mapping($directive, 'wp-config');
                if (!empty($code)) {
                    $extracted_code[] = $code;
                }
            }
            $code = implode("\n", array_filter($extracted_code));
            if (!empty($code)) {
                $matrix['wp_config'] = ['code' => $code];
            }
        } elseif ($driver === 'hook') {
            // [FIX v4.0.x] Extract PHP/hook code from each mapping
            $extracted_code = [];
            foreach ($mappings as $mapping_key => $directive) {
                if (in_array(strtolower($mapping_key), ['feat_enabled', 'enabled'])) continue;
                $code = VAPTGUARD_Enforcer::extract_code_from_mapping($directive, 'hook');
                if (!empty($code)) {
                    $extracted_code[] = $code;
                }
            }
            $code = implode("\n", array_filter($extracted_code));
            if (!empty($code)) {
                $matrix['php_functions'] = ['code' => $code];
            }
        } else {
            // [FIX v4.0.x] Generic fallback - extract from each mapping
            $extracted_code = [];
            foreach ($mappings as $mapping_key => $directive) {
                if (in_array(strtolower($mapping_key), ['feat_enabled', 'enabled'])) continue;
                $code = VAPTGUARD_Enforcer::extract_code_from_mapping($directive, $driver);
                if (!empty($code)) {
                    $extracted_code[] = $code;
                }
            }
            $code = implode("\n", array_filter($extracted_code));
            if (!empty($code)) {
                $matrix['php_functions'] = ['code' => $code];
            }
        }

        return $matrix;
    }

    private function log_deployment($risk_id, $results, $env, $profile)
    {
        $history = get_option('vapt_deployment_history', []);
        $history[] = [
        'risk_id' => $risk_id,
        'timestamp' => time(),
        'profile' => $profile,
        'environment' => $env['optimal_platform'],
        'results' => $results
        ];

        // Keep last 100 entries
        if (count($history) > 100) { array_shift($history);
        }

        update_option('vapt_deployment_history', $history);
    }
}




