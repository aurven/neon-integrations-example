/**
 * Panel API Helper
 * Centralizes API path management for embedded panels
 *
 * When a panel is embedded in an iframe, API calls are prefixed with /neon/api/demo-integration
 * to route through the parent application's proxy.
 */

(function(window) {
    'use strict';

    /**
     * Check if the current page is embedded in an iframe
     * @returns {boolean} - True if embedded, false otherwise
     */
    function isEmbedded() {
        try {
            return window.self !== window.top;
        } catch (e) {
            // If we can't access window.top due to cross-origin restrictions,
            // we're definitely in an iframe
            return true;
        }
    }

    /**
     * Get the API prefix based on embed status
     * @returns {string} - API prefix (/neon/api/demo-integration if embedded, empty string otherwise)
     */
    function getApiPrefix() {
        // Use bootstrap prefix if available (set by panel-bootstrap.js)
        if (window.__PANEL_EMBED_PREFIX__ !== undefined) {
            return window.__PANEL_EMBED_PREFIX__;
        }
        return isEmbedded() ? '/neon/api/demo-integration' : '';
    }

    /**
     * Build a full API path with proper prefix
     * @param {string} path - The API path (e.g., '/panels/trello/api/boards')
     * @returns {string} - Full API path with prefix if embedded
     */
    function buildApiPath(path) {
        // Ensure path starts with /
        const normalizedPath = path.startsWith('/') ? path : '/' + path;

        const prefix = getApiPrefix();

        if (prefix) {
            console.log(`[Panel API Helper] Embedded mode detected - Prefixing API path: ${prefix}${normalizedPath}`);
            return prefix + normalizedPath;
        }

        return normalizedPath;
    }

    /**
     * Make an API call with automatic path prefix handling
     * @param {string} path - API endpoint path
     * @param {Object} options - Fetch options (method, headers, body, etc.)
     * @returns {Promise<Response>} - Fetch promise
     */
    async function apiCall(path, options = {}) {
        const fullPath = buildApiPath(path);

        // Default options
        const defaultOptions = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        };

        // Merge options
        const fetchOptions = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...options.headers
            }
        };

        console.log(`[Panel API Helper] ${fetchOptions.method} ${fullPath}`);

        try {
            const response = await fetch(fullPath, fetchOptions);

            if (!response.ok) {
                console.error(`[Panel API Helper] API call failed: ${response.status} ${response.statusText}`);
            }

            return response;
        } catch (error) {
            console.error(`[Panel API Helper] API call error:`, error);
            throw error;
        }
    }

    /**
     * Make a JSON API call with automatic parsing
     * @param {string} path - API endpoint path
     * @param {Object} options - Fetch options
     * @returns {Promise<Object>} - Parsed JSON response
     */
    async function apiCallJson(path, options = {}) {
        const response = await apiCall(path, options);

        if (!response.ok) {
            const error = new Error(`API call failed: ${response.status} ${response.statusText}`);
            error.response = response;
            throw error;
        }

        return await response.json();
    }

    /**
     * Build a full URL for resources (like PDF generation endpoints)
     * @param {string} path - Resource path
     * @param {Object} params - Query parameters
     * @returns {string} - Full URL with parameters
     */
    function buildResourceUrl(path, params = {}) {
        const fullPath = buildApiPath(path);
        const url = new URL(fullPath, window.location.origin);

        // Add query parameters
        Object.keys(params).forEach(key => {
            if (params[key] !== null && params[key] !== undefined) {
                url.searchParams.append(key, params[key]);
            }
        });

        return url.toString();
    }

    /**
     * Build a path for static resources (CSS, JS, images, etc.)
     * When embedded, prefixes with /neon/api/demo-integration
     * @param {string} path - Static resource path (e.g., '/js/script.js', '/css/style.css')
     * @returns {string} - Full path with prefix if embedded
     */
    function buildStaticPath(path) {
        // Normalize path
        const normalizedPath = path.startsWith('/') ? path : '/' + path;

        // Don't prefix external resources (http://, https://, //)
        if (/^(https?:)?\/\//.test(normalizedPath)) {
            return normalizedPath;
        }

        const prefix = getApiPrefix();

        if (prefix) {
            console.log(`[Panel API Helper] Prefixing static resource: ${prefix}${normalizedPath}`);
            return prefix + normalizedPath;
        }

        return normalizedPath;
    }

    /**
     * Dynamically load a JavaScript file with proper path handling
     * @param {string} path - Script path
     * @param {Object} options - Load options (async, defer, etc.)
     * @returns {Promise<void>} - Resolves when script is loaded
     */
    function loadScript(path, options = {}) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = buildStaticPath(path);
            script.async = options.async !== undefined ? options.async : true;

            if (options.defer) script.defer = true;
            if (options.type) script.type = options.type;

            script.onload = () => {
                console.log(`[Panel API Helper] Script loaded: ${script.src}`);
                resolve();
            };

            script.onerror = () => {
                console.error(`[Panel API Helper] Failed to load script: ${script.src}`);
                reject(new Error(`Failed to load script: ${path}`));
            };

            document.head.appendChild(script);
        });
    }

    /**
     * Dynamically load a CSS file with proper path handling
     * @param {string} path - CSS path
     * @param {Object} options - Load options (media, etc.)
     * @returns {Promise<void>} - Resolves when CSS is loaded
     */
    function loadStylesheet(path, options = {}) {
        return new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = buildStaticPath(path);

            if (options.media) link.media = options.media;
            if (options.type) link.type = options.type || 'text/css';

            link.onload = () => {
                console.log(`[Panel API Helper] Stylesheet loaded: ${link.href}`);
                resolve();
            };

            link.onerror = () => {
                console.error(`[Panel API Helper] Failed to load stylesheet: ${link.href}`);
                reject(new Error(`Failed to load stylesheet: ${path}`));
            };

            document.head.appendChild(link);
        });
    }

    /**
     * Fix all static resource paths in the document
     * Call this after DOMContentLoaded to fix existing <script>, <link>, <img> tags
     */
    function fixStaticResources() {
        if (!isEmbedded()) {
            console.log('[Panel API Helper] Not embedded - skipping static resource fixes');
            return;
        }

        const prefix = getApiPrefix();
        let fixedCount = 0;

        // Fix script tags (only local resources)
        document.querySelectorAll('script[src]').forEach(script => {
            const src = script.getAttribute('src');
            if (src && src.startsWith('/') && !src.startsWith(prefix)) {
                const newSrc = prefix + src;
                console.log(`[Panel API Helper] Fixing script: ${src} → ${newSrc}`);
                script.src = newSrc;
                fixedCount++;
            }
        });

        // Fix link tags (stylesheets, only local resources)
        document.querySelectorAll('link[href]').forEach(link => {
            const href = link.getAttribute('href');
            if (href && href.startsWith('/') && !href.startsWith(prefix)) {
                const newHref = prefix + href;
                console.log(`[Panel API Helper] Fixing link: ${href} → ${newHref}`);
                link.href = newHref;
                fixedCount++;
            }
        });

        // Fix img tags (only local resources)
        document.querySelectorAll('img[src]').forEach(img => {
            const src = img.getAttribute('src');
            if (src && src.startsWith('/') && !src.startsWith(prefix)) {
                const newSrc = prefix + src;
                console.log(`[Panel API Helper] Fixing image: ${src} → ${newSrc}`);
                img.src = newSrc;
                fixedCount++;
            }
        });

        if (fixedCount > 0) {
            console.log(`[Panel API Helper] Fixed ${fixedCount} static resource paths`);
        }
    }

    /**
     * Get embed status info for debugging
     * @returns {Object} - Embed status information
     */
    function getEmbedInfo() {
        const embedded = isEmbedded();
        return {
            isEmbedded: embedded,
            apiPrefix: getApiPrefix(),
            windowSelf: window.self === window,
            windowTop: window.self === window.top,
            parentOrigin: embedded ? document.referrer : null
        };
    }

    // Export to global scope
    window.PanelAPI = {
        isEmbedded,
        getApiPrefix,
        buildApiPath,
        apiCall,
        apiCallJson,
        buildResourceUrl,
        buildStaticPath,
        loadScript,
        loadStylesheet,
        fixStaticResources,
        getEmbedInfo
    };

    // Auto-fix static resources when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            // Small delay to ensure all resources are in DOM
            setTimeout(fixStaticResources, 100);
        });
    } else {
        // DOM already loaded
        setTimeout(fixStaticResources, 100);
    }

    // Log initialization
    const embedInfo = getEmbedInfo();
    console.log('[Panel API Helper] Initialized', embedInfo);

})(window);
