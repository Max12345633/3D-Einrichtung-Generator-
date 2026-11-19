import { useState } from "react";
import { formatLength } from "../lib/format";

export function CalibrationDialog({ measured, onConfirm, onCancel }: { measured: number; onConfirm: (meters: number) => void; onCancel: () => void }) {
  const [value, setValue] = useState("");
  const parsed = Number(value.replace(",", "."));
  const valid = Number.isFinite(parsed) && parsed > 0.1 && parsed < 200;
  return (
    <div className="floating-dialog" role="dialog" aria-label="Maßstab festlegen">
      <h3>Wie lang ist diese Strecke wirklich?</h3>
      <p className="muted">Aktuell gemessen: {formatLength(measured)}. Tipp: Nimm eine bemaßte Außenwand – je länger, desto genauer.</p>
      <form onSubmit={(e) => { e.preventDefault(); if (valid) onConfirm(parsed); }}>
        <div className="input-row">
          <input autoFocus inputMode="decimal" placeholder="z. B. 8,45" value={value} onChange={(e) => setValue(e.target.value)} />
          <span>Meter</span>
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn ghost" onClick={onCancel}>Abbrechen</button>
          <button type="submit" className="btn primary" disabled={!valid}>Maßstab übernehmen</button>
        </div>
      </form>
    </div>
  );
}
