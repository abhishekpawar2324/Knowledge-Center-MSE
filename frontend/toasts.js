/* Non-blocking notifications for the Knowledge Center.
 *
 * app.js already called showToast() but nothing ever defined it, so copying a
 * syntax snippet threw "ReferenceError: showToast is not defined". This defines
 * it, and additionally routes the app's blocking alert() calls through the same
 * surface.
 *
 *   showToast('Saved')                                  // info
 *   showToast('Article published', 'success')
 *   showToast('Upload failed', 'error', { detail: e })  // stays until dismissed
 *
 * Errors do NOT auto-dismiss. A modal alert() was at least impossible to miss;
 * a toast that vanished after four seconds would be a downgrade for failures,
 * so error toasts persist until the user closes them. Everything else clears
 * itself.
 *
 * Loaded before app.js. No dependency on app.js, lucide, or any other script.
 */
(function (global) {
  'use strict';

  var STACK_ID = 'toast-stack';
  var DURATION = { success: 4000, info: 4000, warning: 7000, error: 0 };  // 0 = sticky
  var GLYPH = { success: '✓', error: '✕', warning: '!', info: 'i' };
  var MAX_VISIBLE = 4;

  function stack() {
    var el = document.getElementById(STACK_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = STACK_ID;
      el.className = 'toast-stack';
      // Announce politely: a toast is supplementary, it should not interrupt
      // whatever a screen reader is currently reading.
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    return el;
  }

  function dismiss(toast) {
    if (!toast || toast.dataset.closing) return;
    toast.dataset.closing = '1';
    toast.classList.remove('is-in');
    toast.classList.add('is-out');
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 200);
  }

  /**
   * @param {string} message  main line
   * @param {string} [type]   success | error | warning | info   (default info)
   * @param {object} [opts]   { detail: string, duration: ms }
   * @returns {HTMLElement|null} the toast, so callers can dismiss it early
   */
  function showToast(message, type, opts) {
    try {
      opts = opts || {};
      type = DURATION.hasOwnProperty(type) ? type : 'info';
      if (!document.body) return null;               // called before the DOM exists

      var host = stack();

      // Keep the stack short; drop the oldest rather than covering the screen.
      while (host.children.length >= MAX_VISIBLE) dismiss(host.firstElementChild);

      var toast = document.createElement('div');
      toast.className = 'toast toast-' + type;

      var icon = document.createElement('span');
      icon.className = 'toast-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = GLYPH[type];

      var body = document.createElement('div');
      body.className = 'toast-body';
      var title = document.createElement('div');
      title.className = 'toast-title';
      // textContent, never innerHTML: messages routinely carry server text and
      // exception strings, which must not be parsed as markup.
      title.textContent = String(message == null ? '' : message);
      body.appendChild(title);

      if (opts.detail) {
        var detail = document.createElement('div');
        detail.className = 'toast-detail';
        detail.textContent = String(opts.detail);
        body.appendChild(detail);
      }

      var close = document.createElement('button');
      close.type = 'button';
      close.className = 'toast-close';
      close.setAttribute('aria-label', 'Dismiss notification');
      close.textContent = '✕';
      close.onclick = function () { dismiss(toast); };

      toast.appendChild(icon);
      toast.appendChild(body);
      toast.appendChild(close);
      host.appendChild(toast);

      // next frame, so the transition runs
      requestAnimationFrame(function () { toast.classList.add('is-in'); });

      var ms = typeof opts.duration === 'number' ? opts.duration : DURATION[type];
      if (ms > 0) setTimeout(function () { dismiss(toast); }, ms);

      return toast;
    } catch (e) {
      // A notification helper must never itself break a page. Fall back to the
      // console rather than throwing into the caller.
      try { console.error('showToast failed:', e, message); } catch (_) {}
      return null;
    }
  }

  global.showToast = showToast;
  global.dismissToasts = function () {
    var host = document.getElementById(STACK_ID);
    if (host) Array.prototype.slice.call(host.children).forEach(dismiss);
  };

  /* Route the app's 38 blocking alert() calls through toasts.
   *
   * Every one of them is a terminal notification - an error, a validation
   * message or a success confirmation - so none depends on execution pausing.
   * confirm() is deliberately untouched: it returns a value the callers branch
   * on, and faking that would change behaviour.
   *
   * Set window.TOAST_SHIM_ALERT = false before this script to keep native
   * dialogs. */
  if (global.TOAST_SHIM_ALERT !== false) {
    var nativeAlert = global.alert ? global.alert.bind(global) : null;
    global.alert = function (msg) {
      var text = String(msg == null ? '' : msg);
      // Classify from the wording so failures stay on screen until dismissed.
      var type = /\b(fail|failed|error|could not|cannot|unable|denied|invalid|required)\b/i.test(text)
        ? 'error'
        : (/\b(success|successfully|published|saved|copied|updated|complete)\b/i.test(text) ? 'success' : 'info');
      if (!showToast(text, type) && nativeAlert) nativeAlert(msg);   // last resort
    };
    global.alert.native = nativeAlert;
  }
})(window);
