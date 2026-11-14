import React from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Section } from '@astryxdesign/core/Section';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import { ACTIVITY_LEVELS, activityGuidance, deriveSolution } from '../lib/product.js';

export const FORM_LABEL = { cream: '크림', lotion: '로션', gel: '젤', stick: '스틱', spray: '스프레이', unknown: '미확인' };
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

export function ratingText(profile) {
  const spf = profile.spf === null ? 'SPF 미확인' : `SPF ${profile.spf}${profile.spfPlus ? '+' : ''}`;
  const pa = profile.paGrade === null ? 'PA 미확인' : `PA${'+'.repeat(profile.paGrade)}`;
  return `${spf} · ${pa}`;
}

export default function ProductSolution({ profile, onReset, onEdit }) {
  const solution = deriveSolution(profile);
  const guidance = activityGuidance(profile);
  return (
    <Section padding={4}>
      <VStack gap={4}>
        <VStack gap={1}>
          <Text type="supporting">{profile.source === 'photo-ai' ? '사진으로 등록' : '직접 입력'}</Text>
          <Heading level={3}>{profile.name}</Heading>
          {profile.sellerName && <Text type="supporting">{profile.sellerName}</Text>}
          <Text type="label">{ratingText(profile)} · {FORM_LABEL[profile.form]} · {WATER_LABEL[profile.waterResistance]}</Text>
        </VStack>

        <Banner status={guidance.level === null ? 'info' : 'success'} title={guidance.sentence} description="라벨 표기를 일반 소비자 가이드와 비교한 안내이며 차단 성능을 측정한 값이 아닙니다." />

        {solution.uvFilters.length > 0 && <Text type="supporting">확인된 차단 성분: {solution.uvFilters.join(', ')}</Text>}
        <VStack as="ul" gap={1} style={{ margin: 0, paddingInlineStart: 'var(--spacing-5)' }}>
          <Text as="li">재도포 기준: 약 {solution.reapply.intervalMinutes}분마다 (일반 권고)</Text>
          <Text as="li">{AFTER_WATER[solution.reapply.afterWater]}</Text>
          {solution.flags.map(flag => <Text as="li" key={flag}>{FLAG_TEXT[flag]}</Text>)}
        </VStack>
        <HStack wrap="wrap" gap={2}>
          <Button label="정보 수정" onClick={onEdit} />
          <Button variant="ghost" label="다른 제품 등록" onClick={onReset} />
        </HStack>

        <Divider />
        <VStack gap={2}>
          <Text type="supporting"><Text as="strong" type="supporting" weight="bold">SPF</Text>는 자외선 B(UVB) 차단 지수로, 숫자가 클수록 피부가 붉어지는 UVB를 더 많이 걸러냅니다. 50을 넘는 제품은 50+로 표기합니다. <Text as="strong" type="supporting" weight="bold">PA</Text>는 자외선 A(UVA) 차단 등급으로 + 개수가 많을수록(PA+ ~ PA++++) 피부 노화·색소침착에 관여하는 UVA를 더 많이 차단합니다. 두 지수 모두 라벨의 표기이며 바르는 양과 덧바름에 따라 실제 보호 정도는 달라집니다.</Text>
          <VStack as="ul" gap={1} aria-label="활동 환경별 SPF·PA 선택 기준" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {ACTIVITY_LEVELS.map(row => (
              <HStack as="li" key={row.key} gap={3} wrap="wrap" vAlign="center">
                <Text type="supporting" weight={guidance.level === row.level ? 'bold' : undefined}>{guidance.level === row.level ? '▶ ' : ''}{row.label}</Text>
                <Text type="supporting" weight={guidance.level === row.level ? 'bold' : undefined}>{row.spf} · {row.pa}</Text>
                <Text type="supporting">{row.note}</Text>
              </HStack>
            ))}
          </VStack>
          <Text type="supporting">덧바르는 주기는 활동 환경과 무관하게 약 2시간이 일반 권고입니다. 표는 일반 소비자 가이드입니다.</Text>
        </VStack>
      </VStack>
    </Section>
  );
}
