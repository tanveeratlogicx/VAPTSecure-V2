<?php

/**
 * VAPTGUARD_PHP_Deployer: Universal Hook-based Fallback
 */

if (!defined('ABSPATH')) { exit;
}

class VAPTGUARD_PHP_Deployer implements VAPTGUARD_Driver_Interface
{
    /**
     * Static wrapper for generate_rules - delegates to php driver
     */
    public static function generate_rules($impl_data, $schema)
    {
        return VAPTGUARD_PHP_Driver::generate_rules($impl_data, $schema);
    }

    /**
     * Static wrapper for write_batch - delegates to php driver
     */
    public static function write_batch($rules, $target = 'root')
    {
        return VAPTGUARD_PHP_Driver::write_batch($rules);
    }

    /**
     * Static wrapper for clean - delegates to php driver
     */
    public static function clean($target = 'root')
    {
        return VAPTGUARD_PHP_Driver::clean();
    }

    // Instance methods below...

    public function can_deploy()
    {
        return true; // Universal fallback
    }

    public function deploy($risk_id, $implementation, $is_enabled = true)
    {
        // PHP implementations are typically handled by VAPTGUARD_Enforcer::runtime_enforcement
        // This deployer just validates that the implementation exists.

        $code = $this->extract_code($implementation);

        if (empty($code)) {
            return new WP_Error('vapt_no_code', 'No PHP protection code found in implementation.');
        }

        // Neutralize code if disabled for consistency across platforms
        if (!$is_enabled) {
            $lines = explode("\n", trim($code));
            $code = implode(
                "\n", array_map(
                    function ($l) {
                        $l = trim($l);
                        if ($l === '') { return '';
                        }
                        return '// ' . ltrim($l, '/ ');
                    }, $lines
                )
            );
        }

        include_once VAPTGUARD_PATH . 'includes/class-vaptguard-enforcer.php';
        VAPTGUARD_Enforcer::rebuild_php_functions();

        return [
        'status' => 'deployed',
        'platform' => 'php_functions',
        'note' => 'Active via vapt-functions.php',
        'code' => $code
        ];
    }

    private function extract_code($implementation)
    {
        if (isset($implementation['code'])) { return $implementation['code'];
        }
        if (isset($implementation['php_functions'])) { return $implementation['php_functions'];
        }

        if (class_exists('VAPTGUARD_Enforcer')) {
            return VAPTGUARD_Enforcer::extract_code_from_mapping($implementation, 'hook');
        }

        return '';
    }

    public function undeploy($risk_id)
    {
        // Nothing to do for PHP hooks as they are active based on the 'is_enforced' meta flag
        return true;
    }
}


