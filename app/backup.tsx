"use client";

import { useState } from "react";
import type { ImportPlan } from "@/lib/import-plan";

type Preview = ImportPlan & { token: string; availableSheets: string[] };
const names = { player: "Player", category: "Category", categoryRecord: "Board record", match: "Match", pointTransaction: "Point history", setting: "Setting" };
const showValue = (value: unknown) => value === null || value === undefined ? "(empty)" : typeof value === "string" ? value : JSON.stringify(value);

export default function Backup({ admin, onImported }: { admin: boolean; onImported: (message: string) => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);
  const [mode, setMode] = useState("merge");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [available, setAvailable] = useState<string[]>([]);
  const [sheets, setSheets] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  async function submit(action: "preview" | "apply") {
    if (!file || (action === "apply" && !preview)) return;
    setBusy(action); setError("");
    try {
      const form = new FormData();
      form.set("file", file); form.set("action", action); form.set("mode", mode);
      if (available.length) form.set("sheets", JSON.stringify(sheets));
      if (action === "apply") form.set("token", preview!.token);
      const response = await fetch("/api/import", { method: "POST", body: form });
      const out = await response.json();
      if (!response.ok) throw new Error(out.error || "Import failed.");
      if (action === "preview") {
        setPreview(out); setAvailable(out.availableSheets); setSheets(out.sheets);
        setFilter("all"); setSearch("");
      } else {
        setPreview(null);
        await onImported(out.message);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Import failed.");
      // A rejected/stale confirmation must be reviewed again.
      setPreview(null);
    } finally { setBusy(null); }
  }

  const changes = preview?.changes.filter(change =>
    (filter === "all" || change.action === filter) && `${names[change.model]} ${change.label}`.toLowerCase().includes(search.toLowerCase())
  ) || [];

  return <>
    <div className="section-head"><div><p className="eyebrow">DATA PORTABILITY</p><h2>Backup & Restore</h2></div></div>
    <div className="backup">
      <article><h3>Export Excel Data</h3><p>Download players, points, histories, battle records, Pokémon lineups and supported settings. Images stay in Supabase and are excluded from this data backup.</p><a className={`button ${!admin ? "disabled" : ""}`} href={admin ? "/api/export" : undefined}>Export .xlsx</a></article>
      <article><h3>Import & Review</h3><p>Review additions, changes and removals before applying. All existing images are preserved, including when importing older backups with image columns.</p>
        <input aria-label="Excel backup file" type="file" accept=".xlsx" disabled={!admin || !!busy} onChange={event => { setFile(event.target.files?.[0] || null); setPreview(null); setAvailable([]); setSheets([]); setError(""); }} />
        <label className="import-control">Import mode
          <select value={mode} disabled={!admin || !!busy} onChange={event => { setMode(event.target.value); setPreview(null); }}>
            <option value="merge">Merge — keep existing histories</option>
            <option value="replace">Replace selected match/point histories</option>
          </select>
        </label>
        <p className="muted">Merge adds new rows and updates matching IDs. Rows without IDs create new history entries. Replace removes history rows absent from selected sheets. Players and categories are always kept.</p>
        {available.length > 0 && <fieldset className="import-sheets" disabled={!!busy}><legend>Sheets to import</legend>{available.map(sheet => <label key={sheet}><input type="checkbox" checked={sheets.includes(sheet)} onChange={event => { setSheets(event.target.checked ? [...sheets, sheet] : sheets.filter(name => name !== sheet)); setPreview(null); }} />{sheet}</label>)}</fieldset>}
        <button className="button" disabled={!admin || !file || !!busy || (available.length > 0 && !sheets.length)} onClick={() => submit("preview")}>{busy === "preview" ? "Preparing preview…" : preview ? "Refresh Preview" : "Preview Import"}</button>
        {error && <p role="alert" className="import-error">{error}</p>}
      </article>
    </div>
    {preview && <section className="import-review" aria-label="Import preview">
      <h3>Review Import</h3>
      <p role="status"><strong>{preview.counts.add} additions · {preview.counts.change} changes · {preview.counts.remove} removals</strong></p>
      <p>Nothing has been saved yet. Review the changes below, then apply this import. Changing the file or options requires a fresh preview.</p>
      {preview.warnings.map((warning, index) => <p className="import-warning" key={index}>{warning}</p>)}
      <div className="import-filters"><label>Show <select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All changes</option><option value="add">Additions</option><option value="change">Changes</option><option value="remove">Removals</option></select></label><input aria-label="Search import changes" placeholder="Search player, category or ID…" value={search} onChange={event => setSearch(event.target.value)} /></div>
      <p>{changes.length} matching records</p>
      <div className="import-table-wrap"><table className="import-table"><thead><tr><th>Action</th><th>Record</th><th>Field</th><th>Current value</th><th>After import</th></tr></thead><tbody>
        {changes.flatMap(change => change.fields.map((field, index) => <tr key={`${change.model}:${change.id}:${field.field}`} className={`import-${change.action}`}>
          <td>{index === 0 ? change.action : ""}</td><td>{index === 0 ? `${names[change.model]}: ${change.label}` : ""}</td><td>{field.field}</td><td>{showValue(field.before)}</td><td>{showValue(field.after)}</td>
        </tr>))}
      </tbody></table></div>
      {!preview.changes.length && <p>This import makes no changes.</p>}
      <div className="import-actions"><button className="button" disabled={!admin || !!busy || !preview.changes.length} onClick={() => submit("apply")}>{busy === "apply" ? "Applying…" : `Apply Import (${preview.counts.add + preview.counts.change + preview.counts.remove} records)`}</button><button className="button secondary" disabled={!!busy} onClick={() => setPreview(null)}>Cancel</button></div>
      <p className="muted">The preview expires after 15 minutes. If site data changes, a new preview is required.</p>
    </section>}
    {!admin && <p className="empty">Sign in as an admin to access backups.</p>}
  </>;
}
