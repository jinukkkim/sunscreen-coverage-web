let modelPromise=null;
export async function getFaceModel() {
  modelPromise ??= (async()=>{
    const {FilesetResolver,FaceLandmarker}=await import('@mediapipe/tasks-vision');
    const files=await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}vendor/wasm`);
    return FaceLandmarker.createFromOptions(files,{
      baseOptions:{modelAssetPath:`${import.meta.env.BASE_URL}models/face_landmarker.task`,delegate:'CPU'},
      runningMode:'IMAGE',numFaces:2,outputFaceBlendshapes:false,outputFacialTransformationMatrixes:false,
    });
  })().catch(error=>{modelPromise=null;throw error;});
  return modelPromise;
}
