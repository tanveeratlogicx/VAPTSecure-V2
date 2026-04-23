<?php

if (! defined('ABSPATH')) {
    exit;
}

/**
 * Build generator for client delivery packages.
 *
 * Phase 4 scope:
 * - Generate a downloadable build zip.
 * - Enforce Release-only feature inclusion.
 * - Emit domain-lock config.
 * - Record build history.
 */
class VAPTGUARD_Build
{
    /**
     * Generate a downloadable build package.
     *
     * @param array $data Build payload from REST endpoint.
     * @return string Download URL.
     * @throws Exception On build failures.
     */
    public static function generate($data)
    {
        if (!class_exists('ZipArchive')) {
            throw new Exception('ZipArchive extension is not available on this server.');
        }

        $domain = self::normalize_domain(isset($data['domain']) ? $data['domain'] : '');
        $version = self::normalize_version(isset($data['version']) ? $data['version'] : '');
        $requested_features = isset($data['features']) && is_array($data['features']) ? $data['features'] : array();

        if ($domain === '' || $version === '') {
            throw new Exception('Invalid build payload: domain and version are required.');
        }

        $release_features = self::filter_release_features($requested_features);
        if (empty($release_features)) {
            throw new Exception('No Release features available for this build.');
        }

        $uploads = wp_upload_dir();
        if (!empty($uploads['error'])) {
            throw new Exception('Unable to resolve upload directory: ' . $uploads['error']);
        }

        $base_build_dir = trailingslashit($uploads['basedir']) . 'vaptguard-builds';
        $base_build_url = trailingslashit($uploads['baseurl']) . 'vaptguard-builds';
        if (! file_exists($base_build_dir)) {
            wp_mkdir_p($base_build_dir);
        }

        $token = gmdate('Ymd-His') . '-' . wp_generate_password(6, false, false);
        $plugin_slug = 'vaptguard-pro';
        $working_dir = trailingslashit($base_build_dir) . 'work-' . $token;
        $package_root = trailingslashit($working_dir) . $plugin_slug;
        $zip_filename = sprintf(
            '%s-%s-%s-%s.zip',
            $plugin_slug,
            sanitize_file_name($domain),
            sanitize_file_name($version),
            sanitize_file_name($token)
        );
        $zip_path = trailingslashit($base_build_dir) . $zip_filename;
        $zip_url = trailingslashit($base_build_url) . $zip_filename;

        if (!wp_mkdir_p($package_root)) {
            throw new Exception('Failed to create build working directory.');
        }

        self::copy_directory(VAPTGUARD_PATH, $package_root, self::get_copy_exclusions());
        self::mark_as_client_build($package_root);

        $include_data = !empty($data['include_data']);
        if (!$include_data) {
            self::strip_data_payloads($package_root);
        }

        $include_config = !array_key_exists('include_config', $data) || !empty($data['include_config']);
        if ($include_config) {
            $license_scope = isset($data['license_scope']) ? sanitize_key($data['license_scope']) : 'single';
            $installation_limit = isset($data['installation_limit']) ? intval($data['installation_limit']) : 1;
            $restrict_features = !empty($data['restrict_features']);

            $config_content = self::generate_config_content(
                $domain,
                $version,
                $release_features,
                null,
                $license_scope,
                $installation_limit,
                $restrict_features
            );

            file_put_contents(trailingslashit($package_root) . 'vapt-locked-config.php', $config_content);
        }

        $white_label = isset($data['white_label']) && is_array($data['white_label']) ? $data['white_label'] : array();
        self::apply_white_label($package_root, $white_label, $version);
        self::client_strip($package_root);

        self::create_zip_from_directory($package_root, $zip_path);
        self::remove_directory($working_dir);

        if (class_exists('VAPTGUARD_DB')) {
            VAPTGUARD_DB::record_build($domain, $version, $release_features);
        }

        return $zip_url;
    }

    /**
     * Generate a locked config payload used by builds and server-side config export.
     *
     * @param string     $domain Locked domain.
     * @param string     $version Build version.
     * @param array      $features Allowed feature keys.
     * @param array|null $white_label Optional white label payload (reserved).
     * @param string     $license_scope single|multisite.
     * @param int        $installation_limit Max installations.
     * @param bool       $restrict_features Whether to enforce feature constants.
     * @return string
     */
    public static function generate_config_content(
        $domain,
        $version,
        $features,
        $white_label = null,
        $license_scope = 'single',
        $installation_limit = 1,
        $restrict_features = false
    ) {
        $domain = self::normalize_domain($domain);
        $version = self::normalize_version($version);
        $license_scope = sanitize_key((string) $license_scope);
        $installation_limit = max(1, intval($installation_limit));
        $restrict_features = (bool) $restrict_features;
        $features = array_values(array_unique(array_filter(array_map(array(__CLASS__, 'normalize_feature_key'), (array) $features))));

        $lines = array();
        $lines[] = '<?php';
        $lines[] = '/**';
        $lines[] = ' * VAPTGuard generated config.';
        $lines[] = ' * Build Version: ' . $version;
        $lines[] = ' * Locked Domain: ' . $domain;
        $lines[] = ' * Generated At: ' . gmdate('c');
        $lines[] = ' */';
        $lines[] = '';
        $lines[] = "if (!defined('ABSPATH')) { exit; }";
        $lines[] = '';
        $lines[] = "define( 'VAPTGUARD_DOMAIN_LOCKED', true );";
        $lines[] = "define( 'VAPTGUARD_CLIENT_BUILD', true );";
        $lines[] = "define( 'VAPTGUARD_LOCKED_DOMAIN', '" . self::php_single_quote($domain) . "' );";
        $lines[] = "define( 'VAPTGUARD_BUILD_VERSION', '" . self::php_single_quote($version) . "' );";
        $lines[] = "define( 'VAPTGUARD_LICENSE_SCOPE', '" . self::php_single_quote($license_scope) . "' );";
        $lines[] = "define( 'VAPTGUARD_INSTALLATION_LIMIT', " . $installation_limit . " );";
        $lines[] = "define( 'VAPTGUARD_RESTRICT_FEATURES', " . ($restrict_features ? 'true' : 'false') . " );";
        $lines[] = '';

        foreach ($features as $feature_key) {
            $const_name = strtoupper(str_replace('-', '_', $feature_key));
            $lines[] = "define( 'VAPTGUARD_FEATURE_{$const_name}', true );";
        }

        if (!empty($features)) {
            $quoted = array_map(
                function ($key) {
                    return "'" . self::php_single_quote($key) . "'";
                },
                $features
            );
            $lines[] = '';
            $lines[] = 'if (!defined(\'VAPTGUARD_ALLOWED_FEATURES\')) {';
            $lines[] = '    define(\'VAPTGUARD_ALLOWED_FEATURES\', array(' . implode(',', $quoted) . '));';
            $lines[] = '}';
        }

        return implode("\n", $lines) . "\n";
    }

    /**
     * Validate current host against locked domain.
     *
     * @param string $domain Expected domain.
     * @return bool
     */
    public static function verify_domain_lock($domain)
    {
        $domain = self::normalize_domain($domain);
        if ($domain === '') {
            return false;
        }

        $current_host = self::normalize_domain(isset($_SERVER['HTTP_HOST']) ? wp_unslash($_SERVER['HTTP_HOST']) : '');
        if ($current_host === '') {
            $site_host = parse_url(home_url('/'), PHP_URL_HOST);
            $current_host = self::normalize_domain((string) $site_host);
        }

        if ($current_host === '') {
            return false;
        }

        if (strpos($domain, '*.') === 0) {
            $base = substr($domain, 2);
            return $current_host === $base || preg_match('/\.'. preg_quote($base, '/') . '$/i', $current_host) === 1;
        }

        return $current_host === $domain || $current_host === 'www.' . $domain || ('www.' . $current_host) === $domain;
    }

    /**
     * Keep only release-state keys based on DB status table.
     *
     * @param array $features Requested keys.
     * @return array
     */
    private static function filter_release_features($features)
    {
        global $wpdb;

        $normalized = array_values(array_unique(array_filter(array_map(array(__CLASS__, 'normalize_feature_key'), (array) $features))));
        if (empty($normalized)) {
            return array();
        }

        $table = $wpdb->prefix . 'vaptguard_feature_status';
        $placeholders = implode(',', array_fill(0, count($normalized), '%s'));
        $query = "SELECT feature_key, status FROM {$table} WHERE feature_key IN ({$placeholders})";
        $rows = $wpdb->get_results($wpdb->prepare($query, $normalized), ARRAY_A);

        $release_map = array();
        foreach ((array) $rows as $row) {
            $status = strtolower((string) $row['status']);
            if ($status === 'release' || $status === 'implemented') {
                $release_map[self::normalize_feature_key($row['feature_key'])] = true;
            }
        }

        $filtered = array();
        foreach ($normalized as $key) {
            if (isset($release_map[$key])) {
                $filtered[] = $key;
            }
        }

        return $filtered;
    }

    /**
     * Remove nonessential payloads from generated package.
     *
     * @param string $package_root Build root.
     * @return void
     */
    private static function strip_data_payloads($package_root)
    {
        $data_dir = trailingslashit($package_root) . 'data';
        if (!is_dir($data_dir)) {
            return;
        }

        $active = basename(VAPTGUARD_ACTIVE_DATA_FILE);
        $allow = array(
            $active,
            'Feature-List-159-Adaptive-Updated.json',
            'Updated_Feature_List_159_Adaptive.json',
            'enforcer_pattern_library_v2.0.json',
        );

        $items = glob($data_dir . '/*.json');
        if (!$items) {
            return;
        }

        foreach ($items as $item) {
            $name = basename($item);
            if (!in_array($name, $allow, true)) {
                @unlink($item);
            }
        }
    }

    /**
     * Apply white-label fields to plugin header in generated build.
     *
     * @param string $package_root Build root.
     * @param array  $white_label White-label payload.
     * @param string $version Build version.
     * @return void
     */
    private static function apply_white_label($package_root, $white_label, $version)
    {
        $entry = trailingslashit($package_root) . 'vaptguard.php';
        if (!file_exists($entry)) {
            return;
        }

        $content = file_get_contents($entry);
        if (!is_string($content) || $content === '') {
            return;
        }

        $map = array(
            'Plugin Name' => isset($white_label['name']) ? sanitize_text_field($white_label['name']) : '',
            'Plugin URI' => isset($white_label['plugin_uri']) ? esc_url_raw($white_label['plugin_uri']) : '',
            'Description' => isset($white_label['description']) ? sanitize_text_field($white_label['description']) : '',
            'Version' => $version,
            'Author' => isset($white_label['author']) ? sanitize_text_field($white_label['author']) : '',
            'Author URI' => isset($white_label['author_uri']) ? esc_url_raw($white_label['author_uri']) : '',
            'Text Domain' => isset($white_label['text_domain']) ? sanitize_key($white_label['text_domain']) : '',
        );

        foreach ($map as $label => $value) {
            if ($value === '') {
                continue;
            }
            $content = preg_replace('/^(\s*\*\s*' . preg_quote($label, '/') . ':\s*).+$/mi', '$1' . $value, $content);
        }

        file_put_contents($entry, $content);
    }

    /**
     * Mark generated plugin package as client build at bootstrap level.
     *
     * @param string $package_root Build root.
     * @return void
     */
    private static function mark_as_client_build($package_root)
    {
        $entry = trailingslashit($package_root) . 'vaptguard.php';
        if (!file_exists($entry)) {
            return;
        }

        $content = file_get_contents($entry);
        if (!is_string($content) || $content === '') {
            return;
        }

        if (strpos($content, "define('VAPTGUARD_CLIENT_BUILD'") !== false || strpos($content, 'define("VAPTGUARD_CLIENT_BUILD"') !== false) {
            return;
        }

        $needle = "if (!defined('ABSPATH')) {\n    exit; // Exit if accessed directly.\n}\n";
        $insert = "\nif (!defined('VAPTGUARD_CLIENT_BUILD')) {\n    define('VAPTGUARD_CLIENT_BUILD', true);\n}\n";

        if (strpos($content, $needle) !== false) {
            $content = str_replace($needle, $needle . $insert, $content);
        } else {
            // Fallback insert right after opening tag.
            $content = preg_replace('/^\s*<\?php\s*/', "<?php\n\nif (!defined('VAPTGUARD_CLIENT_BUILD')) {\n    define('VAPTGUARD_CLIENT_BUILD', true);\n}\n\n", $content, 1);
        }

        file_put_contents($entry, $content);
    }

    /**
     * Client packaging strip pass.
     *
     * This keeps a conservative strip list to avoid breaking runtime.
     *
     * @param string $package_root Build root.
     * @return void
     */
    private static function client_strip($package_root)
    {
        $paths = array(
            trailingslashit($package_root) . '.git',
            trailingslashit($package_root) . 'tests',
            trailingslashit($package_root) . 'temp',
            trailingslashit($package_root) . 'plan',
            trailingslashit($package_root) . 'PHASE-1-Core-Foundation.md',
            trailingslashit($package_root) . 'PHASE-2-Core-Functionality.md',
            trailingslashit($package_root) . 'PHASE-3-Feature-System.md',
            trailingslashit($package_root) . 'PHASE-4-Build-ClientViews.md',
            trailingslashit($package_root) . 'Implementation-Plan-Merged.md',
            trailingslashit($package_root) . 'MASTER-INDEX.md',
            trailingslashit($package_root) . 'Codex-Findings_21Apr_1356Hrs.md',
            trailingslashit($package_root) . 'AGENT_CONTEXT_VAPTBUILDER_DATAFILE.md',
            trailingslashit($package_root) . 'AGENT_CONTEXT_VAPTBUILDER_DATAFILE-MultipleDataFiles.md',
        );

        foreach ($paths as $path) {
            if (is_dir($path)) {
                self::remove_directory($path);
            } elseif (file_exists($path)) {
                @unlink($path);
            }
        }
    }

    /**
     * Copy plugin tree into temporary package root.
     *
     * @param string $source Source root.
     * @param string $target Target root.
     * @param array  $exclude Relative paths to skip.
     * @return void
     */
    private static function copy_directory($source, $target, $exclude = array())
    {
        $source = rtrim($source, "\\/");
        $target = rtrim($target, "\\/");
        $exclude_map = array_fill_keys($exclude, true);

        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($source, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::SELF_FIRST
        );

        foreach ($iterator as $item) {
            $src_path = $item->getPathname();
            $relative = ltrim(str_replace($source, '', $src_path), '\\/');
            $relative = str_replace('\\', '/', $relative);

            if ($relative === '') {
                continue;
            }

            foreach ($exclude_map as $excluded => $_enabled) {
                if ($relative === $excluded || strpos($relative, $excluded . '/') === 0) {
                    continue 2;
                }
            }

            $dest_path = $target . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative);
            if ($item->isDir()) {
                if (!file_exists($dest_path)) {
                    mkdir($dest_path, 0775, true);
                }
            } else {
                $dest_dir = dirname($dest_path);
                if (!file_exists($dest_dir)) {
                    mkdir($dest_dir, 0775, true);
                }
                copy($src_path, $dest_path);
            }
        }
    }

    /**
     * Create ZIP archive from directory.
     *
     * @param string $source_dir Directory to archive.
     * @param string $zip_path Output zip file.
     * @return void
     * @throws Exception On zip failure.
     */
    private static function create_zip_from_directory($source_dir, $zip_path)
    {
        $zip = new ZipArchive();
        if ($zip->open($zip_path, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new Exception('Failed to create zip archive.');
        }

        $source_dir = rtrim($source_dir, "\\/");
        $root_name = basename($source_dir);
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($source_dir, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::SELF_FIRST
        );

        foreach ($iterator as $item) {
            $path = $item->getPathname();
            $relative = ltrim(str_replace($source_dir, '', $path), '\\/');
            $relative = str_replace('\\', '/', $relative);
            $archive_path = $root_name . '/' . $relative;

            if ($item->isDir()) {
                $zip->addEmptyDir($archive_path);
            } else {
                $zip->addFile($path, $archive_path);
            }
        }

        $zip->close();
    }

    /**
     * Recursively delete a directory.
     *
     * @param string $dir Directory path.
     * @return void
     */
    private static function remove_directory($dir)
    {
        if (!is_dir($dir)) {
            return;
        }

        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST
        );

        foreach ($iterator as $item) {
            if ($item->isDir()) {
                @rmdir($item->getPathname());
            } else {
                @unlink($item->getPathname());
            }
        }

        @rmdir($dir);
    }

    /**
     * Paths to skip while copying plugin source.
     *
     * @return array
     */
    private static function get_copy_exclusions()
    {
        return array(
            '.git',
            '.github',
            '.vscode',
            'node_modules',
            'vendor/bin',
            'tests',
            'temp',
            'plan',
            'VAPTSecureV2-00.zip',
            'VAPTSecureV2-01.zip',
            'VAPTSecureV2-03.zip',
        );
    }

    /**
     * Normalize and sanitize domain values.
     *
     * @param string $domain Raw domain.
     * @return string
     */
    private static function normalize_domain($domain)
    {
        $domain = strtolower(trim((string) $domain));
        if ($domain === '') {
            return '';
        }

        $domain = preg_replace('#^https?://#', '', $domain);
        $domain = preg_replace('#/.*$#', '', $domain);
        $domain = rtrim($domain, '.');

        if ($domain === '') {
            return '';
        }

        if (strpos($domain, '*.') === 0) {
            $base = substr($domain, 2);
            $base = preg_replace('/[^a-z0-9\.\-]/', '', $base);
            return $base === '' ? '' : '*.' . $base;
        }

        return preg_replace('/[^a-z0-9\.\-]/', '', $domain);
    }

    /**
     * Normalize feature key.
     *
     * @param string $key Raw key.
     * @return string
     */
    private static function normalize_feature_key($key)
    {
        $key = strtolower(trim((string) $key));
        $key = preg_replace('/[^a-z0-9\-_]/', '-', $key);
        $key = preg_replace('/-+/', '-', $key);
        return trim($key, '-');
    }

    /**
     * Normalize version string.
     *
     * @param string $version Raw version.
     * @return string
     */
    private static function normalize_version($version)
    {
        $version = trim((string) $version);
        if ($version === '') {
            return '';
        }
        return preg_replace('/[^0-9A-Za-z\.\-_]/', '', $version);
    }

    /**
     * Escape single-quoted PHP literal.
     *
     * @param string $value Raw value.
     * @return string
     */
    private static function php_single_quote($value)
    {
        return str_replace(array('\\', "'"), array('\\\\', "\\'"), (string) $value);
    }
}
