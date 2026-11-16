# SWCC Salerno

Dashboard delle curve di ritenzione idrica (θ vs suzione) misurate con sensori METER su due parcelle, gen 2025 – set 2026:

- senza vegetazione (NV): 15, 30, 60 cm
- vegetata (V): 15, 35, 60 cm (θ a 15 cm manca dal 31/01 al 04/03/2026)

- `docs/index.html` – dashboard statica (Plotly). Per pubblicarla: *Settings → Pages → Deploy from branch → `main` / `/docs`*.
- `docs/results_NV.json`, `docs/results_V.json` – parametri, classi e punti usati dalla dashboard.
- `site/body.html` + `build.py` – sorgente della pagina e script che incorpora i dati in `docs/index.html`.
- `analysis.py` – classificazione drying/wetting e fit van Genuchten–Mualem. Tutti i parametri sono nel dizionario `CONFIG`.

Rigenerare i risultati:

```bash
pip install pandas openpyxl scipy numpy
python analysis.py Salerno_METER_NV_2025-2026.xlsx results_NV.json 15,30,60 "No vegetation"
python analysis.py Salerno_METER_V_2025-2026.xlsx  results_V.json  15,35,60 "Vegetation"
python build.py
```


## Metodo in breve

1. Medie orarie dei dati a 5 min.
2. Differenza centrata su 24 h: *drying* se θ cala ≥ 0,001 m³/m³ e log₁₀s cresce ≥ 0,01; *wetting* se avviene il contrario; altrimenti *indeterminato* (escluso dal fit).
3. Fit van Genuchten–Mualem (m = 1 − 1/n) sulle mediane per classi di 0,1 decadi di log₁₀s, con vincoli θs ∈ [0,05; 0,55], θr ∈ [0; θmin], α ∈ [1e-4; 10] kPa⁻¹, n ∈ [1,05; 8].

## Drying, calibrazione e infiltrazione: vegetata vs senza vegetazione

Terza scheda della dashboard.

- **Rami di drying a confronto** (curve van Genuchten di campo delle due parcelle).
- **Modello**: Richards 1D alle differenze finite (`sim/solver.js`), colonna di 130 cm, strati A1 0–20, A2 20–115, C1 115–130 cm (Urciuoli et al.), drenaggio libero al fondo, flusso atmosferico in superficie (pioggia × τ meno evaporazione), assorbimento radicale di Feddes. ETP da Oudin (2005) con la temperatura del **suolo** a 15 cm.
- **Calibrazione inversa sul drying** (`sim/calib_drying.js`): Ks di A1 e A2, fattore di ETP e quota radicale, da θ e suzione misurati nel drying 2025 (26/04–28/08), validazione sul drying 2026 (01/04–30/07). Tre punti di partenza; gli insiemi trovati sono poi provati sul periodo completo (`sim/final3.js`), dove per la parcella vegetata si sceglie anche τ.
- **Infiltrazione**: stima per evento dai sensori (`sim/infil_events.py`, accumulo nella colonna 0–75 cm, limite inferiore) e stima dal modello.

```bash
python sim/prep_forcing.py Pioggia_unificata.xlsx Salerno_METER_NV_2025-2026.xlsx Salerno_METER_NV_temperature_2025-2026.xlsx sim/forcing_NV.json 15,30,60
python sim/prep_forcing.py Pioggia_unificata.xlsx Salerno_METER_V_2025-2026.xlsx  Salerno_METER_V_temperature_2025-2026.xlsx  sim/forcing_V.json  15,35,60
python sim/infil_events.py Pioggia_unificata.xlsx Salerno_METER_NV_2025-2026.xlsx Salerno_METER_V_2025-2026.xlsx sim/infiltration_events.json
cd sim && node calib_drying.js NV calibdry_NV.json && node calib_drying.js V calibdry_V.json
node final3.js sim2_results.json && cd .. && python build.py
```
