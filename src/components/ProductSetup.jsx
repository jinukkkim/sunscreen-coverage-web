import React, { useEffect, useRef, useState } from 'react';
import { PRODUCT_FORMS, WATER_RESISTANCE, emptyProfile, validateProfile } from '../lib/product.js';
import { clearProfile, loadProfile, saveProfile } from '../lib/productStorage.js';
import { checkImageFile, downscaleImage } from '../lib/image.js';
import { candidateTitle, candidatesFromRecognition, createVisionAdapter, draftFromRecognition, needsReview, recognizeLabel } from '../lib/labelRecognition.js';
import ProductSolution from './ProductSolution.jsx';

const FORM_LABEL = { cream: '크림', lotion: '로션', gel: '젤', stick: '스틱', spray: '스프레이', unknown: '모름' };
const WATER_LABEL = { none: '없음(표기 없음)', '40min': '40분', '80min': '80분', unknown: '모름' };
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
    const result = validateProfile(profile);
    if (!result.ok) return setErrors(result.errors);
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

  return (
    <section className="card" aria-labelledby="product-title">
      <h2 id="product-title">내 선크림 등록</h2>
      {(mode === 'idle' || mode === 'recognizing') && (
        <>
          <p>제품 앞면(SPF·PA)과 뒷면(전성분·책임판매업자)을 찍으면 라벨을 읽어 초안을 만듭니다. 결과는 저장 전에 직접 확인·수정합니다.</p>
          <div className="field-grid">
            <label>앞면 사진<input ref={front} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={mode === 'recognizing'} /></label>
            <label>뒷면 사진 (선택)<input ref={back} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={mode === 'recognizing'} /></label>
          </div>
          <label className="consent">
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} disabled={mode === 'recognizing'} />
            제품 사진을 분석 서버를 거쳐 외부 AI 모델(Google Gemini)로 전송하는 데 동의합니다. 사진은 저장되지 않으며 얼굴 카메라 영상은 전송되지 않습니다.
          </label>
          <p role="status">{mode === 'recognizing' ? `라벨을 읽고 있습니다. (${elapsed}초 경과 · 보통 10~30초, 최대 100초)` : ''}</p>
          {error && <p role="alert">{error}</p>}
          <div className="actions">
            <button onClick={analyze} disabled={mode === 'recognizing'}>사진으로 읽기</button>
            {mode === 'recognizing'
              ? <button className="secondary" onClick={cancel}>취소</button>
              : <button className="secondary" onClick={startManual}>직접 입력</button>}
          </div>
        </>
      )}
      {mode === 'choose' && (
        <div>
          <p className="badge">사진에서 읽은 후보 {candidates.length}개</p>
          <p>내 제품과 맞는 항목을 고르세요. 다음 화면에서 값을 수정할 수 있습니다.</p>
          <div className="candidates" role="radiogroup" aria-label="제품 후보">
            {candidates.map(c => (
              <label key={c.index} className={`candidate${picked === c.index ? ' selected' : ''}`}>
                <input type="radio" name="candidate" value={c.index} checked={picked === c.index} onChange={() => setPicked(c.index)} />
                <span className="candidate-body">
                  <strong>{candidateTitle(c)}</strong>
                  <span className="muted">
                    {c.spf === null ? 'SPF 미확인' : `SPF ${c.spf}${c.spfPlus ? '+' : ''}`}
                    {' · '}{c.paGrade === null ? 'PA 미확인' : `PA${'+'.repeat(c.paGrade)}`}
                    {' · '}{FORM_LABEL[c.form] ?? c.form}
                    {c.waterResistance !== 'unknown' ? ` · 내수성 ${WATER_LABEL[c.waterResistance]}` : ''}
                    {c.sellerName ? ` · ${c.sellerName}` : ''}
                  </span>
                  {(c.label || c.score !== null) && (
                    <span className="muted">{[c.label, c.score !== null ? `가능성 ${Math.round(c.score * 100)}%` : ''].filter(Boolean).join(' · ')}</span>
                  )}
                </span>
              </label>
            ))}
          </div>
          {notVisible.length > 0 && <p className="muted">사진에서 읽지 못한 항목: {notVisible.length}개 — 다음 화면에서 채워 주세요.</p>}
          <div className="actions">
            <button type="button" onClick={chooseCandidate}>이 제품으로 계속</button>
            <button type="button" className="secondary" onClick={startManual}>목록에 없음 · 직접 입력</button>
            <button type="button" className="secondary" onClick={reset}>취소</button>
          </div>
        </div>
      )}
      {mode === 'draft' && (
        <form onSubmit={save} noValidate>
          {draft.source === 'photo-ai' && !saved && (
            <p className="badge">사진에서 읽지 못한 항목이 있어 확인이 필요합니다.{notVisible.length ? ` (${notVisible.length}개)` : ''}</p>
          )}
          {saved && <p className="badge">등록된 정보를 수정합니다.</p>}
          <div className="field-grid">
            <label>제품 이름{review('productName')}
              <input value={draft.name} onChange={e => update('name', e.target.value)} maxLength={60} required />
              {errors.name && <span role="alert">{errors.name}</span>}
            </label>
            <label>책임판매업자{review('sellerName')}
              <input value={draft.sellerName} onChange={e => update('sellerName', e.target.value)} />
            </label>
            <label>SPF{review('spf')}
              <input type="number" min={15} max={100} value={draft.spf ?? ''} onChange={e => update('spf', e.target.value === '' ? null : Number(e.target.value))} />
              {errors.spf && <span role="alert">{errors.spf}</span>}
            </label>
            <label><input type="checkbox" checked={draft.spfPlus} onChange={e => update('spfPlus', e.target.checked)} /> SPF 50+ 표기</label>
            <label>PA{review('paGrade')}
              <select value={draft.paGrade ?? ''} onChange={e => update('paGrade', e.target.value === '' ? null : Number(e.target.value))}>
                <option value="">모름</option>
                {[1, 2, 3, 4].map(n => <option key={n} value={n}>{`PA${'+'.repeat(n)}`}</option>)}
              </select>
            </label>
            <label>제형{review('form')}
              <select value={draft.form} onChange={e => update('form', e.target.value)}>
                {PRODUCT_FORMS.map(f => <option key={f} value={f}>{FORM_LABEL[f]}</option>)}
              </select>
            </label>
            <label>내수성{review('waterResistance')}
              <select value={draft.waterResistance} onChange={e => update('waterResistance', e.target.value)}>
                {WATER_RESISTANCE.map(w => <option key={w} value={w}>{WATER_LABEL[w]}</option>)}
              </select>
            </label>
          </div>
          <label>전성분 (쉼표로 구분){review('ingredients')}
            <textarea rows={4} value={draft.ingredients.join(', ')} onChange={e => update('ingredients', e.target.value.split(/[,\n]/).map(s => s.trim()).filter(Boolean))} />
            {errors.ingredients && <span role="alert">{errors.ingredients}</span>}
          </label>
          {error && <p role="alert">{error}</p>}
          <div className="actions">
            <button type="submit">이 정보로 저장</button>
            <button type="button" className="secondary" onClick={reset}>취소</button>
          </div>
        </form>
      )}
      <p className="muted">제품 정보는 이 브라우저에만 저장됩니다. 라벨 표기를 읽은 것이며 차단 성능을 측정한 값이 아닙니다.</p>
    </section>
  );
}
