"use client";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
type Data={players:any[];categories:any[];history:any[];matches:any[];background:string|null;logo:string|null;isAdmin:boolean};
const empty:Data={players:[],categories:[],history:[],matches:[],background:null,logo:null,isAdmin:false};
const fmt=(value:string)=>new Date(value).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});
const initials=(player:any)=>String(player?.ign||player?.name||"?").replace(/[^a-z0-9]/gi,"").slice(0,2).toUpperCase()||"?";
function Avatar({player,className=""}:{player:any;className?:string}) {
 const [broken,setBroken]=useState(false);
 if(player?.image&&!broken) return <img className={`avatar ${className}`} src={player.image} alt={`${player.name||player.ign||"Player"} display picture`} onError={()=>setBroken(true)}/>;
 return <span className={`avatar avatar-fallback ${className}`} aria-label={`${player?.name||player?.ign||"Player"} initials`}>{initials(player)}</span>;
}

function PokemonPicker({
  name,
  options,
}: {
  name: string;
  options: string[];
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return options.slice(0, 30);
    return options
      .filter((pokemon) => pokemon.toLowerCase().includes(value))
      .slice(0, 30);
  }, [options, query]);

  return (
    <label className="pokemon-picker">
      <span>{name.replace("p", "Pokémon ")}</span>
      <input
        list={`${name}-options`}
        name={name}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search Pokémon..."
        autoComplete="off"
      />
      <datalist id={`${name}-options`}>
        {filtered.map((pokemon) => (
          <option key={pokemon} value={pokemon} />
        ))}
      </datalist>
    </label>
  );
}

function PokemonSprites({ pokemon, compact=false }: { pokemon: string[]; compact?: boolean }) {
  if (!pokemon?.length) return null;
  return (
    <div className={`pokemon-sprites${compact ? " compact" : ""}`}>
      {Array.from({ length: 6 }, (_, index) => {
        const name = pokemon[index];
        return (
          <span className="pokemon-slot" key={`${name || "empty"}-${index}`}>
            {name ? (
              <img
                src={`https://play.pokemonshowdown.com/sprites/xyani/${name.toLowerCase()}.gif`}
                alt={name}
                title={name}
                onError={(event) => {
                  event.currentTarget.style.visibility = "hidden";
                }}
              />
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

export default function LeaderboardApp(){
 const [data,setData]=useState<Data>(empty);
 const [view,setView]=useState("hall");
 const [query,setQuery]=useState("");
const [selectedPlayer,setSelectedPlayer]=useState<any>(null);
const [selectedCategory,setSelectedCategory]=useState<any>(null);
const [selectedMatch,setSelectedMatch]=useState<any>(null);
const [selectedTransaction,setSelectedTransaction]=useState<any>(null);
const [pokemonOptions,setPokemonOptions]=useState<string[]>([]);
const [modal,setModal]=useState<string|null>(null);;
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

useEffect(() => {
  void load();

  fetch("https://pokeapi.co/api/v2/pokemon?limit=2000")
    .then(response => response.json())
    .then(result => {
      const names = Array.isArray(result?.results)
        ? result.results.map((item: any) => item.name)
        : [];

      setPokemonOptions(names);
    })
    .catch(() => {
      setPokemonOptions([]);
    });
}, []);

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
   p=>(String(p.name||"")+String(p.ign||"")).toLowerCase().includes(query.toLowerCase())
  ),
  [data.players,query]
 );

 const stats={
  points:data.players[0]?.points||0,
  battles:data.matches.length
 };

 const background=data.background
  ?{
    backgroundImage:
     `linear-gradient(rgba(8,8,8,.9),rgba(8,8,8,.98)),url(${data.background})`
   }
  :{};

  const modalSelected =
    modal === "match" ||
    modal === "pokemon" ||
    modal === "delete-category" ||
    modal === "category-points"
      ? selectedCategory
      : modal === "edit-match" ||
        modal === "delete-match"
        ? selectedMatch
        : modal === "edit-points" ||
          modal === "delete-points"
          ? selectedTransaction
          : selectedPlayer;

 return (
  <main className="site" style={background}>
   <style>{`
    input[type="date"]::-webkit-calendar-picker-indicator {
      filter: invert(1) brightness(0.8);
      opacity: 0.9;
    }
    .site-logo {
      width: 42px;
      height: 42px;
      object-fit: contain;
      border-radius: 50%;
      display: block;
      flex: 0 0 42px;
    }
    .pokemon-sprites {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      width: 100%;
      max-width: 100%;
      gap: 6px;
      align-items: center;
      justify-items: center;
      margin-top: 10px;
      min-height: 62px;
      overflow: hidden;
    }
    .pokemon-slot {
      width: 56px;
      height: 56px;
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 0;
    }
    .pokemon-sprites img {
      width: 56px;
      height: 56px;
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      display: block;
    }
    .pokemon-sprites.compact {
      margin-top: 8px;
      min-height: 50px;
      gap: 4px;
    }
    .pokemon-sprites.compact .pokemon-slot,
    .pokemon-sprites.compact img {
      width: 48px;
      height: 48px;
    }
    .pokemon-editor-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .hall-pokemon-button {
      margin-top: 8px;
      align-self: center;
    }
    .place {
      min-width: 0;
      overflow: hidden;
    }
    .place-main {
      width: 100%;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 12px;
      background: transparent;
      border: 0;
      color: inherit;
      text-align: left;
      padding: 0;
      cursor: pointer;
    }
    .place-copy {
      min-width: 0;
    }
    .place .pokemon-sprites {
      width: 100%;
      max-width: 100%;
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }
    .place .pokemon-slot {
      width: 48px;
      height: 48px;
    }
    .place .pokemon-sprites img {
      width: 48px;
      height: 48px;
    }
    .modal {
      overflow: auto;
    }
    .modal > form {
      box-sizing: border-box;
      width: min(620px, calc(100vw - 32px));
      max-width: calc(100vw - 32px);
      max-height: calc(100vh - 32px);
      overflow-y: auto;
    }
    .modal input,
    .modal select,
    .modal textarea {
      box-sizing: border-box;
      max-width: 100%;
    }
    .profile-overlay {
      position: fixed;
      inset: 0;
      z-index: 9999;
      background: rgba(0,0,0,.42);
    }
    .champion-display {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .champion-display .avatar {
      width: 42px;
      height: 42px;
    }
   `}</style>

   <header>
    <button
     className="brand"
     onClick={()=>setView("hall")}
    >
     {data.logo ? (
      <img className="site-logo" src={data.logo} alt="Pallet Town Cafe logo" />
     ) : (
      <span>◉</span>
     )}

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
      <span className="champion-display">
       <Avatar player={data.players[0]} />
       <strong>{data.players[0]?.name || "—"}</strong>
      </span>
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

     <p>EXPLORE</p>      <button
        className={view === "hall" ? "active" : ""}
        onClick={() => setView("hall")}
      >
        Hall of Fame
      </button>

      {data.categories.map((c) => (
        <button
          key={c.id}
          className={
            view === "category" && selectedCategory?.id === c.id
              ? "active"
              : ""
          }
          onClick={() => {
            setSelectedCategory(c);
            setView("category");
          }}
        >
          BATTLE · {c.name}
        </button>
      ))}

      {data.isAdmin && (
        <button onClick={() => setModal("category")}>
          + Create Category
        </button>
      )}

      <div className="aside-rule" />

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
       selectTransaction={setSelectedTransaction}
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
  pokemonOptions={pokemonOptions}
  selectedPlayer={selectedPlayer}
  selectedCategory={selectedCategory}
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
function Hall({players,query,setQuery,choose,admin,open}:any){
  return (
    <>
      <div className="section-head">
        <div>
          <p className="eyebrow">PERMANENT STANDINGS</p>
          <h2>Lifetime Leaderboard</h2>
        </div>
        {admin&&<div>
          <button className="button ghost" onClick={()=>open("pokemon")}>Set Pokémon</button>
          <button className="button ghost" onClick={()=>open("points")}>Award Points</button>
          <button className="button" onClick={()=>open("match")}>Record Battle</button>
        </div>}
      </div>
      <label className="search">Search<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search by player name or IGN…"/></label>
      <div className="podium">
        {players.slice(0,3).map((p:any)=>(
          <article key={p.id} className={`place p${p.rank}`}>
            <button className="place-main" onClick={()=>choose(p)}>
              <Avatar player={p}/>
              <span className="place-copy">
                <i>#{p.rank}</i>
                <strong>{p.name}</strong>
                <small>{p.ign || "No IGN"}</small>
                <span>{p.points} pts</span>
              </span>
            </button>
            {p.hallPokemon?.length ? <PokemonSprites pokemon={p.hallPokemon} compact /> : null}
            {admin&&<button type="button" className="button ghost hall-pokemon-button" onClick={(event)=>{event.stopPropagation();choose(p);open("pokemon")}}>Set Pokémon</button>}
          </article>
        ))}
      </div>
      <div className="table">
        <div className="row labels"><span>RANK</span><span>PLAYER</span><span>STATUS</span><span>POINTS</span></div>
        {players.map((p:any)=><button className="row" key={p.id} onClick={()=>choose(p)}>
          <span className={`rank r${p.rank}`}>#{p.rank}</span>
          <span className="player-cell"><Avatar player={p}/><span><strong>{p.name}</strong><small>{p.ign || "No IGN"}</small></span></span>
          <span>{p.rank===1?<em className="champion">Champion</em>:p.rank<=3?<em>Top 3</em>:p.rank<=10?<em>Top 10</em>:<em className="regular">Competitive</em>}</span>
          <span className="points">{p.points.toLocaleString()}</span>
        </button>)}
      </div>
    </>
  );
}
function Players({players,query,setQuery,choose,admin,open}:any){return <><div className="section-head"><div><p className="eyebrow">ROSTER</p><h2>All Players</h2></div>{admin&&<button className="button" onClick={()=>open("player")}>New Player</button>}</div><label className="search">Search<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find a trainer…"/></label><div className="cards">{players.map(p=><button className="player-card" onClick={()=>choose(p)} key={p.id}><Avatar player={p}/><i>#{p.rank}</i><strong>{p.name}</strong><small>{p.ign}</small><b>{p.points} pts</b></button>)}</div></>}
function Battle({categories,choose,admin,open}:any){return <><div className="section-head"><div><p className="eyebrow">SEPARATE FROM LIFETIME POINTS</p><h2>Battle Leaderboards</h2></div>{admin&&<button className="button" onClick={()=>open("category")}>Create Category</button>}</div><div className="cards categories">{categories.map(c=><button className="category-card" onClick={()=>choose(c)} key={c.id}><i>BATTLE</i><strong>{c.name}</strong><small>{c.description||"A Pallet Town Cafe battle format"}</small><b>{c.records.length} competitors</b></button>)}</div>{!categories.length&&<p className="empty">No battle formats yet. An admin can create the first category.</p>}</>}
function Category({
  category,
  players,
  choose,
  admin,
  open,
}: any) {
  return (
    <>
      <div className="section-head">
        <div>
          <p className="eyebrow">INDEPENDENT W/L RANKING</p>
          <h2>{category.name}</h2>
          <p className="muted">{category.description}</p>
        </div>

        {admin && (
          <div>
            <button
              className="button ghost"
              onClick={() => open("pokemon")}
            >
              Set Pokémon
            </button>

            <button
              className="button ghost"
              onClick={() => open("category-points")}
            >
              Award Points
            </button>

            <button
              className="button"
              onClick={() => open("match")}
            >
              Record Battle
            </button>

            <button
              className="danger"
              onClick={() => open("delete-category")}
            >
              Delete Category
            </button>
          </div>
        )}
      </div>

      <div className="top-three">
        {category.records.slice(0, 3).map((r: any) => (
          <article key={r.id}>
            <Avatar player={r.player} />
            <b>
              #{r.rank} · {r.player?.name || "Unknown player"}
              <small>{r.player?.ign || "No IGN"}</small>
            </b>
            <strong>
              {r.wins}W – {r.losses}L{" "}
              <small>{r.winRate}% WR</small>
            </strong>
            <PokemonSprites pokemon={r.pokemon} />
          </article>
        ))}
      </div>

      <h3>Battle Record</h3>

      <div className="table">
        <div className="row labels">
          <span>RANK</span>
          <span>PLAYER</span>
          <span>RECORD</span>
          <span>CATEGORY POINTS</span>
          <span>WIN RATE</span>
        </div>

        {category.records.map((r: any) => (
          <button
            className="row"
            key={r.id}
            onClick={() => choose(r.player || r.playerId)}
          >
            <span className="rank">#{r.rank}</span>

            <span className="player-cell">
              <Avatar player={r.player} />
              <span>
                <strong>{r.player?.name || "Unknown player"}</strong>
                <small>{r.player?.ign || r.playerId}</small>
              </span>
            </span>

            <span>
              {r.wins}W / {r.losses}L
            </span>

            <span className="points">
              {r.categoryPoints} pts
            </span>

            <span className="points">
              {r.winRate}%
            </span>
          </button>
        ))}
      </div>

      <h3>Category Points</h3>

      {category.pointLeaderboard?.length ? (
        <div className="table">
          <div className="row labels">
            <span>RANK</span>
            <span>PLAYER</span>
            <span>POINTS</span>
          </div>

          {category.pointLeaderboard.map((entry: any) => (
            <button
              className="row"
              key={entry.playerId}
              onClick={() => choose(entry.player)}
            >
              <span className="rank">#{entry.rank}</span>

              <span className="player-cell">
                <Avatar player={entry.player} />
                <span>
                  <strong>{entry.player.name}</strong>
                  <small>{entry.player.ign}</small>
                </span>
              </span>

              <span className="points">
                {entry.points.toLocaleString()} pts
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="empty">
          No category points have been awarded yet.
        </p>
      )}
    </>
  );
}

function History({
  items,
  matches,
  admin,
  open,
  choose,
  selectTransaction,
}: any) {
  return (
    <>
      <div className="section-head">
        <div>
          <p className="eyebrow">PERMANENT RECORDS</p>
          <h2>Activity History</h2>
        </div>
      </div>

      <h3>Point Transactions</h3>

      <div className="timeline">
        {items.map((x: any) => (
          <article key={x.id}>
            <b className={x.amount > 0 ? "plus" : "minus"}>
              {x.amount > 0 ? "+" : ""}
              {x.amount} pts
            </b>

            <div>
              <strong>
                {x.player.name} <small>/{x.player.ign || "No IGN"}</small>
              </strong>
              <p>
                {x.reason || x.action}
                {x.category?.name ? ` · ${x.category.name}` : ""}
                {` · New total: ${x.newTotal}`}
              </p>
            </div>

            <time>{fmt(x.createdAt)}</time>

            {admin && (
              <div className="history-actions">
                <button
                  type="button"
                  className="link"
                  onClick={(event) => {
                    event.stopPropagation();
                    selectTransaction(x);
                    open("edit-points");
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="link danger-link"
                  onClick={(event) => {
                    event.stopPropagation();
                    selectTransaction(x);
                    open("delete-points");
                  }}
                >
                  Delete
                </button>
              </div>
            )}
          </article>
        ))}
      </div>

      <h3>Battle History</h3>

      <div className="timeline">
        {matches.map((m: any) => (
          <article key={m.id}>
            <b>BATTLE</b>

            <div>
              <strong>
                {m.winner?.name || m.winner?.ign || m.winnerId} defeated{" "}
                {m.loser?.name || m.loser?.ign || m.loserId}
              </strong>
              <p>
                {m.category?.name || m.categoryId}
                {m.notes ? ` · ${m.notes}` : ""}
              </p>
            </div>

            <time>{fmt(m.playedAt)}</time>

            {admin && (
              <div className="history-actions">
                <button
                  type="button"
                  className="link"
                  onClick={(event) => {
                    event.stopPropagation();
                    choose(m);
                    open("edit-match");
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="link danger-link"
                  onClick={(event) => {
                    event.stopPropagation();
                    choose(m);
                    open("delete-match");
                  }}
                >
                  Delete
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </>
  );
}

function Profile({player,categories,close,admin,open}:any){const records=categories.flatMap((c:any)=>c.records.filter((r:any)=>r.playerId===player.id).map((r:any)=>({...r,category:c.name})));return <div className="profile-overlay" onClick={close}><div className="drawer" onClick={e=>e.stopPropagation()}><button className="x" onClick={close}>×</button><div className="profile-heading"><Avatar player={player} className="avatar-large"/><div><p className="eyebrow">TRAINER PROFILE</p><h2>{player.name}</h2><p className="ign">{player.ign || "No IGN"}</p></div></div><div className="profile-score"><b>#{player.rank||"—"}<small>Overall rank</small></b><b>{player.points}<small>Lifetime points</small></b></div><p><strong>Best performance</strong><br/>{player.bestPerformance||"Not recorded yet"}</p><p className="notes">{player.notes}</p>{admin&&<div className="drawer-actions"><button className="button" onClick={()=>open("edit-player")}>Edit Player</button><button className="danger" onClick={()=>open("delete-player")}>Delete Player</button></div>}<h3>Battle Records</h3>{records.length?records.map((r:any)=><article className="record" key={r.id}><b>{r.category}</b><span>#{r.rank} · {r.wins}W / {r.losses}L</span></article>):<p className="muted">No category battles recorded.</p>}</div></div>}
function Backup({admin,onImport}:any){const [file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false);return <><div className="section-head"><div><p className="eyebrow">DATA PORTABILITY</p><h2>Backup & Restore</h2></div></div><div className="backup"><article><h3>Export Excel Backup</h3><p>Download the complete current leaderboard, history, battle records, and Pokémon lineups in one `.xlsx` workbook.</p><a className={`button ${!admin?"disabled":""}`} href={admin?"/api/export":undefined}>Export .xlsx</a></article><article><h3>Import Backup</h3><p>Restore players, battle categories, records, and Pokémon lineups. Existing players are matched by IGN.</p><input type="file" accept=".xlsx" onChange={e=>setFile(e.target.files?.[0]||null)}/><button className="button" disabled={!admin||!file||busy} onClick={async()=>{if(!confirm("Import this backup? Existing player points and category records may be updated."))return;setBusy(true);try{await onImport(file)}catch(e){alert(e instanceof Error?e.message:"Import failed")}finally{setBusy(false)}}}> {busy?"Importing…":"Confirm Import"}</button></article></div>{!admin&&<p className="empty">Sign in as an admin to access backups.</p>}</>}
function Modal({
 type,
 data,
 selected,
 close,
 api,
 reload,
 pokemonOptions,
 selectedPlayer,
 selectedCategory,
}:any){const [reason,setReason]=useState(""); const [pokemonTarget,setPokemonTarget]=useState(""); const [pokemonPlayerTarget,setPokemonPlayerTarget]=useState(""); const [matchCategoryTarget,setMatchCategoryTarget]=useState(""); useEffect(()=>{if(type==="pokemon"){setPokemonTarget(selectedCategory?.id||"hall");setPokemonPlayerTarget(selectedPlayer?.id||"");}if(type==="match"){setMatchCategoryTarget(selectedCategory?.id||"");}if(type==="points"||type==="category-points"){setReason("");}},[type,selectedCategory?.id,selectedPlayer?.id]); const submit=async(e:FormEvent<HTMLFormElement>,action:string)=>{e.preventDefault();const f=new FormData(e.currentTarget),p=Object.fromEntries(f);try{await api(action,p)}catch(err){alert(err instanceof Error?err.message:"Unable to save")}}; if(type==="login")return <div className="modal"><form onSubmit={async e=>{e.preventDefault();const r=await fetch("/api/admin/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:new FormData(e.currentTarget).get("password")})});if(r.ok){await reload();close()}else alert("Incorrect password")}}><h2>Admin Sign In</h2><p>Protected actions are server-verified.</p><input name="password" type="password" required placeholder="Admin password"/><button className="button">Sign in</button><button type="button" className="link" onClick={close}>Cancel</button></form></div>;
  if (type === "control") {
    return (
      <div className="modal">
        <div className="admin-panel">
          <h2>Admin Controls</h2>

          <h3>Custom Background</h3>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const input = event.currentTarget.elements.namedItem(
                "backgroundFile"
              ) as HTMLInputElement;
              const file = input.files?.[0];
              if (!file) return;

              const reader = new FileReader();
              reader.onload = () => {
                void api("background.set", { value: reader.result });
              };
              reader.readAsDataURL(file);
            }}
          >
            <p className="muted">
              Upload a JPG, PNG, or WebP. A dark overlay is applied automatically.
            </p>
            <input
              name="backgroundFile"
              type="file"
              accept="image/*"
              required
            />
            <button className="button">Use Background</button>
          </form>

          <h3>PTC Logo</h3>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const input = event.currentTarget.elements.namedItem(
                "logoFile"
              ) as HTMLInputElement;
              const file = input.files?.[0];
              if (!file) return;

              const reader = new FileReader();
              reader.onload = () => {
                void api("logo.set", { value: reader.result });
              };
              reader.readAsDataURL(file);
            }}
          >
            <p className="muted">
              Upload the logo shown in the top-left of the site.
            </p>
            <input
              name="logoFile"
              type="file"
              accept="image/*"
              required
            />
            <button className="button">Use PTC Logo</button>
          </form>

          <button type="button" className="link" onClick={close}>
            Close
          </button>
        </div>
      </div>
    );
  }

  if(type==="player"||type==="edit-player") {const p=type==="edit-player"?selected:null;return <div className="modal"><form onSubmit={e=>submit(e,p?"player.update":"player.create")}><h2>{p?"Edit Player":"New Player"}</h2>{p&&<input type="hidden" name="id" value={p.id}/>}<input name="name" required defaultValue={p?.name} placeholder="Full name"/><input name="ign" defaultValue={p?.ign||""} placeholder="In-game name (optional)"/><input name="points" type="number" defaultValue={p?.points||0} placeholder="Starting points"/><input name="image" type="url" defaultValue={p?.image||""} placeholder="Display picture URL (optional)"/><input name="bestPerformance" defaultValue={p?.bestPerformance||""} placeholder="Best performance"/><textarea name="notes" defaultValue={p?.notes||""} placeholder="Private/admin notes"/><button className="button">Save Player</button><button type="button" className="link" onClick={close}>Cancel</button></form></div>}
 if(type==="delete-player")return <div className="modal"><form onSubmit={e=>{e.preventDefault();api("player.delete",{id:selected.id})}}><h2>Delete {selected.ign}?</h2><p>This safely removes them from active rankings while keeping historical transactions intact.</p><button className="danger">Confirm deletion</button><button type="button" className="link" onClick={close}>Cancel</button></form></div>;
if (type === "category-points") {
    if (!selected) return null;

    return (
      <div className="modal">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);

            void api("category.points", {
              categoryId: selected.id,
              playerId: form.get("playerId"),
              amount: form.get("amount"),
              reason: form.get("reason"),
            });
          }}
        >
          <h2>Award {selected.name} Points</h2>

          <select name="playerId" required>
            <option value="">Select player</option>
            {data.players.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.name} / {p.ign}
              </option>
            ))}
          </select>

          <div className="quick">
            {[1, 5, 10, 25, 50, 100].map((n) => (
              <button
                type="button"
                key={n}
                onClick={(event) => {
                  const input =
                    event.currentTarget.form?.elements.namedItem("amount");

                  if (input instanceof HTMLInputElement) {
                    input.value = String(n);
                  }
                }}
              >
                +{n}
              </button>
            ))}
          </div>

          <input
            name="amount"
            required
            type="number"
            placeholder="Positive or negative amount"
          />

          <select
            value=""
            onChange={(event) => {
              if (event.target.value) setReason(event.target.value);
            }}
          >
            <option value="">Battle board preset (optional)</option>
            {data.categories.map((category: any) => (
              <option key={category.id} value={category.name}>
                {category.name}
              </option>
            ))}
          </select>

          <input
            name="reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Reason (optional)"
          />

          <p className="muted">
            These points count toward both {selected.name} and the player's
            Hall of Fame total.
          </p>

          <button className="button">Save category points</button>
          <button type="button" className="link" onClick={close}>
            Cancel
          </button>
        </form>
      </div>
    );
  }

  if (type === "points") {
    return (
      <div className="modal">
        <form onSubmit={(event) => submit(event, "points")}>
          <h2>Award / Remove Points</h2>

          <select name="playerId" required>
            <option value="">Select player</option>
            {data.players.map((p: any) => (
              <option value={p.id} key={p.id}>
                {p.name} / {p.ign}
              </option>
            ))}
          </select>

          <div className="quick">
            {[1, 5, 10, 25, 50, 100].map((n) => (
              <button
                type="button"
                key={n}
                onClick={(event) => {
                  const input =
                    event.currentTarget.form?.elements.namedItem("amount");

                  if (input instanceof HTMLInputElement) {
                    input.value = String(n);
                  }
                }}
              >
                +{n}
              </button>
            ))}
          </div>

          <input
            name="amount"
            required
            type="number"
            placeholder="Positive or negative amount"
          />

          <select
            value=""
            onChange={(event) => {
              if (event.target.value) setReason(event.target.value);
            }}
          >
            <option value="">Battle board preset (optional)</option>
            {data.categories.map((category: any) => (
              <option key={category.id} value={category.name}>
                {category.name}
              </option>
            ))}
          </select>

          <input
            name="reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Reason (optional)"
          />

          <button className="button">Save transaction</button>
          <button type="button" className="link" onClick={close}>
            Cancel
          </button>
        </form>
      </div>
    );
  }

  if (type === "edit-points") {
    if (!selected) return null;

    return (
      <div className="modal">
        <form onSubmit={(event) => submit(event, "points.update")}>
          <h2>Edit Point Transaction</h2>

          <input type="hidden" name="id" value={selected.id} />

          <label>
            Player
            <select
              name="playerId"
              required
              defaultValue={selected.playerId}
            >
              {data.players.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name} / {p.ign}
                </option>
              ))}
            </select>
          </label>

          {selected.category?.name && (
            <p className="muted">
              Category: {selected.category.name}
            </p>
          )}

          <input
            name="amount"
            required
            type="number"
            defaultValue={selected.amount}
          />

          <input
            name="reason"
            defaultValue={selected.reason || ""}
            placeholder="Reason (optional)"
          />

          <button className="button">Save transaction</button>
          <button type="button" className="link" onClick={close}>
            Cancel
          </button>
        </form>
      </div>
    );
  }

  if (type === "delete-points") {
    if (!selected) return null;

    return (
      <div className="modal">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void api("points.delete", { id: selected.id });
          }}
        >
          <h2>Delete Point Transaction?</h2>

          <p className="muted">
            This removes the transaction and rebuilds the player's total.
          </p>

          <button className="danger">Confirm deletion</button>
          <button type="button" className="link" onClick={close}>
            Cancel
          </button>
        </form>
      </div>
    );
  }

  if(type==="category")return <div className="modal"><form onSubmit={e=>submit(e,"category.create")}><h2>Create Battle Category</h2><input name="name" required placeholder="Category name"/><textarea name="description" placeholder="Description"/><button className="button">Create Category</button><button type="button" className="link" onClick={close}>Cancel</button></form></div>;

if(type==="delete-category")return <div className="modal"><form onSubmit={e=>{e.preventDefault();api("category.delete",{id:selected.id})}}><h2>Delete Battle Category?</h2><p className="muted">This will permanently delete the current battle category and its battle records.</p><button className="button danger">Delete Category</button><button type="button" className="link" onClick={close}>Cancel</button></form></div>;
 if(type==="match")return <div className="modal"><form onSubmit={e=>submit(e,"match.create")}><h2>Record Battle</h2><label>Battle board<select name="categoryId" required value={matchCategoryTarget} onChange={e=>setMatchCategoryTarget(e.target.value)}><option value="">Select battle board</option>{data.categories.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><select name="winnerId" required><option value="">Winner</option>{data.players.map((p:any)=><option key={p.id} value={p.id}>{p.name} / {p.ign || "No IGN"}</option>)}</select><select name="loserId" required><option value="">Loser</option>{data.players.map((p:any)=><option key={p.id} value={p.id}>{p.name} / {p.ign || "No IGN"}</option>)}</select><input name="playedAt" type="date"/><textarea name="notes" placeholder="Match notes (optional)"/><button className="button">Record Battle</button><button type="button" className="link" onClick={close}>Cancel</button></form></div>;
  if(type==="edit-match"){const m=selected;return <div className="modal"><form onSubmit={e=>submit(e,"match.update")}><h2>Edit Battle</h2><input type="hidden" name="id" value={m.id}/><label>Battle category<select name="categoryId" required defaultValue={m.categoryId}>{data.categories.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Winner<select name="winnerId" required defaultValue={m.winnerId}><option value="">Select winner</option>{data.players.map((p:any)=><option key={p.id} value={p.id}>{p.name} / {p.ign || "No IGN"}</option>)}</select></label><label>Loser<select name="loserId" required defaultValue={m.loserId}><option value="">Select loser</option>{data.players.map((p:any)=><option key={p.id} value={p.id}>{p.name} / {p.ign || "No IGN"}</option>)}</select></label><label>Date played<input name="playedAt" type="date" required defaultValue={new Date(m.playedAt).toISOString().slice(0,10)}/></label><textarea name="notes" defaultValue={m.notes||""} placeholder="Match notes (optional)"/><button className="button">Save Battle</button><button type="button" className="link" onClick={close}>Cancel</button></form></div>}
  if(type==="delete-match")return <div className="modal"><form onSubmit={e=>{e.preventDefault();api("match.delete",{id:selected.id})}}><h2>Delete this battle?</h2><p>This removes the recorded match and rebuilds the category standings from the remaining match history.</p><button className="danger">Confirm deletion</button><button type="button" className="link" onClick={close}>Cancel</button></form></div>;
 if (type === "pokemon") {
    return (
      <div className="modal">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const boardId = String(form.get("boardId") || "");
            const playerId = String(form.get("playerId") || "");
            const pokemon = [1, 2, 3, 4, 5, 6].map((n) => form.get(`p${n}`));
            void api("pokemon.set", { boardId, playerId, pokemon });
          }}
        >
          <h2>Set Pokémon Roster</h2>
          <label>
            Board
            <select name="boardId" required value={pokemonTarget} onChange={event=>setPokemonTarget(event.target.value)}>
              <option value="">Select board</option>
              <option value="hall">Hall of Fame</option>
              {data.categories.map((category:any)=><option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label>
            Player
            <select name="playerId" required value={pokemonPlayerTarget} onChange={event=>setPokemonPlayerTarget(event.target.value)}>
              <option value="">Select player</option>
              {data.players.map((p:any)=><option key={p.id} value={p.id}>{p.name} / {p.ign || "No IGN"}</option>)}
            </select>
          </label>
          <div className="pokemon-editor-grid">
            {[1,2,3,4,5,6].map(n=><PokemonPicker key={n} name={`p${n}`} options={pokemonOptions}/>)}
          </div>
          <p className="muted">Choose Hall of Fame for the player's permanent Hall roster, or choose a battle board for that board's roster.</p>
          <button className="button">Save Roster</button>
          <button type="button" className="link" onClick={close}>Cancel</button>
        </form>
      </div>
    );
  }
 return <div className="modal"><form onSubmit={async(e)=>{e.preventDefault();const file=(e.currentTarget.elements.namedItem("file") as HTMLInputElement).files?.[0];if(!file)return;const reader=new FileReader();reader.onload=()=>api("background.set",{value:reader.result});reader.readAsDataURL(file)}}><h2>Custom Background</h2><p>Upload a JPG, PNG, or WebP. A dark overlay is applied automatically.</p><input name="file" type="file" accept="image/*" required/><button className="button">Use Background</button><button type="button" className="link" onClick={close}>Cancel</button></form></div>;
}

