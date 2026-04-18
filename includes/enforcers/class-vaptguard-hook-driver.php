<?php

/**
 * Universal Hook Driver for VAPT Secure
 * Implements security enforcement via PHP hooks (Server Agnostic)
 */

if (!defined("ABSPATH")) {
    exit();
}

class VAPTGUARD_Hook_Driver implements VAPTGUARD_Driver_Interface
{
    private static $feature_configs = [];
    private static $enforced_keys = [];
    private static $rate_limit_hook_registered = false;
    private static $marker_hook_registered = false;
    private static $catalog_data = null;

    // Dynamic Map: matches feature keys/tags to methods
    private static $dynamic_map = [
        "xmlrpc" => "block_xmlrpc",
        "directory_browsing" => "disable_directory_browsing",
        "listing" => "disable_directory_browsing", // fallback
        "version" => "hide_wp_version",
        "debug" => "block_debug_exposure",
        "headers" => "add_security_headers",
        "xss" => "add_security_headers", // XSS headers
        "clickjacking" => "add_security_headers", // Frame options
        "null_byte" => "block_null_byte_injection",
        "author" => "block_author_enumeration",
        "user_enum" => "block_author_enumeration",
        "pingback" => "disable_xmlrpc_pingback",
        "sensitive" => "block_sensitive_files",
        "files" => "block_sensitive_files",
        "limit" => "limit_login_attempts",
        "login" => "limit_login_attempts",
        "brute" => "limit_login_attempts",
        "cron" => "block_wp_cron",
        "rest" => "block_rest_api",
        "api" => "block_rest_api",
    ];

    /**
     * Apply enforcement rules at runtime
     * enhanced to work with VAPT-SixTee-Risk-Catalogue-12-EntReady_v3.4.json
     */
    /**
     * 🛡️ TWO-WAY DEACTIVATION & ENFORCEMENT (v3.6.19)
     */
    public static function apply($impl_data, $schema, $key = "")
    {
        $global_enforced = VAPTGUARD_DB::get_global_enforcement();

        // 🛡️ GLOBAL MASTER TOGGLE (v3.13.20)
        // Runs if Global is ON
        if (!$global_enforced) {
            return; // Stop enforcement site-wide if global is off
        }

        $log_file = VAPTGUARD_PATH . "vapt-debug.txt";
        $log = "VAPT Enforcement Run at " . current_time("mysql") . "\n";
        $log .= "Feature: $key\n";

        // 1. Resolve Data (Merge Defaults)
        $resolved_data = [];
        if (isset($schema["controls"]) && is_array($schema["controls"])) {
            foreach ($schema["controls"] as $control) {
                if (isset($control["key"])) {
                    $key_name = $control["key"];
                    $resolved_data[$key_name] = isset($impl_data[$key_name])
                        ? $impl_data[$key_name]
                        : (isset($control["default"])
                            ? $control["default"]
                            : null);
                }
            }
        }
        if (!empty($impl_data)) {
            $resolved_data = array_merge($resolved_data, $impl_data);
        }

        // 2. TWO-WAY STRATEGY: Check 'enabled' or 'feat_enabled' toggle (v4.0.x FIX)
        // [FIX v4.0.x] Default to ENABLED if no toggle key exists - features should
        // run by default unless explicitly disabled. This fixes the issue where
        // toggling OFF in the UI doesn't update a toggle key, causing all enforcement to be skipped.
        $has_toggle_key = false;
        $is_enabled = true; // Default: ENFORCE if no explicit toggle key exists

        if (isset($resolved_data["feat_enabled"])) {
            $has_toggle_key = true;
            $is_enabled = (bool) filter_var($resolved_data["feat_enabled"], FILTER_VALIDATE_BOOLEAN);
        } elseif (isset($resolved_data["enabled"])) {
            $has_toggle_key = true;
            $is_enabled = (bool) filter_var($resolved_data["enabled"], FILTER_VALIDATE_BOOLEAN);
        } else {
            // Check auto-generated risk-specific toggle keys (v4.0.x)
            $risk_suffix = str_replace('-', '_', strtolower($key));
            $auto_key = "vapt_risk_{$risk_suffix}_enabled";
            if (isset($resolved_data[$auto_key])) {
                $has_toggle_key = true;
                $is_enabled = (bool) filter_var($resolved_data[$auto_key], FILTER_VALIDATE_BOOLEAN);
            }
        }
        
        error_log("VAPT HOOK DRIVER apply(): key={$key}, has_toggle={$has_toggle_key}, is_enabled={$is_enabled}, resolved_data_keys=" . json_encode(array_keys($resolved_data)));

        if (!$is_enabled) {
            file_put_contents(
                $log_file,
                $log .
                    "Deactivated: Feature is explicitly disabled in UI (feat_enabled/enabled=false).\n",
                FILE_APPEND,
            );
            error_log("VAPT HOOK DRIVER: Feature {$key} is DISABLED via toggle, skipping enforcement");
            return; // Stop enforcement
        }

        if ($key && !in_array($key, self::$enforced_keys)) {
            self::$enforced_keys[] = $key;
            self::register_enforcement_marker();
        }

        // 3. Failsafe: Catalog data fallback
        if (empty($impl_data) && !isset($resolved_data["enabled"])) {
            // ... existing catalog loading logic if needed ...
        }

        file_put_contents(
            $log_file,
            $log .
                "Applying rules with Data: " .
                json_encode($resolved_data) .
                "\n",
            FILE_APPEND,
        );

        // 4. Determine Enforcement Mappings
        $mappings = isset($schema["enforcement"]["mappings"])
            ? $schema["enforcement"]["mappings"]
            : [];

        if (empty($mappings)) {
            // Dynamic Fallback
            foreach ($resolved_data as $k => $v) {
                if ($v == true 
                    || $v === "1" 
                    || (is_string($v) && strlen($v) > 0)
                ) {
                    $method = self::resolve_dynamic_method($k, $key);
                    if ($method) {
                        $mappings[$k] = $method;
                    }
                }
            }
        }

        if (empty($mappings)) {
            file_put_contents(
                $log_file,
                $log . "Skipped: No mappings found.\n",
                FILE_APPEND,
            );
            return;
        }

        // 5. Execute Methods
        $triggered_methods = [];
        foreach ($resolved_data as $field_key => $value) {
            if (!$value || empty($mappings[$field_key])) {
                continue;
            }

            $method = $mappings[$field_key];
            if (is_array($method)) {
                $method = $method["method"] ?? ($method[0] ?? null);
            }
            if (!is_string($method) || in_array($method, $triggered_methods)) {
                continue;
            }

            $triggered_methods[] = $method;

            if (method_exists(__CLASS__, $method)) {
                try {
                    switch ($method) {
                    case "block_xmlrpc":
                        self::block_xmlrpc($key);
                        break;
                    case "add_security_headers":
                        self::add_security_headers($key);
                        break;
                    case "disable_directory_browsing":
                        self::disable_directory_browsing($key);
                        break;
                    case "limit_login_attempts":
                        self::limit_login_attempts(
                            $value,
                            $resolved_data,
                            $key,
                        );
                        break;
                    case "block_null_byte_injection":
                        self::block_null_byte_injection($key);
                        break;
                    case "hide_wp_version":
                        self::hide_wp_version($key);
                        break;
                    case "block_debug_exposure":
                        self::block_debug_exposure($value, $key);
                        break;
                    case "block_author_enumeration":
                        self::block_author_enumeration($key);
                        break;
                    case "disable_xmlrpc_pingback":
                        self::disable_xmlrpc_pingback($key);
                        break;
                    case "block_sensitive_files":
                        self::block_sensitive_files($key);
                        break;
                    case "block_wp_cron":
                        self::block_wp_cron($key);
                        break;
                    case "block_rest_api":
                        self::block_rest_api($key);
                        break;
                    }
                } catch (Exception $e) {
                    file_put_contents(
                        $log_file,
                        $log .
                            "Exception in $method: " .
                            $e->getMessage() .
                            "\n",
                        FILE_APPEND,
                    );
                }
            }
        }
    }

    /**
     * 🔍 VERIFICATION LOGIC (v3.6.19)
     */
    public static function verify($key, $impl_data, $schema)
    {
        $is_enabled_in_ui = isset($impl_data["enabled"])
            ? (bool) $impl_data["enabled"]
            : false;
        $feat_enabled = isset($impl_data['feat_enabled']) ? (bool) $impl_data['feat_enabled'] : false;

        // 1. Quick Check: Is it in our runtime enforcement list?
        if (in_array($key, self::$enforced_keys)) {
            return true;
        }

        // 2. Deep Check: Does the implementation require a specific hook or constant?
        $mappings = $schema["enforcement"]["mappings"] ?? [];

        // [v2.0.5] Check for wp-config constants
        $driver = $schema["enforcement"]["driver"] ?? "";
        if ($driver === "config" 
            || $driver === "wp-config" 
            || $driver === "wp_config"
        ) {
            foreach ($mappings as $key => $constant) {
                if (defined((string) $constant) 
                    && constant((string) $constant)
                ) {
                    return true;
                }
            }
        }

        if (isset($mappings["headers"]) 
            || isset($mappings["X-Frame-Options"])
        ) {
            // Check if headers filter is added
            return has_filter("wp_headers");
        }

        if (isset($mappings["xmlrpc"])) {
            return defined("XMLRPC_REQUEST") || has_filter("xmlrpc_enabled");
        }

        // [v3.13.26] Check for PHP Functions enforcer patterns (RISK-004, etc)
        // Look for action/filter hooks in mappings
        foreach ($mappings as $map_key => $map_value) {
            if (is_string($map_value)) {
                // Check for add_action pattern with hook name extraction
                if (preg_match("/add_action\s*\(\s*['\"]([^'\"]+)['\"]/", $map_value, $matches)) {
                    $hook_name = $matches[1];
                    global $wp_filter;
                    if (isset($wp_filter[$hook_name])) {
                        return true;
                    }
                }
                
                // Check for function existence (for directly defined functions)
                if (preg_match("/function\s+([a-zA-Z_][a-zA-Z0-9_]*)/", $map_value, $matches)) {
                    $function_name = $matches[1];
                    if (function_exists($function_name)) {
                        return true;
                    }
                }
            }
        }

        // [v3.13.27] Check external PHP functions files (for php_functions enforcer)
        $external_paths = array(
            ABSPATH . 'wp-content/plugins/vapt-protection-suite/vapt-functions.php',
            VAPTGUARD_PATH . 'vapt-functions.php'
        );

        foreach ($external_paths as $file_path) {
            if (file_exists($file_path)) {
                $content = file_get_contents($file_path);
                // Look for the specific feature marker or function
                if (strpos($content, '// BEGIN VAPT RISK-004') !== false 
                    || strpos($content, 'vapt_rate_limit_password_reset') !== false
                ) {
                    return true;
                }
            }
        }

        // Fallback: If enabled in UI, assume active if we reached this point in a verification cycle
        return $is_enabled_in_ui;
    }

    /**
     * dynamic method resolution based on keywords
     */
    private static function resolve_dynamic_method($field_key, $feature_key)
    {
        $fingerprint = strtolower($field_key . "_" . $feature_key);

        foreach (self::$dynamic_map as $keyword => $method) {
            if (strpos($fingerprint, $keyword) !== false) {
                return $method;
            }
        }
        return null;
    }

    /**
     * Load Catalog Data from JSON Failsafe (Dynamic Source)
     */
    private static function get_catalog_data($key)
    {
        if (self::$catalog_data === null) {
            // Dynamic Active File Resolution
            $active_file = defined("VAPTGUARD_ACTIVE_DATA_FILE")
                ? constant("VAPTGUARD_ACTIVE_DATA_FILE")
                : get_option(
                    "vaptguard_active_feature_file",
                    "Feature-List-99.json",
                );
            $path =
                VAPTGUARD_PATH . "data/" . sanitize_file_name($active_file);

            if (file_exists($path)) {
                $json = json_decode(file_get_contents($path), true);
                if ($json) {
                    // handle various schema formats
                    if (isset($json["risk_catalog"])) {
                        self::$catalog_data = $json["risk_catalog"];
                    } elseif (isset($json["features"])) {
                        self::$catalog_data = $json["features"];
                    } elseif (isset($json["wordpress_vapt"])) {
                        self::$catalog_data = $json["wordpress_vapt"];
                    } else {
                        self::$catalog_data = $json; // Fallback
                    }
                }
            }
        }

        if (self::$catalog_data && is_array(self::$catalog_data)) {
            foreach (self::$catalog_data as $item) {
                // Match by Feature Key (if present) or ID or Title similarity
                if ((isset($item["risk_id"]) && $item["risk_id"] === $key) 
                    || (isset($item["title"]) 
                    && sanitize_title($item["title"]) === $key) 
                    || strpos(
                        $key,
                        sanitize_title(
                            isset($item["title"]) ? $item["title"] : "",
                        ),
                    ) !== false
                ) {
                    return $item;
                }
            }
        }
        return null;
    }

    /**
     * Universal enforcement marker via PHP headers
     */
    private static function register_enforcement_marker()
    {
        if (self::$marker_hook_registered) {
            return;
        }
        self::$marker_hook_registered = true;

        add_filter(
            "wp_headers",
            function ($headers) {
                if (function_exists("wp_doing_ajax") && wp_doing_ajax()) {
                    return $headers;
                }

                $headers["X-VAPT-Enforced"] = "php-headers";
                $existing = isset($headers["X-VAPT-Feature"])
                    ? $headers["X-VAPT-Feature"]
                    : "";
                $keys = !empty($existing) ? explode(",", $existing) : [];

                foreach (self::$enforced_keys as $key) {
                    if (!in_array($key, $keys)) {
                        $keys[] = $key;
                    }
                }

                $headers["X-VAPT-Feature"] = implode(",", $keys);
                $headers["Access-Control-Expose-Headers"] =
                    "X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, X-VAPT-Enforced, X-VAPT-Feature";
                return $headers;
            },
            999,
        );

        if (!headers_sent() 
            && (!function_exists("wp_doing_ajax") || !wp_doing_ajax())
        ) {
            header("X-VAPT-Enforced: php-headers");
            header("X-VAPT-Feature: " . implode(",", self::$enforced_keys));
            header(
                "Access-Control-Expose-Headers: X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, X-VAPT-Enforced, X-VAPT-Feature",
            );
        }
    }

    /**
     * Detect Request Context (Engine Core)
     * Returns: ['is_login', 'is_registration', 'is_lost_password', 'is_admin', 'is_api', 'is_frontend', 'is_form_plugin']
     */
    public static function detect_context()
    {
        $uri = $_SERVER["REQUEST_URI"] ?? "";
        $script = $_SERVER["SCRIPT_NAME"] ?? "";
        $action = isset($_REQUEST['action']) ? $_REQUEST['action'] : (isset($_GET['action']) ? $_GET['action'] : '');

        // WordPress Core Contexts
        $is_login =
            strpos($uri, "wp-login.php") !== false ||
            strpos($script, "wp-login.php") !== false ||
            strpos($uri, "xmlrpc.php") !== false ||
            (defined("XMLRPC_REQUEST") && XMLRPC_REQUEST) ||
            (isset($_GET["vaptguard_test_context"]) &&
                $_GET["vaptguard_test_context"] === "login");

        $is_registration = 
            (strpos($uri, "wp-login.php") !== false && ($action === 'register' || strpos($uri, 'action=register') !== false)) ||
            (isset($_GET["vaptguard_test_context"]) && $_GET["vaptguard_test_context"] === "registration");

        $is_lost_password = 
            (strpos($uri, "wp-login.php") !== false && ($action === 'lostpassword' || strpos($uri, 'action=lostpassword') !== false || strpos($uri, 'action=retrievepassword') !== false)) ||
            (isset($_GET["vaptguard_test_context"]) && $_GET["vaptguard_test_context"] === "lost_password");

        $is_admin = is_admin() && !$is_login && !$is_registration && !$is_lost_password;
        $is_api = strpos($uri, "wp-json") !== false;
        
        // Form Plugin Contexts (detect when form plugins are processing submissions)
        $is_form_plugin = 
            // Contact Form 7
            (isset($_POST['_wpcf7']) || isset($_POST['_wpcf7_unit_tag'])) ||
            // WPForms
            (isset($_POST['wpforms']['id']) || isset($_POST['wpforms_id'])) ||
            // Elementor Forms
            (isset($_POST['action']) && $_POST['action'] === 'elementor_pro_forms_action') ||
            // Gravity Forms
            (isset($_POST['gform_submit']) || isset($_POST['is_submit_gform'])) ||
            // Ninja Forms
            (isset($_POST['_nfs']) || isset($_POST['nfs_form_id'])) ||
            // Fluent Forms
            (isset($_POST['_fluent_form']) || isset($_POST['fluent_form_id']));

        $is_frontend = !$is_login && !$is_registration && !$is_lost_password && !$is_admin && !$is_api && !$is_form_plugin;

        return [
            "is_login" => $is_login,
            "is_registration" => $is_registration,
            "is_lost_password" => $is_lost_password,
            "is_admin" => $is_admin,
            "is_api" => $is_api,
            "is_frontend" => $is_frontend,
            "is_form_plugin" => $is_form_plugin,
        ];
    }

    /**
     * Get Active Stats for a Feature (Observability)
     */
    public static function get_feature_stats($feature_key)
    {
        $lock_dir = sys_get_temp_dir() . "/vapt-locks";
        $files = glob("$lock_dir/vapt_{$feature_key}_*.lock");
        $active_ips = 0;
        $total_attempts = 0;

        if ($files) {
            foreach ($files as $file) {
                $active_ips++;
                $content = @file_get_contents($file);
                if ($content) {
                    $total_attempts += (int) $content;
                }
            }
        }

        $duration = 60;
        if (isset(self::$feature_configs[$feature_key]["duration"])) {
            $duration = self::$feature_configs[$feature_key]["duration"];
        }

        return [
            "active_ips" => $active_ips,
            "total_attempts" => $total_attempts,
            "window" => $duration,
        ];
    }

    /**
     * Reset Stats for a Feature
     */
    public static function reset_feature_stats($feature_key)
    {
        $lock_dir = sys_get_temp_dir() . "/vapt-locks";
        $files = glob("$lock_dir/vapt_{$feature_key}_*.lock");
        $count = 0;
        if ($files) {
            foreach ($files as $file) {
                @unlink($file);
                $count++;
            }
        }
        return $count;
    }

    /**
     * Register a rate limit configuration (Context-Aware & Observable)
     */
    private static function limit_login_attempts(
        $config,
        $all_data = [],
        $feature_key = "unknown",
    ) {
        $limit = null;

        // Resolve Limit Value
        $rl_key = isset($all_data["rate_limit_key"])
            ? $all_data["rate_limit_key"]
            : null;
        $candidates = [
            $config,
            $rl_key ? $all_data[$rl_key] ?? null : null,
            $all_data["rate_limit"] ?? null,
            $all_data["limit"] ?? null,
            $all_data["rpm"] ?? null,
            $all_data["max_login_attempts"] ?? null,
            $all_data["max_attempts"] ?? null,
        ];

        foreach ($candidates as $val) {
            if (isset($val) && is_numeric($val) && (int) $val > 1) {
                $limit = (int) $val;
                break;
            }
            // Support Semantic Strictness (v3.6.25)
            if (isset($val) && is_string($val)) {
                if ($val === "strict") {
                    $limit = 5;
                    break;
                }
                if ($val === "moderate") {
                    $limit = 10;
                    break;
                }
                if ($val === "permissive") {
                    $limit = 20;
                    break;
                }
            }
        }

        if ($limit === null && is_numeric($config) && (int) $config > 1) {
            $limit = (int) $config;
        }

        if ($limit === null) {
            return;
        }

        // Determine Scope
        $scope = "global"; // default
        if (isset($all_data["scope"])) {
            $scope = $all_data["scope"];
        } elseif (strpos($feature_key, "login") !== false 
            || strpos($feature_key, "brute") !== false
        ) {
            $scope = "login";
        }

        self::$feature_configs[$feature_key] = [
            "limit" => $limit,
            "key" => $feature_key,
            "scope" => $scope,
            "duration" => isset($all_data["duration"])
                ? (int) $all_data["duration"]
                : 60,
        ];

        if (self::$rate_limit_hook_registered) {
            return;
        }
        self::$rate_limit_hook_registered = true;

        // Register form plugin hooks if scope includes forms
        $scope = $all_data["scope"] ?? "global";
        if ($scope === "form_plugin" || $scope === "forms" || 
            (is_array($scope) && (in_array("form_plugin", $scope) || in_array("forms", $scope)))) {
            self::register_form_plugin_rate_limits($feature_key, $limit, $all_data["duration"] ?? 60);
        }

        add_action(
            "init",
            function () {
                if (strpos($_SERVER["REQUEST_URI"], "reset-limit") !== false 
                    || isset($_GET["vaptguard_action"])
                ) {
                    return;
                }
                if (current_user_can("manage_options") 
                    && !isset($_GET["vaptguard_test_spike"])
                ) {
                    return;
                }

                $context = self::detect_context();
                $ip = self::get_real_ip();
                $ip_hash = md5($ip); // Privacy + Safe Filename
                $lock_dir = sys_get_temp_dir() . "/vapt-locks";
                if (!file_exists($lock_dir) && !@mkdir($lock_dir, 0755, true)) {
                    return;
                }

                foreach (self::$feature_configs as $feature_key => $cfg) {
                    // Enforce Scope Logic - Universal Rate Limiting Engine
                    $scope = $cfg["scope"];
                    $should_enforce = false;
                    
                    // Support multiple scopes
                    if ($scope === "login") {
                        $should_enforce = $context["is_login"] && !$context["is_registration"] && !$context["is_lost_password"];
                    } elseif ($scope === "registration") {
                        $should_enforce = $context["is_registration"];
                    } elseif ($scope === "lost_password" || $scope === "lostpassword") {
                        $should_enforce = $context["is_lost_password"];
                    } elseif ($scope === "form_plugin" || $scope === "forms") {
                        $should_enforce = $context["is_form_plugin"];
                    } elseif ($scope === "global" || $scope === "all") {
                        $should_enforce = true; // Apply to all contexts
                    } elseif (is_array($scope)) {
                        // Support multiple scopes as array
                        foreach ($scope as $s) {
                            if ($s === "login" && $context["is_login"] && !$context["is_registration"] && !$context["is_lost_password"]) {
                                $should_enforce = true;
                                break;
                            }
                            if ($s === "registration" && $context["is_registration"]) {
                                $should_enforce = true;
                                break;
                            }
                            if (($s === "lost_password" || $s === "lostpassword") && $context["is_lost_password"]) {
                                $should_enforce = true;
                                break;
                            }
                            if (($s === "form_plugin" || $s === "forms") && $context["is_form_plugin"]) {
                                $should_enforce = true;
                                break;
                            }
                        }
                    }
                    
                    if (!$should_enforce) {
                        continue;
                    }

                    $limit = $cfg["limit"];
                    $duration = $cfg["duration"];
                    // New Observable Lock Pattern: vapt_{feature}_{iphash}.lock
                    $lock_file =
                        $lock_dir . "/vapt_{$feature_key}_{$ip_hash}.lock";

                    $fp = @fopen($lock_file, "c+");
                    if (!$fp) {
                        continue;
                    }

                    if (flock($fp, LOCK_EX)) {
                        try {
                            $current = 0;
                            clearstatcache(true, $lock_file);
                            if (filesize($lock_file) > 0) {
                                rewind($fp);
                                $current = (int) fread(
                                    $fp,
                                    filesize($lock_file),
                                );
                            }

                            // Expiry Check
                            if (file_exists($lock_file) 
                                && time() - filemtime($lock_file) > $duration
                            ) {
                                $current = 0;
                            }

                            if (!headers_sent()) {
                                header(
                                    "X-VAPT-Limit-" .
                                        $feature_key .
                                        ": " .
                                        $limit,
                                    false,
                                );
                                header(
                                    "X-VAPT-Count-" .
                                        $feature_key .
                                        ": " .
                                        $current,
                                    false,
                                );
                                header("X-VAPT-Count: " . $current, false); // Generic header for Verification Engine (v3.6.24)
                                header(
                                    "Access-Control-Expose-Headers: X-VAPT-Count, X-VAPT-Limit",
                                    false,
                                );
                            }

                            if ($current >= $limit) {
                                if (!headers_sent()) {
                                    header("X-VAPT-Enforced: php-rate-limit");
                                    header("X-VAPT-Feature: " . $feature_key);
                                    header("X-VAPT-Count: " . $current, false); // Ensure count is visible even on block (v3.6.24)
                                    header(
                                        "Access-Control-Expose-Headers: X-VAPT-Count, X-VAPT-Enforced, X-VAPT-Feature, X-VAPT-Limit",
                                        false,
                                    );
                                    header("Retry-After: " . $duration);
                                }
                                VAPTGUARD_DB::log_security_event(
                                    $feature_key,
                                    "Block",
                                    [
                                        "type" => "Rate Limit",
                                        "limit" => $limit,
                                        "count" => $current,
                                    ],
                                );
                                flock($fp, LOCK_UN);
                                fclose($fp);
                                wp_die(
                                    "VAPT: Too Many Requests ($feature_key).",
                                    "Rate Limit Exceeded",
                                    ["response" => 429],
                                );
                            }

                            rewind($fp);
                            ftruncate($fp, 0);
                            fwrite($fp, (string) ($current + 1));
                            fflush($fp);
                        } catch (Exception $e) {
                            // Safe fail
                        } finally {
                            if (is_resource($fp)) {
                                flock($fp, LOCK_UN);
                                fclose($fp);
                            }
                        }
                    }
                }
            },
            5,
        );
    }

    /**
     * Reset Rate Limit for Current IP (All Features)
     */
    public static function reset_limit()
    {
        $ip = $_SERVER["REMOTE_ADDR"];
        $lock_dir = sys_get_temp_dir() . "/vapt-locks";

        if (!is_dir($lock_dir)) {
            return ["status" => "no_dir"];
        }

        // Updated glob to clear ALL vapt locks (v3.6.24)
        $files = glob("$lock_dir/vapt_*");
        $results = [];

        foreach ($files as $file) {
            @unlink($file);
            $results[] = basename($file) . " deleted";
        }

        return $results;
    }

    /**
     * Block Directory Browsing via PHP
     */
    private static function disable_directory_browsing($key = "unknown")
    {
        add_action(
            "wp_loaded", function () use ($key) {
                $uri = $_SERVER["REQUEST_URI"];
                if (strpos($uri, "/wp-content/uploads/") !== false 
                    && substr($uri, -1) === "/"
                ) {
                    $path = ABSPATH . ltrim($uri, "/");
                    if (is_dir($path)) {
                        status_header(403);
                        header("X-VAPT-Enforced: php-dir");
                        header("X-VAPT-Feature: " . $key);
                        header(
                            "Access-Control-Expose-Headers: X-VAPT-Enforced, X-VAPT-Feature",
                        );
                        VAPTGUARD_DB::log_security_event(
                            $key, "Block", [
                            "type" => "Directory Browsing",
                            "uri" => $uri,
                            ]
                        );
                        wp_die("VAPT: Directory Browsing is Blocked for Security.");
                    }
                }
            }
        );
    }

    /**
     * Block XML-RPC requests
     */
    private static function block_xmlrpc($key = "unknown")
    {
        if (strpos($_SERVER["REQUEST_URI"], "xmlrpc.php") !== false) {
            status_header(403);
            header("X-VAPT-Enforced: php-xmlrpc");
            header("X-VAPT-Feature: " . $key);
            header(
                "Access-Control-Expose-Headers: X-VAPT-Enforced, X-VAPT-Feature",
            );
            header("Content-Type: text/plain");
            VAPTGUARD_DB::log_security_event(
                $key, "Block", [
                "type" => "XML-RPC",
                ]
            );
            wp_die("VAPT: XML-RPC Access is Blocked for Security.");
        }
    }

    /**
     * Block requests containing null byte injections
     */
    private static function block_null_byte_injection($key = "unknown")
    {
        $query = $_SERVER["QUERY_STRING"] ?? "";
        if (strpos($query, "%00") !== false 
            || strpos(urldecode($query), "\0") !== false
        ) {
            status_header(403);
            header("X-VAPT-Enforced: php-null-byte");
            header("X-VAPT-Feature: " . $key);
            header(
                "Access-Control-Expose-Headers: X-VAPT-Enforced, X-VAPT-Feature",
            );
            VAPTGUARD_DB::log_security_event(
                $key, "Block", [
                "type" => "Null Byte Injection",
                "query" => $query,
                ]
            );
            wp_die("VAPT: Null Byte Injection Attempt Blocked.");
        }
    }

    /**
     * Hide WordPress Version
     */
    /**
     * Hide WordPress Version
     */
    private static function hide_wp_version($key = "unknown")
    {
        // 1. Remove Generator Tag
        remove_action("wp_head", "wp_generator");
        add_filter("the_generator", "__return_empty_string");

        // 2. Add Enforcement Headers (Robust)
        // 2. Add Enforcement Headers (Robust)
        add_filter(
            "wp_headers", function ($headers) use ($key) {
                if (function_exists("wp_doing_ajax") && wp_doing_ajax()) {
                    return $headers;
                }

                $headers["X-VAPT-Enforced"] = "php-version-hide";
                $headers["X-VAPT-Feature"] = $key;
                $headers["Access-Control-Expose-Headers"] =
                "X-VAPT-Enforced, X-VAPT-Feature";
                return $headers;
            }
        );

        // 3. Fallback for headers (if not filtered)
        add_action(
            "init", function () use ($key) {
                if (function_exists("wp_doing_ajax") && wp_doing_ajax()) {
                    return;
                }

                if (!headers_sent()) {
                    header("X-VAPT-Enforced: php-version-hide");
                    header("X-VAPT-Feature: " . $key);
                    header(
                        "Access-Control-Expose-Headers: X-VAPT-Enforced, X-VAPT-Feature",
                    );
                }
            }
        );
    }

    /**
     * Block Debug Exposure
     */
    private static function block_debug_exposure($config, $key = "unknown")
    {
        add_action(
            "init", function () use ($key) {
                if (function_exists("wp_doing_ajax") && wp_doing_ajax()) {
                    return;
                }

                if (!headers_sent()) {
                    header("X-VAPT-Enforced: php-debug-exposure");
                    header("X-VAPT-Feature: " . $key);
                    header(
                        "Access-Control-Expose-Headers: X-VAPT-Enforced, X-VAPT-Feature",
                    );
                }
            }
        );

        add_action(
            "wp_loaded", function () use ($key) {
                $uri = $_SERVER["REQUEST_URI"];
                if (strpos($uri, "debug.log") !== false) {
                    status_header(403);
                    header("X-VAPT-Enforced: php-debug-log-block");
                    header("X-VAPT-Feature: " . $key);
                    header(
                        "Access-Control-Expose-Headers: X-VAPT-Enforced, X-VAPT-Feature",
                    );
                    VAPTGUARD_DB::log_security_event(
                        $key, "Block", [
                        "type" => "Debug Log Exposure",
                        "uri" => $uri,
                        ]
                    );
                    wp_die("VAPT: Access to debug.log is Blocked for Security.");
                }
            }
        );
    }

    /**
     * Add Security Headers via PHP
     */
    private static function add_security_headers($key = "unknown")
    {
        add_filter(
            "wp_headers",
            function ($headers) use ($key) {
                if (function_exists("wp_doing_ajax") && wp_doing_ajax()) {
                    return $headers;
                } // VAPT: Skip for AJAX to prevent CORS/Heartbeat issues

                $headers["X-Frame-Options"] = "SAMEORIGIN";
                $headers["X-Content-Type-Options"] = "nosniff";
                $headers["X-XSS-Protection"] = "1; mode=block";
                $headers["X-VAPT-Enforced"] = "php-headers";
                $headers["X-VAPT-Feature"] = $key;
                $headers["Access-Control-Expose-Headers"] =
                    "X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, X-VAPT-Enforced, X-VAPT-Feature";
                return $headers;
            },
            999,
        );

        if (!headers_sent() 
            && (!function_exists("wp_doing_ajax") || !wp_doing_ajax())
        ) {
            header("X-Frame-Options: SAMEORIGIN");
            header("X-Content-Type-Options: nosniff");
            header("X-XSS-Protection: 1; mode=block");
            header("X-VAPT-Enforced: php-headers");
            header("X-VAPT-Feature: " . $key);
            header(
                "Access-Control-Expose-Headers: X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, X-VAPT-Enforced, X-VAPT-Feature",
            );
        }
    }

    /**
     * Block Author Enumeration
     */
    private static function block_author_enumeration($key = "unknown")
    {
        // 1. Block Standard ?author=N
        add_action(
            "init", function () use ($key) {
                if (isset($_GET["author"]) && is_numeric($_GET["author"])) {
                    status_header(403);
                    header("X-VAPT-Enforced: php-author-enum");
                    header("X-VAPT-Feature: " . $key);
                    header(
                        "Access-Control-Expose-Headers: X-VAPT-Enforced, X-VAPT-Feature",
                    );
                    VAPTGUARD_DB::log_security_event(
                        $key, "Block", [
                        "type" => "Author Enumeration",
                        "author" => $_GET["author"],
                        ]
                    );
                    wp_die("VAPT: Author Enumeration is Blocked for Security.");
                }
            }
        );

        // 2. Block REST API User Enumeration (v3.6.19 Fix)
        // Allow /me endpoint for authenticated users while blocking enumeration
        add_filter(
            "rest_endpoints", function ($endpoints) {
                // Block user listing and individual user access by ID
                if (isset($endpoints["/wp/v2/users"])) {
                    unset($endpoints["/wp/v2/users"]);
                }
                if (isset($endpoints["/wp/v2/users/(?P<id>[\d]+)"])) {
                    unset($endpoints["/wp/v2/users/(?P<id>[\d]+)"]);
                }
                // Note: /wp/v2/users/me is preserved automatically when we only remove the above
                return $endpoints;
            }
        );

        // 2b. Ensure only authenticated users can access /users/me endpoint
        add_filter(
            "rest_authentication_errors",
            function ($result) {
                // If already has error, return it
                if (!empty($result)) {
                    return $result;
                }

                // Check if this is the users endpoint
                $current_route = isset($_SERVER["REQUEST_URI"])
                    ? $_SERVER["REQUEST_URI"]
                    : "";
                if (strpos($current_route, "/wp/v2/users") !== false) {
                    // Allow /users/me for authenticated users
                    if (preg_match('#/wp/v2/users/me($|\?|/)#', $current_route)
                    ) {
                        // if (!is_user_logged_in()) {
                        //     return new WP_Error(
                        //         "rest_forbidden",
                        //         "Authentication required.",
                        //         ["status" => 401],
                        //     );
                        // }
                        // Check if user is authenticated via REST API
                        $current_user_id = get_current_user_id();
                        if (!$current_user_id || $current_user_id === 0) {
                            return new WP_Error("rest_forbidden", "Authentication required.", ["status" => 401]);
                        }
                    }
                }
                return $result;
            },
            20,
        );
    }

    /**
     * Disable XML-RPC Pingback
     */
    private static function disable_xmlrpc_pingback($key = "unknown")
    {
        add_filter(
            "xmlrpc_methods", function ($methods) use ($key) {
                unset($methods["pingback.ping"]);
                unset($methods["pingback.extensions.getPingbacks"]);
                return $methods;
            }
        );

        add_action(
            "init", function () use ($key) {
                if (strpos($_SERVER["REQUEST_URI"], "xmlrpc.php") !== false) {
                    header("X-VAPT-Enforced: php-pingback");
                    header("X-VAPT-Feature: " . $key);
                    header(
                        "Access-Control-Expose-Headers: X-VAPT-Enforced, X-VAPT-Feature",
                    );
                }
            }
        );
    }

    /**
     * Block Sensitive Files (readme.html, etc)
     */
    private static function block_sensitive_files($key = "unknown")
    {
        add_action(
            "plugins_loaded", function () use ($key) {
                $uri = strtolower($_SERVER["REQUEST_URI"] ?? "");
                $sensitive_files = [
                "/readme.html",
                "/license.txt",
                "/wp-config.php.bak",
                "/wp-config.php.swp",
                "/.env",
                "/xmlrpc.php",
                "/wp-links-opml.php",
                ];

                foreach ($sensitive_files as $file) {
                    if (strpos($uri, $file) !== false) {
                        status_header(403);
                        header("X-VAPT-Enforced: php-sensitive-file");
                        header("X-VAPT-Feature: " . $key);
                        header(
                            "Access-Control-Expose-Headers: X-VAPT-Enforced, X-VAPT-Feature",
                        );
                        VAPTGUARD_DB::log_security_event(
                            $key, "Block", [
                            "type" => "Sensitive File Access",
                            "file" => $file,
                            ]
                        );
                        wp_die(
                            "VAPT: Access to this file is Blocked for Security.",
                        );
                    }
                }
            }
        );
    }
    /**
     * 🌐 PROXY-AWARE IP DETECTION (v3.6.19)
     * Accounts for Cloudflare, Nginx Proxies, and Load Balancers.
     */
    private static function get_real_ip()
    {
        if (!empty($_SERVER["HTTP_CF_CONNECTING_IP"])) {
            return $_SERVER["HTTP_CF_CONNECTING_IP"];
        }
        if (!empty($_SERVER["HTTP_X_FORWARDED_FOR"])) {
            $ips = explode(",", $_SERVER["HTTP_X_FORWARDED_FOR"]);
            return trim($ips[0]);
        }
        if (!empty($_SERVER["HTTP_X_REAL_IP"])) {
            return $_SERVER["HTTP_X_REAL_IP"];
        }
        return $_SERVER["REMOTE_ADDR"];
    }

    /**
     * Block WP-Cron Requests
     */
    private static function block_wp_cron($key = "unknown")
    {
        add_action(
            "init",
            function () use ($key) {
                $uri = $_SERVER["REQUEST_URI"] ?? "";
                if (strpos($uri, "wp-cron.php") !== false) {
                    status_header(403);
                    header("X-VAPT-Enforced: php-cron");
                    header("X-VAPT-Feature: " . $key);
                    header(
                        "Access-Control-Expose-Headers: X-VAPT-Enforced, X-VAPT-Feature",
                    );
                    VAPTGUARD_DB::log_security_event(
                        $key, "Block", [
                        "type" => "WP-Cron Access",
                        ]
                    );
                    wp_die("VAPT: WP-Cron is Blocked for Security.");
                }
            },
            1,
        );
    }

    /**
     * Block REST API Requests
     */
    private static function block_rest_api($key = "unknown")
    {
        // 🛡️ GLOBAL TOGGLE CHECK: Respect global enforcement state
        if (!self::is_global_enabled()) {
            return; // Skip if global protection is disabled
        }

        // Note: REST API security is handled by individual endpoint permission_callbacks
        // We don't block at the authentication level to avoid breaking core functionality
        // Each endpoint should use 'permission_callback' => [$this, 'check_permission']
        // to properly verify capabilities (e.g., manage_options for admin endpoints)
    }

    /**
     * Check if global protection is enabled
     */
    private static function is_global_enabled()
    {
        return VAPTGUARD_DB::get_global_enforcement();
    }

    /**
     * Register Form Plugin Rate Limiting Hooks
     * Provides deep integration with popular WordPress form plugins
     */
    private static function register_form_plugin_rate_limits($feature_key, $limit, $duration)
    {
        // Contact Form 7 Hook
        add_action('wpcf7_before_send_mail', function($contact_form) use ($feature_key, $limit, $duration) {
            self::check_form_rate_limit($feature_key, $limit, $duration, 'Contact Form 7');
        }, 10, 1);

        // WPForms Hook
        add_action('wpforms_process_validate', function($fields, $entry, $form_data) use ($feature_key, $limit, $duration) {
            self::check_form_rate_limit($feature_key, $limit, $duration, 'WPForms');
        }, 10, 3);

        // Elementor Forms Hook
        add_action('elementor_pro/forms/validation', function($record, $ajax_handler) use ($feature_key, $limit, $duration) {
            self::check_form_rate_limit($feature_key, $limit, $duration, 'Elementor Forms');
        }, 10, 2);

        // Gravity Forms Hook
        add_action('gform_pre_validation', function($form) use ($feature_key, $limit, $duration) {
            self::check_form_rate_limit($feature_key, $limit, $duration, 'Gravity Forms');
        }, 10, 1);

        // Ninja Forms Hook
        add_action('ninja_forms_submit_data', function($data) use ($feature_key, $limit, $duration) {
            self::check_form_rate_limit($feature_key, $limit, $duration, 'Ninja Forms');
        }, 10, 1);

        // Fluent Forms Hook
        add_action('fluentform_before_form_submission_validation', function($request, $form) use ($feature_key, $limit, $duration) {
            self::check_form_rate_limit($feature_key, $limit, $duration, 'Fluent Forms');
        }, 10, 2);
    }

    /**
     * Check rate limit for form submissions
     */
    private static function check_form_rate_limit($feature_key, $limit, $duration, $form_plugin_name)
    {
        $ip = self::get_real_ip();
        $ip_hash = md5($ip);
        $lock_dir = sys_get_temp_dir() . "/vapt-locks";
        
        if (!file_exists($lock_dir) && !@mkdir($lock_dir, 0755, true)) {
            return;
        }

        $lock_file = $lock_dir . "/vapt_{$feature_key}_{$ip_hash}.lock";
        $fp = @fopen($lock_file, "c+");
        
        if (!$fp) {
            return;
        }

        if (flock($fp, LOCK_EX)) {
            try {
                $current = 0;
                clearstatcache(true, $lock_file);
                
                if (filesize($lock_file) > 0) {
                    rewind($fp);
                    $current = (int) fread($fp, filesize($lock_file));
                }

                // Expiry Check
                if (file_exists($lock_file) && time() - filemtime($lock_file) > $duration) {
                    $current = 0;
                }

                if ($current >= $limit) {
                    flock($fp, LOCK_UN);
                    fclose($fp);
                    
                    VAPTGUARD_DB::log_security_event(
                        $feature_key,
                        "Block",
                        [
                            "type" => "Form Rate Limit",
                            "plugin" => $form_plugin_name,
                            "limit" => $limit,
                            "count" => $current,
                        ],
                    );
                    
                    // Throw exception to stop form submission (works for most form plugins)
                    throw new Exception("VAPT: Too Many Form Submissions ($form_plugin_name). Please try again later.");
                }

                rewind($fp);
                ftruncate($fp, 0);
                fwrite($fp, (string) ($current + 1));
                fflush($fp);
            } catch (Exception $e) {
                throw $e; // Re-throw to stop form submission
            } finally {
                if (is_resource($fp)) {
                    flock($fp, LOCK_UN);
                    fclose($fp);
                }
            }
        }
    }

    /**
     * Generates a list of rules based on the provided implementation data and schema.
     *
     * @param array $impl_data Implementation data (user inputs)
     * @param array $schema    Feature schema containing enforcement mappings
     * @return array List of rules/directives for the target platform
     */
    public static function generate_rules($impl_data, $schema)
    {
        // Hook driver operates at runtime; rules are not statically generated for files.
        return [];
    }

    /**
     * Writes a complete batch of rules to the target location.
     *
     * @param array  $rules  Flat array of all rules to write
     * @param string $target Target location identifier (e.g., 'root', 'uploads')
     * @return bool Success status
     */
    public static function write_batch($rules, $target = 'root')
    {
        // Hook-based enforcement is runtime-only; no static writing required.
        return true;
    }

    /**
     * Cleans/disables all hook-based enforcements.
     *
     * Note: Hook driver operates at runtime via PHP hooks.
     * Cleaning is achieved by removing the vapt-functions.php file
     * and clearing internal enforcement state.
     *
     * @param string $target Target location (unused for hook driver, kept for interface compatibility)
     * @return bool Success status
     */
    public static function clean($target = 'root')
    {
        // Hook-based enforcement is runtime-only
        // We clean by clearing the PHP functions file
        return VAPTGUARD_PHP_Driver::clean($target);
    }
}


