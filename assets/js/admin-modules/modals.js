/**
 * VAPTGuard Admin Modals
 * Shared modal utilities for admin interface.
 */
window.VAPTGuardModals = window.VAPTGuardModals || {
    open: function(modalId) {
        var el = document.getElementById(modalId);
        if (el) el.style.display = 'flex';
    },
    close: function(modalId) {
        var el = document.getElementById(modalId);
        if (el) el.style.display = 'none';
    },
    confirm: function(message, onConfirm, onCancel) {
        if (window.confirm(message)) {
            if (typeof onConfirm === 'function') onConfirm();
        } else {
            if (typeof onCancel === 'function') onCancel();
        }
    }
};