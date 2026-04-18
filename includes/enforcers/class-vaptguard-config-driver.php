<?php

/**
 * VAPTGUARD_Config_Driver
 * Handles enforcement of rules into wp-config.php
 */

if (!defined('ABSPATH')) { exit;
}

class VAPTGUARD_Config_Driver implements VAPTGUARD_Driver_Interface
{
    /**
     * Generates a list of valid wp-config.php defines based on the provided data and schema.
     *
     * @param  array $data   Implementation data (user inputs)
     * @param  array $schema Feature schema containing enforcement mappings
     * @return array List of define statements
     */
    public static function generate_rules($data, $schema)
    {
        $enf_config = isset($schema['enforcement']) ? $schema['enforcement'] : array();
        $rules = array();
        $mappings = isset($enf_config['mappings']) ? $enf_config['mappings'] : array();

        // 🛡️ TWO-WAY DEACTIVATION (v4.0.x - Toggle Detection for wp-config)
        // Check master toggle before generating any rules
        $is_enabled = true;
        if (isset($data['feat_enabled'])) {
            $is_enabled = (bool)filter_var($data['feat_enabled'], FILTER_VALIDATE_BOOLEAN);
        } elseif (isset($data['enabled'])) {
            $is_enabled = (bool)filter_var($data['enabled'], FILTER_VALIDATE_BOOLEAN);
        } else {
            $risk_key = $schema['risk_id'] ?? $schema['id'] ?? $schema['feature_key'] ?? '';
            $risk_suffix = str_replace('-', '_', strtolower($risk_key));
            $auto_key = "vapt_risk_{$risk_suffix}_enabled";
            if (isset($data[$auto_key])) {
                $is_enabled = (bool)filter_var($data[$auto_key], FILTER_VALIDATE_BOOLEAN);
            }
        }
        
        // If feature is disabled, return empty rules (rules will be stripped on next rebuild)
        if (!$is_enabled) {
            error_log("VAPT CONFIG: Feature disabled via toggle, skipping rule generation");
            return array();
        }

        foreach ($mappings as $key => $constant) {
            // [v3.13.31] Robust value detection: if the schema-defined key is missing, check common alternates
            $value = null;
            if (isset($data[$key])) {
                $value = $data[$key];
            } else {
                $risk_key = $schema['risk_id'] ?? $schema['id'] ?? $schema['feature_key'] ?? '';
                $risk_suffix = str_replace('-', '_', strtolower($risk_key));
                $auto_key = "vapt_risk_{$risk_suffix}_enabled";
                if (isset($data[$auto_key])) {
                    $value = $data[$auto_key];
                } elseif (isset($data['feat_enabled'])) {
                    $value = $data['feat_enabled'];
                } elseif (isset($data['enabled'])) {
                    $value = $data['enabled'];
                }
            }

            if ($value !== null) {

                // [v1.4.0] Support for v1.1/v2.0 rich mappings (Platform Objects)
                $constant = VAPTGUARD_Enforcer::extract_code_from_mapping($constant, 'wp-config.php');

                // [FIX v1.3.13] Skip if the value is falsey (for toggles)
                if ($value === false || $value === 0 || $value === '0' || $value === 'off') {
                    continue;
                }

                // Convert to PHP literal
                if (is_bool($value)) {
                    $val_str = $value ? 'true' : 'false';
                } elseif (is_numeric($value)) {
                    $val_str = $value;
                } else {
                    $val_str = "'" . addslashes((string)$value) . "'";
                }

                // Heuristic: If it looks like code (contains newlines, defines, or if-statements), treat as raw PHP
                if (strpos($constant, "\n") !== false || strpos($constant, 'define(') !== false || strpos($constant, 'if(') !== false || strpos($constant, 'if (') !== false || strpos($constant, '/*') !== false) {
                    // It's a raw PHP block, use it as-is
                    $rules[] = $constant;
                } else {
                    // It's a constant name, generate the define()
                    $rules[] = "define('$constant', $val_str);";
                }
            }
        }

        return $rules;
    }

    /**
     * Writes a complete batch of rules to wp-config.php, replacing the previous VAPT block.
     *
     * @param  array  $rules  Flat array of all define statements to write
     * @param  string $target Target location identifier (not used for config driver)
     * @return bool Success status
     */
    public static function write_batch($rules, $target = 'root')
    {
        $all_rules_array = $rules;
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

        $wp_config_path = null;
        foreach (array_unique($paths) as $path) {
            if (@is_file($path) && @is_readable($path) && @is_writable($path)) {
                $wp_config_path = $path;
                break;
            }
        }

        if (!$wp_config_path) {
            $checked = implode(', ', array_unique($paths));
            error_log("VAPT: wp-config.php not writable or not found in standard locations: $checked");
            return false;
        } else {
            // error_log("VAPT: Selected wp-config.php Path: " . $wp_config_path);
        }

        $content = file_get_contents($wp_config_path);
        $line_ending = (strpos($content, "\r\n") !== false) ? "\r\n" : "\n";
        $lines = explode($line_ending, $content);

        $start_marker = "// BEGIN VAPT CONFIG RULES";
        $end_marker = "// END VAPT CONFIG RULES";

        // 1. Identify constants we are managing in this batch (to prevent duplicates)
        $managed_constants = [];
        foreach ($all_rules_array as $rule) {
            if (preg_match("/define\s*\(\s*['\"](.+?)['\"]/i", $rule, $m)) {
                $managed_constants[] = $m[1];
            }
        }

        // 2. Filter existing content: remove old VAPT blocks and any existing definitions of our constants
        $new_lines = [];
        $in_vaptguard_block = false;

        // Standardized Multi-Marker Support (v4.0.1)
        $start_markers = [
        "// BEGIN VAPT CONFIG RULES",
        "/* BEGIN VAPT CONFIG RULES",
        "/* BEGIN VAPT SECURITY RULES",
        "# BEGIN VAPT SECURITY RULES"
        ];
        $end_markers = [
        "// END VAPT CONFIG RULES",
        "/* END VAPT CONFIG RULES",
        "/* END VAPT SECURITY RULES",
        "# END VAPT SECURITY RULES"
        ];

        foreach ($lines as $line) {
            $trimmed = trim($line);

            $found_start = false;
            foreach ($start_markers as $sm) {
                if (strpos($trimmed, $sm) !== false) {
                    $found_start = true;
                    break;
                }
            }

            if ($found_start) {
                $in_vaptguard_block = true;
                // If the marker is appended to code, keep the part BEFORE the marker
                foreach ($start_markers as $sm) {
                    $pos = strpos($line, $sm);
                    if ($pos !== false && $pos > 0) {
                        $new_lines[] = substr($line, 0, $pos);
                    }
                }
                continue;
            }

            $found_end = false;
            foreach ($end_markers as $em) {
                if (strpos($trimmed, $em) !== false) {
                    $found_end = true;
                    break;
                }
            }

            if ($found_end) {
                $in_vaptguard_block = false;
                // If code follows the marker on the same line (rare but possible), keep the part AFTER the marker
                foreach ($end_markers as $em) {
                    $pos = strpos($line, $em);
                    if ($pos !== false) {
                        $after = substr($line, $pos + strlen($em));
                        if (trim($after) !== "") {
                            $new_lines[] = $after; 
                        }
                    }
                }
                continue;
            }
      
            if ($in_vaptguard_block) { continue;
            }

            // Clean up legacy single-line markers
            if (strpos($trimmed, "// Added by VAPT Security") !== false) { continue;
            }

            // Check if this line defines one of our managed constants
            // Robust regex: matches define('CONST', ... or define("CONST", ... with varying whitespace
            $is_managed = false;
            foreach ($managed_constants as $const) {
                if (preg_match("/^\s*define\s*\(\s*['\"]" . preg_quote($const, '/') . "['\"]/i", $trimmed)) {
                    $is_managed = true;
                    break;
                }
            }
            if ($is_managed) { continue;
            }

            $new_lines[] = $line;
        }

        // 3. Prepare new VAPT block
        $vaptguard_block = [];
        if (!empty($all_rules_array)) {
            $vaptguard_block[] = $start_marker;
            foreach ($all_rules_array as $rule) {
                $vaptguard_block[] = $rule;
            }
            $vaptguard_block[] = $end_marker;
        }

        // 4. Insert before "That's all, stop editing" or at end
        $insert_idx = -1;
        $marker = "That's all, stop editing";
        foreach ($new_lines as $i => $line) {
            if (stripos($line, $marker) !== false) {
                $insert_idx = $i;
                break;
            }
        }

        if ($insert_idx !== -1) {
            array_splice($new_lines, $insert_idx, 0, $vaptguard_block);
        } else {
            // Fallback: Before wp-settings.php
            foreach ($new_lines as $i => $line) {
                if (strpos($line, 'wp-settings.php') !== false) {
                      $insert_idx = $i;
                      break;
                }
            }
            if ($insert_idx !== -1) {
                array_splice($new_lines, $insert_idx, 0, $vaptguard_block);
            } else {
                $new_lines = array_merge($new_lines, $vaptguard_block);
            }
        }

        $final_content = implode($line_ending, $new_lines);

        // 5. Final Safety: Check if content changed before writing + Backup
        if ($final_content !== $content) {
            @copy($wp_config_path, $wp_config_path . '.bak');
            $written = @file_put_contents($wp_config_path, $final_content) !== false;
            if ($written) {
                error_log("VAPT: wp-config.php updated successfully. Backup created.");
            }
            return $written;
        }

        return true;
    }

    /**
     * Cleans/removes all VAPT rules from wp-config.php.
     *
     * @param string $target Target location (unused for config driver, kept for interface compatibility)
     * @return bool Success status
     */
    public static function clean($target = 'root')
    {
        return self::write_batch([]);
    }
}


