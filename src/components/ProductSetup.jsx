import React, { useEffect, useRef, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Section } from '@astryxdesign/core/Section';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { PRODUCT_FORMS, WATER_RESISTANCE, emptyProfile, validateProfile } from '../lib/product.js';
import { clearProfile, loadProfile, saveProfile } from '../lib/productStorage.js';
import { createVisionAdapter, draftFromRecognition, needsReview, recognizeLabel } from '../lib/labelRecognition.js';
import ProductSolution, { FORM_LABEL } from './ProductSolution.jsx';

const WATER_LABEL = { none: '없음(표기 없음)', '40min': '40분', '80min': '80분', unknown: '모름' };
const inputStyle = { font: 'inherit', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-background-surface)', border: 'thin solid var(--color-border)', padding: 'var(--spacing-2)', borderRadius: 'var(--radius-container)', maxWidth: '100%', width: '100%' };
const adapter = createVisionAdapter();

export default function ProductSetup({ storage = window.localStorage, onProfileChange, capturePhoto, cameraActive, photoFrozen, onRetake }) {
  const [saved, setSaved] = useState(() => loadProfile(storage));
  const [mode, setMode] = useState('idle'); // idle | recognizing | draft
  const [draft, setDraft] = useState(emptyProfile);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [consent, setConsent] = useState(false);
  const [notVisible, setNotVisible] = useState([]);
  const [elapsed, setElapsed] = useState(0);
  const abort = useRef(null);

  useEffect(() => {
    const hide = () => { if (document.hidden) { abort.current?.abort(); setMode(current => current === 'recognizing' ? 'idle' : current); } };
    document.addEventListener('visibilitychange', hide);
    return () => { abort.current?.abort(); document.removeEventListener('visibilitychange', hide); };
  }, []);
  useEffect(() => {
    if (!cameraActive) { abort.current?.abort(); setMode(current => current === 'recognizing' ? 'idle' : current); }
  }, [cameraActive]);
  useEffect(() => { onProfileChange?.(mode === 'idle' ? saved : null); }, [saved, mode, onProfileChange]);

  useEffect(() => {
    if (mode !== 'recognizing') return undefined;
    setElapsed(0);
    const timer = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, [mode]);

  function reset() {
    abort.current?.abort();
    setMode('idle');
    setDraft(emptyProfile());
    setErrors({});
    setError('');
    setNotVisible([]);
  }

  function startManual() {
    reset();
    setMode('draft');
  }

  async function analyze() {
    setError('');
    if (!consent) return setError('사진 전송에 동의해야 분석할 수 있습니다. 동의하지 않으면 직접 입력을 이용해 주세요.');
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setMode('recognizing');
    try {
      const frame = capturePhoto();
      let data;
      try { data = frame.toDataURL('image/jpeg', .85).split(',')[1]; }
      finally { frame.width = 1; frame.height = 1; }
      const images = [{ mimeType: 'image/jpeg', data }];
      if (controller.signal.aborted) return;
      const recognized = await recognizeLabel(images, { adapter, signal: controller.signal });
      if (controller.signal.aborted) return;
      setNotVisible(recognized.notVisible ?? []);
      const next = draftFromRecognition(recognized, 0);
      if (isComplete(next)) {
        register(next);
      } else {
        setDraft(next); setMode('draft');
      }
    } catch (cause) {
      if (controller.signal.aborted) return;
      setMode('idle');
      setError(`${cause.message ?? '분석에 실패했습니다.'} 직접 입력으로 등록할 수 있습니다.`);
    }
  }

  function cancel() {
    abort.current?.abort();
    setMode('idle');
    onRetake?.();
  }

  // Identity fields the solution needs. When the photo gave all of them, register at once;
  // the form is only for filling gaps. Everything stays editable afterwards via "정보 수정".
  function isComplete(d) {
    return Boolean(d.name) && d.spf !== null && d.paGrade !== null && d.form !== 'unknown';
  }

  function register(profile) {
    const stored = saveProfile(storage, { ...profile, id: profile.id || crypto.randomUUID(), registeredAt: new Date().toISOString() });
    setSaved(stored); reset();
  }

  function editSaved() {
    if (!saved) return;
    setDraft({ ...saved });
    setErrors({});
    setError('');
    setMode('draft');
  }

  function update(field, value) {
    setDraft(d => ({ ...d, [field]: value }));
    setErrors(e => ({ ...e, [field]: undefined }));
  }

  function save(event) {
    event.preventDefault();
    const profile = { ...draft, id: draft.id || crypto.randomUUID(), registeredAt: new Date().toISOString() };
    const check = validateProfile(profile);
    if (!check.ok) return setErrors(check.errors);
    try {
      register(profile);
    } catch (cause) {
      setError(cause.message);
    }
  }

  function removeSaved() {
    clearProfile(storage);
    setSaved(null);
    reset();
    onRetake?.();
  }

  if (saved && mode === 'idle') return <ProductSolution profile={saved} onReset={removeSaved} onEdit={editSaved} />;

  const review = field => (draft.source === 'photo-ai' && needsReview(draft, field) ? ' · 확인 필요' : '');
  const field = (id, label, control, fieldError) => (
    <VStack gap={1}>
      <label htmlFor={id}><Text type="label">{label}</Text></label>
      {control}
      {fieldError && <Text as="p" role="alert">{fieldError}</Text>}
    </VStack>
  );

  return (
    <Section padding={4}>
      <VStack gap={4}>
        <Heading level={3}>내 선크림 등록</Heading>

        {(mode === 'idle' || mode === 'recognizing') && (
          <VStack gap={4}>
            <Text>선크림의 제품명·SPF·PA가 가이드 안에 선명하게 보이도록 들고 촬영하세요. 인식된 정보를 확인한 뒤 다음 단계로 진행하세요. 읽지 못한 항목은 직접 확인할 수 있습니다.</Text>
            <CheckboxInput label="제품 사진을 외부 AI 모델(Google Gemini)로 전송하는 데 동의합니다" description="제품 가이드 안의 촬영 영역을 분석 서버와 Gemini로 보내며 저장하지 않습니다. 그 안의 얼굴·배경도 포함될 수 있으니 제품만 담아 주세요. 얼굴 측정·스캔 단계는 전송하지 않습니다." value={consent} onChange={() => setConsent(c => !c)} isDisabled={mode === 'recognizing'} />
            {mode === 'recognizing' && <Text role="status">라벨을 읽고 있습니다. ({elapsed}초 경과 · 보통 10~30초, 최대 100초)</Text>}
            {error && <Text as="p" role="alert">{error}</Text>}
            <HStack wrap="wrap" gap={2}>
              <Button variant="primary" label={photoFrozen ? '사진 다시 인식' : '선크림 촬영하고 인식'} onClick={analyze} isDisabled={mode === 'recognizing' || !cameraActive} />
              {photoFrozen && mode === 'idle' && <Button label="다시 촬영" onClick={onRetake} />}
              {mode === 'recognizing'
                ? <Button label="취소" onClick={cancel} />
                : <Button label="직접 입력" onClick={startManual} />}
            </HStack>
          </VStack>
        )}

        {mode === 'draft' && (
          <form onSubmit={save} noValidate>
            <VStack gap={4}>
              {draft.source === 'photo-ai' && !saved && (
                <Text type="label">사진에서 읽지 못한 항목이 있어 확인이 필요합니다.{notVisible.length ? ` (${notVisible.length}개)` : ''}</Text>
              )}
              {saved && <Text type="label">등록된 정보를 수정합니다.</Text>}
              <Grid columns={{ minWidth: 220, max: 2 }} gap={3}>
                {field('product-name', `제품 이름${review('productName')}`, <input id="product-name" value={draft.name} onChange={e => update('name', e.target.value)} maxLength={60} required style={inputStyle} />, errors.name)}
                {field('product-seller', `책임판매업자${review('sellerName')}`, <input id="product-seller" value={draft.sellerName} onChange={e => update('sellerName', e.target.value)} style={inputStyle} />)}
                {field('product-spf', `SPF${review('spf')}`, <input id="product-spf" type="number" min={15} max={100} value={draft.spf ?? ''} onChange={e => update('spf', e.target.value === '' ? null : Number(e.target.value))} style={inputStyle} />, errors.spf)}
                <CheckboxInput label="SPF 50+ 표기" value={draft.spfPlus} onChange={() => update('spfPlus', !draft.spfPlus)} />
                {field('product-pa', `PA${review('paGrade')}`, (
                  <select id="product-pa" value={draft.paGrade ?? ''} onChange={e => update('paGrade', e.target.value === '' ? null : Number(e.target.value))} style={inputStyle}>
                    <option value="">모름</option>
                    {[1, 2, 3, 4].map(n => <option key={n} value={n}>{`PA${'+'.repeat(n)}`}</option>)}
                  </select>
                ), errors.paGrade)}
                {field('product-form', `제형${review('form')}`, (
                  <select id="product-form" value={draft.form} onChange={e => update('form', e.target.value)} style={inputStyle}>
                    {PRODUCT_FORMS.map(f => <option key={f} value={f}>{f === 'unknown' ? '모름' : FORM_LABEL[f]}</option>)}
                  </select>
                ))}
                {field('product-water', `내수성${review('waterResistance')}`, (
                  <select id="product-water" value={draft.waterResistance} onChange={e => update('waterResistance', e.target.value)} style={inputStyle}>
                    {WATER_RESISTANCE.map(w => <option key={w} value={w}>{WATER_LABEL[w]}</option>)}
                  </select>
                ))}
              </Grid>
              {field('product-ingredients', `전성분 (쉼표로 구분)${review('ingredients')}`, <textarea id="product-ingredients" rows={4} value={draft.ingredients.join(', ')} onChange={e => update('ingredients', e.target.value.split(/[,\n]/).map(s => s.trim()).filter(Boolean))} style={inputStyle} />, errors.ingredients)}
              {error && <Text as="p" role="alert">{error}</Text>}
              <HStack wrap="wrap" gap={2}>
                <Button variant="primary" label="이 정보로 저장" onClick={save} />
                <Button variant="ghost" label="취소" onClick={reset} />
              </HStack>
            </VStack>
          </form>
        )}

        <Text type="supporting">제품 정보는 이 브라우저에만 저장됩니다. 라벨 표기를 읽은 것이며 차단 성능을 측정한 값이 아닙니다.</Text>
      </VStack>
    </Section>
  );
}
