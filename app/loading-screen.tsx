"use client";
import { useState } from "react";
import type { LoadingConfig } from "@/lib/loading";

export function LoadingScreen({ config, error, retry }: { config: LoadingConfig; error: boolean; retry: () => void }) {
  const [broken, setBroken] = useState(false);
  const [ready, setReady] = useState(false);
  return <main className="initial-loading" aria-busy={!error}>
    <p className="eyebrow">PALLET TOWN CAFE</p>
    <div className="loading-art" aria-hidden="true">
      {config.image && !broken && <img key={config.image} src={config.image} alt="" className={config.blend ? "blend-white" : ""} style={{ visibility: ready ? "visible" : "hidden" }} onLoad={() => setReady(true)} onError={() => setBroken(true)} />}
      {(!config.image || broken || !ready) && <span className="loading-orbit" />}
    </div>
    <h1>{error ? "Couldn't load the leaderboard" : "Getting the café ready…"}</h1>
    <p role={error ? "alert" : "status"}>{error ? "Your data is safe. Try loading the page again." : "Loading players, points and battles"}</p>
    {error && <button type="button" className="button" onClick={retry}>Try Again</button>}
  </main>;
}

export function LoadingControls({ config, onSaved }: { config: LoadingConfig; onSaved: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [blend, setBlend] = useState(config.blend);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function save(action: "save" | "remove") {
    setBusy(true); setError(""); setMessage("");
    try {
      if (action === "save" && file && (file.type !== "image/gif" || file.size > 2 * 1024 * 1024)) throw new Error("Choose a GIF file, 2 MB or smaller.");
      const form = new FormData(); form.set("action", action); form.set("blend", String(blend));
      if (file && action === "save") form.set("gif", file);
      const response = await fetch("/api/admin/loading", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save loading GIF.");
      await onSaved(); setFile(null); setMessage(action === "remove" ? "Loading GIF removed. The default animation will be used." : "Loading screen saved. It will appear on the next page load.");
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save loading GIF."); }
    finally { setBusy(false); }
  }
  return <section className="loading-controls"><h3>Loading Screen GIF</h3>
    <p className="muted">Upload or replace the animation shown while the site first loads. GIF only, up to 2 MB.</p>
    {config.image && <div className="loading-art admin-loading-art"><img src={config.image} alt="Current loading GIF" className={blend ? "blend-white" : ""} /></div>}
    <form onSubmit={event => { event.preventDefault(); void save("save"); }}>
      <input key={config.image || "no-gif"} aria-label="Loading GIF file" type="file" accept="image/gif,.gif" disabled={busy} onChange={event => { setFile(event.target.files?.[0] || null); setError(""); setMessage(""); }} />
      <label className="loading-blend-control"><input type="checkbox" checked={blend} disabled={busy} onChange={event => setBlend(event.target.checked)} />Blend a white background into the dark theme</label>
      <p className="muted">Turn blending off for transparent GIFs or to keep the original colors.</p>
      <div className="loading-control-actions"><button className="button" disabled={busy || (!file && !config.image)}>{busy ? "Saving…" : "Save Loading Screen"}</button>{config.image && <button type="button" className="link danger-link" disabled={busy} onClick={() => void save("remove")}>Remove GIF</button>}</div>
      {error && <p role="alert" className="import-error">{error}</p>}{message && <p role="status">{message}</p>}
    </form>
  </section>;
}
