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

## Simulazione pioggia → θ (parcella senza vegetazione)

Scheda *Simulazione* della dashboard. Il solutore (`sim/solver.js`) è lo stesso file usato nel browser e nella calibrazione con Node.

- Equazione di Richards 1D, forma mista, differenze finite implicite, Picard modificato (Celia et al., 1990); profilo di 1 m, Δz = 1 cm, passo temporale adattivo ≤ 1 h; drenaggio libero al fondo.
- Strati 0–22,5 / 22,5–45 / 45–100 cm con le curve di drying a 15 / 30 / 60 cm; conducibilità di Mualem con ingresso d'aria a −2 cm (Vogel et al., 2001).
- Pioggia: `Pioggia_unificata.xlsx` (ore mancanti = 0). Evaporazione potenziale: Oudin (2005) dalla temperatura media giornaliera del suolo a 15 cm, moltiplicata per un fattore E calibrato; superficie limitata a h = −100 000 cm.
- Calibrazione di Ks (3 strati) ed E fino al 31/12/2025, validazione 2026.

```bash
python sim/prep_forcing.py Pioggia_unificata.xlsx Salerno_METER_NV_2025-2026.xlsx Salerno_METER_NV_temperature_2025-2026.xlsx sim/forcing.json
node sim/calibrate.js sim/forcing.json results_NV.json sim/model_defaults.json 2026-01-01 sim/calibration.json
node sim/conv.js 13089   # verifica di convergenza (tolleranza, Δz, Δt)
```

