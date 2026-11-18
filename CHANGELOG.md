# Changelog

Ogni versione corrisponde a un tag git; `MANIFEST.json` contiene lo SHA-256 di dati, script e risultati della versione.

## 1.2.0 — 18/11/2026
- Nuova scheda "Modello numerico" con i risultati del solutore: dominio e condizioni al contorno, calibrazione sul drying, infiltrazione e bilancio, profili, serie simulate, verifica con il codice indipendente.
- Catena del modello rifatta con pendenza 28° (prima 32°): fattori calibrati invariati (ETP × 1,70 e × 0,50, K di matrice × 3,16), drenaggio +8 mm senza vegetazione e +5 mm vegetata.

## 1.1.0 — 17/11/2026
- Fit per ramo: intervalli al 95% da bootstrap a blocchi mensili (300 ricampionamenti) al posto degli errori dalla matrice di covarianza; fit con intervallo di α o n più largo di un fattore 10 segnati come non identificabili.
- Controllo di qualità ora per ora: θ fuori dal campo della calibrazione (incertezza dichiarata ±0,03 m³/m³); ore fuori equilibrio (θ sopra la curva principale di drying di più di 0,02 m³/m³) escluse dal fit di wetting, con sensibilità a tolleranze 0,01 e 0,03 e al fit con tutti i punti.
- Isteresi: differenza θ_drying − θ_wetting con intervallo bootstrap (i due rami rifatti sugli stessi mesi) solo nel campo di suzione comune; isteresi inversa segnalata come artefatto.
- Confronto fra parcelle: differenze assolute mensili di suzione e di S_e affiancate ai rapporti, che sono instabili quando la suzione senza vegetazione è vicina a zero.
- Conducibilità dal drenaggio notturno: dichiarato lo scarto dalla forma di Mualem (pendenza log-log 0,32–0,64 invece di 1).
- Stabilità e conducibilità con pendenza media 28°.
- Soglie congelate in `preregistration.json`.
- Limite noto: pioggia disponibile fino al 30/07/2026; eventi e periodi asciutti di agosto–settembre 2026 non calcolati.

## 1.0.0 — 16/11/2026
- Prima versione con analisi dei rami, curve principali in S_e, confronto fra parcelle sui soli dati, meccanismi, stabilità con i valori misurati e analisi per il manoscritto.
