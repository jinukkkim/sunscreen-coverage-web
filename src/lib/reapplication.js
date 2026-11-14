export const INTERVAL_MS = 2 * 60 * 60 * 1000;
export const STORAGE_KEY = 'sunguard.care.v1';
const DAY_MS = 24 * 60 * 60 * 1000;
export const dayKey = time => new Date(time + 9 * 3600000).toISOString().slice(0, 10);
export const formatTime = time => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(time);
export const formatDate = time => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' }).format(time);
export const dateTimeInput = time => new Date(time + 9 * 3600000).toISOString().slice(0, 16);

export function parseInput(value, now) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('올바른 도포 시각을 입력해 주세요.');
  const time = Date.parse(`${value}:00+09:00`);
  if (!Number.isFinite(time) || dateTimeInput(time) !== value || time > now || dayKey(time) !== dayKey(now)) {
    throw new Error('오늘 실제로 바른 시각을 입력해 주세요. 미래 시각은 기록할 수 없습니다.');
  }
  return time;
}

export function emptyCare() {
  return { version: 1, records: [], enabled: false, activeDay: '', endTime: '20:00', delivered: [] };
}

export function readCare(raw, now = Date.now()) {
  const state = raw ? JSON.parse(raw) : emptyCare();
  if (state.version !== 1 || !Array.isArray(state.records) || state.records.length > 2000) throw new Error('기록 형식이 올바르지 않습니다.');
  const ids = new Set();
  const records = state.records.filter(record => {
    if (!record || typeof record.id !== 'string' || !Number.isFinite(record.at) || record.at <= 0 || record.at > now || ids.has(record.id)) return false;
    ids.add(record.id);
    return record.at >= now - 30 * DAY_MS;
  }).sort((a, b) => a.at - b.at);
  return { ...emptyCare(), records, enabled: state.enabled === true, activeDay: typeof state.activeDay === 'string' ? state.activeDay : '',
    endTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(state.endTime) ? state.endTime : '20:00',
    delivered: Array.isArray(state.delivered) ? state.delivered.filter(id => typeof id === 'string').slice(-200) : [] };
}

export function recordApplication(state, at, now = Date.now(), id = crypto.randomUUID()) {
  if (!Number.isFinite(at) || at > now || dayKey(at) !== dayKey(now)) throw new Error('오늘 실제로 바른 시각만 기록할 수 있습니다.');
  if (state.records.some(record => Math.floor(record.at / 60000) === Math.floor(at / 60000))) throw new Error('같은 분에 기록한 도포가 이미 있습니다.');
  return { ...state, records: [...state.records.filter(record => record.at >= now - 30 * DAY_MS), { id, at }].sort((a, b) => a.at - b.at) };
}

export function dailyEnd(state, now) { return Date.parse(`${dayKey(now)}T${state.endTime}:00+09:00`); }
export function latestRecord(state) { return state.records.at(-1) ?? null; }
export function nextDue(state, now) {
  const last = latestRecord(state);
  if (!last || dayKey(last.at) !== dayKey(now)) return null;
  const due = last.at + INTERVAL_MS;
  return due <= dailyEnd(state, now) && dayKey(due) === dayKey(now) ? { id: last.id, at: due } : null;
}
export function pendingReminder(state, now) {
  const due = nextDue(state, now);
  return state.enabled && state.activeDay === dayKey(now) && now <= dailyEnd(state, now)
    && due && due.at <= now && !state.delivered.includes(due.id) ? due : null;
}

export function uvAt(forecast, at, now) {
  if (!forecast || !Number.isFinite(Date.parse(forecast.fetchedAt)) || now - Date.parse(forecast.fetchedAt) > 60 * 60000) return null;
  return forecast.slots?.find(slot => at >= Date.parse(slot.validFrom) && at < Date.parse(slot.validTo)) ?? null;
}

export function timeline(state, now) {
  const rows = state.records.filter(record => dayKey(record.at) === dayKey(now)).map((record, i) => ({ ...record, kind: 'record', label: i === 0 ? '첫 도포 기록' : '재도포 기록' }));
  const due = nextDue(state, now);
  if (due) {
    for (let at = due.at; at <= dailyEnd(state, now); at += INTERVAL_MS) {
      rows.push({ id: `plan-${at}`, at, kind: 'plan', label: at === due.at ? '다음 재도포' : '이전 예정대로 발랐을 때', overdue: at === due.at && at <= now });
    }
  }
  return rows.sort((a, b) => a.at - b.at);
}
