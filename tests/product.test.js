import test from 'node:test';
import assert from 'node:assert/strict';
import { activityGuidance, deriveSolution, emptyProfile, findUvFilters, normalizeProfile, validateProfile } from '../src/lib/product.js';
import { STORAGE_KEY, clearProfile, loadProfile, saveProfile } from '../src/lib/productStorage.js';

function profile(overrides = {}) {
  return { ...emptyProfile(), id: 'p1', name: '테스트 선크림', registeredAt: '2026-11-14T00:00:00Z', ...overrides };
}

function fakeStorage() {
  const map = new Map();
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key),
  };
}

test('normalizeProfile fills defaults and coerces unsafe values', () => {
  const p = normalizeProfile({ name: '  A  ', spf: '50', paGrade: 9, form: 'foam', ingredients: [' Zinc Oxide ', ''] });
  assert.equal(p.name, 'A');
  assert.equal(p.spf, 50);
  assert.equal(p.paGrade, null);
  assert.equal(p.form, 'unknown');
  assert.deepEqual(p.ingredients, ['zinc oxide']);
  assert.equal(p.source, 'manual');
});

test('validateProfile returns Korean errors per field', () => {
  const result = validateProfile(profile({ name: '', spf: 500, paGrade: 5, form: 'foam', waterResistance: '10min', ingredients: 'x' }));
  assert.equal(result.ok, false);
  assert.deepEqual(Object.keys(result.errors).sort(), ['form', 'ingredients', 'name', 'paGrade', 'spf', 'waterResistance']);
  assert.match(result.errors.name, /제품 이름/);
});

test('validateProfile accepts empty optional fields', () => {
  assert.equal(validateProfile(profile()).ok, true);
  assert.equal(validateProfile(profile({ spf: 50, paGrade: 4, form: 'spray', waterResistance: '80min' })).ok, true);
});

test('findUvFilters matches INCI names and Korean synonyms', () => {
  const found = findUvFilters(['Water', 'Butyl Methoxydibenzoylmethane', '징크옥사이드']);
  assert.deepEqual(found.sort(), ['avobenzone', 'zinc oxide']);
});

test('deriveSolution keeps the general interval regardless of SPF', () => {
  assert.equal(deriveSolution(profile({ spf: 15 })).reapply.intervalMinutes, 120);
  assert.equal(deriveSolution(profile({ spf: 50, spfPlus: true })).reapply.intervalMinutes, 120);
  assert.equal(deriveSolution(profile()).reapply.basis, 'general-guideline');
});

test('deriveSolution maps water resistance to afterWater', () => {
  assert.equal(deriveSolution(profile({ waterResistance: '40min' })).reapply.afterWater, 'after-40min');
  assert.equal(deriveSolution(profile({ waterResistance: '80min' })).reapply.afterWater, 'after-80min');
  assert.equal(deriveSolution(profile({ waterResistance: 'none' })).reapply.afterWater, 'reapply-immediately');
  assert.equal(deriveSolution(profile({ waterResistance: 'unknown' })).reapply.afterWater, 'unknown');
});

test('deriveSolution raises flags without changing other values', () => {
  const base = deriveSolution(profile({ spf: 50, paGrade: 4 }));
  assert.deepEqual(base.flags, []);
  const spray = deriveSolution(profile({ spf: 50, paGrade: 4, form: 'spray' }));
  assert.deepEqual(spray.flags, ['spray-rub-in']);
  const avo = deriveSolution(profile({ spf: 50, paGrade: 4, ingredients: ['avobenzone'] }));
  assert.deepEqual(avo.flags, ['contains-avobenzone']);
  assert.deepEqual(avo.reapply, base.reapply);
  const missing = deriveSolution(profile());
  assert.deepEqual(missing.flags, ['no-uva-rating', 'no-spf-rating']);
  const mineral = deriveSolution(profile({ spf: 50, paGrade: 4, ingredients: ['zinc oxide', 'titanium dioxide'] }));
  assert.deepEqual(mineral.flags, ['mineral-only']);
});

test('storage round-trips a profile and drops corrupt data', () => {
  const storage = fakeStorage();
  assert.equal(loadProfile(storage), null);
  const saved = saveProfile(storage, profile({ spf: 50, ingredients: ['Zinc Oxide'] }));
  assert.deepEqual(loadProfile(storage), saved);
  storage.setItem(STORAGE_KEY, '{not json');
  assert.equal(loadProfile(storage), null);
  storage.setItem(STORAGE_KEY, JSON.stringify({ name: '' }));
  assert.equal(loadProfile(storage), null);
  saveProfile(storage, profile());
  clearProfile(storage);
  assert.equal(loadProfile(storage), null);
});

test('saveProfile rejects an invalid profile', () => {
  assert.throws(() => saveProfile(fakeStorage(), profile({ name: '' })), /제품 이름/);
});

test('activityGuidance picks the environment from the weaker of SPF and PA', () => {
  assert.equal(activityGuidance(profile({ spf: 50, spfPlus: true, paGrade: 4 })).entry.key, 'outdoor');
  assert.equal(activityGuidance(profile({ spf: 50, spfPlus: true, paGrade: 3 })).entry.key, 'daily', 'PA+++ caps it at daily');
  assert.equal(activityGuidance(profile({ spf: 50, spfPlus: false, paGrade: 4 })).entry.key, 'daily', 'SPF 50 without + is the 30~50 band');
  assert.equal(activityGuidance(profile({ spf: 30, paGrade: 2 })).entry.key, 'indoor');
  assert.equal(activityGuidance(profile({ spf: 15, paGrade: 1 })).entry.key, 'indoor');
});

test('activityGuidance explains partial and missing ratings', () => {
  const spfOnly = activityGuidance(profile({ spf: 50, spfPlus: true }));
  assert.equal(spfOnly.basis, 'spf-only');
  assert.match(spfOnly.sentence, /장시간 야외/);
  assert.match(spfOnly.sentence, /PA 표기가 없어/);
  const paOnly = activityGuidance(profile({ paGrade: 3 }));
  assert.equal(paOnly.entry.key, 'daily');
  assert.match(paOnly.sentence, /SPF 표기가 없어/);
  const none = activityGuidance(profile());
  assert.equal(none.level, null);
  assert.match(none.sentence, /확인하면/);
});

test('activityGuidance sentence names the rating and the environment', () => {
  assert.equal(activityGuidance(profile({ spf: 50, spfPlus: true, paGrade: 4 })).sentence,
    "SPF 50+ · PA++++ 기준으로 '장시간 야외 · 등산 · 해변'에 맞는 선크림을 사용하고 계십니다.");
});
