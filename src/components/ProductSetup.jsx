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
import { checkImageFile, downscaleImage } from '../lib/image.js';
import { candidateTitle, candidatesFromRecognition, createVisionAdapter, draftFromRecognition, needsReview, recognizeLabel } from '../lib/labelRecognition.js';
import ProductSolution, { FORM_LABEL } from './ProductSolution.jsx';

const WATER_LABEL = { none: '없음(표기 없음)', '40min': '40분', '80min': '80분', unknown: '모름' };
const inputStyle = { font: 'inherit', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-background-surface)', border: 'thin solid var(--color-border)', padding: 'var(--spacing-2)', borderRadius: 'var(--radius-container)', maxWidth: '100%', width: '100%' };
const optionStyle = selected => ({ display: 'block', cursor: 'pointer', padding: 'var(--spacing-3)', borderRadius: 'var(--radius-container)', border: selected ? 'medium solid var(--color-text-primary)' : 'thin solid var(--color-border)', backgroundColor: 'var(--color-background-surface)' });
const adapter = createVisionAdapter();

// Photos are taken with the OS camera through a file input, not a getUserMedia stream, so this
// component never competes with the face camera in Camera.jsx for the device.
export default function ProductSetup({ storage = window.localStorage }) {
  const [saved, setSaved] = useState(() => loadProfile(storage));
  const [mode, setMode] = useState('idle'); // idle | recognizing | choose | draft
  const [draft, setDraft] = useState(emptyProfile);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [consent, setConsent] = useState(false);
  const [notVisible, setNotVisible] = useState([]);
  const [result, setResult] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [picked, setPicked] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const front = useRef(null);
  const back = useRef(null);
  const abort = useRef(null);

  useEffect(() => () => abort.current?.abort(), []);

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
    setResult(null);
    setCandidates([]);
    setPicked(0);
  }

  function startManual() {
    reset();
    setMode('draft');
  }

  async function analyze() {
    setError('');
    const files = [front.current?.files?.[0], back.current?.files?.[0]].filter(Boolean);
    if (!files.length) return setError('앞면 또는 뒷면 사진을 한 장 이상 선택해 주세요.');
    for (const file of files) {
      const problem = checkImageFile(file);
      if (problem) return setError(problem);
    }
    if (!consent) return setError('사진 전송에 동의해야 분석할 수 있습니다. 동의하지 않으면 직접 입력을 이용해 주세요.');
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setMode('recognizing');
    try {
      const images = await Promise.all(files.map(file => downscaleImage(file)));
      if (controller.signal.aborted) return;
      const recognized = await recognizeLabel(images.map(({ mimeType, data }) => ({ mimeType, data })), { adapter, signal: controller.signal });
      if (controller.signal.aborted) return;
      setResult(recognized);
      setNotVisible(recognized.notVisible ?? []);
      setCandidates(candidatesFromRecognition(recognized));
      setPicked(0);
      setMode('choose');
    } catch (cause) {
      if (controller.signal.aborted && cause.code === 'cancelled') return;
      setMode('idle');
      setError(`${cause.message ?? '분석에 실패했습니다.'} 직접 입력으로 등록할 수 있습니다.`);
    }
  }

  function cancel() {
    abort.current?.abort();
    setMode('idle');
  }

  // Identity fields the solution needs. When the photo gave all of them, register at once;
  // the form is only for filling gaps. Everything stays editable afterwards via "정보 수정".
  function isComplete(d) {
    return Boolean(d.name) && d.spf !== null && d.paGrade !== null && d.form !== 'unknown';
  }

  function chooseCandidate() {
    if (!result) return;
    const next = draftFromRecognition(result, picked);
    setErrors({});
    if (isComplete(next)) {
      try {
        setSaved(saveProfile(storage, { ...next, id: crypto.randomUUID(), registeredAt: new Date().toISOString() }));
        reset();
        return;
      } catch (cause) {
        setError(cause.message);
      }
    }
    setDraft(next);
    setMode('draft');
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
      setSaved(saveProfile(storage, profile));
      reset();
    } catch (cause) {
      setError(cause.message);
    }
  }

  function removeSaved() {
    clearProfile(storage);
    setSaved(null);
    reset();
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
            <Text>제품 앞면(SPF·PA)과 뒷면(전성분·책임판매업자)을 찍으면 라벨을 읽어 등록합니다. 읽지 못한 항목만 직접 채웁니다.</Text>
            <Grid columns={{ minWidth: 220, max: 2 }} gap={3}>
              {field('product-front', '앞면 사진', <input id="product-front" ref={front} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={mode === 'recognizing'} style={inputStyle} />)}
              {field('product-back', '뒷면 사진 (선택)', <input id="product-back" ref={back} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={mode === 'recognizing'} style={inputStyle} />)}
            </Grid>
            <CheckboxInput label="제품 사진을 외부 AI 모델(Google Gemini)로 전송하는 데 동의합니다" description="사진은 분석 서버를 거쳐 모델로 전달되며 저장되지 않습니다. 얼굴 카메라 영상은 전송되지 않습니다." value={consent} onChange={() => setConsent(c => !c)} isDisabled={mode === 'recognizing'} />
            {mode === 'recognizing' && <Text role="status">라벨을 읽고 있습니다. ({elapsed}초 경과 · 보통 10~30초, 최대 100초)</Text>}
            {error && <Text as="p" role="alert">{error}</Text>}
            <HStack wrap="wrap" gap={2}>
              <Button variant="primary" label="사진으로 읽기" onClick={analyze} isDisabled={mode === 'recognizing'} />
              {mode === 'recognizing'
                ? <Button label="취소" onClick={cancel} />
                : <Button label="직접 입력" onClick={startManual} />}
            </HStack>
          </VStack>
        )}

        {mode === 'choose' && (
          <VStack gap={3}>
            <Text type="label">사진에서 읽은 후보 {candidates.length}개</Text>
            <Text>내 제품과 맞는 항목을 고르세요.</Text>
            <VStack gap={2} role="radiogroup" aria-label="제품 후보">
              {candidates.map(c => (
                <label key={c.index} style={optionStyle(picked === c.index)}>
                  <HStack gap={2} vAlign="start">
                    <input type="radio" name="candidate" value={c.index} checked={picked === c.index} onChange={() => setPicked(c.index)} style={{ marginTop: 'var(--spacing-1)' }} />
                    <VStack gap={0}>
                      <Text weight="bold">{candidateTitle(c)}</Text>
                      <Text type="supporting">
                        {c.spf === null ? 'SPF 미확인' : `SPF ${c.spf}${c.spfPlus ? '+' : ''}`}
                        {' · '}{c.paGrade === null ? 'PA 미확인' : `PA${'+'.repeat(c.paGrade)}`}
                        {' · '}{FORM_LABEL[c.form] ?? c.form}
                        {c.waterResistance !== 'unknown' ? ` · 내수성 ${WATER_LABEL[c.waterResistance]}` : ''}
                        {c.sellerName ? ` · ${c.sellerName}` : ''}
                      </Text>
                      {(c.label || c.score !== null) && (
                        <Text type="supporting">{[c.label, c.score !== null ? `가능성 ${Math.round(c.score * 100)}%` : ''].filter(Boolean).join(' · ')}</Text>
                      )}
                    </VStack>
                  </HStack>
                </label>
              ))}
            </VStack>
            {notVisible.length > 0 && <Text type="supporting">사진에서 읽지 못한 항목: {notVisible.length}개 — 비어 있으면 다음 화면에서 채웁니다.</Text>}
            {error && <Text as="p" role="alert">{error}</Text>}
            <HStack wrap="wrap" gap={2}>
              <Button variant="primary" label="이 제품으로 계속" onClick={chooseCandidate} />
              <Button label="목록에 없음 · 직접 입력" onClick={startManual} />
              <Button variant="ghost" label="취소" onClick={reset} />
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
