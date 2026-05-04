/**
 * Same-origin links between Akomanga, Mata, Maumahara, and Pānui (localhost / localStorage only).
 * Hidden in embedded WebViews.
 */
(function () {
  function likelyInAppWebView() {
    try {
      var ua = navigator.userAgent || '';
      return /\bwv\b/i.test(ua) || /Electron\//i.test(ua);
    } catch (e) {
      return false;
    }
  }

  function shellSwitcherEnabled() {
    try {
      if (likelyInAppWebView()) return false;
      var h = location.hostname;
      if (h === 'localhost' || h === '127.0.0.1') return true;
      return localStorage.getItem('ecosystemSwitcher') === '1';
    } catch (e) {
      return false;
    }
  }

  if (!shellSwitcherEnabled()) return;

  var origin = location.origin;
  var path = location.pathname || '/';
  var apps = [
    { key: 'akomanga', label: 'Akomanga', prefix: '/' },
    { key: 'maumahara', label: 'Maumahara', prefix: '/maumahara' },
    { key: 'panui', label: 'Pānui', prefix: '/panui' },
    { key: 'mata', label: 'Mata', prefix: '/mata' },
  ];

  function pathMatches(prefix) {
    if (prefix === '/') return !/^\/(mata|maumahara|panui)(\/|$)/.test(path);
    return path === prefix || path.indexOf(prefix + '/') === 0;
  }

  var wrap = document.createElement('div');
  wrap.id = 'ecosystem-shell-switcher';
  wrap.style.cssText =
    'position:fixed;bottom:14px;right:14px;z-index:99999;font-family:system-ui,-apple-system,sans-serif;font-size:13px;color:#1c1917;';

  var det = document.createElement('details');
  det.style.cssText = 'margin:0;';

  var sum = document.createElement('summary');
  sum.textContent = 'Apps';
  sum.style.cssText =
    'cursor:pointer;list-style:none;padding:8px 14px;background:#fff;border:1px solid #e7e5e4;border-radius:9999px;box-shadow:0 1px 2px rgb(0 0 0 / 0.06);font-weight:600;';
  sum.setAttribute('aria-label', 'Switch ecosystem app');

  var menu = document.createElement('div');
  menu.style.cssText =
    'position:absolute;bottom:100%;right:0;margin-bottom:8px;min-width:11rem;padding:4px 0;background:#fff;border:1px solid #e7e5e4;border-radius:10px;box-shadow:0 4px 12px rgb(0 0 0 / 0.08);';

  for (var i = 0; i < apps.length; i++) {
    var a = apps[i];
    var href = origin + (a.prefix === '/' ? '/' : a.prefix);
    var active = pathMatches(a.prefix);
    var link = document.createElement('a');
    link.href = href;
    link.textContent = a.label + (active ? ' · current' : '');
    link.style.cssText =
      'display:block;padding:8px 14px;text-decoration:none;color:#1c1917;font-size:13px;' +
      (active ? 'font-weight:600;background:#fafaf9;' : 'font-weight:500;');
    menu.appendChild(link);
  }

  det.appendChild(sum);
  det.appendChild(menu);
  wrap.appendChild(det);

  var hideMarker =
    '#ecosystem-shell-switcher summary::-webkit-details-marker{display:none}' +
    '#ecosystem-shell-switcher summary{list-style:none}';
  var style = document.createElement('style');
  style.textContent = hideMarker;
  document.head.appendChild(style);
  document.body.appendChild(wrap);
})();
