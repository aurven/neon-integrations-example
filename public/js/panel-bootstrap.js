/**
 * Panel Bootstrap Script
 * Must be loaded FIRST (inline or as first external script)
 * Detects iframe embedding and sets up the global prefix
 */

(function(window) {
    'use strict';

    // Detect if embedded
    function isEmbedded() {
        try {
            return window.self !== window.top;
        } catch (e) {
            return true;
        }
    }

    // Set global prefix
    const embedded = isEmbedded();
    const prefix = embedded ? '/neon/api/demo-integration' : '';

    // Create minimal global object
    window.__PANEL_EMBED_PREFIX__ = prefix;
    window.__PANEL_IS_EMBEDDED__ = embedded;

    console.log('[Panel Bootstrap]', {
        embedded: embedded,
        prefix: prefix || '(none)'
    });

    // Helper to fix script src before loading
    window.__fixScriptSrc__ = function(src) {
        if (!src || !embedded) return src;
        if (src.startsWith('http') || src.startsWith('//')) return src;
        if (!src.startsWith('/')) return src;
        if (src.startsWith(prefix)) return src; // Already fixed
        return prefix + src;
    };

})(window);
