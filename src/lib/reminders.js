export async function deliverReminder({ refresh, notify, onAlert, isCurrent = () => true, intervalMinutes = 120, uv = null }) {
  let detail = `${uv === null ? '기본' : `UV ${uv} 기준`} ${intervalMinutes}분 알림 시각입니다. 야외활동 중이라면 다시 발라 주세요.`;
  onAlert({ detail, location: refresh ? '현재 위치 확인 중…' : '위치 갱신 사용 안 함' });
  let location = '위치 갱신 사용 안 함';
  if (refresh) {
    try {
      const result = await refresh();
      location = result.message;
      if (result.uv !== null) detail += ` 현재 구간 UV 예보 ${result.uv}.`;
    } catch { location = '위치·예보 갱신 실패 · 도포 기록 기준으로 알림을 보냈습니다.'; }
  }
  if (!isCurrent()) return;
  onAlert({ detail, location });
  try { await notify(`${detail} ${location}`); }
  catch { onAlert({ detail, location, notificationError: '기기 알림을 표시하지 못했습니다. 화면 알림을 확인해 주세요.' }); }
}

export async function enableDeviceNotifications() {
  if (!globalThis.Notification || !globalThis.isSecureContext) throw new Error('이 환경에서는 기기 알림을 지원하지 않습니다. 화면 알림은 사용할 수 있습니다.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('알림 권한이 허용되지 않았습니다. 화면 알림은 계속 사용할 수 있습니다.');
  if ('serviceWorker' in navigator) await navigator.serviceWorker.register('/notifications-sw.js');
  return permission;
}

export async function notifyDevice(body, tag) {
  if (!globalThis.Notification || Notification.permission !== 'granted') return;
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration('/');
    if (registration?.active) return registration.showNotification('SUNFIT 재도포 알림', { body, tag });
  }
  // Desktop fallback. Mobile constructor failures are reported to the in-page alert.
  new Notification('SUNFIT 재도포 알림', { body, tag });
}
