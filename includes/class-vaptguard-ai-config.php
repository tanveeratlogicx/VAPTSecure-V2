<?php

if (! defined('ABSPATH')) {
    exit;
}

/**
 * Class VAPTGUARD_AI_Config
 * Handles automated maintenance of the Universal AI Configuration system.
 */
class VAPTGUARD_AI_Config
{
    /**
     * Expected symlink registry
     */
    private static $symlinks = [
        '.windsurfrules' => '.ai/SOUL.md',
        '.clinerules' => '.ai/SOUL.md',
        '.roorules' => '.ai/SOUL.md',
        '.cursor/cursor.rules' => '../.ai/SOUL.md',
        '.gemini/gemini.md' => '../.ai/SOUL.md',
        '.qoder/qoder.rules' => '../.ai/SOUL.md',
        '.trae/trae.rules' => '../.ai/SOUL.md',
        '.kilocode/rules/soul.md' => '../../.ai/SOUL.md',
        '.continue/rules/soul.md' => '../../.ai/SOUL.md',
        '.roo/rules/soul.md' => '../../.ai/SOUL.md',
        '.opencode/instructions/SOUL.md' => '../../.ai/SOUL.md',
        '.github/copilot-instructions.md' => '../.ai/SOUL.md',
        '.junie/guidelines.md' => '../.ai/SOUL.md',
        '.rules' => '.ai/SOUL.md',
    ];

    /**
     * Automated verification and repair of the AI configuration system.
     * Fires on "Implementation Initiation" (Draft -> Develop).
     */
    public static function verify_and_repair()
    {
        $root = VAPTGUARD_PATH;
        $soul_path = $root . '.ai/SOUL.md';

        if (! file_exists($soul_path)) {
            return false;
        }

        $results = [];

        foreach (self::$symlinks as $target_rel => $source_rel) {
            $target_path = $root . $target_rel;
            $parent_dir = dirname($target_path);

            if (! is_dir($parent_dir)) {
                wp_mkdir_p($parent_dir);
            }

            // Check if repair is needed
            if (! self::is_link_valid($target_path, $source_rel)) {
                $results[$target_rel] = self::repair_link($target_path, $source_rel);
            }
        }

        return $results;
    }

    /**
     * Check if a symlink exists and points to the correct source.
     */
    private static function is_link_valid($path, $expected_source)
    {
        if (! file_exists($path) && ! is_link($path)) {
            return false;
        }

        if (is_link($path)) {
            $actual_source = readlink($path);
            // Normalize slashes for comparison
            $actual_source = str_replace('\\', '/', $actual_source);
            $expected_source = str_replace('\\', '/', $expected_source);
            
            return $actual_source === $expected_source;
        }

        // If it's a file but not a link, check if content matches (fallback for systems without links)
        if (file_exists($path) && file_exists(VAPTGUARD_PATH . '.ai/SOUL.md')) {
            return md5_file($path) === md5_file(VAPTGUARD_PATH . '.ai/SOUL.md');
        }

        return false;
    }

    /**
     * Repair or create a symlink.
     */
    private static function repair_link($path, $source)
    {
        if (file_exists($path) || is_link($path)) {
            @unlink($path);
        }

        // Try symlink first
        if (function_exists('symlink')) {
            try {
                if (@symlink($source, $path)) {
                    return 'symlink_created';
                }
            } catch (Exception $e) {
                // Fallback to copy
            }
        }

        // Fallback to copy if symlink fails (e.g., Windows without proper permissions)
        $soul_path = VAPTGUARD_PATH . '.ai/SOUL.md';
        if (file_exists($soul_path)) {
            if (@copy($soul_path, $path)) {
                return 'copy_created';
            }
        }

        return 'failed';
    }
}


