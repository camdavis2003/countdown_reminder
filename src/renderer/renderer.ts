import type { AppState, CountdownEvent, Recurrence } from './types';

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function formatDateTimeLocal(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function formatEventDateLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

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

function recurrenceToLabel(r: Recurrence) {
  switch (r) {
    case 'yearly':
      return 'Yearly';
    case 'monthly':
      return 'Monthly';
    case 'weekly':
      return 'Weekly';
    case 'daily':
      return 'Daily';
    default:
      return 'None';
  }
}

function nextOccurrence(ev: CountdownEvent): CountdownEvent {
  if (ev.recurrence === 'none') return ev;

  const d = new Date(ev.dateLocal);
  const now = new Date();
  while (d.getTime() < now.getTime()) {
    switch (ev.recurrence) {
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

  return { ...ev, dateLocal: formatDateTimeLocal(d) };
}

let state: AppState | null = null;
let timer: number | null = null;

const els = {
  events: document.getElementById('events') as HTMLDivElement,
  addForm: document.getElementById('addForm') as HTMLFormElement,
  title: document.getElementById('title') as HTMLInputElement,
  date: document.getElementById('date') as HTMLInputElement,
  color: document.getElementById('color') as HTMLInputElement,
  recurrence: document.getElementById('recurrence') as HTMLSelectElement,
  notify: document.getElementById('notify') as HTMLInputElement,
  notifyMinutesBefore: document.getElementById('notifyMinutesBefore') as HTMLInputElement,
  startupToggle: document.getElementById('startupToggle') as HTMLInputElement,
  refresh: document.getElementById('refresh') as HTMLButtonElement,

  editBackdrop: document.getElementById('editBackdrop') as HTMLDivElement,
  editForm: document.getElementById('editForm') as HTMLFormElement,
  editId: document.getElementById('editId') as HTMLInputElement,
  editTitle: document.getElementById('editTitle') as HTMLInputElement,
  editDate: document.getElementById('editDate') as HTMLInputElement,
  editColor: document.getElementById('editColor') as HTMLInputElement,
  editRecurrence: document.getElementById('editRecurrence') as HTMLSelectElement,
  editNotify: document.getElementById('editNotify') as HTMLInputElement,
  editNotifyMinutesBefore: document.getElementById('editNotifyMinutesBefore') as HTMLInputElement,
  editPinned: document.getElementById('editPinned') as HTMLInputElement,
  editClose: document.getElementById('editClose') as HTMLButtonElement,
  editCancel: document.getElementById('editCancel') as HTMLButtonElement,
  editDelete: document.getElementById('editDelete') as HTMLButtonElement
};

function openEditModal(ev: CountdownEvent) {
  els.editId.value = ev.id;
  els.editTitle.value = ev.title;
  els.editDate.value = ev.dateLocal;
  els.editColor.value = ev.color;
  els.editRecurrence.value = ev.recurrence;
  els.editNotify.checked = ev.notify;
  els.editNotifyMinutesBefore.value = String(ev.notifyMinutesBefore ?? 0);
  els.editPinned.checked = ev.pinned;

  els.editBackdrop.classList.remove('hidden');
  els.editBackdrop.setAttribute('aria-hidden', 'false');
  els.editTitle.focus();
}

function closeEditModal() {
  els.editBackdrop.classList.add('hidden');
  els.editBackdrop.setAttribute('aria-hidden', 'true');
}

function render() {
  if (!state) return;

  els.startupToggle.checked = state.launchAtStartup;

  const sorted = [...state.events].sort(
    (a, b) => new Date(nextOccurrence(a).dateLocal).getTime() - new Date(nextOccurrence(b).dateLocal).getTime()
  );

  els.events.innerHTML = '';
  if (sorted.length === 0) {
    els.events.innerHTML = `<div class="muted">No events yet. Add one above.</div>`;
    return;
  }

  for (const ev0 of sorted) {
    const ev = nextOccurrence(ev0);
    const { ms, days, hours, minutes } = diffParts(ev.dateLocal);

    const isDue = ms <= 0;
    const count = isDue ? 'Due' : `${days}d ${hours}h ${minutes}m`;

    const row = document.createElement('div');
    row.className = 'event';
    row.innerHTML = `
      <div class="swatch" style="background:${ev.color}"></div>
      <div>
        <h3>${escapeHtml(ev.title)} <span class="badge">${recurrenceToLabel(ev0.recurrence)}</span></h3>
        <div class="meta">${formatEventDateLabel(ev.dateLocal)} • <span class="count ${isDue ? 'due' : ''}">${count}</span></div>
      </div>
      <div class="actions">
        <button data-action="pin">${ev0.pinned ? 'Unpin' : 'Pin'}</button>
        <button data-action="edit">Edit</button>
        <button data-action="delete">Delete</button>
      </div>
    `;

    (row.querySelector('[data-action="pin"]') as HTMLButtonElement).onclick = async () => {
      state = await window.countdown.toggleWidget(ev0.id, !ev0.pinned);
      render();
    };

    (row.querySelector('[data-action="delete"]') as HTMLButtonElement).onclick = async () => {
      if (!state) return;
      const next = state.events.filter((e) => e.id !== ev0.id);
      state = await window.countdown.saveEvents(next);
      render();
    };

    (row.querySelector('[data-action="edit"]') as HTMLButtonElement).onclick = async () => {
      if (!state) return;
      openEditModal(ev0);
    };

    els.events.appendChild(row);
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

async function refreshState() {
  state = await window.countdown.getState();
  render();
}

function startTicker() {
  if (timer) window.clearInterval(timer);
  timer = window.setInterval(render, 1000);
}

els.addForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const title = els.title.value.trim();
  const dateText = els.date.value;
  if (!title || !dateText) return;

  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) {
    alert('Invalid date/time');
    return;
  }

  const newEvent: CountdownEvent = {
    id: uid(),
    title,
    dateLocal: dateText,
    color: els.color.value,
    timezone: 'local',
    recurrence: els.recurrence.value as Recurrence,
    notify: els.notify.checked,
    notifyMinutesBefore: Number(els.notifyMinutesBefore.value || '0'),
    pinned: false
  };

  state = state ?? (await window.countdown.getState());
  const next = [...state.events, newEvent];
  state = await window.countdown.saveEvents(next);

  els.title.value = '';
  els.date.value = '';
  render();
});

els.startupToggle.addEventListener('change', async () => {
  state = await window.countdown.setStartup(els.startupToggle.checked);
  render();
});

els.refresh.addEventListener('click', refreshState);

els.editClose.addEventListener('click', closeEditModal);
els.editCancel.addEventListener('click', closeEditModal);
els.editBackdrop.addEventListener('click', (e) => {
  if (e.target === els.editBackdrop) closeEditModal();
});

els.editNotify.addEventListener('change', () => {
  els.editNotifyMinutesBefore.disabled = !els.editNotify.checked;
});

els.editDelete.addEventListener('click', async () => {
  if (!state) state = await window.countdown.getState();
  const id = els.editId.value;
  if (!id) return;
  const next = state.events.filter((e) => e.id !== id);
  state = await window.countdown.saveEvents(next);
  closeEditModal();
  render();
});

els.editForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!state) state = await window.countdown.getState();

  const id = els.editId.value;
  const title = els.editTitle.value.trim();
  const dateLocal = els.editDate.value;
  if (!id || !title || !dateLocal) return;

  const date = new Date(dateLocal);
  if (Number.isNaN(date.getTime())) {
    alert('Invalid date/time');
    return;
  }

  const notifyMinutesBefore = Number(els.editNotifyMinutesBefore.value || '0');
  const next = state.events.map((ev) =>
    ev.id === id
      ? {
          ...ev,
          title,
          dateLocal,
          color: els.editColor.value,
          recurrence: els.editRecurrence.value as Recurrence,
          notify: els.editNotify.checked,
          notifyMinutesBefore: Number.isFinite(notifyMinutesBefore) ? notifyMinutesBefore : 0,
          pinned: els.editPinned.checked
        }
      : ev
  );

  state = await window.countdown.saveEvents(next);
  closeEditModal();
  render();
});

window.countdown.onEventsUpdated(() => {
  refreshState();
});

refreshState();
startTicker();
