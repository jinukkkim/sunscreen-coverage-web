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
  return { version: 1, records: [], enabled: false, activeDay: '', endTime: '20:00', delivered: [], completedSessions: [] };
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
    delivered: Array.isArray(state.delivered) ? state.delivered.filter(id => typeof id === 'string').slice(-200) : [],
    completedSessions: Array.isArray(state.completedSessions) ? state.completedSessions.filter(id => typeof id === 'string' && id.length <= 128).slice(-200) : [] };
}

export function recordApplication(state, at, now = Date.now(), id = crypto.randomUUID()) {
  if (!Number.isFinite(at) || at > now || dayKey(at) !== dayKey(now)) throw new Error('오늘 실제로 바른 시각만 기록할 수 있습니다.');
  if (state.records.some(record => Math.floor(record.at / 60000) === Math.floor(at / 60000))) throw new Error('같은 분에 기록한 도포가 이미 있습니다.');
  return { ...state, records: [...state.records.filter(record => record.at >= now - 30 * DAY_MS), { id, at }].sort((a, b) => a.at - b.at) };
}

export function recordMotionCompletion(state, { sessionId, at }, now = Date.now()) {
  if (typeof sessionId !== 'string' || !sessionId.length || sessionId.length > 128) throw new Error('동작 완료 세션을 확인하지 못했습니다.');
  const id = `motion:${sessionId}`;
  if (state.completedSessions?.includes(sessionId) || state.records.some(record => record.id === id)) return state;
  // A manual entry in the same minute describes the same application, so replace it.
  const base = { ...state, records: state.records.filter(record => Math.floor(record.at / 60000) !== Math.floor(at / 60000)) };
  const next = recordApplication(base, at, now, id);
  return { ...next,
    records: next.records.map(record => record.id === id ? { ...record, source: 'motion' } : record),
    completedSessions: [...(state.completedSessions || []), sessionId].slice(-200),
    enabled: true, activeDay: dayKey(at),
  };
}

export function recordSourceLabel(record) { return record?.source === 'motion' ? '동작 완료 자동 기록' : '직접 기록'; }

export function dailyEnd(state, now) { return Date.parse(`${dayKey(now)}T${state.endTime}:00+09:00`); }
export function latestRecord(state) { return state.records.at(-1) ?? null; }

// Product-defined reminder bands. These durations are not measured protection times.
export function uvPolicy(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 30) {
    return { uv: null, minutes: 120, label: 'UV 확인 전 · 기본 120분', fallback: true };
  }
  if (value < 3) return { uv: value, minutes: null, label: 'UV 0–2 · 알림 대기', fallback: false };
  const minutes = value < 4 ? 150 : value < 6 ? 120 : value < 8 ? 80 : 60;
  return { uv: value, minutes, label: `UV ${value} · ${minutes}분 주기`, fallback: false };
}

export function policyAt(forecast, at, now) { return uvPolicy(uvAt(forecast, at, now)?.value); }

// Re-evaluate when a forecast period starts. A low-UV period pauses reminders;
// a later high-UV period can resume them without creating an application record.
function nextPlan(anchor, from, forecast, now, end) {
  let cursor = Math.max(anchor, from);
  const slots = uvAt(forecast, cursor, now) ? forecast.slots : [];
  const boundaries = slots.flatMap(slot => [Date.parse(slot.validFrom), Date.parse(slot.validTo)]).filter(Number.isFinite);
  // Also include future periods when the current period is a data gap.
  if (!slots.length && forecast && Number.isFinite(Date.parse(forecast.fetchedAt)) && now - Date.parse(forecast.fetchedAt) <= 3600000 && now >= Date.parse(forecast.fetchedAt) - 60000) {
    boundaries.push(...(forecast.slots || []).flatMap(slot => [Date.parse(slot.validFrom), Date.parse(slot.validTo)]).filter(Number.isFinite));
  }
  while (cursor <= end) {
    const policy = policyAt(forecast, cursor, now);
    const boundary = Math.min(end + 1, ...boundaries.filter(time => time > cursor));
    if (policy.minutes !== null) {
      const periodStart = Math.max(anchor, ...boundaries.filter(time => time <= cursor));
      const target = Math.max(anchor + policy.minutes * 60000, periodStart);
      const at = cursor <= now ? target : Math.max(cursor, target);
      if (at < boundary && at <= end) return { at, ...policy };
    }
    cursor = boundary;
  }
  return null;
}

export function nextDue(state, now, forecast = null) {
  const last = latestRecord(state);
  if (!last || dayKey(last.at) !== dayKey(now)) return null;
  const plan = nextPlan(last.at, now, forecast, now, dailyEnd(state, now));
  return plan && dayKey(plan.at) === dayKey(now) ? { id: last.id, ...plan } : null;
}
export function pendingReminder(state, now, forecast = null) {
  const due = nextDue(state, now, forecast);
  return state.enabled && state.activeDay === dayKey(now) && now <= dailyEnd(state, now)
    && due && due.at <= now && !state.delivered.includes(due.id) ? due : null;
}

export function uvAt(forecast, at, now) {
  const fetched = Date.parse(forecast?.fetchedAt);
  if (!Number.isFinite(fetched) || now - fetched > 60 * 60000 || fetched - now > 60000) return null;
  return forecast.slots?.find(slot => typeof slot.value === 'number' && Number.isFinite(slot.value) && slot.value >= 0 && slot.value <= 30 && at >= Date.parse(slot.validFrom) && at < Date.parse(slot.validTo)) ?? null;
}

export function timeline(state, now, forecast = null) {
  const rows = state.records.filter(record => dayKey(record.at) === dayKey(now)).map((record, i) => ({ ...record, kind: 'record', label: i === 0 ? '첫 도포 기록' : '재도포 기록' }));
  let plan = nextDue(state, now, forecast);
  let first = true;
  while (plan) {
    rows.push({ ...plan, id: `plan-${plan.at}`, kind: 'plan', label: first ? '다음 재도포' : '이전 예정대로 발랐을 때', overdue: first && plan.at <= now });
    first = false;
    plan = nextPlan(plan.at, plan.at, forecast, now, dailyEnd(state, now));
  }
  return rows.sort((a, b) => a.at - b.at);
}

// Upcoming guidance assumes an overdue application happens now; never build
// future advice on missed applications as if they had actually happened.
export function upcomingTimeline(state, now, forecast = null) {
  const rows = [];
  const last = latestRecord(state);
  const preview = !last || dayKey(last.at) !== dayKey(now);
  // Before today's first record, show a hypothetical schedule anchored to now.
  // This never creates an application or an eligible reminder.
  let plan = preview ? nextPlan(now, now, forecast, now, dailyEnd(state, now)) : nextDue(state, now, forecast);
  if (!plan) return rows;
  // Repeat the measured UV interval until today's end time.
  for (let at = Math.max(now, plan.at), end = dailyEnd(state, now); at <= end; at += plan.minutes * 60000) {
    const first = rows.length === 0;
    rows.push({ ...plan, at, id: `upcoming-${at}`, immediate: first && plan.at <= now, preview,
      label: first ? '다음 재도포' : '이때 다시 바르세요', conditional: !first });
  }
  return rows;
}
