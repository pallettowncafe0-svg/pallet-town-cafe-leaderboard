import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
const date = (value?:string) => value ? new Date(value) : new Date();

async function recalculateCategory(categoryId: string, tx: any) {
const [matches, existingRecords] = await Promise.all([
  tx.match.findMany({
    where:{
      categoryId,
      winner:{
        is:{
          active:true
        }
      },
      loser:{
        is:{
          active:true
        }
      }
    },
    select:{
      winnerId:true,
      loserId:true
    }
  }),
  tx.categoryRecord.findMany({
    where:{categoryId},
    select:{
      playerId:true,
      pokemon:true
    }
  })
]);
 const pokemonByPlayer = new Map(existingRecords.map((record:any)=>[record.playerId, record.pokemon]));
 const totals = new Map<string,{wins:number;losses:number}>();
 for (const match of matches) {
  const winner = totals.get(match.winnerId) || {wins:0,losses:0};
  winner.wins += 1;
  totals.set(match.winnerId, winner);
  const loser = totals.get(match.loserId) || {wins:0,losses:0};
  loser.losses += 1;
  totals.set(match.loserId, loser);
 }
 await tx.categoryRecord.deleteMany({where:{categoryId}});
 if (totals.size) {
  await tx.categoryRecord.createMany({
   data:[...totals].map(([playerId,record])=>({categoryId,playerId,wins:record.wins,losses:record.losses,pokemon:pokemonByPlayer.get(playerId) || null}))
  });
 }
}

async function rebuildPlayerPoints(playerId: string, tx: any) {
  const transactions = await tx.pointTransaction.findMany({
    where: { playerId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, amount: true },
  });

  let total = 0;

  for (const transaction of transactions) {
    total += transaction.amount;

    await tx.pointTransaction.update({
      where: { id: transaction.id },
      data: { newTotal: total },
    });
  }

  await tx.player.update({
    where: { id: playerId },
    data: { points: total },
  });
}

function isAdminError(error: unknown) {
 return error instanceof Error && error.message === "Admin authorization required";
}

export async function POST(request:NextRequest) {
 try { await requireAdmin(); const {action,payload={}}=await request.json();
   if(action==="player.create") { const player=await db.player.create({data:{name:payload.name,ign:payload.ign?.trim() || null,points:Number(payload.points)||0,bestPerformance:payload.bestPerformance||null,notes:payload.notes||null,image:payload.image||null}}); if(player.points) await db.pointTransaction.create({data:{playerId:player.id,amount:player.points,newTotal:player.points,reason:"Starting points",action:"Player created",actor:"Admin"}}); }
   else if(action==="player.update") { const existing=await db.player.findUniqueOrThrow({where:{id:payload.id}}); const points=Number(payload.points); await db.player.update({where:{id:payload.id},data:{name:payload.name,ign:payload.ign?.trim() || null,bestPerformance:payload.bestPerformance||null,notes:payload.notes||null,image:payload.image||null,points}}); if(points!==existing.points) await db.pointTransaction.create({data:{playerId:payload.id,amount:points-existing.points,newTotal:points,reason:"Profile point correction",action:"Points edited",actor:"Admin"}}); }
  else if(action==="player.delete") { await db.player.update({where:{id:payload.id},data:{active:false,ign:null}}); }
  else if(action==="points") { const player=await db.player.findUniqueOrThrow({where:{id:payload.playerId}}); const amount=Number(payload.amount); if(!Number.isInteger(amount)||amount===0) throw new Error("Enter a whole non-zero point amount"); const total=player.points+amount; await db.$transaction([db.player.update({where:{id:player.id},data:{points:total}}),db.pointTransaction.create({data:{playerId:player.id,amount,newTotal:total,reason:payload.reason||null,action:amount>0?"Points awarded":"Points removed",actor:"Admin"}})]); }
else if(action==="category.points") {
  const player=await db.player.findUniqueOrThrow({
    where:{id:payload.playerId}
  });

  const category=await db.category.findUniqueOrThrow({
    where:{id:payload.categoryId}
  });

  const amount=Number(payload.amount);

  if(!Number.isInteger(amount)||amount===0) {
    throw new Error("Enter a whole non-zero point amount");
  }

  const total=player.points+amount;

  await db.$transaction([
    db.player.update({
      where:{id:player.id},
      data:{points:total}
    }),

    db.pointTransaction.create({
      data:{
        playerId:player.id,
        categoryId:category.id,
        amount,
        newTotal:total,
        reason:payload.reason||null,
        action:`${category.name} points`,
        actor:"Admin"
      }
    })
  ]);
}
  else if(action==="points.update") {
    const existing=await db.pointTransaction.findUniqueOrThrow({
      where:{id:payload.id}
    });

    const amount=Number(payload.amount);

    if(!Number.isInteger(amount)||amount===0) {
      throw new Error("Enter a whole non-zero point amount");
    }

    await db.$transaction(async(tx)=>{
      await tx.pointTransaction.update({
        where:{id:payload.id},
        data:{
          playerId:payload.playerId,
          amount,
          reason:payload.reason||null,
          action:existing.categoryId
            ? "Category points edited"
            : amount>0
              ? "Points awarded"
              : "Points removed"
        }
      });

      await rebuildPlayerPoints(existing.playerId,tx);

      if(existing.playerId!==payload.playerId) {
        await rebuildPlayerPoints(payload.playerId,tx);
      }
    });
  }
  else if(action==="points.delete") {
    const existing=await db.pointTransaction.findUniqueOrThrow({
      where:{id:payload.id}
    });

    await db.$transaction(async(tx)=>{
      await tx.pointTransaction.delete({
        where:{id:payload.id}
      });

      await rebuildPlayerPoints(existing.playerId,tx);
    });
  }
  else if(action==="category.create") await db.category.create({data:{name:payload.name,description:payload.description||null,image:payload.image||null}});
  else if(action==="category.update") await db.category.update({where:{id:payload.id},data:{name:payload.name,description:payload.description||null,image:payload.image||null}});
  else if(action==="category.duplicate") {
    const source=await db.category.findUniqueOrThrow({where:{id:payload.id}});
    const name=String(payload.name||`${source.name} Copy`).trim();
    if(!name) throw new Error("Enter a board name");
    const existing=await db.category.findUnique({where:{name}});
    if(existing) throw new Error("A battle board with that name already exists");
    await db.category.create({data:{name,description:source.description||null,image:source.image||null}});
  }
  else if(action==="category.delete") {
  const transactions=await db.pointTransaction.findMany({
    where:{categoryId:payload.id},
    select:{
      playerId:true,
      amount:true
    }
  });

  const totals=new Map<string,number>();

  for(const transaction of transactions) {
    totals.set(
      transaction.playerId,
      (totals.get(transaction.playerId)||0)+transaction.amount
    );
  }

  await db.$transaction([
    ...Array.from(totals.entries()).map(([playerId,amount])=>
      db.player.update({
        where:{id:playerId},
        data:{
          points:{
            decrement:amount
          }
        }
      })
    ),

    db.category.delete({
      where:{id:payload.id}
    })
  ]);
}
   else if(action==="match.create") { if(payload.winnerId===payload.loserId) throw new Error("Choose two different players"); await db.$transaction(async(tx)=>{ await tx.match.create({data:{categoryId:payload.categoryId,winnerId:payload.winnerId,loserId:payload.loserId,notes:payload.notes||null,playedAt:date(payload.playedAt)}}); await recalculateCategory(payload.categoryId,tx); }); }
   else if(action==="match.update") {
    if(payload.winnerId===payload.loserId) throw new Error("Choose two different players");
    await db.$transaction(async(tx)=>{
     const existing=await tx.match.findUniqueOrThrow({where:{id:payload.id}});
     await tx.match.update({where:{id:payload.id},data:{categoryId:payload.categoryId,winnerId:payload.winnerId,loserId:payload.loserId,notes:payload.notes||null,playedAt:date(payload.playedAt)}});
     await recalculateCategory(existing.categoryId,tx);
     if(existing.categoryId!==payload.categoryId) await recalculateCategory(payload.categoryId,tx);
    });
   }
   else if(action==="match.delete") {
    await db.$transaction(async(tx)=>{
     const existing=await tx.match.findUniqueOrThrow({where:{id:payload.id}});
     await tx.match.delete({where:{id:payload.id}});
     await recalculateCategory(existing.categoryId,tx);
    });
   }
  else if(action==="pokemon.set") {
    const list=(payload.pokemon||[]).filter((name:string)=>String(name||"").trim()).slice(0,6);
    if(payload.boardId==="hall") {
      await db.player.update({where:{id:payload.playerId},data:{hallPokemon:JSON.stringify(list)}});
    } else {
      await db.categoryRecord.upsert({where:{categoryId_playerId:{categoryId:payload.boardId,playerId:payload.playerId}},create:{categoryId:payload.boardId,playerId:payload.playerId,pokemon:JSON.stringify(list)},update:{pokemon:JSON.stringify(list)}});
    }
  }
  else if(action==="background.set") await db.setting.upsert({where:{key:"background"},create:{key:"background",value:payload.value},update:{value:payload.value}});
   else if(action==="logo.set") await db.setting.upsert({where:{key:"logo"},create:{key:"logo",value:payload.value},update:{value:payload.value}});
  else throw new Error("Unknown action");
   return NextResponse.json({ok:true});
  } catch(error) { return NextResponse.json({error:error instanceof Error?error.message:"Action failed"},{status:isAdminError(error)?401:400}); }
}

