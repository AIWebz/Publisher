// Folio download site: scroll reveals, nav state, pointer glow, OS tabs, and download links filled in
// from downloads/latest.json (written by the publish workflow).

// ---- scroll reveals ----------------------------------------------------------------------------
const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}, { threshold: 0.18, rootMargin: '0px 0px -40px 0px' });
document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .rise').forEach((el) => io.observe(el));

// ---- nav background once the page scrolls; pointer-following glow ------------------------------
const nav = document.querySelector('.nav');
const onScroll = () => nav.classList.toggle('scrolled', scrollY > 24);
addEventListener('scroll', onScroll, { passive: true });
onScroll();
const glow = document.querySelector('.glow');
addEventListener('pointermove', (e) => {
  glow.style.setProperty('--gx', `${(e.clientX / innerWidth) * 100}%`);
  glow.style.setProperty('--gy', `${(e.clientY / innerHeight) * 100}%`);
}, { passive: true });

// ---- install tabs (sliding pill) ---------------------------------------------------------------
const tabs = [...document.querySelectorAll('.tabs [role="tab"]')];
const pill = document.querySelector('.tab-pill');
function selectTab(tab) {
  for (const t of tabs) {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
  }
  pill.style.width = `${tab.offsetWidth}px`;
  pill.style.transform = `translateX(${tab.offsetLeft - 5}px)`;
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => selectTab(t));
  t.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); selectTab(n); }
  });
});
const isMac = /Macintosh|Mac OS X/i.test(navigator.userAgent);
document.fonts?.ready.then(() => selectTab(tabs[isMac ? 1 : 0]));
selectTab(tabs[isMac ? 1 : 0]);

// ---- downloads ---------------------------------------------------------------------------------
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
    primary.textContent = 'Downloads coming soon';
    primary.setAttribute('aria-disabled', 'true');
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
  let pick = null;
  if (/Windows/i.test(navigator.userAgent)) pick = 'win';
  else if (isMac) {
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
    primary.textContent = pick === 'win' ? 'Download for Windows' : pick === 'macArm' ? 'Download for Mac' : 'Download for Mac (Intel)';
    document.querySelector(`.dl[data-file="${pick}"]`)?.classList.add('recommended');
  } else {
    primary.textContent = 'Choose your download';
  }
})();
