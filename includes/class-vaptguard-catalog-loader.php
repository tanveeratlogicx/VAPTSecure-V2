<?php

if (!defined('ABSPATH')) {
    exit;
}

class VAPTGUARD_Catalog_Loader
{
    private static function join_path($base, $child)
    {
        return rtrim((string) $base, "\\/") . DIRECTORY_SEPARATOR . ltrim((string) $child, "\\/");
    }

    private static function sanitize_file_name_fallback($filename)
    {
        $filename = basename((string) $filename);
        $filename = preg_replace('/[^A-Za-z0-9._-]/', '-', $filename);
        $filename = preg_replace('/-+/', '-', $filename);
        return trim($filename, '-');
    }

    private static function sanitize_file_name_safe($filename)
    {
        if (function_exists('sanitize_file_name')) {
            return sanitize_file_name($filename);
        }

        return self::sanitize_file_name_fallback($filename);
    }

    public static function resolve_files_to_load($requested_file, $data_dir, $hidden_files = array(), $removed_files = array())
    {
        $files_to_load = array();

        if ($requested_file === '__all__') {
            if (is_dir($data_dir)) {
                $all_json = array_filter(
                    scandir($data_dir), function ($f) {
                        return strtolower(pathinfo($f, PATHINFO_EXTENSION)) === 'json';
                    }
                );
                $hidden_normalized = array_map(array(__CLASS__, 'sanitize_file_name_safe'), $hidden_files);
                $removed_normalized = array_map(array(__CLASS__, 'sanitize_file_name_safe'), $removed_files);

                foreach ($all_json as $f) {
                    $normalized = self::sanitize_file_name_safe($f);
                    if (!in_array($normalized, $hidden_normalized, true) && !in_array($normalized, $removed_normalized, true)) {
                        $files_to_load[] = $f;
                    }
                }
            }
        } else {
            $requested = array_filter(array_map('trim', explode(',', (string) $requested_file)));
            $files_to_load = $requested;
        }

                $files_to_load = array_values(
            array_filter(
                $files_to_load, function ($f) use ($data_dir) {
                    return file_exists(self::join_path($data_dir, self::sanitize_file_name_safe($f)));
                }
            )
        );

        return $files_to_load;
    }

    public static function load_json_file($json_path)
    {
        if (!file_exists($json_path)) {
            return array(
                'success' => false,
                'error' => 'File not found',
                'data' => null,
            );
        }

        $content = file_get_contents($json_path);
        if ($content === false) {
            return array(
                'success' => false,
                'error' => 'Unable to read file',
                'data' => null,
            );
        }

        $decoded = json_decode($content, true);
        if (json_last_error() !== JSON_ERROR_NONE || !is_array($decoded)) {
            return array(
                'success' => false,
                'error' => json_last_error() === JSON_ERROR_NONE ? 'Invalid JSON content' : json_last_error_msg(),
                'data' => null,
            );
        }

        return array(
            'success' => true,
            'error' => null,
            'data' => $decoded,
        );
    }

    public static function extract_feature_map($features_data)
    {
        $features = array();

        if (!is_array($features_data)) {
            return $features;
        }

        if (isset($features_data['_index']['by_risk_id']) && is_array($features_data['_index']['by_risk_id'])) {
            foreach ($features_data['_index']['by_risk_id'] as $risk_id => $feature_key) {
                $features[$feature_key] = array(
                    'category' => 'General',
                    'risk_id' => $risk_id,
                );
            }
        }

        if (empty($features) && isset($features_data['features']) && is_array($features_data['features'])) {
            foreach ($features_data['features'] as $item) {
                if (!is_array($item)) {
                    continue;
                }

                $feature_key = isset($item['id']) ? $item['id'] : (isset($item['key']) ? $item['key'] : '');
                if ($feature_key === '') {
                    continue;
                }

                $features[$feature_key] = array(
                    'category' => isset($item['category']) && $item['category'] ? $item['category'] : 'General',
                    'risk_id' => isset($item['RiskID']) ? $item['RiskID'] : (isset($item['risk_id']) ? $item['risk_id'] : null),
                );
            }
        }

        if (empty($features) && isset($features_data['risk_catalog']) && is_array($features_data['risk_catalog'])) {
            foreach ($features_data['risk_catalog'] as $item) {
                if (!is_array($item)) {
                    continue;
                }

                $feature_key = isset($item['id']) ? $item['id'] : (isset($item['risk_id']) ? $item['risk_id'] : '');
                if ($feature_key === '') {
                    continue;
                }

                $features[$feature_key] = array(
                    'category' => isset($item['category']) && $item['category'] ? $item['category'] : 'General',
                    'risk_id' => isset($item['risk_id']) ? $item['risk_id'] : null,
                );
            }
        }

        if (empty($features) && isset($features_data['risk_interfaces']) && is_array($features_data['risk_interfaces'])) {
            foreach ($features_data['risk_interfaces'] as $risk_id => $item) {
                if (!is_array($item)) {
                    continue;
                }

                $feature_key = isset($item['id']) ? $item['id'] : (isset($item['risk_id']) ? $item['risk_id'] : $risk_id);
                if ($feature_key === '') {
                    continue;
                }

                $features[$feature_key] = array(
                    'category' => isset($item['category']) && $item['category'] ? $item['category'] : 'General',
                    'risk_id' => isset($item['risk_id']) ? $item['risk_id'] : $risk_id,
                );
            }
        }

        return $features;
    }
}
