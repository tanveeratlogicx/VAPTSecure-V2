/**
 * VAPTGuard Domains Module
 * Handles domain management UI interactions.
 */
window.VAPTGuardDomains = window.VAPTGuardDomains || {
    list: [],
    load: function(onSuccess, onError) {
        wp.apiFetch({ path: '/vaptguard/v1/domains' })
            .then(function(response) {
                window.VAPTGuardDomains.list = response.domains || response || [];
                if (typeof onSuccess === 'function') onSuccess(window.VAPTGuardDomains.list);
            })
            .catch(function(err) {
                if (typeof onError === 'function') onError(err);
            });
    },
    update: function(domainData, onSuccess, onError) {
        wp.apiFetch({
            path: '/vaptguard/v1/domains/update',
            method: 'POST',
            data: domainData
        }).then(onSuccess).catch(onError);
    },
    remove: function(domainId, onSuccess, onError) {
        wp.apiFetch({
            path: '/vaptguard/v1/domains/delete',
            method: 'DELETE',
            data: { id: domainId }
        }).then(onSuccess).catch(onError);
    }
};