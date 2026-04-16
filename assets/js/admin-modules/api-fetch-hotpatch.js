/**
 * VAPTGuard API Fetch Hotpatch
 * Patches wp.apiFetch to use vaptguard/v1 namespace.
 */
(function() {
    if (typeof wp === 'undefined' || !wp.apiFetch) return;
    var originalFetch = wp.apiFetch;
    wp.apiFetch = function(options) {
        if (options && options.path && options.path.indexOf('vaptsecure/v1') !== -1) {
            options.path = options.path.replace('vaptsecure/v1', 'vaptguard/v1');
        }
        return originalFetch(options);
    };
    Object.assign(wp.apiFetch, originalFetch);
})();