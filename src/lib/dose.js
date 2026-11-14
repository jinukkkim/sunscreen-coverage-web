export const product = Object.freeze({
  name:'맑은쌀 선크림 아쿠아프레쉬', brand:'조선미녀', size:'10mL · 비매품',
  calibrated:false, referenceGramsPerMm:.02, referenceJointMm:25, referenceNozzleMm:5,
});

// Illustrative standard strip only. Not a measured conversion for the user's mini tube.
export function getFingerGuide(grams,jointMm=25) {
  if(!Number.isFinite(grams)||grams<=0||grams>5) throw new Error('유효한 사용량이 필요합니다.');
  if(!Number.isFinite(jointMm)||jointMm<10||jointMm>45) throw new Error('마디 길이는 10~45mm로 입력해 주세요.');
  const stripMm=grams/product.referenceGramsPerMm;
  return {stripMm,joints:stripMm/jointMm,jointMm,calibrated:false};
}
