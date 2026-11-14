import test from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, emptyCare, INTERVAL_MS, nextDue, parseInput, pendingReminder, policyAt, readCare, recordApplication, timeline, uvAt, uvPolicy } from '../src/lib/reapplication.js';
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
test('UV slot bounds and stale forecasts do not invent measurements', () => {
  const forecast = { fetchedAt: new Date(at('09:00')).toISOString(), slots: [{ value: 0, validFrom: new Date(at('09:00')).toISOString(), validTo: new Date(at('12:00')).toISOString() }] };
  assert.equal(uvAt(forecast, at('09:30'), at('09:30')).value, 0);
  assert.equal(uvAt(forecast, at('12:00'), at('09:30')), null);
  assert.equal(uvAt(forecast, at('10:30'), at('10:30')), null);
  assert.equal(INTERVAL_MS, 7200000);
});

function forecastOf(value, fetchedAt = at('09:00'), slots) {
  return { fetchedAt: new Date(fetchedAt).toISOString(), slots: slots || [{ value, validFrom: new Date(at('06:00')).toISOString(), validTo: new Date(at('23:59')).toISOString() }] };
}
test('the requested UV bands map to waiting, 150, 120, 80 and 60 minutes', () => {
  for (const [uv, minutes] of [[0, null], [1, null], [2, null], [3, 150], [4, 120], [5, 120], [6, 80], [7, 80], [8, 60], [11, 60], [30, 60]]) {
    assert.equal(uvPolicy(uv).minutes, minutes, `UV ${uv}`);
    const due = nextDue(started(), at('09:00'), forecastOf(uv));
    assert.equal(due?.at ?? null, minutes === null ? null : at('08:00') + minutes * 60000, `due at UV ${uv}`);
  }
});
test('decimal UV values use continuous, gap-free band boundaries', () => {
  assert.equal(uvPolicy(2.9).minutes, null);
  assert.equal(uvPolicy(3.9).minutes, 150);
  assert.equal(uvPolicy(5.9).minutes, 120);
  assert.equal(uvPolicy(7.9).minutes, 80);
});
test('missing, invalid or stale UV falls back to 120 minutes, never a low-UV pause', () => {
  for (const value of [null, undefined, NaN, Infinity, -1, 31, '0', '8']) assert.equal(uvPolicy(value).minutes, 120);
  assert.equal(policyAt(forecastOf(0, at('07:00')), at('09:00'), at('09:00')).minutes, 120);
  assert.equal(nextDue(started(), at('09:00'), forecastOf(8, at('07:00'))).at, at('10:00'));
});
test('UV 3 triggers after 150 minutes while UV 6 and UV 8 trigger earlier', () => {
  const state = enabled();
  assert.equal(pendingReminder(state, at('10:29'), forecastOf(3, at('10:29'))), null);
  assert.equal(pendingReminder(state, at('10:30'), forecastOf(3, at('10:30'))).minutes, 150);
  assert.equal(pendingReminder(state, at('09:19'), forecastOf(6, at('09:19'))), null);
  assert.equal(pendingReminder(state, at('09:20'), forecastOf(6, at('09:20'))).minutes, 80);
  assert.equal(pendingReminder(state, at('09:00'), forecastOf(8)).minutes, 60);
});
test('current low UV pauses alarms but the timeline resumes on a higher forecast period', () => {
  const slots = [[0, '09:00', '12:00'], [6, '12:00', '15:00'], [2, '15:00', '23:59']].map(([value, start, end]) => ({ value, validFrom: new Date(at(start)).toISOString(), validTo: new Date(at(end)).toISOString() }));
  const forecast = forecastOf(null, at('09:00'), slots);
  assert.equal(pendingReminder(enabled(), at('09:00'), forecast), null);
  assert.equal(nextDue(enabled(), at('09:00'), forecast).at, at('12:00'));
  assert.deepEqual(timeline(enabled(), at('09:00'), forecast).filter(row => row.kind === 'plan').map(row => row.at), [at('12:00'), at('13:20'), at('14:40')]);
  assert.equal(nextDue(enabled(), at('12:30'), { ...forecast, fetchedAt: new Date(at('12:30')).toISOString() }).at, at('12:00'));
});
test('a future UV increase recalculates the next plan at the forecast boundary', () => {
  const slots = [[3, '09:00', '10:00'], [8, '10:00', '12:00']].map(([value, start, end]) => ({ value, validFrom: new Date(at(start)).toISOString(), validTo: new Date(at(end)).toISOString() }));
  const forecast = forecastOf(null, at('09:00'), slots);
  assert.equal(nextDue(started(), at('09:00'), forecast).at, at('10:00'));
  assert.equal(nextDue(started(), at('09:00'), forecast).minutes, 60);
});
test('a new application resets the UV-driven interval without creating extra records', () => {
  const state = recordApplication(started(), at('09:30'), at('09:30'), 'second');
  assert.equal(nextDue(state, at('09:30'), forecastOf(7)).at, at('10:50'));
  assert.equal(state.records.length, 2);
});
test('notification copy uses the applied UV interval', async () => {
  let message;
  await deliverReminder({ intervalMinutes: 80, uv: 7, onAlert() {}, notify: body => { message = body; } });
  assert.match(message, /UV 7 기준 80분/);
  assert.equal(message.includes('2시간'), false);
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
