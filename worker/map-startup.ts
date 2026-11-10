/** Progressive enhancement: keep the readable directory for no-JS visitors,
 * while browsers show a map-coloured loading surface until React commits.
 * A failed bundle reveals the readable page again rather than leaving a blank screen.
 */
export const MAP_STARTUP_HEAD = `<style>
#hmc-map-startup{display:none}
html.hmc-map-starting #root{opacity:0;pointer-events:none}
html.hmc-map-starting #hmc-map-startup{position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#f3efe7;color:#6b418a;font:500 14px system-ui,sans-serif}
#hmc-map-startup img{width:44px;height:44px;border-radius:12px}
</style><script>(function(){var root=document.documentElement;root.classList.add('hmc-map-starting');function ready(){root.classList.remove('hmc-map-starting');var loading=document.getElementById('hmc-map-startup');if(loading)loading.remove();clearTimeout(timer);window.removeEventListener('hmc-app-ready',ready)}var timer=setTimeout(ready,8000);window.addEventListener('hmc-app-ready',ready)})();</script>`;
export const MAP_STARTUP_BODY = '<div id="hmc-map-startup" role="status"><img src="/favicon.png" alt="" /><span>Loading the map…</span></div>';
