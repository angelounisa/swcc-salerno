# v2 — θ con la calibrazione fornita il 19/11/2026

Dashboard: `docs/v2/index.html` (GitHub Pages: /swcc-salerno/v2/).

- θ: file DATI_CAL__COMEGNA.xlsx, colonne sotto CALIBRAZIONE; suzione invariata.
- Orari: il file calibrato è spostato rispetto ai file con la suzione (1 h fino al 30/03/2025; salto il 18/12/2025 di 10 h 40 min NV e 25 h 05 min V).
  È usata la base dei tempi dei file con la suzione, allineata alla pioggia (`inputs/rainlag.py`); righe abbinate tramite il θ grezzo (`inputs/remap.py`).
- Serie tagliata al 30/07/2026 (fine della pioggia), `inputs/make_inputs.py`.
- Stessi script della v1; modifiche: soglia di trend 0,0005 m³/m³ (un passo del sensore con la nuova calibrazione), controllo di estrapolazione non applicato
  (campo di validità non fornito), griglie del terreno in imbibizione estese (g fino a 4, K fino a ×10^1,5), filtro di qualità alternativo sul solo bosco.
