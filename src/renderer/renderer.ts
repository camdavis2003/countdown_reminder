import './styles.css';
import type { AppState, CountdownEvent } from './types';

function qs<T extends HTMLElement>(selector: string): T {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el as T;
}

function uid(): string {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function defaultDateLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

let state: AppState | null = null;
let selectedId: string | null = null;
let saveTimer: number | null = null;

const startupToggle = qs<HTMLInputElement>('#startupToggle');
const closePrefsBtn = qs<HTMLButtonElement>('#closePrefs');
const eventListEl = qs<HTMLDivElement>('#eventList');
const addNewBtn = qs<HTMLButtonElement>('#addNew');
const deleteBtn = qs<HTMLButtonElement>('#deleteEvent');

const detailTitle = qs<HTMLInputElement>('#detailTitle');
const detailDate = qs<HTMLInputElement>('#detailDate');
const detailRecurrence = qs<HTMLSelectElement>('#detailRecurrence');
const detailPinned = qs<HTMLInputElement>('#detailPinned');
const detailBgBtn = qs<HTMLButtonElement>('#detailBgBtn');
const detailBgSwatch = qs<HTMLSpanElement>('#detailBgSwatch');
const detailBgText = qs<HTMLSpanElement>('#detailBgText');
const detailTextBtn = qs<HTMLButtonElement>('#detailTextBtn');
const detailTextSwatch = qs<HTMLSpanElement>('#detailTextSwatch');
const detailTextText = qs<HTMLSpanElement>('#detailTextText');

// Recurrence modal
const recurModal = qs<HTMLDivElement>('#recurModal');
const recurBackdrop = qs<HTMLDivElement>('#recurBackdrop');
const recurCancel = qs<HTMLButtonElement>('#recurCancel');
const recurApply = qs<HTMLButtonElement>('#recurApply');

const recurWeeklyPane = qs<HTMLDivElement>('#recurWeekly');
const recurWeeklyWeekday = qs<HTMLSelectElement>('#recurWeeklyWeekday');

const recurMonthlyPane = qs<HTMLDivElement>('#recurMonthly');
const recurMonthlyLabelDay = qs<HTMLSpanElement>('#recurMonthlyLabelDay');
const recurMonthlyLabelNth = qs<HTMLSpanElement>('#recurMonthlyLabelNth');
const recurMonthlyDayRow = qs<HTMLDivElement>('#recurMonthlyDay');
const recurMonthlyNthRow = qs<HTMLDivElement>('#recurMonthlyNth');
const recurMonthlyDayOfMonth = qs<HTMLInputElement>('#recurMonthlyDayOfMonth');
const recurMonthlyWeekOfMonth = qs<HTMLSelectElement>('#recurMonthlyWeekOfMonth');
const recurMonthlyWeekday = qs<HTMLSelectElement>('#recurMonthlyWeekday');

const recurYearlyPane = qs<HTMLDivElement>('#recurYearly');
const recurYearlyLabelDate = qs<HTMLSpanElement>('#recurYearlyLabelDate');
const recurYearlyLabelNth = qs<HTMLSpanElement>('#recurYearlyLabelNth');
const recurYearlyDateRow = qs<HTMLDivElement>('#recurYearlyDate');
const recurYearlyNthRow = qs<HTMLDivElement>('#recurYearlyNth');
const recurYearlyMonth = qs<HTMLSelectElement>('#recurYearlyMonth');
const recurYearlyDayOfMonth = qs<HTMLInputElement>('#recurYearlyDayOfMonth');
const recurYearlyNthMonth = qs<HTMLSelectElement>('#recurYearlyNthMonth');
const recurYearlyWeekOfMonth = qs<HTMLSelectElement>('#recurYearlyWeekOfMonth');
const recurYearlyWeekday = qs<HTMLSelectElement>('#recurYearlyWeekday');

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
] as const;

function ordinal(n: number): string {
  const v = Math.abs(Math.trunc(n));
  const mod100 = v % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${v}th`;
  switch (v % 10) {
    case 1:
      return `${v}st`;
    case 2:
      return `${v}nd`;
    case 3:
      return `${v}rd`;
    default:
      return `${v}th`;
  }
}

function weekLabelForDate(d: Date): string {
  // Prefer "Last" when this is the final occurrence of that weekday in the month.
  const next = new Date(d);
  next.setDate(d.getDate() + 7);
  const isLast = next.getMonth() !== d.getMonth() || next.getFullYear() !== d.getFullYear();
  if (isLast) return 'Last';
  return ordinal(weekOfMonthForDate(d));
}

const colorPicker = qs<HTMLDivElement>('#colorPicker');
const colorTabPalettes = qs<HTMLButtonElement>('#colorTabPalettes');
const colorTabAdvanced = qs<HTMLButtonElement>('#colorTabAdvanced');
const colorPanePalettes = qs<HTMLDivElement>('#colorPanePalettes');
const colorPaneAdvanced = qs<HTMLDivElement>('#colorPaneAdvanced');
const standardColorsEl = qs<HTMLDivElement>('#standardColors');
const availableColorsEl = qs<HTMLDivElement>('#availableColors');
const recentColorsEl = qs<HTMLDivElement>('#recentColors');
const colorPreview = qs<HTMLDivElement>('#colorPreview');
const colorName = qs<HTMLDivElement>('#colorName');
const colorR = qs<HTMLInputElement>('#colorR');
const colorG = qs<HTMLInputElement>('#colorG');
const colorB = qs<HTMLInputElement>('#colorB');
const colorRNum = qs<HTMLInputElement>('#colorRNum');
const colorGNum = qs<HTMLInputElement>('#colorGNum');
const colorBNum = qs<HTMLInputElement>('#colorBNum');
const colorHex = qs<HTMLInputElement>('#colorHex');

type ColorTarget = 'bg' | 'text';
let activeColorTarget: ColorTarget | null = null;
let currentPickerHex = '#4F46E5';

type NamedColor = { name: string; hex: string };

const NAMED_COLORS: NamedColor[] = [
  { name: 'Black', hex: '#000000' },
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Gray', hex: '#808080' },
  { name: 'Silver', hex: '#C0C0C0' },
  { name: 'Red', hex: '#FF0000' },
  { name: 'Maroon', hex: '#800000' },
  { name: 'Yellow', hex: '#FFFF00' },
  { name: 'Olive', hex: '#808000' },
  { name: 'Lime', hex: '#00FF00' },
  { name: 'Green', hex: '#008000' },
  { name: 'Aqua', hex: '#00FFFF' },
  { name: 'Teal', hex: '#008080' },
  { name: 'Blue', hex: '#0000FF' },
  { name: 'Navy', hex: '#000080' },
  { name: 'Fuchsia', hex: '#FF00FF' },
  { name: 'Purple', hex: '#800080' },
];

const STANDARD_HEX: string[] = [
  '#FFFFFF', '#C0C0C0', '#808080', '#000000',
  '#FF0000', '#800000', '#FFFF00', '#808000',
  '#00FF00', '#008000', '#00FFFF', '#008080',
  '#0000FF', '#000080', '#FF00FF', '#800080',
];

// A larger palette (approximate Windows color dialog). 14 columns.
const AVAILABLE_HEX: string[] = [
  '#F2F2F2','#D9D9D9','#BFBFBF','#A6A6A6','#7F7F7F','#595959','#3F3F3F','#262626','#0C0C0C','#FFFFFF','#FFCCCC','#FF9999','#FF6666','#FF3333',
  '#FF0000','#CC0000','#990000','#660000','#330000','#000000','#FFE5CC','#FFCC99','#FFB266','#FF9933','#FF8000','#CC6600','#994C00','#663300','#331900','#1A0D00',
  '#FFF2CC','#FFE699','#FFD966','#FFCC33','#FFBF00','#CC9900','#997300','#665C00','#333300','#1A1A00','#E2F0D9','#C6E0B4','#A9D18E','#70AD47',
  '#548235','#385723','#273A0F','#1E2B09','#0F1604','#E7E6F7','#C9C7EE','#A8A4E6','#7B75D6','#5A54C4','#3E399E','#2C286F','#1C1A47','#0E0D24',
  '#DDEBF7','#BDD7EE','#9DC3E6','#5B9BD5','#2F75B5','#1F4E79','#16365C','#0F243E','#081522','#FCE4D6','#F8CBAD','#F4B183','#ED7D31',
  '#C55A11','#833C0C','#5A2A08','#3D1D05','#1F0F02','#EAD1DC','#D5A6BD','#C27BA0','#A64D79','#741B47','#4C1130','#2E0A1D','#1C0612','#0E0309',
  '#D9E1F2','#B4C6E7','#8FAADC','#4472C4','#2F5597','#1F3864','#172B4A','#0F1D32','#080E19','#D0CECE','#AEAAAA','#757171','#3A3838',
  '#171616','#0B0B0B','#2E75B6','#00B0F0','#00B050','#92D050','#FFC000','#7030A0','#FF3399','#00CC99','#9933FF','#FF6600','#6666FF','#00FFFF',
];

function setDisabledForDetails(disabled: boolean): void {
  detailTitle.disabled = disabled;
  detailDate.disabled = disabled;
  detailRecurrence.disabled = disabled;
  detailPinned.disabled = disabled;
  detailBgBtn.disabled = disabled;
  detailTextBtn.disabled = disabled;
  deleteBtn.disabled = disabled;
}

function toDateTimeLocalString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function weekOfMonthForDate(d: Date): number {
  // 1..5 based on the day number.
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
  // If it doesn't exist this month (or nth==5), use the last occurrence in this month.
  const weeksAvailable = Math.floor((lastDay - firstOccurrence) / 7);
  return firstOccurrence + weeksAvailable * 7;
}

function nextOccurrenceForEvent(ev: CountdownEvent): Date {
  const base = new Date(ev.dateLocal);
  const now = new Date();

  const recurrence = ev.recurrence;
  if (recurrence === 'none') return base;

  // Legacy modes + weekly with explicit weekday
  if (recurrence === 'yearly' || recurrence === 'monthly' || recurrence === 'weekly' || recurrence === 'daily') {
    const d = new Date(base);
    if (recurrence === 'weekly' && typeof ev.recurrenceWeekday === 'number') {
      if (d.getTime() >= now.getTime()) return d;
      const targetWeekday = clamp(ev.recurrenceWeekday, 0, 6);
      // Find next occurrence from now, keeping the event's time.
      const candidate = new Date(now);
      candidate.setHours(d.getHours(), d.getMinutes(), 0, 0);
      const delta = (targetWeekday - candidate.getDay() + 7) % 7;
      candidate.setDate(candidate.getDate() + delta);
      if (candidate.getTime() < now.getTime()) candidate.setDate(candidate.getDate() + 7);
      return candidate;
    }

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
    return d;
  }

  if (recurrence === 'yearly_nth_weekday') {
    const month = clamp(Number(ev.recurrenceMonth ?? base.getMonth()), 0, 11);
    const weekday = clamp(Number(ev.recurrenceWeekday ?? base.getDay()), 0, 6);
    const nth = clamp(Number(ev.recurrenceWeekOfMonth ?? weekOfMonthForDate(base)), 1, 5);
    let y = base.getFullYear();
    for (let i = 0; i < 20; i++) {
      const day = nthWeekdayDayOfMonth(y, month, weekday, nth);
      const candidate = new Date(y, month, day, base.getHours(), base.getMinutes(), 0, 0);
      if (candidate.getTime() >= now.getTime()) return candidate;
      y += 1;
    }
    return base;
  }

  // New monthly rule: fixed day-of-month (clamped to last day).
  if (recurrence === 'monthly_day_of_month') {
    const desired = Math.max(1, Math.min(31, Number(ev.recurrenceDayOfMonth ?? base.getDate())));
    let y = base.getFullYear();
    let m = base.getMonth();
    for (let i = 0; i < 240; i++) {
      const last = daysInMonth(y, m);
      const day = Math.min(desired, last);
      const candidate = new Date(y, m, day, base.getHours(), base.getMinutes(), 0, 0);
      if (candidate.getTime() >= now.getTime()) return candidate;
      m += 1;
      if (m >= 12) {
        m = 0;
        y += 1;
      }
    }
    return base;
  }

  // New monthly rule: nth weekday of the month.
  if (recurrence === 'monthly_nth_weekday') {
    const weekday = clamp(Number(ev.recurrenceWeekday ?? base.getDay()), 0, 6);
    const nth = clamp(Number(ev.recurrenceWeekOfMonth ?? weekOfMonthForDate(base)), 1, 5);
    let y = base.getFullYear();
    let m = base.getMonth();
    for (let i = 0; i < 240; i++) {
      const day = nthWeekdayDayOfMonth(y, m, weekday, nth);
      const candidate = new Date(y, m, day, base.getHours(), base.getMinutes(), 0, 0);
      if (candidate.getTime() >= now.getTime()) return candidate;
      m += 1;
      if (m >= 12) {
        m = 0;
        y += 1;
      }
    }
    return base;
  }

  return base;
}

function normalizeHex(input: string): string {
  let hex = input.trim();
  if (!hex.startsWith('#')) hex = `#${hex}`;
  if (hex.length === 4) {
    // #RGB -> #RRGGBB
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return '#000000';
  return hex.toUpperCase();
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = normalizeHex(hex).slice(1);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return { r, g, b };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const to = (n: number) => clamp(n).toString(16).padStart(2, '0').toUpperCase();
  return `#${to(r)}${to(g)}${to(b)}`;
}

function getNamedColor(hex: string): NamedColor | null {
  const n = normalizeHex(hex);
  return NAMED_COLORS.find((c) => c.hex === n) ?? null;
}

function formatColorLabel(hex: string): string {
  const n = getNamedColor(hex);
  if (n) return `${n.name} (${n.hex})`;
  return normalizeHex(hex);
}

function getRecentColors(): string[] {
  try {
    const raw = localStorage.getItem('recentColors');
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return arr.map(normalizeHex).filter((v, i, a) => a.indexOf(v) === i).slice(0, 8);
  } catch {
    return [];
  }
}

function pushRecentColor(hex: string): void {
  const next = [normalizeHex(hex), ...getRecentColors()].filter((v, i, a) => a.indexOf(v) === i).slice(0, 8);
  localStorage.setItem('recentColors', JSON.stringify(next));
}

function setPickerHex(hex: string): void {
  currentPickerHex = normalizeHex(hex);
  const { r, g, b } = hexToRgb(currentPickerHex);
  colorR.value = String(r);
  colorG.value = String(g);
  colorB.value = String(b);
  colorRNum.value = String(r);
  colorGNum.value = String(g);
  colorBNum.value = String(b);
  colorHex.value = currentPickerHex;
  colorPreview.style.background = currentPickerHex;
  colorName.textContent = formatColorLabel(currentPickerHex);
}

function applyPickerHex(): void {
  if (!activeColorTarget) return;
  const hex = normalizeHex(currentPickerHex);
  pushRecentColor(hex);
  if (activeColorTarget === 'bg') updateSelected({ color: hex });
  if (activeColorTarget === 'text') updateSelected({ textColor: hex });
  renderDetails();
}

function showPickerNear(anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  const width = 560;
  const height = 410;
  const margin = 8;
  let left = rect.left;
  let top = rect.bottom + 6;

  if (left + width > window.innerWidth - margin) {
    left = window.innerWidth - margin - width;
  }
  if (top + height > window.innerHeight - margin) {
    top = rect.top - 6 - height;
  }
  left = Math.max(margin, left);
  top = Math.max(margin, top);

  colorPicker.style.left = `${Math.round(left)}px`;
  colorPicker.style.top = `${Math.round(top)}px`;
  colorPicker.classList.remove('hidden');
}

function hidePicker(): void {
  colorPicker.classList.add('hidden');
  activeColorTarget = null;
  detailBgBtn.setAttribute('aria-expanded', 'false');
  detailTextBtn.setAttribute('aria-expanded', 'false');
}

function setPickerTab(tab: 'palettes' | 'advanced'): void {
  const palettes = tab === 'palettes';
  colorTabPalettes.classList.toggle('active', palettes);
  colorTabAdvanced.classList.toggle('active', !palettes);
  colorPanePalettes.classList.toggle('hidden', !palettes);
  colorPaneAdvanced.classList.toggle('hidden', palettes);
}

function renderPalette(targetEl: HTMLElement, colors: string[]): void {
  targetEl.innerHTML = '';
  for (const hex of colors) {
    const cell = document.createElement('div');
    cell.className = 'colorCell';
    cell.style.background = hex;
    cell.title = formatColorLabel(hex);
    cell.addEventListener('click', () => {
      setPickerHex(hex);
      applyPickerHex();
      hidePicker();
    });
    targetEl.appendChild(cell);
  }
}

function renderRecentPalette(): void {
  const recents = getRecentColors();
  renderPalette(recentColorsEl, recents.length ? recents : ['#FFFFFF', '#000000', '#808080']);
}

function getSelectedEvent(): CountdownEvent | null {
  if (!state || !selectedId) return null;
  return state.events.find((e) => e.id === selectedId) ?? null;
}

function nextOccurrenceDate(ev: CountdownEvent): Date {
  return nextOccurrenceForEvent(ev);
}

function getSortedEventsForDisplay(events: CountdownEvent[]): CountdownEvent[] {
  return [...events].sort((a, b) => {
    const ap = !!a.pinned;
    const bp = !!b.pinned;
    if (ap !== bp) return ap ? -1 : 1;
    return nextOccurrenceDate(a).getTime() - nextOccurrenceDate(b).getTime();
  });
}

function ensureSelection(): void {
  if (!state) return;
  if (selectedId && state.events.some((e) => e.id === selectedId)) return;
  selectedId = getSortedEventsForDisplay(state.events)[0]?.id ?? null;
}

function scheduleSave(): void {
  if (!state) return;
  if (saveTimer) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    if (!state) return;
    window.countdown.saveEvents(state.events);
  }, 200);
}

function renderList(): void {
  if (!state) return;
  ensureSelection();

  eventListEl.innerHTML = '';

  if (state.events.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'eventListEmpty';
    empty.textContent = 'No events yet.';
    eventListEl.appendChild(empty);
    return;
  }

  for (const e of getSortedEventsForDisplay(state.events)) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'eventItem' + (e.id === selectedId ? ' selected' : '');
    item.innerHTML = `
      <span class="eventSwatch" style="background:${e.color}"></span>
      <span class="eventItemTitle">${escapeHtml(e.title)}</span>
    `;
    item.addEventListener('click', () => {
      selectedId = e.id;
      renderList();
      renderDetails();
    });
    eventListEl.appendChild(item);
  }
}

function renderDetails(): void {
  const e = getSelectedEvent();
  if (!e) {
    setDisabledForDetails(true);
    detailTitle.value = '';
    detailDate.value = '';
    detailRecurrence.value = 'none';
    detailPinned.checked = false;
    detailBgSwatch.style.background = '#4F46E5';
    detailBgText.textContent = '#4F46E5';
    detailTextSwatch.style.background = '#FFFFFF';
    detailTextText.textContent = '#FFFFFF';
    return;
  }

  setDisabledForDetails(false);
  detailTitle.value = e.title;
  detailDate.value = e.dateLocal;
  const internal = e.recurrence ?? 'none';
  if (internal === 'monthly_day_of_month' || internal === 'monthly_nth_weekday' || internal === 'monthly') {
    detailRecurrence.value = 'monthly';
  } else if (internal === 'yearly_nth_weekday') {
    detailRecurrence.value = 'yearly';
  } else {
    detailRecurrence.value = internal;
  }
  lastUiRecurrenceValue = detailRecurrence.value;

  detailPinned.checked = !!e.pinned;
  const bg = normalizeHex(e.color);
  const fg = normalizeHex(e.textColor ?? '#FFFFFF');
  detailBgSwatch.style.background = bg;
  detailBgText.textContent = formatColorLabel(bg);
  detailTextSwatch.style.background = fg;
  detailTextText.textContent = formatColorLabel(fg);
}

let lastUiRecurrenceValue: string = 'none';
let modalMode: 'weekly' | 'monthly' | 'yearly' | null = null;

function setModalMode(mode: 'weekly' | 'monthly' | 'yearly'): void {
  modalMode = mode;
  recurWeeklyPane.classList.toggle('hidden', mode !== 'weekly');
  recurMonthlyPane.classList.toggle('hidden', mode !== 'monthly');
  recurYearlyPane.classList.toggle('hidden', mode !== 'yearly');
}

function showRecurrenceModal(mode: 'weekly' | 'monthly' | 'yearly', e: CountdownEvent): void {
  setModalMode(mode);
  const base = new Date(e.dateLocal);

  // Smart prompt labels derived from the selected date.
  const baseDay = clamp(base.getDate(), 1, 31);
  const baseWeekday = clamp(base.getDay(), 0, 6);
  const baseWeekLabel = weekLabelForDate(base);
  const baseWeekdayName = WEEKDAY_NAMES[baseWeekday];
  const baseMonthName = MONTH_NAMES[clamp(base.getMonth(), 0, 11)];

  recurMonthlyLabelDay.textContent = `Monthly on the ${ordinal(baseDay)}`;
  recurMonthlyLabelNth.textContent = `Monthly on the ${baseWeekLabel} ${baseWeekdayName}`;
  recurYearlyLabelDate.textContent = `Yearly on ${baseMonthName} ${ordinal(baseDay)}`;
  recurYearlyLabelNth.textContent = `Yearly on the ${baseWeekLabel} ${baseWeekdayName} of ${baseMonthName}`;

  if (mode === 'weekly') {
    recurWeeklyWeekday.value = String(clamp(Number(e.recurrenceWeekday ?? base.getDay()), 0, 6));
  }

  if (mode === 'monthly') {
    const monthlyMode = e.recurrence === 'monthly_nth_weekday' ? 'nth' : 'day';
    (document.querySelector(`input[name="recurMonthlyMode"][value="${monthlyMode}"]`) as HTMLInputElement).checked = true;
    recurMonthlyDayOfMonth.value = String(clamp(Number(e.recurrenceDayOfMonth ?? base.getDate()), 1, 31));
    recurMonthlyWeekOfMonth.value = String(clamp(Number(e.recurrenceWeekOfMonth ?? weekOfMonthForDate(base)), 1, 5));
    recurMonthlyWeekday.value = String(clamp(Number(e.recurrenceWeekday ?? base.getDay()), 0, 6));
    syncMonthlyModeUI();
  }

  if (mode === 'yearly') {
    const yearlyMode = e.recurrence === 'yearly_nth_weekday' ? 'nth' : 'date';
    (document.querySelector(`input[name="recurYearlyMode"][value="${yearlyMode}"]`) as HTMLInputElement).checked = true;

    const month = clamp(Number(e.recurrenceMonth ?? base.getMonth()), 0, 11);
    const day = clamp(Number(e.recurrenceDayOfMonth ?? base.getDate()), 1, 31);
    recurYearlyMonth.value = String(month);
    recurYearlyDayOfMonth.value = String(day);

    recurYearlyNthMonth.value = String(month);
    recurYearlyWeekOfMonth.value = String(clamp(Number(e.recurrenceWeekOfMonth ?? weekOfMonthForDate(base)), 1, 5));
    recurYearlyWeekday.value = String(clamp(Number(e.recurrenceWeekday ?? base.getDay()), 0, 6));
    syncYearlyModeUI();
  }

  recurModal.classList.remove('hidden');
}

function hideRecurrenceModal(): void {
  recurModal.classList.add('hidden');
  modalMode = null;
}

function syncMonthlyModeUI(): void {
  const mode = (document.querySelector('input[name="recurMonthlyMode"]:checked') as HTMLInputElement)?.value ?? 'day';
  recurMonthlyDayRow.classList.toggle('hidden', mode !== 'day');
  recurMonthlyNthRow.classList.toggle('hidden', mode !== 'nth');
}

function syncYearlyModeUI(): void {
  const mode = (document.querySelector('input[name="recurYearlyMode"]:checked') as HTMLInputElement)?.value ?? 'date';
  recurYearlyDateRow.classList.toggle('hidden', mode !== 'date');
  recurYearlyNthRow.classList.toggle('hidden', mode !== 'nth');
}

function updateSelected(patch: Partial<CountdownEvent>): void {
  if (!state || !selectedId) return;
  const idx = state.events.findIndex((e) => e.id === selectedId);
  if (idx < 0) return;

  const next: CountdownEvent = { ...state.events[idx], ...patch };
  const nextEvents = state.events.slice();
  nextEvents[idx] = next;
  state = { ...state, events: nextEvents };

  scheduleSave();
  renderList();
}

async function refreshState(): Promise<void> {
  state = await window.countdown.getState();
  startupToggle.checked = !!state.launchAtStartup;
  ensureSelection();
  renderList();
  renderDetails();
}

closePrefsBtn.addEventListener('click', () => {
  window.close();
});

startupToggle.addEventListener('change', async () => {
  await window.countdown.setStartup(startupToggle.checked);
});

addNewBtn.addEventListener('click', () => {
  if (!state) return;

  const base = new Date(defaultDateLocal());

  const newEvent: CountdownEvent = {
    id: uid(),
    title: 'New Event',
    dateLocal: defaultDateLocal(),
    timezone: 'local',
    recurrence: 'none',
    recurrenceDayOfMonth: base.getDate(),
    recurrenceMonth: base.getMonth(),
    recurrenceWeekOfMonth: weekOfMonthForDate(base),
    recurrenceWeekday: base.getDay(),
    color: '#4f46e5',
    textColor: '#ffffff',
    notify: true,
    notifyMinutesBefore: 0,
    pinned: false,
  };

  state = { ...state, events: [...state.events, newEvent] };
  selectedId = newEvent.id;
  window.countdown.saveEvents(state.events);
  renderList();
  renderDetails();
});

deleteBtn.addEventListener('click', async () => {
  if (!state || !selectedId) return;
  const toDelete = selectedId;
  state = { ...state, events: state.events.filter((e) => e.id !== toDelete) };
  selectedId = getSortedEventsForDisplay(state.events)[0]?.id ?? null;
  renderList();
  renderDetails();
  await window.countdown.deleteEvent(toDelete);
  await refreshState();
});

detailTitle.addEventListener('input', () => {
  updateSelected({ title: detailTitle.value });
});
detailDate.addEventListener('change', () => {
  updateSelected({ dateLocal: detailDate.value });
});

detailRecurrence.addEventListener('change', () => {
  const e = getSelectedEvent();
  if (!e) return;

  const nextUi = detailRecurrence.value;
  if (nextUi === 'none' || nextUi === 'daily') {
    updateSelected({ recurrence: nextUi });
    lastUiRecurrenceValue = nextUi;
    renderDetails();
    return;
  }

  // Weekly/monthly/yearly require configuration in modal.
  showRecurrenceModal(nextUi as 'weekly' | 'monthly' | 'yearly', e);
});

// Modal interactions
recurBackdrop.addEventListener('mousedown', () => {
  hideRecurrenceModal();
  detailRecurrence.value = lastUiRecurrenceValue;
});
recurCancel.addEventListener('click', () => {
  hideRecurrenceModal();
  detailRecurrence.value = lastUiRecurrenceValue;
});

document.querySelectorAll('input[name="recurMonthlyMode"]').forEach((el) => {
  el.addEventListener('change', () => syncMonthlyModeUI());
});
document.querySelectorAll('input[name="recurYearlyMode"]').forEach((el) => {
  el.addEventListener('change', () => syncYearlyModeUI());
});

recurApply.addEventListener('click', () => {
  const e = getSelectedEvent();
  if (!e || !modalMode) {
    hideRecurrenceModal();
    return;
  }

  const base = new Date(e.dateLocal);
  const now = new Date();
  const patch: Partial<CountdownEvent> = {};

  const withTime = (d: Date) => {
    d.setHours(base.getHours(), base.getMinutes(), 0, 0);
    return d;
  };

  if (modalMode === 'weekly') {
    const weekday = clamp(Number(recurWeeklyWeekday.value), 0, 6);
    patch.recurrence = 'weekly';
    patch.recurrenceWeekday = weekday;
    // Set next occurrence for that weekday/time.
    const candidate = withTime(new Date(now));
    const delta = (weekday - candidate.getDay() + 7) % 7;
    candidate.setDate(candidate.getDate() + delta);
    if (candidate.getTime() < now.getTime()) candidate.setDate(candidate.getDate() + 7);
    patch.dateLocal = toDateTimeLocalString(candidate);
  }

  if (modalMode === 'monthly') {
    const monthlyMode = (document.querySelector('input[name="recurMonthlyMode"]:checked') as HTMLInputElement)?.value ?? 'day';
    if (monthlyMode === 'day') {
      patch.recurrence = 'monthly_day_of_month';
      patch.recurrenceDayOfMonth = clamp(Number(recurMonthlyDayOfMonth.value), 1, 31);
    } else {
      patch.recurrence = 'monthly_nth_weekday';
      patch.recurrenceWeekOfMonth = clamp(Number(recurMonthlyWeekOfMonth.value), 1, 5);
      patch.recurrenceWeekday = clamp(Number(recurMonthlyWeekday.value), 0, 6);
    }
    const next = nextOccurrenceForEvent({ ...e, ...patch, dateLocal: toDateTimeLocalString(base) } as CountdownEvent);
    patch.dateLocal = toDateTimeLocalString(next);
  }

  if (modalMode === 'yearly') {
    const yearlyMode = (document.querySelector('input[name="recurYearlyMode"]:checked') as HTMLInputElement)?.value ?? 'date';
    if (yearlyMode === 'date') {
      const month = clamp(Number(recurYearlyMonth.value), 0, 11);
      const desiredDay = clamp(Number(recurYearlyDayOfMonth.value), 1, 31);
      patch.recurrence = 'yearly';
      patch.recurrenceMonth = month;
      patch.recurrenceDayOfMonth = desiredDay;

      let y = now.getFullYear();
      for (let i = 0; i < 5; i++) {
        const last = daysInMonth(y, month);
        const day = Math.min(desiredDay, last);
        const cand = withTime(new Date(y, month, day));
        if (cand.getTime() >= now.getTime()) {
          patch.dateLocal = toDateTimeLocalString(cand);
          break;
        }
        y += 1;
      }
    } else {
      const month = clamp(Number(recurYearlyNthMonth.value), 0, 11);
      const nth = clamp(Number(recurYearlyWeekOfMonth.value), 1, 5);
      const weekday = clamp(Number(recurYearlyWeekday.value), 0, 6);
      patch.recurrence = 'yearly_nth_weekday';
      patch.recurrenceMonth = month;
      patch.recurrenceWeekOfMonth = nth;
      patch.recurrenceWeekday = weekday;

      let y = now.getFullYear();
      for (let i = 0; i < 5; i++) {
        const day = nthWeekdayDayOfMonth(y, month, weekday, nth);
        const cand = withTime(new Date(y, month, day));
        if (cand.getTime() >= now.getTime()) {
          patch.dateLocal = toDateTimeLocalString(cand);
          break;
        }
        y += 1;
      }
    }
  }

  updateSelected(patch);
  hideRecurrenceModal();
  lastUiRecurrenceValue = detailRecurrence.value;
  renderDetails();
});
detailBgBtn.addEventListener('click', () => {
  const e = getSelectedEvent();
  if (!e) return;
  activeColorTarget = 'bg';
  detailBgBtn.setAttribute('aria-expanded', 'true');
  setPickerTab('palettes');
  setPickerHex(e.color);
  renderRecentPalette();
  showPickerNear(detailBgBtn);
});

detailTextBtn.addEventListener('click', () => {
  const e = getSelectedEvent();
  if (!e) return;
  activeColorTarget = 'text';
  detailTextBtn.setAttribute('aria-expanded', 'true');
  setPickerTab('palettes');
  setPickerHex(e.textColor ?? '#FFFFFF');
  renderRecentPalette();
  showPickerNear(detailTextBtn);
});

colorTabPalettes.addEventListener('click', () => setPickerTab('palettes'));
colorTabAdvanced.addEventListener('click', () => setPickerTab('advanced'));

function syncAdvancedFromSliders(): void {
  const r = Number(colorR.value);
  const g = Number(colorG.value);
  const b = Number(colorB.value);
  colorRNum.value = String(r);
  colorGNum.value = String(g);
  colorBNum.value = String(b);
  setPickerHex(rgbToHex(r, g, b));
  applyPickerHex();
}

function syncAdvancedFromNumbers(): void {
  const r = Number(colorRNum.value);
  const g = Number(colorGNum.value);
  const b = Number(colorBNum.value);
  colorR.value = String(r);
  colorG.value = String(g);
  colorB.value = String(b);
  setPickerHex(rgbToHex(r, g, b));
  applyPickerHex();
}

colorR.addEventListener('input', syncAdvancedFromSliders);
colorG.addEventListener('input', syncAdvancedFromSliders);
colorB.addEventListener('input', syncAdvancedFromSliders);
colorRNum.addEventListener('change', syncAdvancedFromNumbers);
colorGNum.addEventListener('change', syncAdvancedFromNumbers);
colorBNum.addEventListener('change', syncAdvancedFromNumbers);

colorHex.addEventListener('change', () => {
  setPickerHex(colorHex.value);
  applyPickerHex();
});

document.addEventListener('mousedown', (ev) => {
  if (colorPicker.classList.contains('hidden')) return;
  const target = ev.target as Node;
  if (colorPicker.contains(target)) return;
  if (detailBgBtn.contains(target)) return;
  if (detailTextBtn.contains(target)) return;
  hidePicker();
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && !colorPicker.classList.contains('hidden')) {
    hidePicker();
  }
});

detailPinned.addEventListener('change', async () => {
  const e = getSelectedEvent();
  if (!e) return;
  const nextPinned = detailPinned.checked;
  updateSelected({ pinned: nextPinned });
  // Pin only affects ordering; saving the event list is enough.
});

window.countdown.onEventsUpdated(() => {
  refreshState();
});

window.countdown.onSelectEvent(async (eventId) => {
  if (!state) await refreshState();
  if (!state) return;
  if (state.events.some((e) => e.id === eventId)) {
    selectedId = eventId;
    renderList();
    renderDetails();
  }
});

refreshState();

// Initialize palettes once
renderPalette(standardColorsEl, STANDARD_HEX);
renderPalette(availableColorsEl, AVAILABLE_HEX);
renderRecentPalette();
