export function rankPlayers<T extends { points: number }>(players:T[]) { return [...players].sort((a,b)=>b.points-a.points); }
export function rankRecords<T extends { wins:number; losses:number }>(records:T[]) { return [...records].sort((a,b)=> { const ar=a.wins/(a.wins+a.losses||1), br=b.wins/(b.wins+b.losses||1); return b.wins-a.wins || br-ar || a.losses-b.losses; }); }

