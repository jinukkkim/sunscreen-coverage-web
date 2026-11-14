// Product profile model shared by the browser, the recognition server and tests.
// Pure functions only: no DOM, no network, no storage.

export const PRODUCT_FORMS = ['cream', 'lotion', 'gel', 'stick', 'spray', 'unknown'];
export const WATER_RESISTANCE = ['none', '40min', '80min', 'unknown'];
export const PROFILE_SOURCES = ['manual', 'photo-ai'];

export const GENERAL_REAPPLY_MINUTES = 120;

// UV filters we recognise in an INCI list. Synonyms are lowercase; matching is substring-based
// after normalisation so "butyl methoxydibenzoylmethane (avobenzone)" still matches.
export const UV_FILTERS = {
  avobenzone: ['avobenzone', 'butyl methoxydibenzoylmethane', '부틸메톡시디벤조일메탄', '아보벤존'],
  oxybenzone: ['oxybenzone', 'benzophenone-3', '벤조페논-3', '옥시벤존'],
  octinoxate: ['octinoxate', 'ethylhexyl methoxycinnamate', '에칠헥실메톡시신나메이트'],
  octocrylene: ['octocrylene', '옥토크릴렌'],
  homosalate: ['homosalate', '호모살레이트'],
  'zinc oxide': ['zinc oxide', '징크옥사이드'],
  'titanium dioxide': ['titanium dioxide', '티타늄디옥사이드'],
  'bemotrizinol': ['bemotrizinol', 'bis-ethylhexyloxyphenol methoxyphenyl triazine', '비스에칠헥실옥시페놀메톡시페닐트리아진'],
  'bisoctrizole': ['bisoctrizole', 'methylene bis-benzotriazolyl tetramethylbutylphenol', '메틸렌비스벤조트리아졸릴테트라메틸부틸페놀'],
  'ethylhexyl triazone': ['ethylhexyl triazone', '에칠헥실트리아존'],
  'diethylamino hydroxybenzoyl hexyl benzoate': ['diethylamino hydroxybenzoyl hexyl benzoate', '디에칠아미노하이드록시벤조일헥실벤조에이트'],
};

export function emptyProfile() {
  return {
    id: '',
    name: '',
    brand: '',
    sellerName: '',
    spf: null,
    spfPlus: false,
    paGrade: null,
    form: 'unknown',
    waterResistance: 'unknown',
    ingredients: [],
    source: 'manual',
    confidence: {},
    mfds: null,
    registeredAt: '',
  };
}

export function normalizeIngredient(value) {
  return String(value ?? '').toLowerCase().replace(/\s+/g, ' ').replace(/[.;]+$/, '').trim();
}

export function normalizeProfile(input) {
  const base = emptyProfile();
  const p = { ...base, ...(input ?? {}) };
  const spf = Number.isInteger(p.spf) ? p.spf : (p.spf === null ? null : Number.parseInt(p.spf, 10));
  return {
    ...base,
    id: String(p.id ?? ''),
    name: String(p.name ?? '').trim(),
    brand: String(p.brand ?? '').trim(),
    sellerName: String(p.sellerName ?? '').trim(),
    spf: Number.isInteger(spf) ? spf : null,
    spfPlus: Boolean(p.spfPlus),
    paGrade: [1, 2, 3, 4].includes(p.paGrade) ? p.paGrade : null,
    form: PRODUCT_FORMS.includes(p.form) ? p.form : 'unknown',
    waterResistance: WATER_RESISTANCE.includes(p.waterResistance) ? p.waterResistance : 'unknown',
    ingredients: Array.isArray(p.ingredients) ? p.ingredients.map(normalizeIngredient).filter(Boolean) : [],
    source: PROFILE_SOURCES.includes(p.source) ? p.source : 'manual',
    confidence: p.confidence && typeof p.confidence === 'object' ? { ...p.confidence } : {},
    mfds: p.mfds && typeof p.mfds === 'object' ? { ...p.mfds } : null,
    registeredAt: String(p.registeredAt ?? ''),
  };
}

export function validateProfile(profile) {
  const errors = {};
  if (!profile || typeof profile !== 'object') return { ok: false, errors: { profile: '제품 정보가 없습니다.' } };
  const name = String(profile.name ?? '').trim();
  if (name.length < 1 || name.length > 60) errors.name = '제품 이름을 1~60자로 입력해 주세요.';
  if (profile.spf !== null && profile.spf !== undefined
    && (!Number.isInteger(profile.spf) || profile.spf < 15 || profile.spf > 100)) {
    errors.spf = 'SPF는 15~100 사이의 정수이거나 비워 두어야 합니다.';
  }
  if (profile.paGrade !== null && profile.paGrade !== undefined && ![1, 2, 3, 4].includes(profile.paGrade)) {
    errors.paGrade = 'PA 등급은 + 1~4개 중 하나여야 합니다.';
  }
  if (profile.form !== undefined && !PRODUCT_FORMS.includes(profile.form)) errors.form = '지원하지 않는 제형입니다.';
  if (profile.waterResistance !== undefined && !WATER_RESISTANCE.includes(profile.waterResistance)) {
    errors.waterResistance = '지원하지 않는 내수성 값입니다.';
  }
  if (profile.ingredients !== undefined) {
    if (!Array.isArray(profile.ingredients) || profile.ingredients.length > 200
      || profile.ingredients.some(item => typeof item !== 'string')) {
      errors.ingredients = '성분은 문자열 목록(최대 200개)이어야 합니다.';
    }
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

export function findUvFilters(ingredients) {
  const list = (ingredients ?? []).map(normalizeIngredient);
  const found = [];
  for (const [key, synonyms] of Object.entries(UV_FILTERS)) {
    if (list.some(item => synonyms.some(syn => item.includes(syn)))) found.push(key);
  }
  return found;
}

// The solution is derived, never stored. intervalMinutes is a general guideline and does not
// depend on SPF: this app does not compute protection time from label values.
export function deriveSolution(profile) {
  const flags = [];
  if (profile.form === 'spray') flags.push('spray-rub-in');
  if (profile.form === 'stick') flags.push('stick-double-pass');
  if (profile.paGrade === null) flags.push('no-uva-rating');
  if (profile.spf === null) flags.push('no-spf-rating');
  const filters = findUvFilters(profile.ingredients);
  if (filters.includes('avobenzone')) flags.push('contains-avobenzone');
  if (filters.includes('oxybenzone')) flags.push('contains-oxybenzone');
  if (filters.length && filters.every(f => f === 'zinc oxide' || f === 'titanium dioxide')) flags.push('mineral-only');

  const afterWater = { '40min': 'after-40min', '80min': 'after-80min', none: 'reapply-immediately' }[profile.waterResistance] ?? 'unknown';

  return {
    reapply: { intervalMinutes: GENERAL_REAPPLY_MINUTES, basis: 'general-guideline', afterWater },
    amount: { formHint: profile.form },
    uvFilters: filters,
    flags,
    notes: [
      '일반 권고에 따라 약 2시간마다, 땀을 많이 흘리거나 물에 들어간 뒤에는 라벨 지침에 따라 다시 바르세요.',
      '제품 정보는 라벨 표기를 읽은 것이며 실제 차단 성능이나 도포량을 측정한 값이 아닙니다.',
    ],
  };
}

// Activity-environment guidance from the label's SPF and PA. This is a general consumer
// guideline table, not a measurement: the weaker of the two ratings decides the level.
export const ACTIVITY_LEVELS = [
  { level: 0, key: 'indoor', label: '실내 생활 · 간단한 외출', spf: 'SPF 15 ~ 30', pa: 'PA+ ~ PA++', note: '피부 부담이 적고 세안이 용이함' },
  { level: 1, key: 'daily', label: '일상적인 야외 활동 · 산책', spf: 'SPF 30 ~ 50', pa: 'PA+++', note: '출퇴근, 가벼운 야외 활동에 적합' },
  { level: 2, key: 'outdoor', label: '장시간 야외 · 등산 · 해변', spf: 'SPF 50+', pa: 'PA++++', note: '강한 직사광선 노출 시 필수' },
];

export function spfLevel(spf, spfPlus) {
  if (!Number.isInteger(spf)) return null;
  if (spf >= 50 && spfPlus) return 2;
  if (spf >= 30) return 1;
  if (spf >= 15) return 0;
  return null;
}

export function paLevel(paGrade) {
  if (paGrade === 4) return 2;
  if (paGrade === 3) return 1;
  if (paGrade === 1 || paGrade === 2) return 0;
  return null;
}

export function activityGuidance(profile) {
  const s = spfLevel(profile.spf, profile.spfPlus);
  const p = paLevel(profile.paGrade);
  if (s === null && p === null) return { level: null, entry: null, basis: 'none', sentence: 'SPF와 PA 표기를 확인하면 활동 환경별 권장 기준과 비교해 드립니다.' };
  const level = s === null ? p : p === null ? s : Math.min(s, p);
  const entry = ACTIVITY_LEVELS[level];
  const basis = s === null ? 'pa-only' : p === null ? 'spf-only' : 'both';
  const rating = [
    profile.spf !== null ? `SPF ${profile.spf}${profile.spfPlus ? '+' : ''}` : null,
    profile.paGrade !== null ? `PA${'+'.repeat(profile.paGrade)}` : null,
  ].filter(Boolean).join(' · ');
  const sentence = `${rating} 기준으로 '${entry.label}' 활동 환경에 맞는 선크림을 사용하고 계십니다.`;
  const caveat = basis === 'both' ? '' : basis === 'spf-only' ? ' PA 표기가 없어 SPF만으로 판단했습니다.' : ' SPF 표기가 없어 PA만으로 판단했습니다.';
  return { level, entry, basis, sentence: sentence + caveat };
}
