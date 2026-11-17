"use client";
import { useEffect, useRef, useState } from "react";

type Page = { items: any[]; matches: any[]; hasMorePoints: boolean; hasMoreMatches: boolean };
const empty: Page = { items: [], matches: [], hasMorePoints: false, hasMoreMatches: false };
const fmt = (date: string) => new Date(date).toLocaleString();

export default function History({ items, matches, admin, open, choose, selectTransaction }: any) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [page, setPage] = useState<Page>(empty);
  const [older, setOlder] = useState<{ points: any[]; matches: any[] }>({ points: [], matches: [] });
  const [busy, setBusy] = useState(true);
  const [moreBusy, setMoreBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    const current = ++generation.current;
    setBusy(true); setError(""); setPage(empty); setOlder({ points: [], matches: [] }); setMoreBusy(null);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ type, q: query.trim() });
        const response = await fetch(`/api/history?${params}`, { cache: "no-store", signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (current === generation.current) setPage(result);
      } catch (error) { if (!controller.signal.aborted && current === generation.current) setError(error instanceof Error ? error.message : "Could not load history."); }
      finally { if (current === generation.current && !controller.signal.aborted) setBusy(false); }
    }, query ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); generation.current++; };
  }, [query, type, retry, items, matches]);

  async function more(kind: "points" | "matches") {
    if (moreBusy || busy) return;
    const current = generation.current;
    setMoreBusy(kind); setError("");
    try {
      const params = new URLSearchParams({ type: kind, q: query.trim(), [kind === "points" ? "pointsOffset" : "matchesOffset"]: String(10 + older[kind].length) });
      const response = await fetch(`/api/history?${params}`, { cache: "no-store" });
      const result: Page & { error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (current !== generation.current) return;
      const entries = kind === "points" ? result.items : result.matches;
      setOlder(previous => ({ ...previous, [kind]: [...previous[kind], ...entries] }));
      setPage(previous => ({ ...previous, ...(kind === "points" ? { hasMorePoints: result.hasMorePoints } : { hasMoreMatches: result.hasMoreMatches }) }));
    } catch (error) { if (current === generation.current) setError(error instanceof Error ? error.message : "Could not load older history."); }
    finally { if (current === generation.current) setMoreBusy(null); }
  }

  const pointRow = (x: any) => <article key={x.id}><b className={x.amount > 0 ? "plus" : "minus"}>{x.amount > 0 ? "+" : ""}{x.amount} pts</b><div><strong>{x.player?.name || "Unknown player"} <small>/{x.player?.ign || "No IGN"}</small></strong><p>{x.reason || x.action}{x.category?.name ? ` · ${x.category.name}` : ""}{` · New total: ${x.newTotal}`}</p></div><time>{fmt(x.createdAt)}</time>{admin && <div className="history-actions"><button type="button" className="link" onClick={() => { selectTransaction(x); open("edit-points"); }}>Edit</button><button type="button" className="link danger-link" onClick={() => { selectTransaction(x); open("delete-points"); }}>Delete</button></div>}</article>;
  const matchRow = (m: any) => <article key={m.id}><b>BATTLE</b><div><strong>{m.winner?.name || m.winner?.ign || m.winnerId} defeated {m.loser?.name || m.loser?.ign || m.loserId}</strong><p>{m.category?.name || m.categoryId}{m.notes ? ` · ${m.notes}` : ""}</p></div><time>{fmt(m.playedAt)}</time>{admin && <div className="history-actions"><button type="button" className="link" onClick={() => { choose(m); open("edit-match"); }}>Edit</button><button type="button" className="link danger-link" onClick={() => { choose(m); open("delete-match"); }}>Delete</button></div>}</article>;

  function section(kind: "points" | "matches", entries: any[], hasMore: boolean) {
    const render = kind === "points" ? pointRow : matchRow;
    return <section className="history-section" key={kind}><h3>{kind === "points" ? "Point Transactions" : "Battle History"}</h3><p className="muted">Latest {Math.min(entries.length, 10)}{query ? " matching" : ""} entries</p><div className="timeline">{entries.map(render)}</div>{!busy && !entries.length && <p className="empty">{query ? "No matching entries." : "No history yet."}</p>}
      {(hasMore || older[kind].length > 0) && <details className="history-older" key={`${kind}:${query}:${type}:${retry}`} onToggle={event => { if (event.currentTarget.open && !older[kind].length && hasMore) void more(kind); }}><summary>Older {kind === "points" ? "point transactions" : "battles"}</summary><div className="timeline">{older[kind].map(render)}</div>{moreBusy === kind && <p role="status">Loading older entries…</p>}{hasMore && <button type="button" className="button secondary" disabled={!!moreBusy || busy} onClick={() => void more(kind)}>Load 10 More</button>}</details>}
    </section>;
  }
  return <><div className="section-head"><div><p className="eyebrow">PERMANENT RECORDS</p><h2>Activity History</h2></div></div>
    <div className="history-filters"><label>Search history<input type="search" placeholder="Player, IGN, category, reason or points…" value={query} onChange={event => setQuery(event.target.value)} /></label><label>History type<select value={type} onChange={event => setType(event.target.value)}><option value="all">Points & Matches</option><option value="points">Points only</option><option value="matches">Matches only</option></select></label>{query && <button type="button" className="link" onClick={() => setQuery("")}>Clear Search</button>}</div>
    {busy && <p role="status">Searching history…</p>}{error && <p role="alert" className="import-error">{error} <button type="button" className="link" onClick={() => setRetry(value => value + 1)}>Retry</button></p>}
    {type !== "matches" && section("points", page.items, page.hasMorePoints)}{type !== "points" && section("matches", page.matches, page.hasMoreMatches)}
  </>;
}
