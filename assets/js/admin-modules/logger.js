/**
 * VAPTGuard Admin Logger
 * Provides conditional debug logging for admin modules.
 */
window.vaptguardLog = window.vaptguardLog || function(message, level, data) {
    if (typeof console === 'undefined') return;
    var prefix = '[VAPTGuard]';
    if (level === 'error') {
        console.error(prefix, message, data !== undefined ? data : '');
    } else if (level === 'warn') {
        console.warn(prefix, message, data !== undefined ? data : '');
    } else {
        console.log(prefix, message, data !== undefined ? data : '');
    }
};