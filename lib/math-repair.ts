// Formatting failures happen before semantic review. Give the author one targeted
// repair, then validate again; never suppress the parser or accept invalid maths.
export async function repairDraftMath<T>(value:unknown,validate:(v:unknown)=>T,repair:(value:unknown,issue:string)=>Promise<unknown>):Promise<T>{
 try{return validate(value);}catch(error){
  if((error as Error).name!=='ParseError')throw error;
  const corrected=await repair(value,(error as Error).message);
  return validate(corrected);
 }
}
