import type { AppState, CountdownEvent } from './types';

function diffParts(targetISO: string) {
  const now = new Date();
  const target = new Date(targetISO);
  const ms = target.getTime() - now.getTime();
  const abs = Math.abs(ms);
  const totalMinutes = Math.floor(abs / (60 * 1000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes - days * 60 * 24) / 60);
  const minutes = totalMinutes - days * 60 * 24 - hours * 60;
  return { ms, days, hours, minutes };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function weekOfMonthForDate(d: Date): number {
  return Math.floor((d.getDate() - 1) / 7) + 1;
}

function nthWeekdayDayOfMonth(year: number, monthIndex: number, weekday: number, nth: number): number {
  const first = new Date(year, monthIndex, 1);
  const firstWeekday = first.getDay();
  const offset = (weekday - firstWeekday + 7) % 7;
  const firstOccurrence = 1 + offset;
  const candidate = firstOccurrence + (Math.max(1, Math.min(5, nth)) - 1) * 7;
  const lastDay = daysInMonth(year, monthIndex);
  if (candidate <= lastDay) return candidate;
  const weeksAvailable = Math.floor((lastDay - firstOccurrence) / 7);
  return firstOccurrence + weeksAvailable * 7;
}

function toDateTimeLocalString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function eventSortKey(ev: CountdownEvent) {
  const ms = new Date(dueOccurrenceLocal(ev)).getTime();
  return { pinned: !!ev.pinned, time: ms };
}

function formatDateLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatShortDateLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

function nextOccurrence(ev: CountdownEvent, now: Date = new Date()): CountdownEvent {
  if (ev.recurrence === 'none') return ev;
  const base = new Date(ev.dateLocal);

  const recurrence = ev.recurrence;
  const d = new Date(base);

  if (recurrence === 'interval') {
    const rawInterval = Number(ev.recurrenceInterval ?? 1);
    const interval = clamp(Number.isFinite(rawInterval) ? Math.trunc(rawInterval) : 1, 1, 10000);
    const unitRaw = String(ev.recurrenceIntervalUnit ?? 'day');
    const unit = unitRaw === 'day' || unitRaw === 'week' || unitRaw === 'month' || unitRaw === 'year' ? unitRaw : 'day';

    const baseHours = base.getHours();
    const baseMinutes = base.getMinutes();
    const baseDayOfMonth = base.getDate();
    const baseMonthIndex = base.getMonth();

    const addDays = (dt: Date, days: number) => {
      const out = new Date(dt);
      out.setDate(out.getDate() + days);
      return out;
    };
    const monthIndex = (dt: Date) => dt.getFullYear() * 12 + dt.getMonth();

    const monthOccurrenceFromBase = (monthsToAdd: number) => {
      const startMonthIndex = base.getFullYear() * 12 + base.getMonth();
      const targetMonthIndex = startMonthIndex + monthsToAdd;
      const y = Math.floor(targetMonthIndex / 12);
      const m = targetMonthIndex % 12;
      const last = daysInMonth(y, m);
      const day = Math.min(baseDayOfMonth, last);
      return new Date(y, m, day, baseHours, baseMinutes, 0, 0);
    };

    const yearOccurrenceFromBase = (yearsToAdd: number) => {
      const y = base.getFullYear() + yearsToAdd;
      const m = baseMonthIndex;
      const last = daysInMonth(y, m);
      const day = Math.min(baseDayOfMonth, last);
      return new Date(y, m, day, baseHours, baseMinutes, 0, 0);
    };

    let start = new Date(base);
    start.setHours(baseHours, baseMinutes, 0, 0);

    if (unit === 'week' && typeof ev.recurrenceWeekday === 'number') {
      const weekday = clamp(Number(ev.recurrenceWeekday), 0, 6);
      const delta = (weekday - start.getDay() + 7) % 7;
      start = addDays(start, delta);
    }

    let candidate: Date;
    if (start.getTime() >= now.getTime()) {
      candidate = start;
    } else if (unit === 'day' || unit === 'week') {
      const stepDays = interval * (unit === 'week' ? 7 : 1);
      const approxSteps = Math.floor((now.getTime() - start.getTime()) / (stepDays * 24 * 60 * 60 * 1000));
      candidate = approxSteps > 0 ? addDays(start, approxSteps * stepDays) : new Date(start);
      while (candidate.getTime() < now.getTime()) candidate = addDays(candidate, stepDays);
    } else if (unit === 'month') {
      const diffMonths = Math.max(0, monthIndex(now) - monthIndex(start));
      const approxMonths = Math.floor(diffMonths / interval) * interval;
      candidate = monthOccurrenceFromBase(approxMonths);
      if (candidate.getTime() < start.getTime()) candidate = new Date(start);
      while (candidate.getTime() < now.getTime()) {
        const monthsFromBase = monthIndex(candidate) - monthIndex(base);
        candidate = monthOccurrenceFromBase(monthsFromBase + interval);
      }
    } else {
      const diffYears = Math.max(0, now.getFullYear() - start.getFullYear());
      const approxYears = Math.floor(diffYears / interval) * interval;
      candidate = yearOccurrenceFromBase(approxYears);
      if (candidate.getTime() < start.getTime()) candidate = new Date(start);
      while (candidate.getTime() < now.getTime()) {
        const yearsFromBase = candidate.getFullYear() - base.getFullYear();
        candidate = yearOccurrenceFromBase(yearsFromBase + interval);
      }
    }

    d.setTime(candidate.getTime());
  } else

  if (recurrence === 'yearly' || recurrence === 'monthly' || recurrence === 'weekly' || recurrence === 'daily') {
    if (recurrence === 'weekly' && typeof ev.recurrenceWeekday === 'number') {
      if (d.getTime() < now.getTime()) {
        const targetWeekday = clamp(Number(ev.recurrenceWeekday), 0, 6);
        const candidate = new Date(now);
        candidate.setHours(base.getHours(), base.getMinutes(), 0, 0);
        const delta = (targetWeekday - candidate.getDay() + 7) % 7;
        candidate.setDate(candidate.getDate() + delta);
        if (candidate.getTime() < now.getTime()) candidate.setDate(candidate.getDate() + 7);
        d.setTime(candidate.getTime());
      }
    } else {
      while (d.getTime() < now.getTime()) {
        switch (recurrence) {
          case 'yearly':
            d.setFullYear(d.getFullYear() + 1);
            break;
          case 'monthly':
            d.setMonth(d.getMonth() + 1);
            break;
          case 'weekly':
            d.setDate(d.getDate() + 7);
            break;
          case 'daily':
            d.setDate(d.getDate() + 1);
            break;
        }
      }
    }
  } else if (recurrence === 'yearly_nth_weekday') {
    const month = clamp(Number(ev.recurrenceMonth ?? base.getMonth()), 0, 11);
    const weekday = clamp(Number(ev.recurrenceWeekday ?? base.getDay()), 0, 6);
    const nth = clamp(Number(ev.recurrenceWeekOfMonth ?? weekOfMonthForDate(base)), 1, 5);
    let y = base.getFullYear();
    for (let i = 0; i < 20; i++) {
      const day = nthWeekdayDayOfMonth(y, month, weekday, nth);
      const candidate = new Date(y, month, day, base.getHours(), base.getMinutes(), 0, 0);
      if (candidate.getTime() >= now.getTime()) {
        d.setTime(candidate.getTime());
        break;
      }
      y += 1;
    }
  } else if (recurrence === 'monthly_day_of_month') {
    const desired = clamp(Number(ev.recurrenceDayOfMonth ?? base.getDate()), 1, 31);
    let y = base.getFullYear();
    let m = base.getMonth();
    for (let i = 0; i < 240; i++) {
      const last = daysInMonth(y, m);
      const day = Math.min(desired, last);
      const candidate = new Date(y, m, day, base.getHours(), base.getMinutes(), 0, 0);
      if (candidate.getTime() >= now.getTime()) {
        d.setTime(candidate.getTime());
        break;
      }
      m += 1;
      if (m >= 12) {
        m = 0;
        y += 1;
      }
    }
  } else if (recurrence === 'monthly_nth_weekday') {
    const weekday = clamp(Number(ev.recurrenceWeekday ?? base.getDay()), 0, 6);
    const nth = clamp(Number(ev.recurrenceWeekOfMonth ?? weekOfMonthForDate(base)), 1, 5);
    let y = base.getFullYear();
    let m = base.getMonth();
    for (let i = 0; i < 240; i++) {
      const day = nthWeekdayDayOfMonth(y, m, weekday, nth);
      const candidate = new Date(y, m, day, base.getHours(), base.getMinutes(), 0, 0);
      if (candidate.getTime() >= now.getTime()) {
        d.setTime(candidate.getTime());
        break;
      }
      m += 1;
      if (m >= 12) {
        m = 0;
        y += 1;
      }
    }
  } else {
    return ev;
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return { ...ev, dateLocal: `${yyyy}-${mm}-${dd}T${hh}:${min}` };
}

function dueOccurrenceLocal(ev: CountdownEvent): string {
  if (ev.recurrence === 'none') return ev.dateLocal;

  // If the user hasn't marked this recurring event done yet, keep the original occurrence.
  if (!ev.completedThroughLocal) return ev.dateLocal;

  // Otherwise, show the next occurrence after the completion checkpoint.
  const from = new Date(ev.completedThroughLocal);
  const after = new Date(from.getTime() + 1);
  return nextOccurrence(ev, after).dateLocal;
}

async function markEventDone(eventId: string) {
  const st: AppState = await window.countdown.getState();
  const idx = st.events.findIndex((e) => e.id === eventId);
  if (idx < 0) return;

  const nowLocal = toDateTimeLocalString(new Date());
  const nextEvents = st.events.slice();
  nextEvents[idx] = { ...nextEvents[idx], completedThroughLocal: nowLocal };
  await window.countdown.saveEvents(nextEvents);
}

function renderGroup(events: CountdownEvent[]) {
  const el = document.getElementById('widget') as HTMLDivElement;
  el.innerHTML = '';
  el.classList.add('widgetGroup');

  for (const ev0 of events) {
    const dueLocal = dueOccurrenceLocal(ev0);
    const { ms, days } = diffParts(dueLocal);
    const isPast = ms <= 0;
    const isWithin24h = ms > 0 && ms <= 24 * 60 * 60 * 1000;
    const daysText = isPast ? 'Now' : String(days);

    let bg = ev0.color || '#4f46e5';
    let fg = ev0.textColor || '#ffffff';
    if (isWithin24h) {
      bg = '#FFEB3B';
      fg = '#000000';
    }
    if (isPast) {
      bg = '#D32F2F';
      fg = '#FFFFFF';
    }

    const card = document.createElement('div');
    card.className = 'widgetItem';
    card.style.setProperty('--event-bg', bg);
    card.style.setProperty('--event-fg', fg);
    card.dataset.eventId = ev0.id;

    const showDone = isPast && ev0.recurrence !== 'none';

    card.innerHTML = `
      <div class="widgetItemDays">
        <div class="widgetItemDaysInner">
          <div class="widgetItemDaysNum ${isPast ? 'due' : ''}">${escapeHtml(daysText)}</div>
          ${isPast ? '' : '<div class="widgetItemDaysLabel">Days</div>'}
        </div>
      </div>
      <div class="widgetItemInfo">
        <div class="widgetItemTitleRow">
          <div class="widgetItemTitle">${escapeHtml(ev0.title)}</div>
          <div class="widgetItemActions">
            ${showDone ? '<button class="widgetItemDoneBtn" type="button">Done</button>' : ''}
            <button class="widgetItemMenuBtn" type="button" aria-label="Menu">⋯</button>
          </div>
        </div>
        <div class="widgetItemDate">${escapeHtml(formatShortDateLabel(dueLocal))}</div>
      </div>
    `;

    const doneBtn = card.querySelector('.widgetItemDoneBtn') as HTMLButtonElement | null;
    doneBtn?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await markEventDone(ev0.id);
      await refresh();
    });

    const menuBtn = card.querySelector('.widgetItemMenuBtn') as HTMLButtonElement | null;
    menuBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      showContextMenu({ x: rect.right, y: rect.bottom }, ev0.id);
    });

    el.appendChild(card);
  }
}

function escapeHtml(s: string) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function refresh() {
  const st: AppState = await window.countdown.getState();

  const eventIdFromHash = (() => {
    const raw = (window.location.hash || '').replace(/^#/, '').trim();
    if (!raw) return null;
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  })();

  const base = st.events;
  const eventsToShow = eventIdFromHash ? base.filter((e) => e.id === eventIdFromHash) : base;

  const sorted = [...eventsToShow].sort((a, b) => {
    const ka = eventSortKey(a);
    const kb = eventSortKey(b);
    if (ka.pinned !== kb.pinned) return ka.pinned ? -1 : 1;
    return ka.time - kb.time;
  });
  if (sorted.length === 0) {
    const el = document.getElementById('widget') as HTMLDivElement;
    el.innerHTML = '';
    return;
  }
  renderGroup(sorted);
}

let menuEl: HTMLDivElement | null = null;
let menuBackdropEl: HTMLDivElement | null = null;

function hideContextMenu() {
  if (menuBackdropEl) {
    menuBackdropEl.remove();
    menuBackdropEl = null;
  }
  if (menuEl) {
    menuEl.remove();
    menuEl = null;
  }
}

function showContextMenu(pos: { x: number; y: number }, eventId: string) {
  hideContextMenu();

  // Backdrop captures clicks in drag regions so the menu can be dismissed.
  const backdrop = document.createElement('div');
  backdrop.className = 'widgetMenuBackdrop';
  backdrop.addEventListener('mousedown', (e) => {
    e.preventDefault();
    hideContextMenu();
  });
  document.body.appendChild(backdrop);
  menuBackdropEl = backdrop;

  const wrap = document.createElement('div');
  wrap.className = 'widgetMenu';
  wrap.style.left = `${clamp(pos.x, 8, window.innerWidth - 180)}px`;
  wrap.style.top = `${clamp(pos.y, 8, window.innerHeight - 160)}px`;

  const pref = document.createElement('button');
  pref.type = 'button';
  pref.className = 'widgetMenuItem';
  pref.textContent = 'Preferences';
  pref.addEventListener('click', async () => {
    hideContextMenu();
    await window.countdown.openPreferences(eventId);
  });

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'widgetMenuItem';
  del.textContent = 'Delete';
  del.addEventListener('click', async () => {
    hideContextMenu();
    await window.countdown.deleteEvent(eventId);
  });

  const sep = document.createElement('div');
  sep.className = 'widgetMenuSep';

  const exit = document.createElement('button');
  exit.type = 'button';
  exit.className = 'widgetMenuItem';
  exit.textContent = 'Exit';
  exit.addEventListener('click', async () => {
    hideContextMenu();
    await window.countdown.quitApp();
  });

  wrap.appendChild(pref);
  wrap.appendChild(del);
  wrap.appendChild(sep);
  wrap.appendChild(exit);

  document.body.appendChild(wrap);
  menuEl = wrap;
}

document.addEventListener('mousedown', (ev) => {
  // Fallback if backdrop didn't catch for any reason.
  if (!menuEl) return;
  const target = ev.target as Node;
  if (menuEl.contains(target)) return;
  hideContextMenu();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideContextMenu();
});

window.countdown.onEventsUpdated(() => refresh());

refresh();
window.setInterval(refresh, 1000);
