import './styles.css';
import { createCameraSession } from '../lib/camera.js';
import { createOperationGuard } from '../lib/operation.js';
import { getFaceModel } from '../lib/vision.js';
import { estimateFace } from '../lib/measurement.js';
import { getFingerGuide } from '../lib/dose.js';
import { drawFaceOverlay, fingerSVG } from '../lib/ui.js';

const $=id=>document.getElementById(id);
const video=$('video'), preview=$('preview'), input=$('photo-input');
const operations=createOperationGuard();
const camera=createCameraSession({getUserMedia:c=>navigator.mediaDevices.getUserMedia(c),video});
let source=null,result=null,cameraState='idle',busy=false,mode='camera';

function text(id,value){$(id).textContent=value;}
function show(id,value=true){$(id).hidden=!value;}
function status(value){text('capture-status',value);}
function clearResult(){result=null;show('result-content',false);show('result-empty');show('reset',false);setStep(1);}
function setStep(step){
  for(let i=1;i<=3;i++) {
    const node=$(`step-${i}`);node.classList.toggle('current',i===step);node.classList.toggle('complete',i<step);
    if(i===step)node.setAttribute('aria-current','step');else node.removeAttribute('aria-current');
  }
}
function controls(){
  show('start-camera',mode==='camera'&&cameraState==='idle');
  show('analyze-camera',mode==='camera'&&cameraState==='active');
  show('stop-camera',cameraState!=='idle');
  $('start-camera').disabled=busy;
  $('analyze-camera').disabled=busy;
  $('select-photo').disabled=busy;
  show('retry-analysis',!!source&&cameraState==='idle'&&!busy&&!result);
  show('stage-loading',busy);
  text('capture-badge',busy?'분석 중':result?'영역 분석 완료':cameraState==='active'?'카메라 사용 중':'촬영 준비');
}
function releaseSource(){source=null;preview.width=1;preview.height=1;}
function stopCamera(){camera.stop();cameraState='idle';show('video',false);controls();}
function cancel(){operations.cancel();busy=false;clearResult();if(source)drawFaceOverlay(preview,source);controls();status('분석을 취소했어요. 다시 촬영하거나 사진을 선택해 주세요.');}
function error(message){text('capture-error',message);show('capture-error');status('입력을 확인한 뒤 다시 시도해 주세요.');controls();}
function dismissError(){show('capture-error',false);}
function setMode(next){
  operations.cancel();busy=false;stopCamera();releaseSource();clearResult();dismissError();mode=next;
  $('camera-tab').setAttribute('aria-pressed',String(next==='camera'));
  $('upload-tab').setAttribute('aria-pressed',String(next==='upload'));
  text('stage-instruction',next==='camera'?'얼굴 전체가 보이도록\n정면을 바라봐 주세요.':'정면에서 촬영한\n얼굴 사진을 선택해 주세요.');
  show('preview',false);show('stage-empty');text('stage-resolution','FACE GUIDE');
  status(next==='camera'?'카메라를 켜거나 정면 사진을 선택해 주세요.':'JPG, PNG, WebP, AVIF · 최대 15MB · 사진은 기기 안에서만 분석해요.');controls();
}
function reset(){input.value='';setMode('camera');}
async function startCamera(){
  operations.cancel();const token=operations.begin();clearResult();dismissError();releaseSource();
  if(!navigator.mediaDevices?.getUserMedia){error('카메라를 사용할 수 없어요. HTTPS 또는 localhost로 접속하거나 사진을 선택해 주세요.');return;}
  cameraState='loading';status('카메라 권한을 확인하고 있어요.');controls();
  try{
    const started=await camera.start();
    if(!started||!operations.isCurrent(token))return;
    cameraState='active';show('preview',false);show('stage-empty',false);show('video');
    status('얼굴과 양쪽 눈이 선명하게 보이면 촬영해 주세요.');controls();
  }catch(cause){
    if(!operations.isCurrent(token))return;
    stopCamera();show('stage-empty');
    error(cause.name==='NotAllowedError'?'카메라 권한이 허용되지 않았어요. 브라우저 설정을 확인하거나 사진으로 분석해 주세요.':'카메라에 연결하지 못했어요. 다른 앱의 카메라 사용 여부를 확인해 주세요.');
  }
}
function snapshot(image,width,height){
  const factor=Math.min(1,2048/Math.max(width,height));
  const canvas=document.createElement('canvas');canvas.width=Math.round(width*factor);canvas.height=Math.round(height*factor);
  canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
  source=canvas;preview.width=canvas.width;preview.height=canvas.height;
  drawFaceOverlay(preview,source);show('stage-empty',false);show('video',false);show('preview');
  text('stage-resolution',`${canvas.width} × ${canvas.height}`);
}
async function analyze(){
  if(!source||busy)return;
  const token=operations.begin(), analyzingSource=source;
  clearResult();dismissError();busy=true;drawFaceOverlay(preview,source);setStep(2);
  text('loading-message','얼굴 분석 모델을 준비하고 있어요');status('처음에는 모델을 내려받느라 잠시 걸릴 수 있어요.');controls();
  let model;
  try{model=await getFaceModel();}
  catch(cause){
    if(!operations.isCurrent(token))return;
    busy=false;setStep(1);console.error('Face model load failed',cause);
    error('분석 모델을 불러오지 못했어요. 연결 상태를 확인하고 ‘다시 분석’을 눌러 주세요.');return;
  }
  if(!operations.isCurrent(token))return;
  text('loading-message','얼굴과 홍채, 분석 영역을 확인하고 있어요');
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  if(!operations.isCurrent(token))return;
  try{
    const detected=model.detect(analyzingSource);
    if(!detected.faceLandmarks.length)throw new Error('얼굴을 찾지 못했어요. 얼굴과 양쪽 눈이 보이는 정면 사진으로 다시 시도해 주세요.');
    if(detected.faceLandmarks.length!==1)throw new Error('한 사람의 얼굴만 보이게 촬영해 주세요.');
    const measured=estimateFace(detected.faceLandmarks[0],analyzingSource.width,analyzingSource.height);
    if(!operations.isCurrent(token))return;
    result=measured;busy=false;drawFaceOverlay(preview,source,result);renderResult();
    status('초록색으로 표시한 모델 영역의 면적과 계산량이에요. 전체 얼굴의 권장량은 아니에요.');controls();
    $('results').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
  }catch(cause){
    if(!operations.isCurrent(token))return;
    busy=false;setStep(1);error(cause.message||'사진을 분석하지 못했어요. 다시 촬영해 주세요.');
  }
}
function renderFinger(){
  if(!result)return;
  const guide=getFingerGuide(result.doseGrams,Number($('joint-length').value));
  text('joint-mm',`${guide.jointMm}mm`);text('joint-value',guide.joints.toFixed(1));text('length-value',guide.stripMm.toFixed(0));
  $('finger-graphic').innerHTML=fingerSVG(guide);
  $('finger-graphic').setAttribute('aria-label',`표준 조건 참고: 약 ${guide.joints.toFixed(1)}마디, ${guide.stripMm.toFixed(0)}mm. 제품별 토출량 미검증.`);
}
function renderResult(){
  text('area-value',result.areaCm2.toFixed(0));text('width-value',result.widthCm.toFixed(1));text('height-value',result.heightCm.toFixed(1));
  text('dose-value',result.doseGrams.toFixed(2));text('formula-area',result.areaCm2.toFixed(0));
  text('sensitivity',`홍채 지름 가정을 11.2~12.2mm로 바꾸면 면적 계산은 ${result.areaSensitivity.map(n=>n.toFixed(0)).join('~')}cm²로 달라져요.`);
  renderFinger();show('result-empty',false);show('result-content');show('reset');setStep(3);
}
async function readPhoto(file){
  if(!file)return;
  operations.cancel();stopCamera();clearResult();releaseSource();dismissError();
  show('preview',false);show('stage-empty');
  const token=operations.begin();
  if(!/^image\/(jpeg|png|webp|avif)$/.test(file.type)){error('JPG, PNG, WebP 또는 AVIF 사진을 선택해 주세요.');return;}
  if(file.size>15*1024*1024){error('15MB 이하의 사진을 선택해 주세요.');return;}
  busy=true;text('loading-message','사진을 읽고 있어요');controls();
  const url=URL.createObjectURL(file);
  try{
    const image=new Image();image.src=url;await image.decode();
    if(!operations.isCurrent(token))return;
    if(!image.naturalWidth||image.naturalWidth*image.naturalHeight>40_000_000)throw new Error('사진 해상도가 너무 커요. 4천만 화소 이하의 사진을 선택해 주세요.');
    snapshot(image,image.naturalWidth,image.naturalHeight);busy=false;controls();await analyze();
  }catch(cause){if(operations.isCurrent(token)){busy=false;error(cause.message.includes('해상도')?cause.message:'사진을 읽지 못했어요. 다른 사진을 선택해 주세요.');}}
  finally{URL.revokeObjectURL(url);input.value='';}
}
$('camera-tab').addEventListener('click',()=>setMode('camera'));
$('upload-tab').addEventListener('click',()=>setMode('upload'));
$('start-camera').addEventListener('click',startCamera);
$('stop-camera').addEventListener('click',()=>{operations.cancel();busy=false;stopCamera();show('stage-empty',!source);status('카메라를 껐어요.');});
$('analyze-camera').addEventListener('click',()=>{
  if(!video.videoWidth){error('영상이 준비될 때까지 잠시 기다려 주세요.');return;}
  snapshot(video,video.videoWidth,video.videoHeight);stopCamera();analyze();
});
$('select-photo').addEventListener('click',()=>input.click());
input.addEventListener('change',()=>readPhoto(input.files[0]));
$('retry-analysis').addEventListener('click',analyze);
$('cancel-analysis').addEventListener('click',cancel);
$('joint-length').addEventListener('input',renderFinger);
$('reset').addEventListener('click',reset);
document.addEventListener('visibilitychange',()=>{if(document.hidden){operations.cancel();busy=false;stopCamera();show('stage-empty',!source);controls();}});
window.addEventListener('pagehide',()=>{operations.cancel();camera.stop();releaseSource();});
controls();
