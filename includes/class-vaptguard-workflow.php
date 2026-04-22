<?php

if (! defined('ABSPATH')) {
    exit;
}

/**
 * Class VAPTGUARD_Workflow
 * Manages the state machine and history for security features.
 */
class VAPTGUARD_Workflow
{
    /**
     * Normalize a status value to the canonical title-case form.
     */
    public static function normalize_status($status)
    {
        if (class_exists('VAPTGUARD_DB')) {
            return VAPTGUARD_DB::normalize_status($status);
        }

        $status = strtolower(trim((string) $status));
        $map = array(
            'available'   => 'Draft',
            'draft'       => 'Draft',
            'develop'     => 'Develop',
            'in_progress' => 'Develop',
            'testing'     => 'Test',
            'test'        => 'Test',
            'implemented' => 'Release',
            'release'     => 'Release',
        );

        return isset($map[$status]) ? $map[$status] : ucfirst($status);
    }

    /**
     * Normalize a status value to the canonical lookup key.
     */
    public static function normalize_status_key($status)
    {
        return strtolower(self::normalize_status($status));
    }

    /**
     * Validate if a transition from old status to new status is allowed.
     */
    public static function is_transition_allowed($old_status, $new_status)
    {
        // Map legacy status if they exist and normalize to lowercase for rules
        $old = self::normalize_status_key($old_status);
        $new = self::normalize_status_key($new_status);

        if ($old === $new) { return true;
        }

        // CRITICAL - Adjacent States Only (Phase 3)
        $rules = array(
        'draft'   => array('develop'),
        'develop' => array('draft', 'test'),      // NOT 'release' - must go through test
        'test'    => array('develop', 'release'),
        'release' => array('test')                 // NOT 'develop' or 'draft' - must go through test
        );

        return isset($rules[$old]) && in_array($new, $rules[$old]);
    }

    /**
     * Transition a feature to a new status.
     */
    public static function transition_feature($feature_key, $new_status, $note = '', $user_id = 0)
    {
        global $wpdb;
        $table_status = $wpdb->prefix . 'vaptguard_feature_status';
        $table_history = $wpdb->prefix . 'vaptguard_feature_history';

        error_log("VAPT WORKFLOW: Starting transition for feature '{$feature_key}' from current status to '{$new_status}'");

        // Get current status
        $current = $wpdb->get_row(
            $wpdb->prepare(
                "SELECT status FROM $table_status WHERE feature_key = %s",
                $feature_key
            )
        );

        $old_status = $current ? self::normalize_status($current->status) : 'Draft';
        error_log("VAPT WORKFLOW: Feature '{$feature_key}' current status is '{$old_status}'");

        if (! self::is_transition_allowed($old_status, $new_status)) {
            error_log("VAPT WORKFLOW: Invalid transition from '{$old_status}' to '{$new_status}' for feature '{$feature_key}'");
            return new WP_Error('invalid_transition', sprintf(__('Transition from %s to %s is not allowed.', 'vaptguard'), $old_status, $new_status));
        }

        // Update Status
        $new_status = self::normalize_status($new_status);
        $update_data = array('status' => $new_status);
        if ($new_status === 'Release') {
            $update_data['implemented_at'] = current_time('mysql');
        } else {
            $update_data['implemented_at'] = null;
        }

        // 🛡️ Automated Initiation Check (Draft -> Develop)
        if (self::normalize_status_key($old_status) === 'draft' && self::normalize_status_key($new_status) === 'develop') {
            if (class_exists('VAPTGUARD_AI_Config')) {
                VAPTGUARD_AI_Config::verify_and_repair();
            }
        }

        if ($current) {
            $wpdb->update($table_status, $update_data, array('feature_key' => $feature_key));
        } else {
            $update_data['feature_key'] = $feature_key;
            $wpdb->insert($table_status, $update_data);
        }

        // Record History
        $wpdb->insert(
            $table_history, array(
            'feature_key' => $feature_key,
            'old_status'  => $old_status,
            'new_status'  => $new_status,
            'user_id'     => $user_id ? $user_id : get_current_user_id(),
            'note'        => $note,
            'created_at'  => current_time('mysql')
            )
        );

        // Special Case: Reset if moving back to Draft
        if (self::normalize_status_key($new_status) === 'draft') {
            // 1. Wipe History
            $wpdb->delete($table_history, array('feature_key' => $feature_key));

            // 2. Wipe Implementation Data (Meta)
            $table_meta = $wpdb->prefix . 'vaptguard_feature_meta';
            $wpdb->delete($table_meta, array('feature_key' => $feature_key));

            // 3. 🛡️ Trigger Complete Systemic Purge (v4.0.1)
            // Since meta is now null, rebuild_all() will physically remove all rules from files
            // [v4.0.2] Skip if in a batch operation to avoid O(N^2) performance hit
            if (empty($note) || strpos($note, 'Batch') === false) {
                if (file_exists(VAPTGUARD_PATH . 'includes/class-vaptguard-enforcer.php')) {
                    include_once VAPTGUARD_PATH . 'includes/class-vaptguard-enforcer.php';
                    VAPTGUARD_Enforcer::rebuild_all();
                }
            }
        }

        return true;
    }

    /**
     * Get history for a feature.
     */
    public static function get_history($feature_key)
    {
        global $wpdb;
        $table_history = $wpdb->prefix . 'vaptguard_feature_history';

        return $wpdb->get_results(
            $wpdb->prepare(
                "SELECT h.*, u.display_name as user_name 
       FROM $table_history h
       LEFT JOIN {$wpdb->users} u ON h.user_id = u.ID
       WHERE h.feature_key = %s 
       ORDER BY h.created_at DESC",
                $feature_key
            )
        );
    }

    /**
     * Preview what would be affected by a batch revert to Draft.
     * Does NOT make any changes - read-only operation.
     * 
     * Broken features = Features in Draft status that have history records.
     * These indicate a feature was transitioned but history wasn't properly cleaned.
     * 
     * @param  bool $include_broken  Whether to include broken features in the preview
     * @param  bool $include_release Whether to include Release features in the preview
     * @return array Preview of affected features and data
     */
    public static function preview_revert_to_draft($include_broken = false, $include_release = false)
    {
        global $wpdb;

        $table_status = $wpdb->prefix . 'vaptguard_feature_status';
        $table_history = $wpdb->prefix . 'vaptguard_feature_history';
        $table_meta = $wpdb->prefix . 'vaptguard_feature_meta';

        // 1. Get all features in 'Develop' status
        $develop_features = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT feature_key, implemented_at, assigned_to, 'develop' as source FROM $table_status WHERE status = %s",
                self::normalize_status('Develop')
            ), ARRAY_A
        );

        // 2. Get BROKEN features (Draft status + has history records)
        // These are features that have history but are in Draft state (inconsistent)
        $broken_features = $wpdb->get_results(
            "SELECT DISTINCT s.feature_key, s.implemented_at, s.assigned_to, 'broken' as source
       FROM $table_status s
       INNER JOIN $table_history h ON s.feature_key = h.feature_key
       WHERE s.status = 'Draft'",
            ARRAY_A
        );

        // 3. Get RELEASE features (Always fetch total for UI count)
        $release_features = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT feature_key, implemented_at, assigned_to, 'release' as source FROM $table_status WHERE status = %s",
                self::normalize_status('Release')
            ), ARRAY_A
        );

        // 4. Merge based on flags
        $all_features = $develop_features ?: array();
        if ($include_broken && $broken_features) {
            $all_features = array_merge($all_features, $broken_features);
        }
        if ($include_release && $release_features) {
            $all_features = array_merge($all_features, $release_features);
        }

        if (empty($all_features)) {
            return array(
            'success' => true,
            'count' => 0,
            'features' => array(),
            'total_history_records' => 0,
            'total_with_schema' => 0,
            'total_with_impl' => 0,
            'broken_count' => count($broken_features ?: array()),
            'develop_count' => count($develop_features ?: array()),
            'release_count' => count($release_features ?: array()),
            'included_broken_count' => 0,
            'included_release_count' => 0,
            'message' => 'No features in Develop or Release status to revert.'
            );
        }

        $feature_keys = wp_list_pluck($all_features, 'feature_key');

        // Build IN clause safely
        $placeholders = implode(',', array_fill(0, count($feature_keys), '%s'));
        $prepared_in = $wpdb->prepare($placeholders, $feature_keys);

        // 4. Count history records per feature
        $history_counts = $wpdb->get_results(
            "SELECT feature_key, COUNT(*) as count FROM $table_history WHERE feature_key IN ($prepared_in) GROUP BY feature_key",
            OBJECT_K
        );

        // 5. Check which features have implementation data
        $impl_data = $wpdb->get_results(
            "SELECT feature_key, generated_schema IS NOT NULL as has_schema, implementation_data IS NOT NULL as has_impl 
       FROM $table_meta WHERE feature_key IN ($prepared_in)",
            OBJECT_K
        );

        // 6. Build preview response
        $preview = array();
        $broken_count = 0;
        $release_count = 0;
        foreach ($all_features as $feature) {
            $key = $feature['feature_key'];
            $is_broken = isset($feature['source']) && $feature['source'] === 'broken';
            $is_release = isset($feature['source']) && $feature['source'] === 'release';
            if ($is_broken) { $broken_count++;
            }
            if ($is_release) { $release_count++;
            }

            $preview[] = array(
            'feature_key' => $key,
            'implemented_at' => $feature['implemented_at'],
            'assigned_to' => $feature['assigned_to'],
            'source' => isset($feature['source']) ? $feature['source'] : 'develop',
            'is_broken' => $is_broken,
            'is_release' => $is_release,
            'history_records' => isset($history_counts[$key]) ? (int) $history_counts[$key]->count : 0,
            'has_generated_schema' => isset($impl_data[$key]) && (bool) $impl_data[$key]->has_schema,
            'has_implementation_data' => isset($impl_data[$key]) && (bool) $impl_data[$key]->has_impl,
            );
        }

        return array(
        'success' => true,
        'count' => count($preview),
        'broken_count' => count($broken_features ?: array()),
        'develop_count' => count($develop_features ?: array()),
        'release_count' => count($release_features ?: array()),
        'included_broken_count' => $broken_count,
        'included_release_count' => $release_count,
        'features' => $preview,
        'total_history_records' => array_sum(wp_list_pluck($preview, 'history_records')),
        'total_with_schema' => count(
            array_filter(
                $preview, function ($f) {
                    return $f['has_generated_schema'];
                }
            )
        ),
        'total_with_impl' => count(
            array_filter(
                $preview, function ($f) {
                    return $f['has_implementation_data'];
                }
            )
        ),
        );
    }

    /**
     * Batch revert all features in 'Develop' status to 'Draft'.
     * Optionally includes broken features (Draft status + has history records).
     * Optionally includes Release features.
     * 
     * @param  string $note            Optional note for the operation
     * @param  bool   $include_broken  Whether to include broken features
     * @param  bool   $include_release Whether to include Release features
     * @return array Result with counts of affected features
     */
    public static function batch_revert_to_draft($note = 'Batch revert to Draft', $include_broken = false, $include_release = false)
    {
        global $wpdb;

        $table_status = $wpdb->prefix . 'vaptguard_feature_status';
        $table_history = $wpdb->prefix . 'vaptguard_feature_history';
        $table_meta = $wpdb->prefix . 'vaptguard_feature_meta';

        // 1. Get all features in 'Develop' status
        $develop_features = $wpdb->get_col(
            $wpdb->prepare(
                "SELECT feature_key FROM $table_status WHERE status = %s",
                self::normalize_status('Develop')
            )
        );

        // 2. Get BROKEN features (Draft status + has history records)
        $broken_features = $wpdb->get_col(
            "SELECT DISTINCT s.feature_key
       FROM $table_status s
       INNER JOIN $table_history h ON s.feature_key = h.feature_key
       WHERE s.status = 'Draft'"
        );

        // 3. Get RELEASE features
        $release_features = $wpdb->get_col(
            $wpdb->prepare(
                "SELECT feature_key FROM $table_status WHERE status = %s",
                self::normalize_status('Release')
            )
        );

        // 4. Merge based on flags
        $all_features = $develop_features ?: array();
        if ($include_broken && $broken_features) {
            $all_features = array_unique(array_merge($all_features, $broken_features));
        }
        if ($include_release && $release_features) {
            $all_features = array_unique(array_merge($all_features, $release_features));
        }

        if (empty($all_features)) {
            return array(
            'success' => true,
            'reverted_count' => 0,
            'broken_count' => count($broken_features ?: array()),
            'develop_count' => count($develop_features ?: array()),
            'release_count' => count($release_features ?: array()),
            'message' => 'No features in Develop or Release status to revert.'
            );
        }

        // [v4.0.3] BULK DATABASE OPTIMIZATION
        // Instead of N calls to transition_feature, we perform bulk deletes and updates.
        
        $placeholders = implode(',', array_fill(0, count($all_features), '%s'));
        
        // A. Wipe History for all selected features
        $wpdb->query($wpdb->prepare("DELETE FROM $table_history WHERE feature_key IN ($placeholders)", $all_features));
        
        // B. Wipe Meta (Implementation Data) for all selected features
        $wpdb->query($wpdb->prepare("DELETE FROM $table_meta WHERE feature_key IN ($placeholders)", $all_features));
        
        // C. Update Status to 'Draft' for all selected features
        $wpdb->query($wpdb->prepare("UPDATE $table_status SET status = 'Draft', implemented_at = NULL WHERE feature_key IN ($placeholders)", $all_features));

        // D. Clear Enforcement Cache
        delete_transient('vaptguard_active_enforcements');

        // E. Trigger ONE final rebuild to clean up files
        if (file_exists(VAPTGUARD_PATH . 'includes/class-vaptguard-enforcer.php')) {
            include_once VAPTGUARD_PATH . 'includes/class-vaptguard-enforcer.php';
            if (class_exists('VAPTGUARD_Enforcer')) {
                VAPTGUARD_Enforcer::rebuild_all();
            }
        }

        return array(
        'success' => true,
        'reverted_count' => count($all_features),
        'broken_count' => count($broken_features ?: array()),
        'develop_count' => count($develop_features ?: array()),
        'release_count' => count($release_features ?: array()),
        'reverted' => $all_features
        );
    }

    /**
     * Helper to normalize status.
     */
    private static function map_status($status)
    {
        return self::normalize_status($status);
    }
}



