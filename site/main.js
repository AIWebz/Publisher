// Fills in the download links from downloads/latest.json (written by the publish workflow) and
// points the main button at the installer for the visitor's computer.
(async () => {
  const MB = (n) => `${Math.round(n / 1048576)} MB`;
  const primary = document.getElementById('primary-download');
  const versionLine = document.getElementById('version-line');
  const note = document.getElementById('downloads-note');
  let latest = null;
  try {
    const res = await fetch('downloads/latest.json', { cache: 'no-store' });
    if (res.ok) latest = await res.json();
  } catch { /* offline or not published yet */ }

  const cards = [...document.querySelectorAll('.dl')];
  if (!latest || !latest.files) {
    for (const c of cards) c.setAttribute('aria-disabled', 'true');
    primary.setAttribute('aria-disabled', 'true');
    primary.textContent = 'Downloads coming soon';
    note.textContent = 'The installers have not been published yet.';
    return;
  }

  for (const c of cards) {
    const f = latest.files[c.dataset.file];
    if (!f) { c.setAttribute('aria-disabled', 'true'); continue; }
    c.href = `downloads/${encodeURIComponent(f.name)}`;
    c.setAttribute('download', '');
    c.querySelector('.size').textContent = `${f.name} · ${MB(f.size)}`;
  }
  versionLine.textContent = `Version ${latest.version} · free for Windows 10/11 and macOS 13 or later.`;

  // Best guess at the visitor's platform (Apple silicon vs Intel cannot always be told apart).
  const ua = navigator.userAgent;
  let pick = null;
  if (/Windows/i.test(ua)) pick = 'win';
  else if (/Macintosh|Mac OS X/i.test(ua)) {
    pick = 'macArm';
    try {
      const d = navigator.userAgentData && await navigator.userAgentData.getHighEntropyValues(['architecture']);
      if (d && d.architecture === 'x86') pick = 'macIntel';
    } catch { /* keep Apple silicon */ }
  }
  const f = pick && latest.files[pick];
  if (f) {
    primary.href = `downloads/${encodeURIComponent(f.name)}`;
    primary.setAttribute('download', '');
    primary.textContent = pick === 'win' ? 'Download for Windows' : pick === 'macArm' ? 'Download for Mac (Apple silicon)' : 'Download for Mac (Intel)';
    document.querySelector(`.dl[data-file="${pick}"]`)?.classList.add('recommended');
  } else {
    primary.textContent = 'Choose your download';
  }
})();
