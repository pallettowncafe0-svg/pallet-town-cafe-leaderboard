import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAdmin } from "@/lib/auth";
import { rankPlayers, rankRecords } from "@/lib/rankings";
export async function GET() {
  const [rawPlayers, rawCategories, history, matches, background] = await Promise.all([
    db.player.findMany({ where:{active:true} }), db.category.findMany({ include:{records:{include:{player:true}}} }),
    db.pointTransaction.findMany({include:{player:true},orderBy:{createdAt:"desc"},take:100}), db.match.findMany({include:{category:true,winner:true,loser:true},orderBy:{playedAt:"desc"},take:100}), db.setting.findUnique({where:{key:"background"}})
  ]);
  const players=rankPlayers(rawPlayers).map((player,index)=>({...player,rank:index+1}));
  const categories=rawCategories.map((category:any)=>({...category, records:rankRecords(category.records).map((record:any,index:number)=>({...record,rank:index+1, winRate:record.wins+record.losses ? Math.round(record.wins/(record.wins+record.losses)*100) : 0, pokemon:record.pokemon ? JSON.parse(record.pokemon) : []}))}));
  return NextResponse.json({players,categories,history,matches,background:background?.value||null,isAdmin:await isAdmin()});
}

