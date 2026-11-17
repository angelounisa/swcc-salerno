# Analisi per l'articolo

Analisi sui soli dati misurati per il manoscritto sul confronto bosco / area disboscata.

- `mechanisms.py` → `mechanisms.json`: accumulo per evento (soglia e pendenza), date di essiccamento e riumidificazione, ripartizione giorno/notte, fronte umido, rapporto mensile delle suzioni.
- `paper_analysis.py` → `paper_analysis.json`: assorbimento diurno per strato e per classe di suzione (P1); modello logistico della perdita di suzione (P2); tempi di recupero (P3, non usati: quasi tutti troncati dall'evento successivo).
- `paper_p2_sens.py` → `paper_p2.json`: fattore di pioggia equivalente k = exp(d/b) con intervallo bootstrap sugli eventi e sensibilità a penalità e soglia.
- `stability.py` → `stability.json`: pendio indefinito con suzione e θ misurati.
- `make_paper_figs.py` → `figs/`: figure 2–7 del manoscritto (PNG 300 dpi e PDF).

```bash
pip install pandas openpyxl numpy scipy matplotlib
python mechanisms.py NV_cal.xlsx V_cal.xlsx Pioggia_unificata.xlsx compare.json sim/infiltration_events.json tempNV.xlsx tempV.xlsx mechanisms.json
python stability.py NV_cal.xlsx V_cal.xlsx swcc_main.json sim/infiltration_events.json stability.json
python paper_analysis.py NV_cal.xlsx V_cal.xlsx compare.json paper_analysis.json figs
python paper_p2_sens.py compare.json paper_p2.json
python make_paper_figs.py figs      # dalla cartella con i JSON
```
