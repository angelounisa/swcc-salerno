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

## Drying e modello: vegetata vs senza vegetazione

Scheda *Drying e modello* della dashboard: confronto dei rami di drying delle due parcelle e simulazione con lo stesso modello alle differenze finite (`sim/solver.js`).

- Dominio: colonna 1D di 130 cm (copertura piroclastica su dolomia fratturata), Δz = 1 cm. Strati da Urciuoli et al.: A1 0–20 cm, A2 20–115 cm, C1 115–130 cm, con Ks di laboratorio (1,03·10⁻⁶, 9,27·10⁻⁶, 4,82·10⁻⁶ m/s). Curve di ritenzione: drying di campo di ciascuna parcella (C1 con la curva a 60 cm).
- Bordo superiore: pioggia × τ (τ = 1 senza vegetazione, 0,49 vegetata) meno evaporazione, con passaggio a carico imposto in caso di ristagno o di superficie troppo secca. Bordo inferiore: drenaggio libero.
- Evapotraspirazione potenziale: Oudin (2005) dalla temperatura del suolo a 15 cm × fattore calibrato; quota traspirata calibrata, assorbita dalle radici con Feddes (distribuzione radicale per parcella).
- Calibrati solo il fattore di ETP e la quota traspirata (2025); validazione 2026.

```bash
python sim/prep_forcing.py Pioggia_unificata.xlsx Salerno_METER_NV_2025-2026.xlsx Salerno_METER_NV_temperature_2025-2026.xlsx sim/forcing_NV.json 15,30,60
python sim/prep_forcing.py Pioggia_unificata.xlsx Salerno_METER_V_2025-2026.xlsx  Salerno_METER_V_temperature_2025-2026.xlsx  sim/forcing_V.json  15,35,60
cd sim && node calibrate2.js NV 2026-01-01 calib2_NV.json && node calibrate2.js V 2026-01-01 calib2_V.json
node final2.js sim2_results.json && cd .. && python build.py
```
