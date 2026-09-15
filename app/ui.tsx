"use client";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
type HighScore={score:number;name:string;note:string;createdAt:string};
type Data={players:any[];categories:any[];history:any[];matches:any[];background:string|null;logo:string|null;isAdmin:boolean;pokeCompareHighScores:HighScore[];pokeCompareArt:string|null;pokeCompareHideDetails:boolean};
const empty:Data={players:[],categories:[],history:[],matches:[],background:null,logo:null,isAdmin:false,pokeCompareHighScores:[],pokeCompareArt:null,pokeCompareHideDetails:false};
const fmt=(value:string)=>new Date(value).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});
const initials=(player:any)=>String(player?.ign||player?.name||"?").replace(/[^a-z0-9]/gi,"").slice(0,2).toUpperCase()||"?";
function Avatar({player,className=""}:{player:any;className?:string}) {
 const [broken,setBroken]=useState(false);
 if(player?.image&&!broken) return <img className={`avatar ${className}`} src={player.image} alt={`${player.name||player.ign||"Player"} display picture`} style={{border:"0",outline:"none",boxShadow:"none",borderRadius:"50%",objectFit:"cover"}} onError={()=>setBroken(true)}/>;
 return <span className={`avatar avatar-fallback ${className}`} aria-label={`${player?.name||player?.ign||"Player"} initials`}>{initials(player)}</span>;
}

function parsePokemonValue(value:string) {
  const raw=String(value||"");
  const shiny=raw.endsWith("|shiny");
  return {
    name:shiny?raw.slice(0,-6):raw,
    shiny,
  };
}

function showdownNames(value:string) {
  const raw=parsePokemonValue(value).name.trim().toLowerCase();
  if(!raw)return [];

  const base=raw
    .replace(/[’']/g,"")
    .replace(/\s+/g,"-")
    .replace(/-+/g,"-");

  const names=[base];
  const add=(name:string)=>{if(name&&!names.includes(name))names.push(name)};

  if(base.endsWith("-mega-x"))add(base.replace(/-mega-x$/,"-megax"));
  if(base.endsWith("-mega-y"))add(base.replace(/-mega-y$/,"-megay"));
  if(base.endsWith("-mega"))add(base.replace(/-mega$/,"-mega"));
  if(base.endsWith("-male"))add(base.replace(/-male$/,"-m"));
  if(base.endsWith("-female"))add(base.replace(/-female$/,"-f"));

  const aliases:Record<string,string>={
    "meowstic-male":"meowstic-m",
    "meowstic-female":"meowstic-f",
    "indeedee-male":"indeedee",
    "indeedee-female":"indeedee-f",
    "basculegion-male":"basculegion",
    "basculegion-female":"basculegion-f",
    "urshifu-single-strike":"urshifu",
    "urshifu-rapid-strike":"urshifu-rapidstrike",
    "keldeo-ordinary":"keldeo",
    "keldeo-resolute":"keldeo-resolute",
    "mimikyu-disguised":"mimikyu",
    "mimikyu-busted":"mimikyu-busted",
    "eiscue-ice":"eiscue",
    "eiscue-noice":"eiscue-noice",
    "darmanitan-standard":"darmanitan",
    "darmanitan-galar-standard":"darmanitan-galar",
    "darmanitan-galar-zen":"darmanitan-galar-zen",
    "gimmighoul-chest":"gimmighoul",
    "gimmighoul-roaming":"gimmighoul-roaming",
    "ogerpon-teal-mask":"ogerpon",
    "ogerpon-wellspring-mask":"ogerpon-wellspring",
    "ogerpon-hearthflame-mask":"ogerpon-hearthflame",
    "ogerpon-cornerstone-mask":"ogerpon-cornerstone",
  };
  if(aliases[base])add(aliases[base]);

  return names;
}

function pokemonSpriteUrl(value:string, shiny:boolean, candidate=0) {
  const names=showdownNames(value);
  const name=names[candidate]||names[0]||"";
  if(!name)return "";
  return `https://play.pokemonshowdown.com/sprites/${shiny?"ani-shiny":"ani"}/${name}.gif`;
}

function PokemonPicker({
  name,
  options,
  initialValue = "",
}: {
  name: string;
  options: string[];
  initialValue?: string;
}) {
  const initial=parsePokemonValue(initialValue);
  const [query,setQuery]=useState(initial.name);
  const [shiny,setShiny]=useState(initial.shiny);

  useEffect(()=>{
    const next=parsePokemonValue(initialValue);
    setQuery(next.name);
    setShiny(next.shiny);
  },[initialValue]);

  const filtered=useMemo(()=>{
    const value=query.trim().toLowerCase();
    if(!value)return options.slice(0,30);
    return options.filter(pokemon=>pokemon.toLowerCase().includes(value)).slice(0,30);
  },[options,query]);

  const storedValue=query.trim()?`${query.trim()}${shiny?"|shiny":""}`:"";

  return (
    <label className="pokemon-picker">
      <span>{name.replace("p","Pokémon ")}</span>
      <input
        list={`${name}-options`}
        value={query}
        onChange={event=>setQuery(event.target.value)}
        placeholder="Search Pokémon..."
        autoComplete="off"
      />
      <input type="hidden" name={name} value={storedValue}/>
      <datalist id={`${name}-options`}>
        {filtered.map(pokemon=><option key={pokemon} value={pokemon}/>)}
      </datalist>
      <div className="pokemon-variant-toggle">
        <button
          type="button"
          className={`variant-button${!shiny?" active":""}`}
          onClick={()=>setShiny(false)}
        >
          Normal
        </button>
        <button
          type="button"
          className={`variant-button${shiny?" active":""}`}
          onClick={()=>setShiny(true)}
        >
          Shiny
        </button>
      </div>
      {query.trim() ? (
        <div className="pokemon-picker-preview">
          <img
            src={pokemonSpriteUrl(query,shiny)}
            alt={`${query}${shiny?" shiny":""}`}
            onError={event=>{
              const current=Number(event.currentTarget.dataset.candidate||"0");
              const next=current+1;
              const urls=showdownNames(query);
              if(next<urls.length){
                event.currentTarget.dataset.candidate=String(next);
                event.currentTarget.src=pokemonSpriteUrl(query,shiny,next);
              } else {
                event.currentTarget.style.visibility="hidden";
              }
            }}
          />
        </div>
      ) : null}
    </label>
  );
}

function PokemonSprites({ pokemon, compact=false }: { pokemon: string[]; compact?: boolean }) {
  if(!pokemon?.length)return null;
  return (
    <div className={`pokemon-sprites${compact ? " compact" : ""}`}>
      {Array.from({length:6},(_,index)=>{
        const value=pokemon[index];
        const parsed=parsePokemonValue(value||"");
        return (
          <span className="pokemon-slot" key={`${value||"empty"}-${index}`}>
            {parsed.name ? (
              <img
                src={pokemonSpriteUrl(value,parsed.shiny)}
                alt={`${parsed.name}${parsed.shiny?" shiny":""}`}
                title={`${parsed.name}${parsed.shiny?" (Shiny)":""}`}
                onError={event=>{
                  const current=Number(event.currentTarget.dataset.candidate||"0");
                  const next=current+1;
                  const urls=showdownNames(value);
                  if(next<urls.length){
                    event.currentTarget.dataset.candidate=String(next);
                    event.currentTarget.src=pokemonSpriteUrl(value,parsed.shiny,next);
                  } else {
                    event.currentTarget.style.visibility="hidden";
                  }
                }}
              />
            ) : null}
          </span>
        );
      })}
    </div>
  );
}


type GamePokemon = {
  id:number;
  name:string;
  height:number;
  weight:number;
  stats:Record<string,number>;
  sprite:string;
  types:string[];
};

const HIGHER_LOWER_METRICS = [
  {key:"hp", label:"HP"},
  {key:"attack", label:"Attack"},
  {key:"defense", label:"Defense"},
  {key:"special-attack", label:"Sp. Attack"},
  {key:"special-defense", label:"Sp. Defense"},
  {key:"speed", label:"Speed"},
  {key:"height", label:"Height"},
  {key:"weight", label:"Weight"},
  {key:"bst", label:"Base Stat Total"},
] as const;

function gameDisplayName(name:string){
  return String(name||"").split("-").map(part=>part.charAt(0).toUpperCase()+part.slice(1)).join(" ");
}

function HigherLowerGame({highScores,onScoresChange,art,isAdmin,hideHighScoreDetails}:{highScores:HighScore[];onScoresChange:(scores:HighScore[])=>void;art:string|null;isAdmin:boolean;hideHighScoreDetails:boolean}){
  const [current,setCurrent]=useState<GamePokemon|null>(null);
  const [next,setNext]=useState<GamePokemon|null>(null);
  const [metric,setMetric]=useState<(typeof HIGHER_LOWER_METRICS)[number]>(HIGHER_LOWER_METRICS[0]);
  const [score,setScore]=useState(0);
  const [best,setBest]=useState(0);
  const [started,setStarted]=useState(false);
  const [revealed,setRevealed]=useState(false);
  const [correct,setCorrect]=useState<boolean|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [gameOver,setGameOver]=useState(false);
  const [qualifies,setQualifies]=useState(false);
  const [submitted,setSubmitted]=useState(false);
  const [playerName,setPlayerName]=useState("");
  const [playerNote,setPlayerNote]=useState("");
  const [submitting,setSubmitting]=useState(false);
  const [timeLeft,setTimeLeft]=useState(10);
  const [editingHighScore,setEditingHighScore]=useState<number|null>(null);
  const [editName,setEditName]=useState("");
  const [editNote,setEditNote]=useState("");

  useEffect(()=>{
    const saved=Number(window.localStorage.getItem("ptc-pokecompare-best")||0);
    if(Number.isFinite(saved))setBest(saved);
  },[]);

  const finishForTimeout=()=>{
    if(!current||!next||revealed||gameOver)return;
    setRevealed(true);setCorrect(false);setGameOver(true);
    const qualifiesNow=highScores.length<10 || score>Number(highScores[highScores.length-1]?.score||0);
    setQualifies(score>0 && qualifiesNow);
  };

  useEffect(()=>{
    if(!started||loading||revealed||gameOver)return;
    const timer=window.setInterval(()=>{
      setTimeLeft(value=>{
        if(value<=1){
          window.clearInterval(timer);
          finishForTimeout();
          return 0;
        }
        return value-1;
      });
    },1000);
    return ()=>window.clearInterval(timer);
  },[started,loading,revealed,gameOver,current,next,score,highScores.length]);

  const fetchRound=async(currentId?:number)=>{
    const query=currentId?`?currentId=${currentId}`:"";
    const response=await fetch(`/api/pokecompare/round${query}`,{cache:"no-store"});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||"Could not load Pokémon.");
    return result as {current:GamePokemon;next:GamePokemon;metric:(typeof HIGHER_LOWER_METRICS)[number]};
  };

  const valueFor=(pokemon:GamePokemon,key:string)=>key==="height"?pokemon.height:key==="weight"?pokemon.weight:pokemon.stats[key]||0;
  const formatValue=(pokemon:GamePokemon,key:string)=>{
    const value=valueFor(pokemon,key);
    if(key==="height")return `${(value/10).toFixed(1)} m`;
    if(key==="weight")return `${(value/10).toFixed(1)} kg`;
    return value.toLocaleString();
  };

  const loadRound=async(first?:GamePokemon)=>{
    setLoading(true);setError("");setRevealed(false);setCorrect(null);setGameOver(false);setSubmitted(false);setTimeLeft(10);
    try{
      const round=await fetchRound(first?.id);
      setCurrent(round.current);setNext(round.next);setMetric(round.metric);
    }catch(err){
      setError(err instanceof Error?err.message:"Could not load the Pokémon. Try again.");
    }finally{setLoading(false);}
  };

  const start=async()=>{
    setScore(0);setStarted(true);setGameOver(false);setQualifies(false);setPlayerName("");setPlayerNote("");await loadRound();
  };

  const guess=(direction:"higher"|"lower")=>{
    if(!current||!next||revealed||loading)return;
    const currentValue=valueFor(current,metric.key);
    const nextValue=valueFor(next,metric.key);
    const isCorrect=direction==="higher"?nextValue>currentValue:nextValue<currentValue;
    setRevealed(true);setCorrect(isCorrect);
    if(isCorrect){
      const newScore=score+1;
      setScore(newScore);
      if(newScore>best){setBest(newScore);window.localStorage.setItem("ptc-pokecompare-best",String(newScore));}
    } else {
      setGameOver(true);
      const qualifiesNow=highScores.length<10 || score>Number(highScores[highScores.length-1]?.score||0);
      setQualifies(score>0 && qualifiesNow);
    }
  };


  const continueGame=async()=>{
    if(!current||!next)return;
    if(correct){await loadRound(next);return;}
    goHome();
  };

  const goHome=()=>{
    setScore(0);
    setStarted(false);
    setCurrent(null);
    setNext(null);
    setRevealed(false);
    setCorrect(null);
    setGameOver(false);
    setQualifies(false);
    setSubmitted(false);
    setPlayerName("");
    setPlayerNote("");
    setError("");
    setTimeLeft(10);
  };

  const loadState=async()=>{
    setScore(0);setStarted(true);setGameOver(false);setQualifies(false);setSubmitted(false);setPlayerName("");setPlayerNote("");
    await loadRound();
  };

  const submitHighScore=async(event:FormEvent)=>{
    event.preventDefault();
    if(!playerName.trim()||score<1||submitting)return;
    setSubmitting(true);setError("");
    try{
      const response=await fetch("/api/pokecompare/score",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({score,name:playerName,note:playerNote}),
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||"Could not save high score.");
      onScoresChange(Array.isArray(result.scores)?result.scores:highScores);
      setSubmitted(true);
    }catch(err){
      setError(err instanceof Error?err.message:"Could not save high score.");
    }finally{setSubmitting(false);}
  };

  const beginEditHighScore=(index:number,entry:HighScore)=>{
    setEditingHighScore(index);
    setEditName(entry.name);
    setEditNote(entry.note);
    setError("");
  };

  const saveEditedHighScore=async()=>{
    if(editingHighScore===null)return;
    try{
      const response=await fetch("/api/admin/pokecompare-highscores",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"edit",index:editingHighScore,name:editName,note:editNote}),
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||"Could not edit high score.");
      onScoresChange(Array.isArray(result.scores)?result.scores:highScores);
      setEditingHighScore(null);
    }catch(err){setError(err instanceof Error?err.message:"Could not edit high score.");}
  };

  const removeHighScore=async()=>{
    if(editingHighScore===null)return;
    if(!window.confirm("Remove this high score?"))return;
    try{
      const response=await fetch("/api/admin/pokecompare-highscores",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"remove",index:editingHighScore}),
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||"Could not remove high score.");
      onScoresChange(Array.isArray(result.scores)?result.scores:highScores);
      setEditingHighScore(null);
    }catch(err){setError(err instanceof Error?err.message:"Could not remove high score.");}
  };

  return (
    <div className="pokecompare-page">
      <div className="pokecompare-main">
        <div className="pokecompare-titlebar">
          <div>
            <p className="eyebrow">ARCADE MINI GAME</p>
            <h2>PokéCompare</h2>
            <p className="pokecompare-sub">Guess higher or lower. Keep the streak alive.</p>
          </div>
          <div className="arcade-score">
            <span>STREAK <b>{score}</b></span>
            <span>BEST <b>{best}</b></span>
          </div>
        </div>

        {!started ? (
          <article className="pokecompare-start">
            <div className="arcade-badge">PC</div>
            <p className="arcade-kicker">CAN YOU BEAT THE BOARD?</p>
            <h3>PokéCompare</h3>
            <p>Compare two Pokémon using a randomly selected stat. Pick higher or lower and build the longest streak you can.</p>
            <div className="arcade-metrics">
              {HIGHER_LOWER_METRICS.map(metricOption=><span key={metricOption.key}>{metricOption.label}</span>)}
            </div>
            <button className="button arcade-start" onClick={()=>void start()}>START GAME</button>
          </article>
        ) : (
          <>
            <div className={`pokecompare-timer${timeLeft<=3?" urgent":""}`}>
              TIME <b>{timeLeft}</b>
            </div>

            <div className="game-question">
              <span>WILL THE NEXT POKÉMON HAVE</span>
              <strong>{metric.label.toUpperCase()}</strong>
              <span>{next&&current?`HIGHER OR LOWER THAN ${gameDisplayName(current.name).toUpperCase()}?`:""}</span>
            </div>

            <div className="higher-lower-board">
              <article className="game-pokemon current-pokemon">
                <span className="game-card-label">CURRENT</span>
                {current?.sprite&&<img src={current.sprite} alt={gameDisplayName(current.name)}/>} 
                <h3>{gameDisplayName(current?.name||"")}</h3>
                <div className="game-types">{current?.types.map(type=><span key={type}>{type}</span>)}</div>
                <b>{current&&formatValue(current,metric.key)}</b>
              </article>

              <div className="game-vs">VS</div>

              <article className={`game-pokemon next-pokemon${revealed?(correct?" correct":" wrong"):""}`}>
                <span className="game-card-label">NEXT</span>
                {next ? (
                  <>
                    {next.sprite&&<img src={next.sprite} alt={gameDisplayName(next.name)}/>} 
                    <h3>{gameDisplayName(next.name)}</h3>
                    <div className="game-types">{next.types.map(type=><span key={type}>{type}</span>)}</div>
                    <b>{revealed ? formatValue(next,metric.key) : "?"}</b>
                  </>
                ) : (
                  <div className="game-hidden-pokemon">?</div>
                )}
              </article>
            </div>

            {!revealed ? (
              <div className="game-choices">
                <button className="higher-choice" onClick={()=>guess("higher")} disabled={loading}>▲ HIGHER</button>
                <button className="lower-choice" onClick={()=>guess("lower")} disabled={loading}>▼ LOWER</button>
              </div>
            ) : gameOver ? (
              <div className="game-over-panel">
                <div>
                  <span className="game-over-label">GAME OVER</span>
                  <strong>{score} <small>STREAK</small></strong>
                </div>
                {qualifies&&!submitted ? (
                  <form className="highscore-entry" onSubmit={submitHighScore}>
                    <p>NEW HIGH SCORE — ENTER YOUR NAME</p>
                    <div className="highscore-fields">
                      <input value={playerName} onChange={event=>setPlayerName(event.target.value.slice(0,16))} maxLength={16} required placeholder="Name / initials" />
                      <input value={playerNote} onChange={event=>setPlayerNote(event.target.value.slice(0,24))} maxLength={24} placeholder="Message (optional)" />
                    </div>
                    <button className="button" disabled={submitting}>{submitting?"SAVING…":"SAVE SCORE"}</button>
                  </form>
                ) : submitted ? (
                  <p className="highscore-saved">SCORE ENTERED — CHECK THE HIGH SCORE BOARD</p>
                ) : null}
                <button className="button arcade-again" onClick={()=>void start()}>PLAY AGAIN</button>
              </div>
            ) : (
              <div className={`game-result ${correct?"is-correct":"is-wrong"}`}>
                <strong>{correct?"CORRECT!":"WRONG!"}</strong>
                <span>{gameDisplayName(next?.name||"")} has {next&&formatValue(next,metric.key)} {metric.label.toLowerCase()}.</span>
                {correct ? (
                    <button className="button arcade-next" onClick={()=>void continueGame()}>NEXT ROUND</button>
                  ) : (
                    <button className="button" onClick={()=>void continueGame()}>PLAY AGAIN</button>
                  )}
              </div>
            )}
            {error&&<p className="game-error">{error}</p>}
            <div className="pokecompare-bottom-actions">
              <button type="button" className="pokecompare-load-state" onClick={()=>void loadState()} disabled={loading}>LOAD STATE</button>
              <button type="button" className="pokecompare-home" onClick={goHome}>HOME</button>
            </div>
          </>
        )}
      </div>

      <aside className="pokecompare-highscores">
        <div className="highscore-marquee">HIGH SCORES</div>
        <div className="highscore-subtitle">TOP 10 · POKÉCOMPARE</div>
        <div className="highscore-list">
          {Array.from({length:10},(_,index)=>{
            const entry=highScores[index];
            return (
              <div className={`highscore-row${entry?" filled":" empty"}`} key={entry?`${entry.createdAt}-${index}`:`empty-${index}`}>
                <span className="highscore-rank">{String(index+1).padStart(2,"0")}</span>
                <span className="highscore-player">
                  {hideHighScoreDetails ? <strong>—</strong> : <>
                    <strong>{entry?.name||"—"}</strong>
                    <small>{entry?.note||""}</small>
                  </>}
                </span>
                <b>{entry?entry.score:"-"}</b>
                {isAdmin&&entry&&<button type="button" className="highscore-edit" onClick={()=>beginEditHighScore(index,entry)}>EDIT</button>}
              </div>
            );
          })}
        </div>
        {isAdmin&&editingHighScore!==null&&highScores[editingHighScore]&&<div className="highscore-edit-panel">
          <p>EDIT SCORE #{String(editingHighScore+1).padStart(2,"0")} · POINTS LOCKED</p>
          <input value={editName} maxLength={16} onChange={event=>setEditName(event.target.value.slice(0,16))} placeholder="Name / initials" />
          <input value={editNote} maxLength={24} onChange={event=>setEditNote(event.target.value.slice(0,24))} placeholder="Message" />
          <div><button type="button" className="button" onClick={()=>void saveEditedHighScore()}>SAVE</button><button type="button" className="danger" onClick={()=>void removeHighScore()}>REMOVE</button><button type="button" className="link" onClick={()=>setEditingHighScore(null)}>CANCEL</button></div>
        </div>}
        <div className="highscore-footer">INSERT COINS · BEAT YOUR SCORE</div>
        <div className={`highscore-art${art?" has-image":""}`} aria-label={art?"PokéCompare arcade artwork":"PokéCompare artwork area"} style={art?{backgroundImage:`url(${art})`}:undefined} />
      </aside>
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

 const champion=data.players[0] || null;
 const stats={
  points:Number(champion?.points||0),
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
    modal === "category-points" ||
    modal === "edit-category" ||
    modal === "duplicate-category"
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
    .pokemon-variant-toggle {
      display: flex;
      gap: 6px;
      margin-top: 6px;
    }
    .variant-button {
      border: 1px solid rgba(215,177,83,.35);
      background: rgba(255,255,255,.04);
      color: inherit;
      border-radius: 7px;
      padding: 5px 9px;
      cursor: pointer;
      font-size: .78rem;
    }
    .variant-button.active {
      background: rgba(215,177,83,.18);
      border-color: rgba(215,177,83,.75);
    }
    .pokemon-picker-preview {
      height: 54px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: 4px;
      overflow: hidden;
    }
    .pokemon-picker-preview img {
      width: 54px;
      height: 54px;
      object-fit: contain;
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
    /* Keep Hall of Fame podium cards visually identical to the battle-board cards:
       player info on top, then a clean 3x2 Pokémon grid underneath. */
    .place {
      min-width: 0;
      min-height: 245px;
      overflow: hidden;
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-rows: auto auto auto;
      align-content: start;
      gap: 8px 10px;
      padding: 18px !important;
      box-sizing: border-box;
    }
    .place-main {
      width: 100%;
      min-width: 0;
      grid-column: 1;
      grid-row: 1;
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
      overflow: hidden;
    }
    .place-copy strong,
    .place-copy small,
    .place-copy > span {
      display: block;
    }
    .place .pokemon-sprites {
      grid-column: 1 / -1;
      grid-row: 2;
      width: 100%;
      max-width: 100%;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      grid-template-rows: repeat(2, 64px);
      gap: 4px 8px;
      margin-top: 6px;
      min-height: 132px;
      overflow: hidden;
    }
    .place .pokemon-slot,
    .place .pokemon-sprites img {
      width: 64px;
      height: 64px;
    }
    .hall-pokemon-button {
      grid-column: 2;
      grid-row: 1;
      align-self: center;
      white-space: nowrap;
      margin-top: 0 !important;
    }
    .top-three {
      align-items: stretch;
    }
    .top-three article {
      min-width: 0;
      min-height: 245px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      overflow: hidden;
    }
    .top-three article .pokemon-sprites {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      grid-template-rows: repeat(2, 64px);
      width: 100%;
      min-height: 132px;
      margin-top: auto;
      gap: 4px 8px;
    }
    .top-three article .pokemon-slot,
    .top-three article .pokemon-sprites img {
      width: 64px;
      height: 64px;
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
    .place .avatar,
    .top-three article .avatar {
      width: 56px;
      height: 56px;
      border: 0 !important;
      box-shadow: none !important;
    }
    .place .avatar-fallback,
    .top-three article .avatar-fallback {
      border: 1px solid rgba(215, 177, 83, .45) !important;
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
      ["games","Mini Games"],
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
        :view==="games"
         ?"Mini Games"
         :"Pallet Town Cafe"}
     </h1>

     <p className="sub">
      Where every battle, victory, and point counts.
     </p>
    </div>


    <div className="hero-stats">

     <b className="hero-stat champion-stat">
      <span className="champion-display">
       <Avatar player={champion} />
       <strong>{champion?.name || "—"}</strong>
      </span>
      <small>Current Champion</small>
     </b>

     <b className="hero-stat">
      {stats.points.toLocaleString()}
      <small>Champion Points</small>
     </b>

     <b className="hero-stat">
      {stats.battles}
      <small>Total Battles</small>
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

      <button
        className={view === "games" ? "active" : ""}
        onClick={() => setView("games")}
      >
        MINI GAME · Higher or Lower
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


     {view==="games"&&<HigherLowerGame highScores={data.pokeCompareHighScores} art={data.pokeCompareArt} isAdmin={data.isAdmin} hideHighScoreDetails={data.pokeCompareHideDetails} onScoresChange={scores=>setData(current=>({...current,pokeCompareHighScores:scores}))}/>}


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
       setSelectedCategory={setSelectedCategory}
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
            {p.hallPokemon?.length ? <PokemonSprites pokemon={p.hallPokemon} /> : null}
            {admin&&<button type="button" className="button ghost hall-pokemon-button" onClick={(event)=>{event.stopPropagation();choose(p);open("pokemon")}}>Set Pokémon</button>}
          </article>
        ))}
      </div>
      <div className="table lifetime-table">
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
function Players({players,query,setQuery,choose,admin,open}:any){
  return <>
    <div className="section-head">
      <div><p className="eyebrow">ROSTER</p><h2>All Players</h2></div>
      {admin&&<button className="button" onClick={()=>open("player")}>New Player</button>}
    </div>
    <label className="search">Search<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find a trainer…"/></label>
    <div className="cards players-grid">
      {players.map((p:any)=><button className="player-card" onClick={()=>choose(p)} key={p.id}>
        <span className="player-card-info">
          <strong>{p.name}</strong>
          <small>{p.ign || "No IGN"}</small>
          <b>{p.points} pts</b>
        </span>
        <span className="player-card-avatar"><Avatar player={p}/></span>
        {p.hallPokemon?.length ? <span className="player-card-pokemon"><PokemonSprites pokemon={p.hallPokemon} compact/></span> : null}
      </button>)}
    </div>
  </>;
}
function Battle({categories,choose,admin,open}:any){return <><div className="section-head"><div><p className="eyebrow">SEPARATE FROM LIFETIME POINTS</p><h2>Battle Leaderboards</h2></div>{admin&&<button className="button" onClick={()=>open("category")}>Create Category</button>}</div><div className="cards categories">{categories.map(c=><button className="category-card" onClick={()=>choose(c)} key={c.id}><i>BATTLE</i><strong>{c.name}</strong><small>{c.description||"A Pallet Town Cafe battle format"}</small><b>{c.records.length} competitors</b></button>)}</div>{!categories.length&&<p className="empty">No battle formats yet. An admin can create the first category.</p>}</>}
function Category({
  category,
  players,
  choose,
  admin,
  open,
  setSelectedCategory,
}: any) {
  const openCategoryModal = (type: string) => {
    setSelectedCategory(category);
    open(type);
  };

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
              onClick={() => openCategoryModal("pokemon")}
            >
              Set Pokémon
            </button>

            <button
              className="button ghost"
              onClick={() => openCategoryModal("category-points")}
            >
              Award Points
            </button>

            <button
              className="button"
              onClick={() => openCategoryModal("match")}
            >
              Record Battle
            </button>

            <button
              className="button ghost"
              onClick={() => openCategoryModal("edit-category")}
            >
              Edit Board
            </button>

            <button
              className="button ghost"
              onClick={() => openCategoryModal("duplicate-category")}
            >
              Duplicate
            </button>

            <button
              className="danger"
              onClick={() => openCategoryModal("delete-category")}
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

      <div className="table battle-record-table">
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
        <div className="table category-points-table">
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
function Backup({admin,onImport}:any){const [file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false);return <><div className="section-head"><div><p className="eyebrow">DATA PORTABILITY</p><h2>Backup & Restore</h2></div></div><div className="backup"><article><h3>Export Excel Backup</h3><p>Download the complete current leaderboard, history, battle records, and Pokémon lineups in one `.xlsx` workbook.</p><a className={`button ${!admin?"disabled":""}`} href={admin?"/api/export":undefined}>Export .xlsx</a></article><article><h3>Import Backup</h3><p>Replace the current leaderboard data with this backup. Players, categories, match history, point history, records, and Pokémon lineups will be replaced.</p><input type="file" accept=".xlsx" onChange={e=>setFile(e.target.files?.[0]||null)}/><button className="button" disabled={!admin||!file||busy} onClick={async()=>{if(!confirm("IMPORT REPLACES ALL LEADERBOARD DATA. Current players, categories, match history, point history, records, and Pokémon lineups will be deleted and replaced by this file. Continue?"))return;setBusy(true);try{await onImport(file)}catch(e){alert(e instanceof Error?e.message:"Import failed")}finally{setBusy(false)}}}> {busy?"Importing…":"Confirm Import"}</button></article></div>{!admin&&<p className="empty">Sign in as an admin to access backups.</p>}</>}
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
}:any){const [reason,setReason]=useState(""); const [pokemonTarget,setPokemonTarget]=useState(""); const [pokemonPlayerTarget,setPokemonPlayerTarget]=useState(""); const [matchCategoryTarget,setMatchCategoryTarget]=useState(""); useEffect(()=>{if(type==="pokemon"){setPokemonTarget(selectedCategory?.id||"hall");setPokemonPlayerTarget(selectedPlayer?.id||"");}if(type==="match"){setMatchCategoryTarget(selectedCategory?.id||"");}if(type==="points"||type==="category-points"){setReason("");}},[type,selectedCategory?.id,selectedPlayer?.id]); const selectedRoster=useMemo(()=>{if(!pokemonPlayerTarget)return []; if(pokemonTarget==="hall"){const player=data.players.find((p:any)=>p.id===pokemonPlayerTarget);return Array.isArray(player?.hallPokemon)?player.hallPokemon:[];} const category=data.categories.find((c:any)=>c.id===pokemonTarget); const record=category?.records?.find((r:any)=>r.playerId===pokemonPlayerTarget); return Array.isArray(record?.pokemon)?record.pokemon:[];},[data.players,data.categories,pokemonTarget,pokemonPlayerTarget]); const submit=async(e:FormEvent<HTMLFormElement>,action:string)=>{e.preventDefault();const f=new FormData(e.currentTarget),p=Object.fromEntries(f);try{await api(action,p)}catch(err){alert(err instanceof Error?err.message:"Unable to save")}}; if(type==="login")return <div className="modal"><form onSubmit={async e=>{e.preventDefault();const r=await fetch("/api/admin/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:new FormData(e.currentTarget).get("password")})});if(r.ok){await reload();close()}else alert("Incorrect password")}}><h2>Admin Sign In</h2><p>Protected actions are server-verified.</p><input name="password" type="password" required placeholder="Admin password"/><button className="button">Sign in</button><button type="button" className="link" onClick={close}>Cancel</button></form></div>;
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

          <h3>PokéCompare Artwork</h3>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const input = event.currentTarget.elements.namedItem("pokeCompareArtFile") as HTMLInputElement;
              const file = input.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = async () => {
                try {
                  const response = await fetch("/api/admin/pokecompare-art", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ value: reader.result }),
                  });
                  const result = await response.json();
                  if (!response.ok) throw new Error(result.error || "Could not save artwork.");
                  await reload();
                  close();
                } catch (error) {
                  alert(error instanceof Error ? error.message : "Could not save artwork.");
                }
              };
              reader.readAsDataURL(file);
            }}
          >
            <p className="muted">Optional image for the transparent orange arcade panel under the high scores.</p>
            <input name="pokeCompareArtFile" type="file" accept="image/*" required />
            <button className="button">Use PokéCompare Artwork</button>
          </form>

          <div className="pokecompare-admin-setting">
            <div>
              <strong>Hide High Score Names & Messages</strong>
              <p className="muted">When enabled, the high-score board shows scores only. Admins can still edit entries.</p>
            </div>
            <label className="toggle">
              <input type="checkbox" checked={data.pokeCompareHideDetails} onChange={async(event)=>{
                try{
                  const response=await fetch("/api/admin/pokecompare-settings",{
                    method:"POST",
                    headers:{"Content-Type":"application/json"},
                    body:JSON.stringify({hideDetails:event.target.checked}),
                  });
                  const result=await response.json();
                  if(!response.ok)throw new Error(result.error||"Could not update setting.");
                  await reload();
                }catch(error){alert(error instanceof Error?error.message:"Could not update setting.");}
              }}/>
              <span>ON</span>
            </label>
          </div>

          <div className="admin-control-actions">
            <button type="button" className="danger admin-logout" onClick={async()=>{
              const response=await fetch("/api/admin/logout",{method:"POST"});
              if(response.ok){await reload();close();}
            }}>Log Out</button>
            <button type="button" className="link" onClick={close}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  if(type==="player"||type==="edit-player") {
    const p=type==="edit-player"?selected:null;
    return <div className="modal"><form onSubmit={async e=>{
      e.preventDefault();
      const form=e.currentTarget;
      const values:any=Object.fromEntries(new FormData(form));
      const fileInput=form.elements.namedItem("imageFile") as HTMLInputElement;
      const file=fileInput?.files?.[0];
      if(file){
        if(file.size>2*1024*1024){alert("Profile picture must be 2 MB or smaller.");return;}
        const reader=new FileReader();
        reader.onload=()=>{void api(p?"player.update":"player.create",{...values,image:reader.result});};
        reader.readAsDataURL(file);
        return;
      }
      if(p && !String(values.image||"").trim() && p.image?.startsWith("data:image/")) {
        values.image=p.image;
      }
      await api(p?"player.update":"player.create",values);
    }}><h2>{p?"Edit Player":"New Player"}</h2>{p&&<input type="hidden" name="id" value={p.id}/>}<input name="name" required defaultValue={p?.name} placeholder="Full name"/><input name="ign" defaultValue={p?.ign||""} placeholder="In-game name (optional)"/><input name="points" type="number" defaultValue={p?.points||0} placeholder="Starting points"/><label className="field-label">Display picture URL (optional)<input name="image" type="url" defaultValue={p?.image?.startsWith("data:image/")?"":(p?.image||"")} placeholder="Image URL"/></label><label className="field-label">Or upload a picture<input name="imageFile" type="file" accept="image/*"/></label><p className="muted">An uploaded picture replaces the URL. Maximum 2 MB.</p><input name="bestPerformance" defaultValue={p?.bestPerformance||""} placeholder="Best performance"/><textarea name="notes" defaultValue={p?.notes||""} placeholder="Private/admin notes"/><button className="button">Save Player</button><button type="button" className="link" onClick={close}>Cancel</button></form></div>
  }
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

  if(type==="category")return <div className="modal"><form key="create-category-form" onSubmit={e=>submit(e,"category.create")}><h2>Create Battle Category</h2><input name="name" required defaultValue="" placeholder="Category name"/><textarea name="description" defaultValue="" placeholder="Description"/><button className="button">Create Category</button><button type="button" className="link" onClick={close}>Cancel</button></form></div>;

if(type==="edit-category") {
    const c=selected;
    if(!c) return null;
    return <div className="modal"><form onSubmit={async e=>{
      e.preventDefault();
      const form=e.currentTarget;
      const values:any=Object.fromEntries(new FormData(form));
      const fileInput=form.elements.namedItem("imageFile") as HTMLInputElement;
      const file=fileInput?.files?.[0];
      const save=(image:any)=>api("category.update",{...values,id:c.id,image:image ?? null});
      if(file){
        if(file.size>2*1024*1024){alert("Board image must be 2 MB or smaller.");return;}
        const reader=new FileReader();
        reader.onload=()=>{void save(reader.result)};
        reader.readAsDataURL(file);
      } else {
        const typedUrl=String(values.image||"").trim();
        await save(typedUrl || (c.image || null));
      }
    }}>
      <h2>Edit Battle Board</h2>
      <input name="name" required defaultValue={c.name||""} placeholder="Board name"/>
      <textarea name="description" placeholder="Description" defaultValue={c.description||""}/>
      <label className="field-label">Board image URL (optional)
        <input name="image" type="url" defaultValue={c.image?.startsWith("data:image/")?"":(c.image||"")} placeholder="Image URL"/>
      </label>
      {c.image?.startsWith("data:image/") && <p className="muted">Current uploaded board image will be kept unless you upload a new image.</p>}
      <label className="field-label">Or upload a board image
        <input name="imageFile" type="file" accept="image/*"/>
      </label>
      <p className="muted">Changing the board does not alter its matches, points, or standings.</p>
      <button className="button">Save Board</button>
      <button type="button" className="link" onClick={close}>Cancel</button>
    </form></div>
  }
if(type==="duplicate-category") { const c=selected; return <div className="modal"><form onSubmit={e=>submit(e,"category.duplicate")}><h2>Duplicate Battle Board</h2><p className="muted">Creates a new empty board using this board's name, description, and image. Matches, points, and standings are not copied.</p><input name="id" type="hidden" value={c?.id||""}/><input name="name" required defaultValue={`${c?.name||""} Copy`} placeholder="New board name"/><button className="button">Duplicate Board</button><button type="button" className="link" onClick={close}>Cancel</button></form></div>}
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
            {[1,2,3,4,5,6].map(n=><PokemonPicker key={`${pokemonTarget}-${pokemonPlayerTarget}-${n}-${selectedRoster[n-1]||""}`} name={`p${n}`} options={pokemonOptions} initialValue={selectedRoster[n-1]||""}/>)}
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

