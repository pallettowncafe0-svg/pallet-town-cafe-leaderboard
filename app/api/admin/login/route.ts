import { NextRequest, NextResponse } from "next/server";
import { grantAdmin, verifyPassword } from "@/lib/auth";
export async function POST(request:NextRequest) { const {password}=await request.json(); if(typeof password!=="string" || !(await verifyPassword(password))) return NextResponse.json({error:"Incorrect password"},{status:401}); await grantAdmin(); return NextResponse.json({ok:true}); }

