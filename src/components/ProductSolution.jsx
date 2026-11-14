import React from 'react';
import { deriveSolution } from '../lib/product.js';

const FORM_LABEL = { cream: '크림', lotion: '로션', gel: '젤', stick: '스틱', spray: '스프레이', unknown: '미확인' };
const WATER_LABEL = { none: '내수성 표기 없음', '40min': '내수성 40분', '80min': '내수성 80분', unknown: '내수성 미확인' };
const FLAG_TEXT = {
  'spray-rub-in': '스프레이 제형은 뿌린 뒤 손으로 고르게 펴 바르세요.',
  'stick-double-pass': '스틱 제형은 같은 부위를 두 번 이상 지나가며 바르세요.',
  'no-uva-rating': 'PA(UVA 차단) 표기를 확인하지 못했습니다. 라벨을 다시 확인해 주세요.',
  'no-spf-rating': 'SPF 표기를 확인하지 못했습니다.',
  'contains-avobenzone': '아보벤존(부틸메톡시디벤조일메탄)이 포함돼 있습니다. 민감하다면 패치 테스트를 권장합니다.',
  'contains-oxybenzone': '옥시벤존(벤조페논-3)이 포함돼 있습니다. 민감하다면 패치 테스트를 권장합니다.',
  'mineral-only': '무기(미네랄) 자외선 차단 성분만 확인됐습니다. 백탁이 있을 수 있어 고르게 펴 바르는 것이 중요합니다.',
};
const AFTER_WATER = {
  'after-40min': '물놀이·땀 흘린 뒤에는 라벨 기준 40분 이후 다시 바르세요.',
  'after-80min': '물놀이·땀 흘린 뒤에는 라벨 기준 80분 이후 다시 바르세요.',
  'reapply-immediately': '내수성 표기가 없으므로 물에 닿거나 땀을 흘린 뒤 바로 다시 바르세요.',
  unknown: '내수성 정보가 없어 물놀이·땀 이후에는 바로 다시 바르는 것이 안전합니다.',
};

export default function ProductSolution({ profile, onReset }) {
  const solution = deriveSolution(profile);
  const spf = profile.spf === null ? '미확인' : `SPF ${profile.spf}${profile.spfPlus ? '+' : ''}`;
  const pa = profile.paGrade === null ? '미확인' : `PA${'+'.repeat(profile.paGrade)}`;
  return (
    <section className="card" aria-labelledby="product-title">
      <h2 id="product-title">내 선크림</h2>
      <p className="badge">{profile.source === 'photo-ai' ? '사진으로 등록' : '직접 입력'}</p>
      <p><strong>{profile.name}</strong>{profile.sellerName && <span className="muted"> · {profile.sellerName}</span>}</p>
      <p>{spf} · {pa} · {FORM_LABEL[profile.form]} · {WATER_LABEL[profile.waterResistance]}</p>
      {solution.uvFilters.length > 0 && <p className="muted">확인된 차단 성분: {solution.uvFilters.join(', ')}</p>}
      <ul>
        <li>재도포 기준: 약 {solution.reapply.intervalMinutes}분마다 (일반 권고)</li>
        <li>{AFTER_WATER[solution.reapply.afterWater]}</li>
        {solution.flags.map(flag => <li key={flag}>{FLAG_TEXT[flag]}</li>)}
      </ul>
      <p className="muted">{solution.notes[1]}</p>
      <div className="actions"><button className="secondary" onClick={onReset}>다른 제품 등록</button></div>
    </section>
  );
}
