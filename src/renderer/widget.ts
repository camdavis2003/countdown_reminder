import type { AppState, CountdownEvent } from './types';

function getEventId() {
  const url = new URL(window.location.href);
  return url.searchParams.get('eventId');
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

function renderOne(ev: CountdownEvent) {
  const el = document.getElementById('widget') as HTMLDivElement;
  const { ms, days, hours, minutes } = diffParts(ev.dateLocal);
  const isDue = ms <= 0;
  const count = isDue ? 'Due' : `${days}d ${hours}h ${minutes}m`;
  el.innerHTML = `
    <div class="widget-title">${escapeHtml(ev.title)}</div>
    <div class="widget-main">
      <div class="widget-count ${isDue ? 'due' : ''}">${count}</div>
      <div class="widget-date">${formatDateLabel(ev.dateLocal)}</div>
    </div>
  `;
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
  const id = getEventId();
  const st: AppState = await window.countdown.getState();
  const ev = st.events.find((e) => e.id === id);
  const el = document.getElementById('widget') as HTMLDivElement;
  if (!ev) {
    el.innerHTML = `<div class="muted">Event not found</div>`;
    return;
  }
  renderOne(ev);
}

window.countdown.onEventsUpdated(() => refresh());

refresh();
window.setInterval(refresh, 1000);
