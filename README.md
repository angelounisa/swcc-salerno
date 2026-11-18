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

## Confronto vegetata – senza vegetazione (solo dati)

Terza scheda della dashboard, costruita da `compare_plots.py` → `compare.json`. Nessuna simulazione.

- Serie appaiate di θ calibrato (o di Se, con il selettore) e suzione per le coppie di sensori 15/15, 30/35, 60/60 cm.
- Curve di durata della suzione e tempo passato sotto soglie di suzione, per stagione.
- Risposta a ogni evento di pioggia (`sim/infil_events.py` per gli eventi): aumento di θ e di Se, suzione minima, ritardo, soglia di pioggia; acqua accumulata in 0–75 cm.
- Invaso della colonna 0–75 cm e perdita nei periodi senza pioggia.
- Segno del gradiente verticale fra i sensori.
- Temperatura del suolo a 15 cm e dell'aria.
- Meccanismi che emergono dai dati (`mechanisms.py` → `mechanisms.json`): accumulo per evento = b·(P − P0) con intervalli bootstrap, date dell'essiccamento stagionale e della riumidificazione autunnale per profondità, ripartizione giorno/notte della perdita d'acqua, ordine e ritardo del fronte umido, rapporto mensile fra le suzioni.
- Stabilità con i valori misurati (`stability.py` → `stability.json`): pendio indefinito, FS = tanφ'/tanβ + (c' + χ·s·tanφ')/(W·senβ·cosβ) alla profondità di ogni sensore, con suzione e θ misurati; χ = Se misurata (in alternativa θ/n, oppure Se della curva principale alla suzione misurata), β = 32° (sensibilità 28° e 35°), φ' = 38,5°, c' = 0, nessun rinforzo radicale. Le ore con Se misurata < 0,05 non sono valutate.
- Curve principali di drying in Se (`swcc_main.py`) e conducibilità dal drenaggio notturno (`kfield.py`).

```bash
python swcc_main.py NV_cal.xlsx V_cal.xlsx results_NV.json swcc_main.json
python kfield.py Pioggia_unificata.xlsx NV_cal.xlsx V_cal.xlsx swcc_main.json kfield.json 32
python sim/infil_events.py Pioggia_unificata.xlsx NV_cal.xlsx V_cal.xlsx sim/infiltration_events.json
python compare_plots.py NV_cal.xlsx V_cal.xlsx Pioggia_unificata.xlsx Salerno_METER_NV_temperature_2025-2026.xlsx Salerno_METER_V_temperature_2025-2026.xlsx data/air_T_RH_2025_from_slides.csv swcc_main.json sim/infiltration_events.json compare.json
python mechanisms.py NV_cal.xlsx V_cal.xlsx Pioggia_unificata.xlsx compare.json sim/infiltration_events.json Salerno_METER_NV_temperature_2025-2026.xlsx Salerno_METER_V_temperature_2025-2026.xlsx mechanisms.json
python stability.py NV_cal.xlsx V_cal.xlsx swcc_main.json sim/infiltration_events.json stability.json
python build.py
```

## Controllo di qualità e versioni (dalla 1.1.0)

- `analysis.py` ora richiede anche `swcc_main.json` e `theta_calibration.json`: segna ora per ora θ fuori dal campo della calibrazione (incertezza dichiarata ±0,03 m³/m³) e le ore fuori equilibrio (θ sopra la curva principale di drying di più di 0,02 m³/m³, ritardo del sensore di suzione), che sono escluse dal fit di wetting con sensibilità pubblicata. Gli intervalli dei parametri e dell'isteresi vengono da un bootstrap a blocchi mensili.
- `qc.py` → `qc.json`: dove pesano i flag e quali fit non sono identificabili.
- `preregistration.json`: soglie congelate prima di estendere la serie; `MANIFEST.json`: SHA-256 di dati, script e risultati; `CHANGELOG.md`: cosa cambia fra le versioni (tag git).

```bash
python analysis.py NV_cal.xlsx results_NV.json 15,30,60 "No vegetation" NV swcc_main.json theta_calibration.json
python analysis.py V_cal.xlsx  results_V.json  15,35,60 "Vegetation"    V  swcc_main.json theta_calibration.json
python qc.py NV_cal.xlsx V_cal.xlsx theta_calibration.json swcc_main.json results_NV.json results_V.json compare.json qc.json
python manifest.py 1.1.0 MANIFEST.json
```

## Modello numerico (quarta scheda della dashboard)

Il solutore di Richards 1D in schema di pendio indefinito a 28° (`sim/solver.js`), calibrato sui periodi di drying (`sim/`, `run_pipeline.sh`) e verificato con un codice indipendente (`verify/`), non è usato per simulare l'intero periodo ma per esperimenti numerici su una colonna con terreno identico, in cui i fattori del bosco si accendono uno alla volta (`exp/`):

- `attribution.js`: piano fattoriale sulla stagione umida 2025–26 (valori di Shapley). Non è mostrato nella dashboard: il modello, senza ramo di wetting, dà il 6–7% di ore sotto 10 kPa contro il 27% misurato;
- `events.js`: eventi di progetto con suzione iniziale uguale, pioggia critica, fattore di pioggia equivalente del modello, fattore di sicurezza fino a 120 cm;
- `memory.js`: riumidificazione autunnale 2025, piano 2 × 2 stato iniziale × colonna e fattori singoli.

```bash
./run_pipeline.sh Pioggia_unificata.xlsx NV_cal.xlsx V_cal.xlsx      # calibrazione e verifica
cd exp && node events.js events.json && node memory.js memory.json
cd .. && python build.py
```
