export function createOperationGuard() {
  let generation=0;
  return {begin:()=>++generation, cancel:()=>{generation+=1;}, isCurrent:token=>token===generation};
}
