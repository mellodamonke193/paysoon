(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  // Fill hidden timezone fields with the browser's timezone (signup).
  $$('input[data-timezone]').forEach(function (el) {
    try { el.value = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { el.value = 'UTC'; }
  });

  // Confirmation prompts + double-submit protection.
  document.addEventListener('submit', function (event) {
    var form = event.target;
    var message = form.getAttribute('data-confirm');
    if (message && !window.confirm(message)) { event.preventDefault(); return; }
    if (form.getAttribute('data-submitting') === '1') { event.preventDefault(); return; }
    form.setAttribute('data-submitting', '1');
    setTimeout(function () { form.removeAttribute('data-submitting'); }, 5000);
  });

  // Copy-to-clipboard buttons: <button data-copy="element-id">.
  $$('[data-copy]').forEach(function (button) {
    button.addEventListener('click', function () {
      var target = document.getElementById(button.getAttribute('data-copy'));
      if (!target) return;
      var text = 'value' in target ? target.value : target.textContent;
      var done = function () {
        var label = button.textContent;
        button.textContent = 'Copied!';
        setTimeout(function () { button.textContent = label; }, 1600);
      };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done, function () {});
      } else if (target.select) {
        target.select();
        try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ }
      }
    });
  });

  $$('input[data-select-on-focus]').forEach(function (input) {
    input.addEventListener('focus', function () { input.select(); });
  });

  // Live reminder-schedule preview on the invoice form.
  var preview = $('#schedule-preview');
  var dueInput = $('#due_date');
  if (preview && dueInput) {
    var today = preview.getAttribute('data-today');
    var parse = function (s) { var p = s.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); };
    var iso = function (d) { return d.toISOString().slice(0, 10); };
    var addDays = function (s, n) { var d = parse(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
    var weekdayOnly = function (s) { var day = parse(s).getUTCDay(); return day === 6 ? addDays(s, 2) : day === 0 ? addDays(s, 1) : s; };
    var pretty = function (s) { return parse(s).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }); };
    var label = function (offset, isLast) {
      if (offset < 0) return 'Friendly heads-up · ' + -offset + (offset === -1 ? ' day' : ' days') + ' before';
      if (offset === 0) return 'Due today';
      if (isLast) return 'Final notice · ' + offset + ' days late';
      return (offset >= 14 ? 'Firm reminder · ' : 'Follow-up · ') + offset + (offset === 1 ? ' day' : ' days') + ' late';
    };

    var render = function () {
      while (preview.firstChild) preview.removeChild(preview.firstChild);
      var checked = $('input[name="cadence"]:checked');
      if (!checked || !/^\d{4}-\d{2}-\d{2}$/.test(dueInput.value)) {
        var li = document.createElement('li');
        li.textContent = 'Pick a due date to see when reminders go out.';
        preview.appendChild(li);
        return;
      }
      var offsets = checked.getAttribute('data-offsets').split(',').map(Number);
      var items = offsets.map(function (o, i) {
        return { offset: o, date: weekdayOnly(addDays(dueInput.value, o)), last: i === offsets.length - 1 };
      });
      var lastPast = -1;
      items.forEach(function (item, i) { if (item.date < today) lastPast = i; });
      items.forEach(function (item, i) {
        var li = document.createElement('li');
        var left = document.createElement('span');
        var right = document.createElement('span');
        left.textContent = label(item.offset, item.last);
        right.textContent = pretty(item.date) + ', 9:00 AM';
        if (i === lastPast && item.offset >= 0) {
          li.className = 'soon';
          right.textContent = 'Goes out next';
        } else if (item.date < today) {
          li.className = 'past';
        }
        li.appendChild(left);
        li.appendChild(right);
        preview.appendChild(li);
      });
    };

    dueInput.addEventListener('input', render);
    dueInput.addEventListener('change', render);
    $$('input[name="cadence"]').forEach(function (radio) { radio.addEventListener('change', render); });
    render();
  }
})();
