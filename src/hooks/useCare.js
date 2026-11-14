import { useCallback, useEffect, useRef, useState } from 'react';
import { dailyEnd, dayKey, emptyCare, latestRecord, pendingReminder, readCare, recordApplication, STORAGE_KEY, uvAt } from '../lib/reapplication.js';
import { getForecast, locate } from '../lib/location.js';
import { deliverReminder, enableDeviceNotifications, notifyDevice } from '../lib/reminders.js';

export function useCare() {
  const [initial] = useState(() => {
    try { return { state: readCare(localStorage.getItem(STORAGE_KEY)), error: '' }; }
    catch { return { state: emptyCare(), error: '저장된 기록을 읽지 못했습니다. 새 기록은 이 화면에서 사용할 수 있습니다.' }; }
  });
  const [care, setCare] = useState(initial.state), [error, setError] = useState(initial.error);
  const [now, setNow] = useState(Date.now()), [alert, setAlert] = useState(null);
  const [forecast, setForecast] = useState(null), [locationStatus, setLocationStatus] = useState('위치 갱신 사용 안 함');
  const [locationEnabled, setLocationEnabled] = useState(false), [permission, setPermission] = useState(globalThis.Notification?.permission || 'unsupported');
  const [deviceEnabled, setDeviceEnabled] = useState(false);
  const state = useRef(care), live = useRef(true), locationRequest = useRef(0), inFlight = useRef(false);
  const options = useRef({ locationEnabled, deviceEnabled });
  const storageHealthy = useRef(!initial.error);
  options.current = { locationEnabled, deviceEnabled };

  const update = useCallback(transform => {
    let base = state.current;
    try {
      if (!storageHealthy.current) throw new Error('memory-only storage');
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) base = readCare(stored);
    } catch { storageHealthy.current = false; }
    const next = transform(base);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); storageHealthy.current = true; }
    catch { storageHealthy.current = false; setError('기록을 기기에 저장하지 못했습니다. 새로고침하면 이번 변경이 사라질 수 있습니다.'); }
    state.current = next;
    setCare(next);
    return next;
  }, []);

  const refresh = useCallback(async () => {
    const token = ++locationRequest.current;
    setForecast(null);
    setLocationStatus('새 위치 확인 중…');
    try {
      const position = await locate();
      if (token !== locationRequest.current || !live.current) return { message: '위치 갱신 취소', uv: null };
      setLocationStatus('위치 확인 완료 · 자외선 예보 확인 중…');
      try {
        const data = await getForecast(position);
        if (token !== locationRequest.current || !live.current) return { message: '위치 갱신 취소', uv: null };
        const message = `${data.location.name} 인근 지점 · ${data.location.distanceKm}km · 위치 정확도 약 ${Math.round(position.accuracy)}m`;
        if (token === locationRequest.current && live.current) { setForecast(data); setLocationStatus(message); }
        return { message, uv: uvAt(data, Date.now(), Date.now())?.value ?? null };
      } catch (cause) {
        if (token !== locationRequest.current || !live.current) return { message: '위치 갱신 취소', uv: null };
        const message = `위치 확인 완료 · UV 예보 없음: ${cause.message}`;
        if (token === locationRequest.current && live.current) setLocationStatus(message);
        return { message, uv: null };
      }
    } catch (cause) {
      if (token === locationRequest.current && live.current) setLocationStatus(cause.message);
      throw cause;
    }
  }, []);

  useEffect(() => {
    live.current = true;
    // Normalize persisted history on opening the page, including retention pruning.
    update(current => current);
    const tick = () => setNow(Date.now());
    const sync = event => {
      if (event.key !== STORAGE_KEY) return;
      try {
        const next = readCare(event.newValue);
        if (latestRecord(next)?.id !== latestRecord(state.current)?.id || !next.enabled) setAlert(null);
        state.current = next;
        setCare(next);
      }
      catch { setError('다른 탭의 기록을 읽지 못했습니다.'); }
    };
    const timer = setInterval(tick, 10000);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('storage', sync);
    return () => {
      live.current = false;
      locationRequest.current++;
      clearInterval(timer);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('storage', sync);
    };
  }, [update]);

  useEffect(() => {
    if (document.visibilityState !== 'visible' || inFlight.current || !pendingReminder(care, now)) return;
    inFlight.current = true;
    async function send() {
      if (!live.current || document.visibilityState !== 'visible') return;
      // Re-read inside the browser-wide lock so two open tabs cannot claim the same reminder.
      let due = null;
      update(current => {
        due = pendingReminder(current, Date.now());
        return due ? { ...current, delivered: [...current.delivered, due.id].slice(-200) } : current;
      });
      if (!due || !live.current) return;
      const isCurrent = () => live.current && state.current.enabled && state.current.activeDay === dayKey(Date.now()) && latestRecord(state.current)?.id === due.id;
      if (!isCurrent()) return;
      await deliverReminder({
        refresh: options.current.locationEnabled ? refresh : null,
        onAlert: value => { if (isCurrent()) setAlert(value); },
        isCurrent,
        notify: body => options.current.deviceEnabled ? notifyDevice(body, `sunguard-${due.id}`) : undefined,
      });
    }
    const work = navigator.locks ? navigator.locks.request('sunguard-reminder', send) : send();
    work.catch(() => { if (live.current) setError('알림 처리에 실패했습니다. 기록과 권한을 확인해 주세요.'); })
      .finally(() => { inFlight.current = false; });
  }, [care, now, refresh, update]);

  function record(at = Date.now()) {
    setError('');
    try { update(current => recordApplication(current, at)); setAlert(null); setNow(Date.now()); }
    catch (cause) { setError(cause.message); }
  }
  function toggleLocation(value) {
    setLocationEnabled(value);
    if (value) refresh().catch(() => {});
    else { locationRequest.current++; setForecast(null); setLocationStatus('위치 갱신 사용 안 함'); }
  }
  async function enableNotifications() {
    try { const value = await enableDeviceNotifications(); setPermission(value); setDeviceEnabled(true); }
    catch (cause) { setError(cause.message); setPermission(globalThis.Notification?.permission || 'unsupported'); }
  }
  return { care, now, error, clearError: () => setError(''), alert, dismiss: () => setAlert(null), forecast, locationStatus,
    locationEnabled, toggleLocation, refresh: () => refresh().catch(() => {}), permission, deviceEnabled, enableNotifications,
    disableNotifications: () => setDeviceEnabled(false), record,
    remove: id => { update(current => ({ ...current, records: current.records.filter(record => record.id !== id) })); setAlert(null); },
    setEndTime: endTime => {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)) return;
      update(current => ({ ...current, endTime }));
    },
    toggleReminders: () => {
      if (Date.now() > dailyEnd(state.current, Date.now())) { setError('알림 종료 시각을 현재 시각 이후로 설정해 주세요.'); return; }
      update(current => ({ ...current, enabled: !(current.enabled && current.activeDay === dayKey(Date.now())), activeDay: dayKey(Date.now()) }));
      setAlert(null);
    },
  };
}
