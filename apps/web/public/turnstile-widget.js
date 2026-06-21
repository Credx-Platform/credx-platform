/* CredX Turnstile helper — shared across index.html, signup.html, masterclass.html.
 *
 * To ENABLE CAPTCHA:
 *   1. Create a Turnstile widget at https://dash.cloudflare.com (Turnstile).
 *   2. Paste the *site key* into SITE_KEY below (site keys are public — safe to commit).
 *   3. Set TURNSTILE_SECRET_KEY on the API (Railway) to the matching secret key.
 *
 * Until SITE_KEY is set, the widget stays inert and the forms submit normally;
 * the API also skips verification while its secret is unset, so client + server
 * activate together with no broken intermediate state.
 */
(function () {
  var SITE_KEY = ''; // <-- paste Cloudflare Turnstile SITE key here to enable CAPTCHA
  var widgetId = null;

  function render() {
    if (!SITE_KEY || !window.turnstile) return;
    var slot = document.querySelector('.cf-turnstile-slot');
    if (!slot || slot.dataset.rendered) return;
    widgetId = window.turnstile.render(slot, { sitekey: SITE_KEY });
    slot.dataset.rendered = '1';
  }

  // Called by Cloudflare's api.js (?onload=onCredXTurnstileLoad) and as a fallback.
  window.onCredXTurnstileLoad = render;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }

  window.CredXTurnstile = {
    enabled: function () { return !!SITE_KEY; },
    getToken: function () {
      if (!SITE_KEY || !window.turnstile || widgetId === null) return undefined;
      return window.turnstile.getResponse(widgetId) || undefined;
    },
    reset: function () {
      if (window.turnstile && widgetId !== null) window.turnstile.reset(widgetId);
    }
  };
})();
