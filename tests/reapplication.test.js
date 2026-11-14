import test from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, emptyCare, INTERVAL_MS, nextDue, parseInput, pendingReminder, readCare, recordApplication, timeline, uvAt } from '../src/lib/reapplication.js';
import { deliverReminder } from '../src/lib/reminders.js';
import { locate, getForecast } from '../src/lib/location.js';

const at = value => Date.parse(`2026-11-14T${value}:00+09:00`);
const started = () => recordApplication(emptyCare(), at('08:00'), at('08:00'), 'first');
const enabled = () => ({ ...started(), enabled: true, activeDay: '2026-11-14' });

test('first application anchors a two-hour reminder; reapplication resets it', () => {
  assert.equal(nextDue(started(), at('09:00')).at, at('10:00'));
  const reapplied = recordApplication(started(), at('09:30'), at('09:30'), 'second');
  assert.equal(nextDue(reapplied, at('09:30')).at, at('11:30'));
  assert.deepEqual(timeline(reapplied, at('09:30')).filter(row => row.kind === 'record').map(row => row.label), ['첫 도포 기록', '재도포 기록']);
});
test('late or backdated records sort correctly without moving the latest application backwards', () => {
  const state = recordApplication(started(), at('07:00'), at('09:00'), 'earlier');
  assert.equal(state.records.at(-1).id, 'first');
  assert.equal(nextDue(state, at('09:00')).at, at('10:00'));
});
test('missed plans never create records or imply completed reapplication', () => {
  const state = started();
  const rows = timeline(state, at('15:00'));
  assert.equal(rows.filter(row => row.kind === 'record').length, 1);
  assert.equal(rows.find(row => row.kind === 'plan').at, at('10:00'));
  assert.equal(rows.find(row => row.kind === 'plan').overdue, true);
  assert.equal(state.records.length, 1);
});
test('notification is due once per actual application, including after reload', () => {
  const state = enabled();
  assert.equal(pendingReminder(state, at('09:59')), null);
  assert.equal(pendingReminder(state, at('10:00')).id, 'first');
  state.delivered.push('first');
  assert.equal(pendingReminder(readCare(JSON.stringify(state), at('10:00')), at('10:01')), null);
  const next = recordApplication(state, at('10:05'), at('10:05'), 'second');
  assert.equal(pendingReminder(next, at('12:05')).id, 'second');
});
test('reminders respect opt-in, selected end time and Korea day boundary', () => {
  assert.equal(pendingReminder(started(), at('10:00')), null);
  assert.equal(pendingReminder({ ...enabled(), endTime: '09:00' }, at('10:00')), null);
  assert.equal(pendingReminder(enabled(), Date.parse('2026-11-15T09:00:00+09:00')), null);
  assert.equal(dayKey(Date.parse('2026-11-14T15:00:00Z')), '2026-11-15');
  const late = recordApplication(emptyCare(), at('23:30'), at('23:30'), 'late');
  assert.equal(nextDue({ ...late, endTime: '23:59' }, at('23:30')), null);
});
test('manual records reject future, invalid dates and duplicates within a minute', () => {
  assert.equal(parseInput('2026-11-14T08:00', at('09:00')), at('08:00'));
  for (const value of ['2026-11-14T10:00', '2026-11-13T08:00', '2026-11-14T25:00', 'bad']) assert.throws(() => parseInput(value, at('09:00')));
  assert.throws(() => recordApplication(started(), at('08:00') + 1000, at('09:00'), 'duplicate'));
});
test('storage validates, prunes old records and preserves disabled state', () => {
  assert.throws(() => readCare('{'));
  const raw = { ...enabled(), records: [{ id: 'old', at: at('08:00') - 31 * 86400000 }, { id: 'bad', at: 'not a date' }, ...started().records], endTime: 'broken' };
  const state = readCare(JSON.stringify(raw), at('09:00'));
  assert.equal(state.records.length, 1);
  assert.equal(state.endTime, '20:00');
});
test('UV slot bounds and stale forecasts do not invent measurements or alter the interval', () => {
  const forecast = { fetchedAt: new Date(at('09:00')).toISOString(), slots: [{ value: 0, validFrom: new Date(at('09:00')).toISOString(), validTo: new Date(at('12:00')).toISOString() }] };
  assert.equal(uvAt(forecast, at('09:30'), at('09:30')).value, 0);
  assert.equal(uvAt(forecast, at('12:00'), at('09:30')), null);
  assert.equal(uvAt(forecast, at('10:30'), at('10:30')), null);
  assert.equal(INTERVAL_MS, 7200000);
});
test('a location failure cannot suppress the due reminder', async () => {
  const alerts = [], notifications = [];
  await deliverReminder({ refresh: async () => { throw new Error('denied'); }, notify: async body => notifications.push(body), onAlert: value => alerts.push(value) });
  assert.equal(alerts.length, 2);
  assert.equal(notifications.length, 1);
  assert.match(notifications[0], /갱신 실패/);
});
test('fresh location refresh runs for every reminder and device failure leaves the screen alert', async () => {
  let refreshes = 0;
  const alerts = [];
  const options = { refresh: async () => { refreshes++; return { message: '새 위치', uv: 3 }; }, onAlert: value => alerts.push(value), notify: async () => { throw new Error('unsupported'); } };
  await deliverReminder(options); await deliverReminder(options);
  assert.equal(refreshes, 2);
  assert.match(alerts.at(-1).notificationError, /표시하지 못했습니다/);
});
test('recording a new application while refreshing cancels the old device notification', async () => {
  let current = true, notified = false;
  await deliverReminder({ refresh: async () => { current = false; return { message: 'late', uv: 2 }; }, onAlert() {}, isCurrent: () => current, notify: () => { notified = true; } });
  assert.equal(notified, false);
});
test('geolocation requests a fresh position and rounds only the coordinates sent to the server', async () => {
  const position = await locate({ getCurrentPosition(success, _error, options) {
    assert.equal(options.maximumAge, 0); assert.equal(options.timeout, 8000);
    success({ coords: { latitude: 37.5665123, longitude: 126.9780123, accuracy: 50 }, timestamp: at('09:00') });
  } });
  await getForecast(position, async url => {
    assert.equal(url, '/api/uv?latitude=37.567&longitude=126.978');
    return new Response(JSON.stringify({ slots: [{ value: 0 }] }));
  });
});
