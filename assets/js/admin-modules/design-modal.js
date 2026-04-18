/**
 * VAPTGuard Design Modal
 * Handles the transition modal UI for Draft -> Develop state change.
 */
window.VAPTGuardDesignModal = window.VAPTGuardDesignModal || {
    activeFeatureKey: null,
    open: function(featureKey, featureName) {
        this.activeFeatureKey = featureKey;
        var modal = document.getElementById('vaptguard-transition-modal');
        if (!modal) return;
        var title = modal.querySelector('.vaptguard-modal-title');
        if (title) title.textContent = 'Transition to Develop: ' + (featureName || featureKey);
        modal.style.display = 'flex';
    },
    close: function() {
        var modal = document.getElementById('vaptguard-transition-modal');
        if (modal) modal.style.display = 'none';
        this.activeFeatureKey = null;
    },
    submit: function(note, devInstruct, wireframeUrl, onSuccess, onError) {
        var featureKey = this.activeFeatureKey;
        if (!featureKey) {
            if (typeof onError === 'function') onError('No feature selected');
            return;
        }
        var settings = window.vaptguardSettings || {};
        wp.apiFetch({
            path: '/vaptguard/v1/features/transition',
            method: 'POST',
            data: {
                feature_key: featureKey,
                note: note,
                dev_instruct: devInstruct,
                wireframe_url: wireframeUrl,
                new_status: 'Develop'
            }
        }).then(function(response) {
            window.VAPTGuardDesignModal.close();
            if (typeof onSuccess === 'function') onSuccess(response);
        }).catch(function(err) {
            if (typeof onError === 'function') onError(err);
        });
    }
};