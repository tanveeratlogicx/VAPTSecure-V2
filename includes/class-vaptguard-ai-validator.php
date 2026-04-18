<?php
/**
 * VAPTSecure AI Validator
 *
 * Validates AI-generated code against the VAPTSecure rubric.
 * Provides automated scoring and failure detection for enforcement code,
 * UI components, and driver manifest entries.
 *
 * @package VAPTSecure
 * @version 2.6.1
 * @since 2.6.1
 */

if (!defined('ABSPATH')) {
    exit; // Exit if accessed directly
}

/**
 * Class VAPTGUARD_AI_Validator
 *
 * Validates AI-generated output against VAPTSecure compliance rules.
 */
class VAPTGUARD_AI_Validator {

    /**
     * Rubric checks with weights
     *
     * @var array
     */
    private $rubric = array(
        'component_ids_valid' => array(
            'weight' => 2,
            'description' => 'Component IDs match interface_schema_v2.0 exactly - no fabricated IDs'
        ),
        'pattern_library_used' => array(
            'weight' => 2,
            'description' => 'All enforcement code read from enforcer_pattern_library_v2.0 - nothing from memory'
        ),
        'severity_colors_valid' => array(
            'weight' => 1,
            'description' => 'Severity badge colors match global_ui_config.severity_badge_colors'
        ),
        'handler_names_valid' => array(
            'weight' => 1,
            'description' => 'Handler names follow naming_conventions (handleRISK{NNN}ToggleChange etc.)'
        ),
        'platform_available' => array(
            'weight' => 1,
            'description' => 'Platform is listed in risk_interfaces[rid].available_platforms'
        ),
        'block_markers_present' => array(
            'weight' => 1,
            'description' => 'VAPT block markers (begin_marker/end_marker) present in all code output'
        ),
        'verification_present' => array(
            'weight' => 1,
            'description' => 'verification.command present and matches the platform CLI'
        ),
        'no_forbidden_naming' => array(
            'weight' => 1,
            'description' => 'No forbidden patterns (snake_case component IDs, fabricated hook names)'
        ),
        'no_forbidden_htaccess' => array(
            'weight' => 2,
            'description' => 'No forbidden .htaccess directives (TraceEnable, ServerSignature, ServerTokens, <Directory>)'
        ),
        'rewrite_before_wp' => array(
            'weight' => 1,
            'description' => 'All RewriteRule/RewriteCond placed BEFORE # BEGIN WordPress (not after)'
        ),
        'ifmodule_wrapper' => array(
            'weight' => 1,
            'description' => 'All RewriteRule/RewriteCond wrapped in <IfModule mod_rewrite.c> with RewriteEngine On and RewriteBase /'
        ),
        'mod_headers_noted' => array(
            'weight' => 1,
            'description' => 'mod_headers requirement noted for all Header directives'
        ),
        'allowoverride_noted' => array(
            'weight' => 1,
            'description' => 'AllowOverride requirement noted for Options directives'
        ),
        'risk020_target_valid' => array(
            'weight' => 1,
            'description' => 'RISK-020 target_file = wp-content/uploads/.htaccess (not root .htaccess)'
        ),
        'iis_requirements_noted' => array(
            'weight' => 1,
            'description' => 'IIS <rewrite> sections include URL Rewrite Module 2.1 requirement note'
        ),
        'caddy_v2_syntax' => array(
            'weight' => 1,
            'description' => 'Caddy output uses v2 syntax only - no Apache directives, no semicolons, no Order/Deny'
        ),
        'code_ref_valid' => array(
            'weight' => 1,
            'description' => 'code_ref in interface schema uses correct lib_key'
        ),
        'driver_ref_valid' => array(
            'weight' => 1,
            'description' => 'driver_ref in interface schema points to vapt_driver_manifest_v2.0'
        ),
        'driver_fields_complete' => array(
            'weight' => 1,
            'description' => 'All required driver{} sub-fields present'
        ),
        'syntax_matches_target' => array(
            'weight' => 1,
            'description' => 'Payload syntax matches target file engine (.htaccess != PHP, wp-config.php != Apache)'
        )
    );

    /**
     * Forbidden htaccess directives
     *
     * @var array
     */
    private $forbidden_htaccess = array(
        'TraceEnable',
        'ServerSignature',
        'ServerTokens',
        '<Directory',
        '</Directory>',
        '<?php',
    );

    /**
     * Naming convention patterns
     *
     * @var array
     */
    private $naming_patterns = array(
        'component_id' => '/^UI-RISK-\d{3}-\d{3}$/',
        'action_id' => '/^ACTION-\d{3}-\d{3}$/',
        'toggle_handler' => '/^handleRISK\d{3}ToggleChange$/',
        'dropdown_handler' => '/^handleRISK\d{3}DropdownChange$/',
        'settings_key' => '/^vapt_risk_\d{3}_enabled$/',
        'caddy_matcher' => '/^@risk\d{3}$/',
    );

    /**
     * Block markers by enforcer type
     *
     * @var array
     */
    private $block_markers = array(
        'htaccess' => array('begin' => '# BEGIN VAPT', 'end' => '# END VAPT'),
        'nginx' => array('begin' => '# BEGIN VAPT', 'end' => '# END VAPT'),
        'apache' => array('begin' => '# BEGIN VAPT', 'end' => '# END VAPT'),
        'caddy' => array('begin' => '# BEGIN VAPT', 'end' => '# END VAPT'),
        'fail2ban' => array('begin' => '# BEGIN VAPT', 'end' => '# END VAPT'),
        'server_cron' => array('begin' => '# BEGIN VAPT', 'end' => '# END VAPT'),
        'wp_config' => array('begin' => '/* BEGIN VAPT', 'end' => '/* END VAPT'),
        'php_functions' => array('begin' => '// BEGIN VAPT', 'end' => '// END VAPT'),
        'wordpress' => array('begin' => '// BEGIN VAPT', 'end' => '// END VAPT'),
        'wordpress_core' => array('begin' => '// BEGIN VAPT', 'end' => '// END VAPT'),
    );

    /**
     * Constructor
     */
    public function __construct() {
        // Load additional configuration if needed
    }

    /**
     * Validate a complete risk package
     *
     * @param string $risk_id The risk ID (e.g., 'RISK-003')
     * @param array $package The generated package containing UI and enforcement code
     * @return array Validation results with score and failures
     */
    public function validate_risk_package($risk_id, $package) {
        $results = array(
            'score' => 0,
            'max_score' => 20,
            'passed' => array(),
            'failed' => array(),
            'details' => array()
        );

        // Validate UI components
        if (isset($package['ui'])) {
            $ui_results = $this->validate_ui_component($risk_id, $package['ui']);
            $results = $this->merge_results($results, $ui_results);
        }

        // Validate enforcement code for each platform
        if (isset($package['enforcement']) && is_array($package['enforcement'])) {
            foreach ($package['enforcement'] as $platform => $code) {
                $enforcement_results = $this->validate_enforcement_code($risk_id, $platform, $code);
                $results = $this->merge_results($results, $enforcement_results);
            }
        }

        // Validate driver manifest entry
        if (isset($package['driver_manifest'])) {
            $driver_results = $this->validate_driver_manifest($risk_id, $package['driver_manifest']);
            $results = $this->merge_results($results, $driver_results);
        }

        // Calculate final score
        $results['score'] = $this->calculate_score($results['passed']);
        $results['passed_validation'] = ($results['score'] >= 16);

        return $results;
    }

    /**
     * Validate UI component schema
     *
     * @param string $risk_id The risk ID
     * @param array $ui_component The UI component data
     * @return array Validation results
     */
    public function validate_ui_component($risk_id, $ui_component) {
        $results = array(
            'score' => 0,
            'max_score' => 20,
            'passed' => array(),
            'failed' => array(),
            'details' => array()
        );

        // Check 1: Component IDs match interface_schema (simplified check)
        if (isset($ui_component['components']) && is_array($ui_component['components'])) {
            $valid_ids = true;
            foreach ($ui_component['components'] as $component) {
                if (isset($component['id'])) {
                    if (!$this->is_valid_component_id($component['id'], $risk_id)) {
                        $valid_ids = false;
                        $results['details'][] = "Invalid component ID: {$component['id']}";
                    }
                }
            }
            if ($valid_ids) {
                $results['passed'][] = 'component_ids_valid';
            } else {
                $results['failed'][] = 'component_ids_valid';
            }
        }

        // Check 3: Severity badge colors
        if (isset($ui_component['severity']) && isset($ui_component['severity']['color'])) {
            $valid_colors = array('#e53935', '#fb8c00', '#fdd835', '#43a047'); // critical, high, medium, low
            if (in_array($ui_component['severity']['color'], $valid_colors)) {
                $results['passed'][] = 'severity_colors_valid';
            } else {
                $results['failed'][] = 'severity_colors_valid';
            }
        }

        // Check 4: Handler names
        if (isset($ui_component['handlers']) && is_array($ui_component['handlers'])) {
            $valid_handlers = true;
            foreach ($ui_component['handlers'] as $handler_name) {
                if (!$this->is_valid_handler_name($handler_name)) {
                    $valid_handlers = false;
                    $results['details'][] = "Invalid handler name: {$handler_name}";
                }
            }
            if ($valid_handlers) {
                $results['passed'][] = 'handler_names_valid';
            } else {
                $results['failed'][] = 'handler_names_valid';
            }
        }

        $results['score'] = $this->calculate_score($results['passed']);
        return $results;
    }

    /**
     * Validate enforcement code
     *
     * @param string $risk_id The risk ID
     * @param string $platform The platform (htaccess, nginx, etc.)
     * @param string $code The enforcement code
     * @return array Validation results
     */
    public function validate_enforcement_code($risk_id, $platform, $code) {
        $results = array(
            'score' => 0,
            'max_score' => 20,
            'passed' => array(),
            'failed' => array(),
            'details' => array()
        );

        // Check 6: Block markers present
        if ($this->has_block_markers($code, $platform)) {
            $results['passed'][] = 'block_markers_present';
        } else {
            $results['failed'][] = 'block_markers_present';
            $results['details'][] = "Missing VAPT block markers for {$platform}";
        }

        // Check 9: No forbidden htaccess directives
        if ($platform === 'htaccess' || $platform === 'apache') {
            $forbidden_found = $this->check_forbidden_htaccess($code);
            if (empty($forbidden_found)) {
                $results['passed'][] = 'no_forbidden_htaccess';
            } else {
                $results['failed'][] = 'no_forbidden_htaccess';
                $results['details'][] = "Forbidden htaccess directives found: " . implode(', ', $forbidden_found);
            }
        }

        // Check 10: RewriteRule BEFORE # BEGIN WordPress
        if ($platform === 'htaccess') {
            if ($this->is_rewrite_before_wordpress($code)) {
                $results['passed'][] = 'rewrite_before_wp';
            } else {
                $results['failed'][] = 'rewrite_before_wp';
                $results['details'][] = "RewriteRule found after # BEGIN WordPress (dead zone)";
            }
        }

        // Check 11: IfModule wrapper
        if ($platform === 'htaccess' && strpos($code, 'RewriteRule') !== false) {
            if ($this->has_ifmodule_wrapper($code)) {
                $results['passed'][] = 'ifmodule_wrapper';
            } else {
                $results['failed'][] = 'ifmodule_wrapper';
                $results['details'][] = "Missing <IfModule mod_rewrite.c> wrapper";
            }
        }

        // Check 12: mod_headers noted
        if ($platform === 'htaccess' && strpos($code, 'Header ') !== false) {
            if (strpos($code, 'mod_headers') !== false || strpos($code, 'a2enmod headers') !== false) {
                $results['passed'][] = 'mod_headers_noted';
            } else {
                $results['failed'][] = 'mod_headers_noted';
                $results['details'][] = "mod_headers requirement not noted";
            }
        }

        // Check 13: AllowOverride noted
        if ($platform === 'htaccess' && strpos($code, 'Options ') !== false) {
            if (strpos($code, 'AllowOverride') !== false) {
                $results['passed'][] = 'allowoverride_noted';
            } else {
                $results['failed'][] = 'allowoverride_noted';
                $results['details'][] = "AllowOverride requirement not noted";
            }
        }

        // Check 14: RISK-020 target file
        if ($risk_id === 'RISK-020') {
            if (strpos($code, 'uploads/.htaccess') !== false || strpos($code, "uploads' . '/.htaccess") !== false) {
                $results['passed'][] = 'risk020_target_valid';
            } else {
                $results['failed'][] = 'risk020_target_valid';
                $results['details'][] = "RISK-020 must target uploads/.htaccess, not root .htaccess";
            }
        }

        // Check 16: Caddy v2 syntax
        if ($platform === 'caddy') {
            $invalid_patterns = array('RewriteRule', 'RewriteCond', 'Order ', 'Deny ', 'Allow ', ';', '<?php');
            $found_invalid = array();
            foreach ($invalid_patterns as $pattern) {
                if (strpos($code, $pattern) !== false) {
                    $found_invalid[] = $pattern;
                }
            }
            if (empty($found_invalid)) {
                $results['passed'][] = 'caddy_v2_syntax';
            } else {
                $results['failed'][] = 'caddy_v2_syntax';
                $results['details'][] = "Invalid Caddy v2 syntax found: " . implode(', ', $found_invalid);
            }
        }

        // Check 20: Syntax matches target
        if ($this->syntax_matches_target($code, $platform)) {
            $results['passed'][] = 'syntax_matches_target';
        } else {
            $results['failed'][] = 'syntax_matches_target';
            $results['details'][] = "Syntax doesn't match target file type: {$platform}";
        }

        $results['score'] = $this->calculate_score($results['passed']);
        return $results;
    }

    /**
     * Validate driver manifest entry
     *
     * @param string $risk_id The risk ID
     * @param array $manifest_entry The driver manifest entry
     * @return array Validation results
     */
    public function validate_driver_manifest($risk_id, $manifest_entry) {
        $results = array(
            'score' => 0,
            'max_score' => 20,
            'passed' => array(),
            'failed' => array(),
            'details' => array()
        );

        $required_fields = array(
            'write_mode', 'target_file', 'write_block', 'begin_marker', 'end_marker',
            'insertion.anchor_string', 'insertion.anchor_position', 'insertion.fallback',
            'idempotency.check_string', 'idempotency.if_found',
            'backup_required', 'verification.command', 'verification.expected',
            'rollback.begin_marker', 'rollback.end_marker', 'rollback.target_file'
        );

        // Check 19: Driver fields complete
        $missing_fields = array();
        foreach ($required_fields as $field) {
            if (!$this->array_has_path($manifest_entry, $field)) {
                $missing_fields[] = $field;
            }
        }

        if (empty($missing_fields)) {
            $results['passed'][] = 'driver_fields_complete';
        } else {
            $results['failed'][] = 'driver_fields_complete';
            $results['details'][] = "Missing driver fields: " . implode(', ', $missing_fields);
        }

        $results['score'] = $this->calculate_score($results['passed']);
        return $results;
    }

    /**
     * Validate pre-generation checklist completion
     *
     * @param array $checklist The checklist items
     * @return array Validation results
     */
    public function validate_pre_generation_checklist($checklist) {
        $required_items = array(
            'read_interface_schema',
            'read_pattern_library',
            'read_driver_manifest',
            'read_agent_instructions',
            'architecture_confirmed',
            'safety_guardrails_verified',
            'naming_conventions_confirmed'
        );

        $results = array(
            'complete' => true,
            'missing' => array(),
            'verified' => array()
        );

        foreach ($required_items as $item) {
            if (isset($checklist[$item]) && $checklist[$item] === true) {
                $results['verified'][] = $item;
            } else {
                $results['missing'][] = $item;
                $results['complete'] = false;
            }
        }

        return $results;
    }

    /**
     * Generate a validation report
     *
     * @param array $results The validation results
     * @return string Formatted report
     */
    public function generate_report($results) {
        $report = "=== VAPTSecure AI Validation Report ===\n\n";
        $report .= "Score: {$results['score']}/{$results['max_score']}\n";
        $report .= "Status: " . ($results['passed_validation'] ? 'PASSED' : 'FAILED') . "\n";
        $report .= "Minimum Required: 16/20\n\n";

        if (!empty($results['passed'])) {
            $report .= "Passed Checks:\n";
            foreach ($results['passed'] as $check) {
                $report .= "  [PASS] {$this->rubric[$check]['description']}\n";
            }
            $report .= "\n";
        }

        if (!empty($results['failed'])) {
            $report .= "Failed Checks:\n";
            foreach ($results['failed'] as $check) {
                $report .= "  [FAIL] {$this->rubric[$check]['description']}\n";
            }
            $report .= "\n";
        }

        if (!empty($results['details'])) {
            $report .= "Details:\n";
            foreach ($results['details'] as $detail) {
                $report .= "  - {$detail}\n";
            }
            $report .= "\n";
        }

        return $report;
    }

    /**
     * Check if a component ID is valid
     *
     * @param string $id The component ID
     * @param string $risk_id The risk ID for context
     * @return bool
     */
    private function is_valid_component_id($id, $risk_id) {
        $pattern = $this->naming_patterns['component_id'];
        return preg_match($pattern, $id);
    }

    /**
     * Check if a handler name is valid
     *
     * @param string $name The handler name
     * @return bool
     */
    private function is_valid_handler_name($name) {
        $patterns = array(
            $this->naming_patterns['toggle_handler'],
            $this->naming_patterns['dropdown_handler']
        );

        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $name)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Check if code has block markers
     *
     * @param string $code The code to check
     * @param string $platform The platform type
     * @return bool
     */
    private function has_block_markers($code, $platform) {
        if (!isset($this->block_markers[$platform])) {
            return true; // Skip for platforms without markers (cloudflare, iis)
        }

        $markers = $this->block_markers[$platform];
        return (strpos($code, $markers['begin']) !== false && strpos($code, $markers['end']) !== false);
    }

    /**
     * Check for forbidden htaccess directives
     *
     * @param string $code The code to check
     * @return array Found forbidden directives
     */
    private function check_forbidden_htaccess($code) {
        $found = array();
        foreach ($this->forbidden_htaccess as $directive) {
            if (strpos($code, $directive) !== false) {
                $found[] = $directive;
            }
        }
        return $found;
    }

    /**
     * Check if RewriteRule is before WordPress block
     *
     * @param string $code The code to check
     * @return bool
     */
    private function is_rewrite_before_wordpress($code) {
        // Check if RewriteRule exists
        if (strpos($code, 'RewriteRule') === false) {
            return true; // No RewriteRule to check
        }

        // Look for dead zone pattern: RewriteRule after # BEGIN WordPress
        $pattern = '/# BEGIN WordPress.*RewriteRule/s';
        if (preg_match($pattern, $code)) {
            return false; // RewriteRule found after WordPress block
        }

        return true;
    }

    /**
     * Check if code has IfModule wrapper
     *
     * @param string $code The code to check
     * @return bool
     */
    private function has_ifmodule_wrapper($code) {
        return (strpos($code, '<IfModule mod_rewrite.c>') !== false &&
                strpos($code, 'RewriteEngine On') !== false &&
                strpos($code, 'RewriteBase /') !== false);
    }

    /**
     * Check if syntax matches target file
     *
     * @param string $code The code to check
     * @param string $platform The target platform
     * @return bool
     */
    private function syntax_matches_target($code, $platform) {
        // Check for mismatches
        switch ($platform) {
            case 'htaccess':
            case 'apache':
                if (strpos($code, '<?php') !== false || strpos($code, 'define(') !== false) {
                    return false; // PHP in .htaccess = wrong
                }
                break;

            case 'wp_config':
                if (strpos($code, 'RewriteRule') !== false || strpos($code, '<IfModule') !== false) {
                    return false; // Apache in wp-config = wrong
                }
                break;

            case 'php_functions':
            case 'wordpress':
                if (strpos($code, 'RewriteRule') !== false || strpos($code, '<IfModule') !== false) {
                    return false; // Apache in PHP = wrong
                }
                break;
        }

        return true;
    }

    /**
     * Check if array has a dot-notation path
     *
     * @param array $array The array to check
     * @param string $path The dot-notation path
     * @return bool
     */
    private function array_has_path($array, $path) {
        $keys = explode('.', $path);
        $current = $array;

        foreach ($keys as $key) {
            if (!is_array($current) || !isset($current[$key])) {
                return false;
            }
            $current = $current[$key];
        }

        return true;
    }

    /**
     * Merge validation results
     *
     * @param array $existing Existing results
     * @param array $new New results to merge
     * @return array Merged results
     */
    private function merge_results($existing, $new) {
        $merged = array(
            'score' => 0,
            'max_score' => 20,
            'passed' => array_merge($existing['passed'], $new['passed']),
            'failed' => array_merge($existing['failed'], $new['failed']),
            'details' => array_merge($existing['details'], $new['details'])
        );

        return $merged;
    }

    /**
     * Calculate score from passed checks
     *
     * @param array $passed List of passed check IDs
     * @return int The calculated score
     */
    private function calculate_score($passed) {
        $score = 0;
        foreach ($passed as $check) {
            if (isset($this->rubric[$check])) {
                $score += $this->rubric[$check]['weight'];
            }
        }
        return $score;
    }

    /**
     * Run full rubric validation and return formatted result
     *
     * @param string $risk_id The risk ID
     * @param array $package The complete package
     * @return array Results with report
     */
    public function run_full_validation($risk_id, $package) {
        $results = $this->validate_risk_package($risk_id, $package);
        $results['report'] = $this->generate_report($results);
        return $results;
    }
}

// Example usage (commented out):
/*
$validator = new VAPTGUARD_AI_Validator();

$package = array(
    'ui' => array(
        'components' => array(
            array('id' => 'UI-RISK-003-001')
        ),
        'severity' => array('color' => '#e53935'),
        'handlers' => array('handleRISK003ToggleChange')
    ),
    'enforcement' => array(
        'htaccess' => '<IfModule mod_rewrite.c>\n    RewriteEngine On\n    RewriteBase /\n    # BEGIN VAPT RISK-003\n    RewriteRule ^wp-json/wp/v2/users$ - [F,L]\n    # END VAPT RISK-003\n</IfModule>'
    )
);

$results = $validator->run_full_validation('RISK-003', $package);
echo $results['report'];
echo "Passed: " . ($results['passed_validation'] ? 'Yes' : 'No');
*/


