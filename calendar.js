/* calendar.js — rendering + interaction. Reads only from Store; never holds
 * its own copy of the data. Re-renders whenever Store emits a change. */
(() => {
  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  const WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']; // week starts Sunday
  const WEEK_START = 0;

  // Per-event colours — quiet, easy-on-the-eye hues. `null` = default (accent).
  const COLORS = [
    { name: 'Default', val: null },
    { name: 'Rose',    val: '#f7768e' },
    { name: 'Amber',   val: '#e0af68' },
    { name: 'Green',   val: '#9ece6a' },
    { name: 'Teal',    val: '#73daca' },
    { name: 'Sky',     val: '#7dcfff' },
    { name: 'Purple',  val: '#bb9af7' },
  ];
  let selectedColor = null;

  const $ = id => document.getElementById(id);
  const today = new Date();
  let view = { year: today.getFullYear(), month: today.getMonth() }; // 0-based month
  let navDir = 'none';   // 'next' | 'prev' | 'none' — drives the grid slide direction
  let firstLoad = true;  // stagger the cells once, on the very first render
  let sheetDate = null;  // the day currently shown in the mobile day sheet
  const isMobile = () => window.matchMedia('(max-width: 720px)').matches;

  /* ---- date helpers ---- */
  const pad = n => String(n).padStart(2, '0');
  const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
  const todayStr = ymd(today.getFullYear(), today.getMonth(), today.getDate());

  /* ---- theme ---- */
  function initTheme() {
    const saved = localStorage.getItem('mycalendar.theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    $('theme-toggle').onclick = () => {
      const cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', cur);
      localStorage.setItem('mycalendar.theme', cur);
    };
  }

  /* ---- rail (year + months) ---- */
  function renderRail() {
    $('rail-year-label').textContent = view.year;
    const counts = Store.countByMonth(view.year);
    const rail = $('rail-months');
    rail.innerHTML = '';
    MONTHS.forEach((name, i) => {
      const btn = document.createElement('button');
      btn.className = 'rail-month' + (i === view.month ? ' active' : '');
      btn.innerHTML = `<span>${name}</span>` +
        (counts[i] ? `<span class="count">${counts[i]}</span>` : `<span class="count" style="visibility:hidden">0</span>`);
      btn.onclick = () => { navDir = i > view.month ? 'next' : i < view.month ? 'prev' : 'none'; view.month = i; renderAll(); };
      rail.appendChild(btn);
    });
  }

  /* ---- grid ---- */
  function renderWeekdays() {
    $('weekdays').innerHTML = WEEKDAYS.map(d => `<span>${d}</span>`).join('');
  }

  function renderGrid() {
    $('month-title').textContent = `${MONTHS[view.month]} ${view.year}`;
    const grid = $('grid');
    grid.classList.remove('anim-next', 'anim-prev', 'first-load');
    grid.innerHTML = '';

    const first = new Date(view.year, view.month, 1);
    const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
    const daysInPrev = new Date(view.year, view.month, 0).getDate();
    let startOffset = (first.getDay() - WEEK_START + 7) % 7;

    const cells = [];
    // leading days from previous month
    for (let i = startOffset; i > 0; i--)
      cells.push({ day: daysInPrev - i + 1, month: view.month - 1, dim: true });
    // this month
    for (let d = 1; d <= daysInMonth; d++)
      cells.push({ day: d, month: view.month, dim: false });
    // trailing to fill 6 rows (42 cells) for a stable height
    while (cells.length % 7 !== 0 || cells.length < 42)
      cells.push({ day: cells.length - (startOffset + daysInMonth) + 1, month: view.month + 1, dim: true });

    cells.forEach((c, idx) => {
      const y = view.year + (c.month < 0 ? -1 : c.month > 11 ? 1 : 0);
      const m = (c.month + 12) % 12;
      const dateStr = ymd(y, m, c.day);

      const wd = new Date(y, m, c.day).getDay();   // 5=Fri, 6=Sat → weekend (KSA)
      const cell = document.createElement('div');
      cell.className = 'cell' + (c.dim ? ' dim' : '') + (dateStr === todayStr ? ' today' : '')
        + (wd === 5 || wd === 6 ? ' weekend' : '');
      // Mobile cells are tiny → tap opens a readable day sheet; desktop opens the editor.
      cell.onclick = () => isMobile() ? openDaySheet(dateStr) : openModal({ event_date: dateStr });
      if (firstLoad) cell.style.animationDelay = Math.min(idx * 7, 280) + 'ms';

      const num = document.createElement('div');
      num.className = 'cell-num';
      num.textContent = c.day;
      cell.appendChild(num);

      const dayEvents = Store.forDay(dateStr);
      if (isMobile()) {
        // Compact coloured dots — the day sheet carries the readable detail.
        const dots = document.createElement('div');
        dots.className = 'dots';
        dayEvents.slice(0, 5).forEach(ev => {
          const d = document.createElement('span');
          d.className = 'dot' + (ev.done ? ' done' : '');
          if (ev.color) d.style.background = ev.color;
          dots.appendChild(d);
        });
        if (dayEvents.length > 5) {
          const more = document.createElement('span');
          more.className = 'more';
          more.textContent = '+' + (dayEvents.length - 5);
          dots.appendChild(more);
        }
        cell.appendChild(dots);
      } else {
        const evWrap = document.createElement('div');
        evWrap.className = 'cell-events';
        dayEvents.forEach(ev => {
          const pill = document.createElement('div');
          pill.className = 'pill' + (ev.done ? ' done' : '');
          if (ev.color) { pill.style.borderLeftColor = ev.color; pill.style.background = ev.color + '2b'; }

          const check = document.createElement('button');
          check.className = 'pill-check';
          check.setAttribute('aria-label', ev.done ? 'Mark not done' : 'Mark done');
          check.innerHTML = ev.done ? '✓' : '';
          check.onclick = (e) => { e.stopPropagation(); Store.update(ev.id, { done: !ev.done }); };

          const label = document.createElement('button');
          label.className = 'pill-title';
          label.innerHTML = `${escapeHtml(ev.title)}` +
            (ev.category ? `<span class="cat">${escapeHtml(ev.category)}</span>` : '');
          label.title = (ev.notes ? ev.notes + '\n' : '') + (ev.added_by === 'claude' ? '· added by Claude' : '');
          label.onclick = (e) => { e.stopPropagation(); openModal(ev); };

          pill.append(check, label);
          evWrap.appendChild(pill);
        });
        cell.appendChild(evWrap);
      }
      grid.appendChild(cell);
    });

    // Motion: stagger the cells once on first load; slide the block on month nav.
    if (firstLoad) { grid.classList.add('first-load'); firstLoad = false; }
    else if (navDir === 'next' || navDir === 'prev') {
      void grid.offsetWidth;   // reflow so the animation re-triggers
      grid.classList.add(navDir === 'next' ? 'anim-next' : 'anim-prev');
    }
    navDir = 'none';
  }

  function renderAll() { renderRail(); renderGrid(); }

  /* ---- modal ---- */
  function renderSwatches(current) {
    selectedColor = current || null;
    const wrap = $('event-colors');
    wrap.innerHTML = '';
    COLORS.forEach(c => {
      const b = document.createElement('button');
      b.type = 'button';
      b.title = c.name;
      const isSel = c.val === selectedColor || (c.val === null && !selectedColor);
      b.className = 'swatch' + (c.val === null ? ' default' : '') + (isSel ? ' selected' : '');
      if (c.val) b.style.background = c.val;
      b.onclick = () => {
        selectedColor = c.val;
        [...wrap.children].forEach(x => x.classList.remove('selected'));
        b.classList.add('selected');
      };
      wrap.appendChild(b);
    });
  }

  function openModal(ev) {
    $('modal-title').textContent = ev.id ? 'Edit event' : 'New event';
    $('event-id').value = ev.id || '';
    $('event-date').value = ev.event_date || todayStr;
    $('event-title').value = ev.title || '';
    $('event-category').value = ev.category || '';
    $('event-notes').value = ev.notes || '';
    $('event-done').checked = !!ev.done;
    renderSwatches(ev.color);
    $('event-delete').classList.toggle('hidden', !ev.id);
    $('modal').classList.add('open');
    setTimeout(() => $('event-title').focus(), 40);
  }
  function closeModal() { $('modal').classList.remove('open'); }

  /* ---- day sheet (mobile) — a readable list of one day's events ---- */
  function openDaySheet(dateStr) {
    sheetDate = dateStr;
    const [y, m, d] = dateStr.split('-').map(Number);
    $('sheet-date').textContent = new Date(y, m - 1, d)
      .toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    renderSheet();
    $('daysheet').classList.add('open');
  }
  function renderSheet() {
    const wrap = $('sheet-events');
    wrap.innerHTML = '';
    const evs = Store.forDay(sheetDate);
    if (!evs.length) {
      const empty = document.createElement('div');
      empty.className = 'sheet-empty';
      empty.textContent = 'Nothing planned. Add an event below.';
      wrap.appendChild(empty);
      return;
    }
    evs.forEach(ev => {
      const row = document.createElement('div');
      row.className = 'sheet-ev' + (ev.done ? ' done' : '');
      if (ev.color) row.style.borderLeftColor = ev.color;

      const check = document.createElement('button');
      check.className = 'sheet-ev-check';
      check.setAttribute('aria-label', ev.done ? 'Mark not done' : 'Mark done');
      check.innerHTML = ev.done ? '✓' : '';
      check.onclick = (e) => { e.stopPropagation(); Store.update(ev.id, { done: !ev.done }); };

      const body = document.createElement('button');
      body.className = 'sheet-ev-body';
      body.innerHTML = `<div class="sheet-ev-title">${escapeHtml(ev.title)}</div>`
        + (ev.category ? `<span class="sheet-ev-cat">${escapeHtml(ev.category)}</span>` : '')
        + (ev.notes ? `<div class="sheet-ev-notes">${escapeHtml(ev.notes)}</div>` : '')
        + (ev.added_by === 'claude' ? `<div class="sheet-ev-notes">· added by Claude</div>` : '');
      body.onclick = () => { closeSheet(); openModal(ev); };

      const edit = document.createElement('button');
      edit.className = 'sheet-ev-edit';
      edit.setAttribute('aria-label', 'Edit');
      edit.textContent = '›';
      edit.onclick = () => { closeSheet(); openModal(ev); };

      row.append(check, body, edit);
      wrap.appendChild(row);
    });
  }
  function closeSheet() { $('daysheet').classList.remove('open'); sheetDate = null; }

  async function saveEvent(e) {
    e.preventDefault();
    const id = $('event-id').value;
    const payload = {
      event_date: $('event-date').value,
      title: $('event-title').value.trim(),
      category: $('event-category').value.trim() || null,
      notes: $('event-notes').value.trim() || null,
      color: selectedColor || null,
      done: $('event-done').checked,
    };
    if (!payload.title || !payload.event_date) return;
    try {
      if (id) await Store.update(id, payload);
      else    await Store.add(payload);
      closeModal();
    } catch (err) { alert('Could not save: ' + (err.message || err)); }
  }

  async function deleteEvent() {
    const id = $('event-id').value;
    if (!id) return;
    if (!confirm('Delete this event?')) return;
    try { await Store.remove(id); closeModal(); }
    catch (err) { alert('Could not delete: ' + (err.message || err)); }
  }

  /* ---- nav wiring ---- */
  function shiftMonth(delta) {
    navDir = delta > 0 ? 'next' : 'prev';
    let m = view.month + delta, y = view.year;
    if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
    view = { year: y, month: m }; renderAll();
  }
  function wireNav() {
    $('month-prev').onclick = () => shiftMonth(-1);
    $('month-next').onclick = () => shiftMonth(1);
    $('year-prev').onclick  = () => { navDir = 'prev'; view.year--; renderAll(); };
    $('year-next').onclick  = () => { navDir = 'next'; view.year++; renderAll(); };
    $('today-btn').onclick  = () => { view = { year: today.getFullYear(), month: today.getMonth() }; renderAll(); };
    $('modal-close').onclick = closeModal;
    $('event-form').onsubmit = saveEvent;
    $('event-delete').onclick = deleteEvent;
    $('event-notes').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveEvent(e); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeSheet(); } });
    $('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
    // Day sheet
    $('sheet-close').onclick = closeSheet;
    $('sheet-add').onclick = () => { const d = sheetDate; closeSheet(); openModal({ event_date: d }); };
    $('daysheet').addEventListener('click', e => { if (e.target.id === 'daysheet') closeSheet(); });
    // Re-render when crossing the mobile/desktop breakpoint (dots ↔ pills).
    let lastMobile = isMobile();
    window.addEventListener('resize', () => {
      if (isMobile() !== lastMobile) { lastMobile = isMobile(); renderAll(); }
    });
  }

  // One place the UI refreshes from — grid, and the day sheet if it's open.
  function refresh() { renderAll(); if ($('daysheet').classList.contains('open')) renderSheet(); }

  /* ---- auth gate (supabase mode) — email + password ---- */
  async function gate() {
    if (!Store.auth.enabled) return true;         // local mode → straight in
    const session = await Store.auth.session();
    if (session && session.user) return true;

    $('auth').classList.add('open');
    $('signout-btn').classList.remove('hidden');

    let mode = 'signin';   // 'signin' | 'signup'
    const setMode = (m) => {
      mode = m;
      $('auth-submit').textContent = m === 'signin' ? 'Sign in' : 'Create account';
      $('auth-lead').textContent = m === 'signin' ? 'Sign in to your calendar.' : 'Create your calendar account.';
      $('auth-toggle').textContent = m === 'signin' ? 'Create an account' : 'I already have an account';
      $('auth-pass').setAttribute('autocomplete', m === 'signin' ? 'current-password' : 'new-password');
      $('auth-msg').textContent = '';
    };
    $('auth-toggle').onclick = () => setMode(mode === 'signin' ? 'signup' : 'signin');

    $('auth-form').onsubmit = async (e) => {
      e.preventDefault();
      const email = $('auth-email').value.trim();
      const password = $('auth-pass').value;
      const btn = $('auth-submit'); btn.disabled = true;
      $('auth-msg').textContent = mode === 'signin' ? 'Signing in…' : 'Creating account…';
      const { data, error } = mode === 'signin'
        ? await Store.auth.signIn(email, password)
        : await Store.auth.signUp(email, password);
      btn.disabled = false;
      if (error) { $('auth-msg').textContent = error.message; return; }
      if (mode === 'signup' && !(data && data.session)) {
        // "Confirm email" is still on → no session yet.
        $('auth-msg').textContent = 'Account created — turn off “Confirm email” in Supabase, then sign in.';
        setMode('signin');
        return;
      }
      location.reload();   // session persisted → gate passes on reload
    };

    Store.auth.onChange(s => { if (s && s.user) location.reload(); });
    return false;
  }

  /* ---- boot ---- */
  async function boot() {
    initTheme();
    wireNav();
    renderWeekdays();
    $('mode-badge').textContent = Store.mode === 'supabase' ? 'Synced' : 'Local (demo)';
    if (Store.auth.enabled) {
      $('signout-btn').classList.remove('hidden');
      $('signout-btn').onclick = async () => { await Store.auth.signOut(); location.reload(); };
    }
    const ok = await gate();
    if (!ok) return;
    await Store.init();
    Store.onChange(refresh);
    renderAll();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  boot();
})();
