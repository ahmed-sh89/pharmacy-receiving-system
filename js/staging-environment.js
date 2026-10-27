// Staging indicator follows the actual backend configuration, never the hostname.
(function(){
    'use strict';
    if(typeof CLOUD_CONFIG === 'undefined' || CLOUD_CONFIG.url !== 'https://tovkcakucyagvbzvlnks.supabase.co') return;
    if(document.getElementById('pharmflowStagingIndicator')) return;
    const badge = document.createElement('div');
    badge.id = 'pharmflowStagingIndicator';
    badge.textContent = 'STAGING — TEST DATA';
    badge.setAttribute('role','note');
    badge.style.cssText = 'position:fixed;bottom:6px;right:8px;z-index:10000;padding:3px 7px;border-radius:4px;background:#173f65;color:white;font:600 10px/1.2 Arial,sans-serif;letter-spacing:.3px;pointer-events:none';
    document.body.appendChild(badge);
})();
