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


## Calibrazione di θ

Tutte le analisi usano il contenuto d'acqua calibrato per terreno (`calibrate_theta.py` → `theta_calibration.json`).
Dal file calibrato della parcella senza vegetazione (`dati_NV_cal.xlsx`, fino al 20/02/2026) sono ricavate due funzioni dell'uscita del sensore in mV: A1 (15 cm) e A2 (30, 35, 60 cm). In quel file θ è in ritardo di 1 h rispetto alla suzione: il ritardo è rimosso. Le funzioni sono applicate a tutta la serie di entrambe le parcelle (per la vegetata è un'ipotesi: stessi terreni e sensori; a 60 cm il 37% delle misure è sotto il campo della calibrazione).

```bash
python calibrate_theta.py Salerno_METER_NV_2025-2026.xlsx Salerno_METER_V_2025-2026.xlsx dati_NV_cal.xlsx NV_cal.csv V_cal.csv theta_calibration.json
# i file *_cal (stesse colonne dei file originali) sono poi l'ingresso di analysis.py, swcc_main.py, kfield.py e degli script in sim/
```

## Metodo in breve

1. Medie orarie dei dati a 5 min.
2. Differenza centrata su 24 h: *drying* se θ cala ≥ 0,001 m³/m³ e log₁₀s cresce ≥ 0,01; *wetting* se avviene il contrario; altrimenti *indeterminato* (escluso dal fit).
3. Fit van Genuchten–Mualem (m = 1 − 1/n) sulle mediane per classi di 0,1 decadi di log₁₀s, con vincoli θs ∈ [0,05; 0,55], θr ∈ [0; θmin], α ∈ [1e-4; 10] kPa⁻¹, n ∈ [1,05; 8].

## Drying in saturazione efficace, calibrazione e infiltrazione

Terza scheda della dashboard. I parametri idraulici sono fissati uno alla volta da misure in sito indipendenti; il modello calibra solo due fattori.

1. **Curva principale di drying in Se** (`swcc_main.py` → `swcc_main.json`): per ogni sensore, inviluppo superiore dei punti di essiccamento (95° percentile di θ per classe di suzione, non crescente); fit van Genuchten; Se = (θ − θr)/(θs − θr), con θr non superiore al minimo θ osservato. Curva comune (α, n) per strato (A1: sensori a 15 cm; A2: 30, 35, 60 cm) con θr, θs propri di ogni sensore. Incertezza con bootstrap a blocchi sugli episodi di drying.
2. **Conducibilità non satura** (`kfield.py` → `kfield.json`): metodo del profilo istantaneo nelle notti senza pioggia (flusso nullo in superficie), senza stime di evapotraspirazione. Dà la Ks di matrice che scala la curva di Mualem.
3. **Modello** (`sim/solver.js`, `sim/build_models.py`): Richards 1D alle differenze finite, colonna di 130 cm, A1 0–20 / A2 20–115 / C1 115–130 cm, drenaggio libero. K(h) = Ks di matrice × Mualem + Kmac·exp(h/5 cm), con Ks + Kmac = Ksat di laboratorio. Radici dalla biomassa misurata a 20, 40, 60 cm; Feddes 100–1500 kPa; quota radicale 1 − exp(−0,5·LAI) con LAI 1 e 3 (Comegna et al., ALERT 2025).
4. **Forzanti** (`sim/prep_forcing2.py`): pioggia unificata; ETP di Oudin dalla temperatura dell'aria in campo aperto (misurata 17/03–03/09/2025, `data/air_T_RH_2025_from_slides.csv`; altrove stimata dalla temperatura del suolo); per la parcella vegetata serbatoio di intercettazione di 16,75 mm.
5. **Calibrazione sul drying** (`sim/calib_dry2.js`): griglia completa su fattore di ETP e moltiplicatore della K di matrice, drying 2025 (26/04–28/08); validazione drying 2026 (01/04–30/07). Obiettivo su Se e log10 suzione.
6. **Periodo completo** (`sim/final4.js`): moltiplicatore di K della parcella senza vegetazione applicato anche alla vegetata; Kmac di A1 scelto come il più piccolo che dà ruscellamento ≤ 2% della pioggia.
7. **Infiltrazione per evento dai sensori** (`sim/infil_events.py`).

```bash
python swcc_main.py Salerno_METER_NV_2025-2026.xlsx Salerno_METER_V_2025-2026.xlsx results_NV.json swcc_main.json
python kfield.py Pioggia_unificata.xlsx Salerno_METER_NV_2025-2026.xlsx Salerno_METER_V_2025-2026.xlsx swcc_main.json kfield.json
python sim/prep_forcing2.py NV Pioggia_unificata.xlsx Salerno_METER_NV_2025-2026.xlsx Salerno_METER_NV_temperature_2025-2026.xlsx data/air_T_RH_2025_from_slides.csv sim/forcing_NV.json
python sim/prep_forcing2.py V  Pioggia_unificata.xlsx Salerno_METER_V_2025-2026.xlsx  Salerno_METER_NV_temperature_2025-2026.xlsx data/air_T_RH_2025_from_slides.csv sim/forcing_V.json
python sim/infil_events.py Pioggia_unificata.xlsx Salerno_METER_NV_2025-2026.xlsx Salerno_METER_V_2025-2026.xlsx sim/infiltration_events.json
cd sim && python build_models.py ../swcc_main.json ../kfield.json
node calib_dry2.js NV calibdry2_NV.json && node calib_dry2.js V calibdry2_V.json
node final4.js sim2_results.json && cd .. && python build.py
```
