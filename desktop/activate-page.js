/* Folio Publisher — activation window script (runs in the page, not in Node). */
'use strict';

(async () => {
  const api = window.folioLicense;
  const $ = (id) => document.getElementById(id);
  const s = await api.strings();
  document.documentElement.lang = s.lang || 'en';
  for (const el of document.querySelectorAll('[data-s]')) el.textContent = s[el.dataset.s] || el.textContent;
  if (s.hint) { $('hint').textContent = s.hint; $('hint').hidden = false; }
  $('serial').focus();
  $('quit').addEventListener('click', () => api.quit());
  $('serial').addEventListener('input', () => { $('error').textContent = ''; });
  $('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('go').disabled = true;
    const ok = await api.activate($('serial').value).catch(() => false);
    if (!ok) {
      $('error').textContent = s.invalid;
      $('go').disabled = false;
      $('serial').focus();
    }
  });
})();
