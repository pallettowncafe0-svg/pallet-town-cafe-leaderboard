"use client";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
type Data={players:any[];categories:any[];history:any[];matches:any[];background:string|null;isAdmin:boolean};
const empty:Data={players:[],categories:[],history:[],matches:[],background:null,isAdmin:false};
const fmt=(value:string)=>new Date(value).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});
const initials=(player:any)=>String(player?.ign||player?.name||"?").replace(/[^a-z0-9]/gi,"").slice(0,2).toUpperCase()||"?";
function Avatar({player,className=""}:{player:any;className?:string}) {
 const [broken,setBroken]=useState(false);
 if(player?.image&&!broken) return <img className={`avatar ${className}`} src={player.image} alt={`${player.name||player.ign||"Player"} display picture`} onError={()=>setBroken(true)}/>;
 return <span className={`avatar avatar-fallback ${className}`} aria-label={`${player?.name||player?.ign||"Player"} initials`}>{initials(player)}</span>;
}
export default function LeaderboardApp(){
 const [data,setData]=useState<Data>(empty);
 const [view,setView]=useState("hall");
 const [query,setQuery]=useState("");
 const [selectedPlayer,setSelectedPlayer]=useState<any>(null);
 const [selectedCategory,setSelectedCategory]=useState<any>(null);
 const [selectedMatch,setSelectedMatch]=useState<any>(null);
 const [modal,setModal]=useState<string|null>(null);
 const [notice,setNotice]=useState("");

 const load=async()=>{
  try{
   const r=await fetch("/api/data",{cache:"no-store"});
   if(!r.ok)throw new Error("Could not load leaderboard data.");
   const result=await r.json();
   setData(result);
  }catch{
   setNotice("Could not load leaderboard data.");
  }
 };

 useEffect(()=>{
  void load();
 },[]);

 const api=async(action:string,payload:any={})=>{
  const r=await fetch("/api/admin/action",{
   method:"POST",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({action,payload})
  });

  const result=await r.json();

  if(!r.ok)throw new Error(result.error);

  await load();
  setModal(null);
  setNotice("Saved successfully.");
 };

 const choosePlayer=(candidate:any)=>{
  const id=candidate?.id||candidate?.playerId;
  const nested=candidate?.player;

  const player=
   data.players.find(p=>p.id===id||p.id===nested?.id)||
   data.players.find(p=>p.ign===candidate?.ign||p.ign===nested?.ign)||
   nested||
   candidate;

  if(player?.id){
   setSelectedPlayer(player);
  }
 };

 const filtered=useMemo(
  ()=>data.players.filter(
   p=>(p.name+p.ign).toLowerCase().includes(query.toLowerCase())
  ),
  [data.players,query]
 );

 const stats={
  points:data.players.reduce((n,p)=>n+p.points,0),
  battles:data.matches.length
 };

 const background=data.background
  ?{
    backgroundImage:
     `linear-gradient(rgba(8,8,8,.9),rgba(8,8,8,.98)),url(${data.background})`
   }
  :{};

const modalSelected=
  modal==="match"||
  modal==="pokemon"||
  modal==="delete-category"
   ?selectedCategory
   :modal==="edit-match"||
    modal==="delete-match"
    ?selectedMatch
    :selectedPlayer;

 return (
  <main className="site" style={background}>

   <header>
    <button
     className="brand"
     onClick={()=>setView("hall")}
    >
     <span>◉</span>

     <div>
      Pallet Town Cafe
      <small>SVR COMPETITIVE HUB</small>
     </div>
    </button>

    <nav>
     {[
      ["hall","Hall of Fame"],
      ["battle","Battle Leaderboards"],
      ["players","Players"],
      ["history","History"],
      ["backup","Backup"]
     ].map(([id,label])=>
      <button
       key={id}
       className={view===id?"active":""}
       onClick={()=>setView(id)}
      >
       {label}
      </button>
     )}
    </nav>

    <button
     className="admin"
     onClick={()=>setModal(data.isAdmin?"control":"login")}
    >
     {data.isAdmin?"Admin Controls":"Admin Sign In"}
    </button>
   </header>


   <section className="hero">

    <div>
     <p className="eyebrow">THE LIFETIME RANKINGS</p>

     <h1>
      {view==="hall"
       ?"Hall of Fame"
       :view==="battle"
        ?"Battle Leaderboards"
        :"Pallet Town Cafe"}
     </h1>

     <p className="sub">
      Where every battle, victory, and point counts.
     </p>
    </div>


    <div className="hero-stats">

     <b>
      {data.players[0]?.ign||"—"}
      <small>Current Champion</small>
     </b>

     <b>
      {stats.points.toLocaleString()}
      <small>Total Points</small>
     </b>

     <b>
      {stats.battles}
      <small>Recorded Battles</small>
     </b>

    </div>

   </section>


   <div className="layout">

    <aside>

     <p>EXPLORE</p>


     {data.categories.map(c=>
      <button
       key={c.id}
       onClick={()=>{
        setSelectedCategory(c);
        setView("category");
       }}
      >
       BATTLE · {c.name}
      </button>
     )}


     {data.isAdmin&&
      <button onClick={()=>setModal("category")}>
       + Create Category
      </button>
     }


     <div className="aside-rule"/>


     <button onClick={()=>setModal("background")}>
      Background
     </button>

    </aside>


    <section className="content">

     {view==="hall"&&
      <Hall
       players={filtered}
       query={query}
       setQuery={setQuery}
       choose={choosePlayer}
       admin={data.isAdmin}
       open={setModal}
      />
     }


     {view==="players"&&
      <Players
       players={filtered}
       query={query}
       setQuery={setQuery}
       choose={choosePlayer}
       admin={data.isAdmin}
       open={setModal}
      />
     }


     {view==="battle"&&
      <Battle
       categories={data.categories}
       choose={c=>{
        setSelectedCategory(c);
        setView("category");
       }}
       admin={data.isAdmin}
       open={setModal}
      />
     }


     {view==="category"&&selectedCategory&&
      <Category
       category={
        data.categories.find(
         c=>c.id===selectedCategory.id
        )||selectedCategory
       }
       players={data.players}
       choose={choosePlayer}
       admin={data.isAdmin}
       open={setModal}
      />
     }


     {view==="history"&&
      <History
       items={data.history}
       matches={data.matches}
       admin={data.isAdmin}
       open={setModal}
       choose={setSelectedMatch}
      />
     }


     {view==="backup"&&
      <Backup
       admin={data.isAdmin}
       onImport={async(file)=>{
        const form=new FormData();

        form.append("file",file);

        const r=await fetch(
         "/api/import",
         {
          method:"POST",
          body:form
         }
        );

        const out=await r.json();

        if(!r.ok)throw new Error(out.error);

        setNotice(out.message);

        await load();
       }}
      />
     }

    </section>

   </div>


   {selectedPlayer&&
    modal===null&&
    data.players.some(
     p=>p.id===selectedPlayer.id
    )&&
    <Profile
     player={
      data.players.find(
       p=>p.id===selectedPlayer.id
      )
     }
     categories={data.categories}
     close={()=>setSelectedPlayer(null)}
     admin={data.isAdmin}
     open={setModal}
    />
   }


   {modal&&
    <Modal
     type={modal}
     data={data}
     selected={modalSelected}
     close={()=>setModal(null)}
     api={api}
     reload={load}
    />
   }


   {notice&&
    <div
     className="toast"
     onClick={()=>setNotice("")}
    >
     {notice}
    </div>
   }

  </main>
 );
}
function Hall({players,query,setQuery,choose,admin,open}:any){return <><div className="section-head"><div><p className="eyebrow">PERMANENT STANDINGS</p><h2>Lifetime Leaderboard</h2></div>{admin&&<div><button className="button ghost" onClick={()=>open("points")}>Award Points</button><button className="button" onClick={()=>open("player")}>New Player</button></div>}</div><label className="search">Search<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search by player name or IGN…"/></label><div className="podium">{players.slice(0,3).map(p=><button key={p.id} className={`place p${p.rank}`} onClick={()=>choose(p)}><Avatar player={p}/><span className="place-copy"><i>#{p.rank}</i><strong>{p.ign}</strong><span>{p.points} pts</span></span></button>)}</div><div className="table"><div className="row labels"><span>RANK</span><span>PLAYER</span><span>STATUS</span><span>POINTS</span></div>{players.map(p=><button className="row" key={p.id} onClick={()=>choose(p)}><span className={`rank r${p.rank}`}>#{p.rank}</span><span className="player-cell"><Avatar player={p}/><span><strong>{p.name}</strong><small>{p.ign}</small></span></span><span>{p.rank===1?<em className="champion">Champion</em>:p.rank<=3?<em>Top 3</em>:p.rank<=10?<em>Top 10</em>:<em className="regular">Competitive</em>}</span><span className="points">{p.points.toLocaleString()}</span></button>)}</div></>}
function Players({players,query,setQuery,choose,admin,open}:any){return <><div className="section-head"><div><p className="eyebrow">ROSTER</p><h2>All Players</h2></div>{admin&&<button className="button" onClick={()=>open("player")}>New Player</button>}</div><label className="search">Search<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find a trainer…"/></label><div className="cards">{players.map(p=><button className="player-card" onClick={()=>choose(p)} key={p.id}><Avatar player={p}/><i>#{p.rank}</i><strong>{p.name}</strong><small>{p.ign}</small><b>{p.points} pts</b></button>)}</div></>}
function Battle({categories,choose,admin,open}:any){return <><div className="section-head"><div><p className="eyebrow">SEPARATE FROM LIFETIME POINTS</p><h2>Battle Leaderboards</h2></div>{admin&&<button className="button" onClick={()=>open("category")}>Create Category</button>}</div><div className="cards categories">{categories.map(c=><button className="category-card" onClick={()=>choose(c)} key={c.id}><i>BATTLE</i><strong>{c.name}</strong><small>{c.description||"A Pallet Town Cafe battle format"}</small><b>{c.records.length} competitors</b></button>)}</div>{!categories.length&&<p className="empty">No battle formats yet. An admin can create the first category.</p>}</>}
function Category({category,players,choose,admin,open}:any){return <><div className="section-head"><div><p className="eyebrow">INDEPENDENT W/L RANKING</p><h2>{category.name}</h2><p className="muted">{category.description}</p></div>{admin&&<div>
  <button
    className="button ghost"
    onClick={()=>open("pokemon")}
  >
    Set Pokémon
  </button>

  <button
    className="button"
    onClick={()=>open("match")}
  >
    Record Battle
  </button>

  <button
    className="danger"
    onClick={()=>open("delete-category")}
  >
    Delete Category
  </button>
</div>}</div><div className="top-three">{category.records.slice(0,3).map((r:any)=><article key={r.id}><Avatar player={r.player}/><b>#{r.rank} · {r.player?.ign||r.playerId}</b><strong>{r.wins}W – {r.losses}L <small>{r.winRate}% WR</small></strong><p>{r.pokemon.length?r.pokemon.join(" · "):"Pokémon roster not recorded"}</p></article>)}</div><div className="table"><div className="row labels"><span>RANK</span><span>PLAYER</span><span>RECORD</span><span>WIN RATE</span></div>{category.records.map((r:any)=><button className="row" key={r.id} onClick={()=>choose(r.player||r.playerId)}><span className="rank">#{r.rank}</span><span className="player-cell"><Avatar player={r.player}/><span><strong>{r.player?.name||"Unknown player"}</strong><small>{r.player?.ign||r.playerId}</small></span></span><span>{r.wins}W / {r.losses}L</span><span className="points">{r.winRate}%</span></button>)}</div></>}
function History({items,matches,admin,open,choose}:any){return <><div className="section-head"><div><p className="eyebrow">PERMANENT RECORDS</p><h2>Activity History</h2></div></div><h3>Point Transactions</h3><div className="timeline">{items.map((x:any)=><article key={x.id}><b className={x.amount>0?"plus":"minus"}>{x.amount>0?"+":""}{x.amount} pts</b><div><strong>{x.player.name} <small>/{x.player.ign}</small></strong><p>{x.reason||x.action} · New total: {x.newTotal}</p></div><time>{fmt(x.createdAt)}</time></article>)}</div><h3>Battle History</h3><div className="timeline">{matches.map((m:any)=><article key={m.id}><b>BATTLE</b><div><strong>{m.winner?.ign||m.winnerId} defeated {m.loser?.ign||m.loserId}</strong><p>{m.category?.name||m.categoryId}{m.notes?` · ${m.notes}`:""}</p></div><time>{fmt(m.playedAt)}</time>{admin&&<div className="history-actions"><button className="link" onClick={()=>{choose(m);open("edit-match")}}>Edit</button><button className="link danger-link" onClick={()=>{choose(m);open("delete-match")}}>Delete</button></div>}</article>)}</div></>}
function Profile({player,categories,close,admin,open}:any){const records=categories.flatMap((c:any)=>c.records.filter((r:any)=>r.playerId===player.id).map((r:any)=>({...r,category:c.name})));return <div className="drawer"><button className="x" onClick={close}>×</button><div className="profile-heading"><Avatar player={player} className="avatar-large"/><div><p className="eyebrow">TRAINER PROFILE</p><h2>{player.name}</h2><p className="ign">{player.ign}</p></div></div><div className="profile-score"><b>#{player.rank||"—"}<small>Overall rank</small></b><b>{player.points}<small>Lifetime points</small></b></div><p><strong>Best performance</strong><br/>{player.bestPerformance||"Not recorded yet"}</p><p className="notes">{player.notes}</p>{admin&&<div className="drawer-actions"><button className="button" onClick={()=>open("edit-player")}>Edit Player</button><button className="danger" onClick={()=>open("delete-player")}>Delete Player</button></div>}<h3>Battle Records</h3>{records.length?records.map((r:any)=><article className="record" key={r.id}><b>{r.category}</b><span>#{r.rank} · {r.wins}W / {r.losses}L</span></article>):<p className="muted">No category battles recorded.</p>}</div>}
function Backup({admin,onImport}:any){const [file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false);return <><div className="section-head"><div><p className="eyebrow">DATA PORTABILITY</p><h2>Backup & Restore</h2></div></div><div className="backup"><article><h3>Export Excel Backup</h3><p>Download the complete current leaderboard, history, battle records, and Pokémon lineups in one `.xlsx` workbook.</p><a className={`button ${!admin?"disabled":""}`} href={admin?"/api/export":undefined}>Export .xlsx</a></article><article><h3>Import Backup</h3><p>Restore players, battle categories, records, and Pokémon lineups. Existing players are matched by IGN.</p><input type="file" accept=".xlsx" onChange={e=>setFile(e.target.files?.[0]||null)}/><button className="button" disabled={!admin||!file||busy} onClick={async()=>{if(!confirm("Import this backup? Existing player points and category records may be updated."))return;setBusy(true);try{await onImport(file)}catch(e){alert(e instanceof Error?e.message:"Import failed")}finally{setBusy(false)}}}> {busy?"Importing…":"Confirm Import"}</button></article></div>{!admin&&<p className="empty">Sign in as an admin to access backups.</p>}</>}
function Modal({type,data,selected,close,api,reload}:any){const submit=async(e:FormEvent<HTMLFormElement>,action:string)=>{e.preventDefault();const f=new FormData(e.currentTarget),p=Object.fromEntries(f);try{await api(action,p)}catch(err){alert(err instanceof Error?err.message:"Unable to save")}}; if(type==="login")return <div className="modal"><form onSubmit={async e=>{e.preventDefault();const r=await fetch("/api/admin/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:new FormData(e.currentTarget).get("password")})});if(r.ok){reload();close()}else alert("Incorrect password")}}><h2>Admin Sign In</h2><p>Protected actions are server-verified.</p><input name="password" type="password" required placeholder="Admin password"/><button className="button">Sign in</button><button type="button" className="link" onClick={close}>Cancel</button></form></div>;
  if(type==="player"||type==="edit-player") {const p=type==="edit-player"?selected:null;return <div className="modal"><form onSubmit={e=>submit(e,p?"player.update":"player.create")}><h2>{p?"Edit Player":"New Player"}</h2>{p&&<input type="hidden" name="id" value={p.id}/>}<input name="name" required defaultValue={p?.name} placeholder="Full name"/><input name="ign" required defaultValue={p?.ign} placeholder="In-game name (IGN)"/><input name="points" type="number" defaultValue={p?.points||0} placeholder="Starting points"/><input name="image" type="url" defaultValue={p?.image||""} placeholder="Display picture URL (optional)"/><input name="bestPerformance" defaultValue={p?.bestPerformance||""} placeholder="Best performance"/><textarea name="notes" defaultValue={p?.notes||""} placeholder="Private/admin notes"/><button className="button">Save Player</button><button type="button" className="link" onClick={close}>Cancel</button></form></div>}
 if(type==="delete-player")return <div className="modal"><form onSubmit={e=>{e.preventDefault();api("player.delete",{id:selected.id})}}><h2>Delete {selected.ign}?</h2><p>This safely removes them from active rankings while keeping historical transactions intact.</p><button className="danger">Confirm deletion</button><button type="button" className="link" onClick={close}>Cancel</button></form></div>;
 if(type==="points")return <div className="modal"><form onSubmit={e=>submit(e,"points")}><h2>Award / Remove Points</h2><select name="playerId" required><option value="">Select player</option>{data.players.map((p:any)=><option value={p.id} key={p.id}>{p.name} / {p.ign}</option>)}</select><div className="quick">{[1,5,10,25,50,100].map(n=><button type="button" key={n} onClick={e=>{const input=(e.currentTarget.form!.elements.namedItem("amount") as HTMLInputElement);input.value=String(n)}}>+{n}</button>)}</div><input name="amount" required type="number" placeholder="Positive or negative amount"/><input name="reason" placeholder="Reason (optional)"/><button className="button">Save transaction</button><button type="button" className="link" onClick={close}>Cancel</button></form></div>;
 if(type==="category")return <div className="modal"><form onSubmit={e=>submit(e,"category.create")}><h2>Create Battle Category</h2><input name="name" required placeholder="Category name"/><textarea name="description" placeholder="Description"/><button className="button">Create Category</button><button type="button" className="link" onClick={close}>Cancel</button></form></div>;

if(type==="delete-category")return <div className="modal"><form onSubmit={e=>submit(e,"category.delete")}><h2>Delete Battle Category?</h2><p className="muted">This will permanently delete the current battle category and its battle records.</p><button className="button danger">Delete Category</button><button type="button" className="link" onClick={close}>Cancel</button></form></div>;
 if(type==="match")return <div className="modal"><form onSubmit={e=>submit(e,"match.create")}><h2>Record {selected.name} Battle</h2><input type="hidden" name="categoryId" value={selected.id}/><select name="winnerId" required><option value="">Winner</option>{data.players.map((p:any)=><option key={p.id} value={p.id}>{p.ign}</option>)}</select><select name="loserId" required><option value="">Loser</option>{data.players.map((p:any)=><option key={p.id} value={p.id}>{p.ign}</option>)}</select><input name="playedAt" type="date"/><textarea name="notes" placeholder="Match notes (optional)"/><button className="button">Record Battle</button><button type="button" className="link" onClick={close}>Cancel</button></form></div>;
  if(type==="edit-match"){const m=selected;return <div className="modal"><form onSubmit={e=>submit(e,"match.update")}><h2>Edit Battle</h2><input type="hidden" name="id" value={m.id}/><label>Battle category<select name="categoryId" required defaultValue={m.categoryId}>{data.categories.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Winner<select name="winnerId" required defaultValue={m.winnerId}><option value="">Select winner</option>{data.players.map((p:any)=><option key={p.id} value={p.id}>{p.ign}</option>)}</select></label><label>Loser<select name="loserId" required defaultValue={m.loserId}><option value="">Select loser</option>{data.players.map((p:any)=><option key={p.id} value={p.id}>{p.ign}</option>)}</select></label><label>Date played<input name="playedAt" type="date" required defaultValue={new Date(m.playedAt).toISOString().slice(0,10)}/></label><textarea name="notes" defaultValue={m.notes||""} placeholder="Match notes (optional)"/><button className="button">Save Battle</button><button type="button" className="link" onClick={close}>Cancel</button></form></div>}
  if(type==="delete-match")return <div className="modal"><form onSubmit={e=>{e.preventDefault();api("match.delete",{id:selected.id})}}><h2>Delete this battle?</h2><p>This removes the recorded match and rebuilds the category standings from the remaining match history.</p><button className="danger">Confirm deletion</button><button type="button" className="link" onClick={close}>Cancel</button></form></div>;
 if(type==="pokemon")return <div className="modal"><form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);api("pokemon.set",{categoryId:selected.id,playerId:f.get("playerId"),pokemon:[1,2,3,4,5,6].map(n=>f.get(`p${n}`))})}}><h2>Set Pokémon Roster</h2><select name="playerId" required><option value="">Select player</option>{data.players.map((p:any)=><option key={p.id} value={p.id}>{p.name} / {p.ign}</option>)}</select>{[1,2,3,4,5,6].map(n=><input key={n} name={`p${n}`} placeholder={`Pokémon ${n}`}/>)}<button className="button">Save Roster</button><button type="button" className="link" onClick={close}>Cancel</button></form></div>;
 return <div className="modal"><form onSubmit={async(e)=>{e.preventDefault();const file=(e.currentTarget.elements.namedItem("file") as HTMLInputElement).files?.[0];if(!file)return;const reader=new FileReader();reader.onload=()=>api("background.set",{value:reader.result});reader.readAsDataURL(file)}}><h2>Custom Background</h2><p>Upload a JPG, PNG, or WebP. A dark overlay is applied automatically.</p><input name="file" type="file" accept="image/*" required/><button className="button">Use Background</button><button type="button" className="link" onClick={close}>Cancel</button></form></div>;
}

