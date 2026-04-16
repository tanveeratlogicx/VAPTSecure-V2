<?php

/**
 * VAPTGUARD_Environment_Detector: Runtime Environment Detection Cascade
 * 
 * Implements the v4.0.0 detection engine to identify optimal enforcement platforms.
 * Logic derived from vapt-feature-deployment.agrules.
 */

if (!defined('ABSPATH')) { exit;
}

class VAPTGUARD_Environment_Detector
{
    private $cache_key = 'vaptguard_environment_profile';
    private $cache_duration = HOUR_IN_SECONDS;
    private $detection_config;

    public function __construct()
    {
        // Default detection configuration based on A+ v3.2/v4.0 standards
        $this->detection_config = [
        'version' => '4.0.0',
        'detection_cascade' => [
        ['name' => 'server_software_header', 'priority' => 10, 'confidence' => 0.9, 'timeout_ms' => 50],
        ['name' => 'php_sapi_detection', 'priority' => 20, 'confidence' => 1.0, 'timeout_ms' => 20],
        ['name' => 'filesystem_probe', 'priority' => 30, 'confidence' => 0.95, 'timeout_ms' => 200, 'probes' => [
          'apache' => ['.htaccess'],
          'nginx' => ['nginx.conf'],
          'iis' => ['web.config'],
          'caddy' => ['Caddyfile']
        ]],
        ['name' => 'function_availability', 'priority' => 40, 'confidence' => 1.0, 'timeout_ms' => 50, 'tests' => [
          'apache' => ['apache_get_modules'],
          'litespeed' => ['litespeed_finish_request']
        ]],
        ['name' => 'hosting_provider_detection', 'priority' => 50, 'confidence' => 0.8, 'timeout_ms' => 100, 'indicators' => [
          'pantheon' => 'PANTHEON_ENVIRONMENT',
          'wpengine' => 'WPE_APIKEY',
          'kinsta' => 'KINSTA_CACHE_ZONE'
        ]]
        ],
        'capability_matrix' => [
        'cloudflare_edge' => [
          'detected_by' => ['hosting_provider_detection:cloudflare'],
          'capabilities' => ['edge_blocking', 'global_propagation'],
          'requirements' => ['api_token']
        ],
        'nginx_config' => [
          'detected_by' => ['server_software_header:nginx', 'filesystem_probe:nginx'],
          'capabilities' => ['high_performance', 'location_blocking'],
          'requirements' => ['reload_required']
        ],
        'apache_htaccess' => [
          'detected_by' => ['server_software_header:apache', 'server_software_header:litespeed', 'filesystem_probe:apache'],
          'capabilities' => ['runtime_blocking', 'directory_context'],
          'requirements' => ['mod_rewrite', 'allowoverride']
        ],
        'iis_config' => [
          'detected_by' => ['server_software_header:iis', 'filesystem_probe:iis'],
          'capabilities' => ['url_rewrite'],
          'requirements' => ['web_config_writable']
        ],
        'fail2ban' => [
          'detected_by' => ['php_sapi_detection:any'], 
          'capabilities' => ['ip_blocking', 'brute_force_protection'],
          'requirements' => ['jail_local_writable']
        ],
        'server_cron' => [
          'detected_by' => ['php_sapi_detection:any'], // Universal for Linux/Unix hosts
          'capabilities' => ['background_tasks', 'scheduled_enforcement'],
          'requirements' => ['crontab_access']
        ],
        'php_functions' => [
          'detected_by' => ['php_sapi_detection:any'],
          'capabilities' => ['universal_fallback', 'application_level'],
          'requirements' => ['php_execution']
        ]
        ]
        ];
    }

    /**
     * Main detection entry point
     */
    public function detect($force = false)
    {
        if (!$force) {
            $cached = get_transient($this->cache_key);
            if ($cached !== false) {
                return $cached;
            }
        }

        $profile = $this->run_detection_cascade();
        $profile['detected_at'] = time();
        $profile['detection_version'] = $this->detection_config['version'];

        set_transient($this->cache_key, $profile, $this->cache_duration);

        return $profile;
    }

    /**
     * Execute detection cascade
     */
    private function run_detection_cascade()
    {
        $cascade = $this->detection_config['detection_cascade'];
        $results = [];

        foreach ($cascade as $detector) {
            $method = 'detect_' . $detector['name'];

            if (method_exists($this, $method)) {
                $start_time = microtime(true);
                $result = $this->$method($detector);
                $elapsed = (microtime(true) - $start_time) * 1000;

                $results[$detector['name']] = array_merge(
                    $result, [
                    'priority' => $detector['priority'],
                    'confidence' => $detector['confidence'],
                    'elapsed_ms' => $elapsed
                    ]
                );
            }
        }

        return $this->build_capability_profile($results);
    }

    private function detect_server_software_header($config)
    {
        $software = $_SERVER['SERVER_SOFTWARE'] ?? 'unknown';
        $detected = 'unknown';

        if (stripos($software, 'nginx') !== false) { $detected = 'nginx';
        } elseif (stripos($software, 'litespeed') !== false) { $detected = 'litespeed';
        } elseif (stripos($software, 'apache') !== false) { $detected = 'apache';
        } elseif (stripos($software, 'iis') !== false) { $detected = 'iis';
        }

        return [
        'server_software_raw' => $software,
        'server_software' => $detected,
        'detected' => $detected !== 'unknown'
        ];
    }

    private function detect_php_sapi_detection($config)
    {
        $sapi = php_sapi_name();
        return [
        'php_sapi' => $sapi,
        'is_cgi' => (strpos($sapi, 'cgi') !== false),
        'is_cli' => ($sapi === 'cli'),
        'detected' => true
        ];
    }

    private function detect_filesystem_probe($config)
    {
        $results = [];
        foreach ($config['probes'] as $server => $paths) {
            $results[$server] = ['config_found' => false, 'writable' => false];
            foreach ($paths as $path) {
                $absolute_path = (strpos($path, '/') === 0 || strpos($path, ':') === 1) ? $path : ABSPATH . $path;
                if (file_exists($absolute_path)) {
                    $results[$server]['config_found'] = true;
                    if (is_writable($absolute_path)) {
                        $results[$server]['writable'] = true;
                    }
                }
            }
        }
        return ['filesystem_probes' => $results, 'detected' => true];
    }

    private function detect_function_availability($config)
    {
        $results = [];
        foreach ($config['tests'] as $server => $functions) {
            $results[$server] = [];
            foreach ($functions as $function) {
                $results[$server][$function] = function_exists($function);
            }
        }
        return ['function_tests' => $results, 'detected' => true];
    }

    private function detect_hosting_provider_detection($config)
    {
        $detected_provider = 'unknown';
        foreach ($config['indicators'] as $provider => $env_var) {
            if (!empty($_SERVER[$env_var]) || !empty(getenv($env_var))) {
                $detected_provider = $provider;
                break;
            }
        }

        // Edge proxy detection
        $edge_proxy = 'none';
        if (!empty($_SERVER['HTTP_CF_RAY'])) { $edge_proxy = 'cloudflare';
        } elseif (!empty($_SERVER['HTTP_X_SUCURI_ID'])) { $edge_proxy = 'sucuri';
        }

        return [
        'hosting_provider' => $detected_provider,
        'edge_proxy' => $edge_proxy,
        'detected' => true
        ];
    }

    private function build_capability_profile($results)
    {
        $matrix = $this->detection_config['capability_matrix'];
        $profile = [
        'capabilities' => [],
        'optimal_platform' => 'php_functions',
        'platform_tier' => 'limited_php_only'
        ];

        foreach ($matrix as $platform => $definition) {
            $is_match = false;
            foreach ($definition['detected_by'] as $criterion) {
                if ($this->matches_criterion($criterion, $results)) {
                    $is_match = true;
                    break;
                }
            }

            if ($is_match || $platform === 'php_functions') {
                // MUTUAL EXCLUSIVITY: Hard guard for IIS/Caddy false positives based on filesystem probes
                $detected_software = $results['server_software_header']['server_software'] ?? 'unknown';
        
                if ($platform === 'iis_config') {
                    if (in_array($detected_software, ['apache', 'nginx', 'litespeed', 'caddy'])) {
                        continue; 
                    }
                    if (isset($profile['capabilities']['apache_htaccess']) || isset($profile['capabilities']['nginx_config'])) {
                        continue; // Final guard: don't show IIS if Apache/Nginx logic already matched
                    }
                }
        
                if ($platform === 'caddy_native' && in_array($detected_software, ['apache', 'nginx', 'litespeed', 'iis'])) {
                    continue; 
                }

                $profile['capabilities'][$platform] = $definition['capabilities'];
            }
        }

        $profile['optimal_platform'] = $this->select_optimal_platform($profile['capabilities']);
        return $profile;
    }

    private function matches_criterion($criterion, $results)
    {
        if (strpos($criterion, ':') !== false) {
            list($detector, $value) = explode(':', $criterion, 2);
            if (isset($results[$detector])) {
                $res = $results[$detector];
                if ($detector === 'server_software_header') { return stripos($res['server_software_raw'], $value) !== false;
                }
                if ($detector === 'filesystem_probe') { return $res['filesystem_probes'][$value]['config_found'] ?? false;
                }
                if ($detector === 'hosting_provider_detection') { return ($res['hosting_provider'] === $value || $res['edge_proxy'] === $value);
                }
                if ($detector === 'php_sapi_detection') { return ($value === 'any' || $res['php_sapi'] === $value);
                }
            }
        }
        return false;
    }

    private function select_optimal_platform($capabilities)
    {
        // Preference order: Cloudflare > Nginx > Apache > PHP
        if (isset($capabilities['cloudflare_edge'])) { return 'cloudflare_edge';
        }
        if (isset($capabilities['nginx_config'])) { return 'nginx_config';
        }
        if (isset($capabilities['apache_htaccess'])) { return 'apache_htaccess';
        }
        if (isset($capabilities['iis_config'])) { return 'iis_config';
        }
        return 'php_functions';
    }

    public function redetect()
    {
        delete_transient($this->cache_key);
        return $this->detect(true);
    }
}
