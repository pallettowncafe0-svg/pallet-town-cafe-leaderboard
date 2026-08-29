import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
const date = (value?:string) => value ? new Date(value) : new Date();
export async function POST(request:NextRequest) {
 try { await requireAdmin(); const {action,payload={}}=await request.json();
  if(action==="player.create") { const player=await db.player.create({data:{name:payload.name,ign:payload.ign,points:Number(payload.points)||0,bestPerformance:payload.bestPerformance||null,notes:payload.notes||null}}); if(player.points) await db.pointTransaction.create({data:{playerId:player.id,amount:player.points,newTotal:player.points,reason:"Starting points",action:"Player created",actor:"Admin"}}); }
  else if(action==="player.update") { const existing=await db.player.findUniqueOrThrow({where:{id:payload.id}}); const points=Number(payload.points); await db.player.update({where:{id:payload.id},data:{name:payload.name,ign:payload.ign,bestPerformance:payload.bestPerformance||null,notes:payload.notes||null,points}}); if(points!==existing.points) await db.pointTransaction.create({data:{playerId:payload.id,amount:points-existing.points,newTotal:points,reason:"Profile point correction",action:"Points edited",actor:"Admin"}}); }
  else if(action==="player.delete") { await db.player.update({where:{id:payload.id},data:{active:false,ign:`deleted-${payload.id}`}}); }
  else if(action==="points") { const player=await db.player.findUniqueOrThrow({where:{id:payload.playerId}}); const amount=Number(payload.amount); if(!Number.isInteger(amount)||amount===0) throw new Error("Enter a whole non-zero point amount"); const total=player.points+amount; await db.$transaction([db.player.update({where:{id:player.id},data:{points:total}}),db.pointTransaction.create({data:{playerId:player.id,amount,newTotal:total,reason:payload.reason||null,action:amount>0?"Points awarded":"Points removed",actor:"Admin"}})]); }
  else if(action==="category.create") await db.category.create({data:{name:payload.name,description:payload.description||null}});
  else if(action==="category.update") await db.category.update({where:{id:payload.id},data:{name:payload.name,description:payload.description||null}});
  else if(action==="category.delete") await db.category.delete({where:{id:payload.id}});
  else if(action==="match.create") { if(payload.winnerId===payload.loserId) throw new Error("Choose two different players"); await db.$transaction([db.match.create({data:{categoryId:payload.categoryId,winnerId:payload.winnerId,loserId:payload.loserId,notes:payload.notes||null,playedAt:date(payload.playedAt)}}),db.categoryRecord.upsert({where:{categoryId_playerId:{categoryId:payload.categoryId,playerId:payload.winnerId}},create:{categoryId:payload.categoryId,playerId:payload.winnerId,wins:1},update:{wins:{increment:1}}}),db.categoryRecord.upsert({where:{categoryId_playerId:{categoryId:payload.categoryId,playerId:payload.loserId}},create:{categoryId:payload.categoryId,playerId:payload.loserId,losses:1},update:{losses:{increment:1}}})]); }
  else if(action==="pokemon.set") { const list=(payload.pokemon||[]).filter((name:string)=>name.trim()).slice(0,6); await db.categoryRecord.upsert({where:{categoryId_playerId:{categoryId:payload.categoryId,playerId:payload.playerId}},create:{categoryId:payload.categoryId,playerId:payload.playerId,pokemon:JSON.stringify(list)},update:{pokemon:JSON.stringify(list)}}); }
  else if(action==="background.set") await db.setting.upsert({where:{key:"background"},create:{key:"background",value:payload.value},update:{value:payload.value}});
  else throw new Error("Unknown action");
  return NextResponse.json({ok:true});
 } catch(error) { return NextResponse.json({error:error instanceof Error?error.message:"Action failed"},{status:400}); }
}

