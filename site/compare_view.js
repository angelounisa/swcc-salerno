<script>
(function(){
'use strict';
const C = window.CMP.cmp, SW = window.CMP.swcc, KF = window.CMP.kfield, TC = window.CMP.thetaCal, EVS = window.CMP.eventsSummary, ME = window.CMP.mech, FS = window.CMP.stab;
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const $ = id => document.getElementById(id);
const SITES = ['NV','V'], LABEL = {NV:'Senza vegetazione', V:'Vegetata'}, COL = {NV:'--nv', V:'--veg'};
const PAIRS = C.config.pairs, PLAB = PAIRS.map(p => p[0]===p[1] ? `${p[0]} cm` : `${p[0]} / ${p[1]} cm`);
const fx = (x,k) => (x==null||!isFinite(x)) ? '–' : Number(x).toFixed(k).replace('.',',');
const it = x => (x==null||!isFinite(x)) ? '–' : Math.round(x).toLocaleString('it-IT');
const pc = x => (x==null) ? '–' : (x*100).toFixed(x<0.1?1:0).replace('.',',')+'%';
const pill = s => `<span class="pill" style="color:var(${COL[s]})">${LABEL[s]}</span>`;
const dIt = s => s.slice(0,10).split('-').reverse().join('/');
const mIt = m => ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'][+m.slice(5,7)-1]+' '+m.slice(2,4);
const seVG = (s,a,n) => Math.pow(1+Math.pow(a*s,n), -(1-1/n));
const SHADE = {NV_15:'--nv', V_15:'--veg', NV_30:'--nv', NV_60:'--dry', V_35:'--veg', V_60:'--wet'};
const ES = C.event_summary, EP = C.event_pairs, ST = C.storage_stats, DT = C.dry_spell_totals;
const PCOL = ['#c9a227','#8a5a9e','#2b7a8c'], PSYM = ['circle','square','diamond'], PDASH = ['solid','dash','dot'];
const dDM = s => s == null ? '–' : s.slice(8,10)+'/'+s.slice(5,7);
const nDays = (a,b) => (a==null||b==null) ? null : Math.round((new Date(b)-new Date(a))/864e5);
const ci = (v,k) => `<span class="muted">(${fx(v[0],k)}–${fx(v[1],k)})</span>`;
const wvar = () => (document.querySelector('input[name=wvar]:checked')||{value:'th'}).value;

function fill(){
  // ---- 1 summary
  const rows = [];
  PAIRS.forEach((p,j) => { const w=C.pairs[j].stats.wet, d=C.pairs[j].stats.dry;
    rows.push(['Suzione mediana, ottobre–aprile [kPa]', PLAB[j], fx(w.NV.median_s,0), fx(w.V.median_s,0)]);
    rows.push(['Tempo con suzione sotto 10 kPa, ottobre–aprile', PLAB[j], pc(w.NV.frac_below['10']), pc(w.V.frac_below['10'])]);
    rows.push(['Suzione mediana, maggio–settembre [kPa]', PLAB[j], it(d.NV.median_s), it(d.V.median_s)]);
    rows.push(['θ mediano, ottobre–aprile [m³/m³]', PLAB[j], fx(w.NV.median_theta,3), fx(w.V.median_theta,3)]);
    rows.push(['θ mediano, maggio–settembre [m³/m³]', PLAB[j], fx(d.NV.median_theta,3), fx(d.V.median_theta,3)]); });
  PAIRS.forEach((p,j) => { const e=EP[j];
    rows.push([`Eventi di pioggia con risposta di θ (su ${e.n_both} eventi comuni)`, PLAB[j], e.n_resp_NV, e.n_resp_V]);
    rows.push(['Aumento mediano di θ per evento [m³/m³]', PLAB[j], fx(e.median_dtheta_NV,3), fx(e.median_dtheta_V,3)]);
    rows.push(['Aumento mediano di S<sub>e</sub> per evento', PLAB[j], fx(e.median_dSe_NV,2), fx(e.median_dSe_V,2)]); });
  [['NV_15','V_15'],['NV_30','V_35'],['NV_60','V_60']].forEach((k,j) => {
    rows.push(['Pioggia più piccola che ha dato risposta [mm]', PLAB[j], fx(ES[k[0]].smallest_P_with_response,0), fx(ES[k[1]].smallest_P_with_response,0)]);
    rows.push(['Ritardo mediano della risposta dall\'inizio della pioggia [h]', PLAB[j], fx(ES[k[0]].median_lag_h,0), fx(ES[k[1]].median_lag_h,0)]);
    rows.push(['Eventi in cui la suzione scende sotto 10 kPa', PLAB[j], ES[k[0]].n_s_min_below_10kPa, ES[k[1]].n_s_min_below_10kPa]); });
  rows.push(['Acqua accumulata negli eventi di pioggia, in % della pioggia', '0–75 cm', pc(EVS.frac_NV), pc(EVS.frac_V)]);
  rows.push(['Pioggia dell\'evento sotto la quale l\'invaso non aumenta [mm]', '0–75 cm', fx(ME.M1.NV.fit.P0_mm,0), fx(ME.M1.V.fit.P0_mm,0)]);
  rows.push(['Quota della pioggia oltre quella soglia che resta nel profilo', '0–75 cm', fx(ME.M1.NV.fit.slope,2), fx(ME.M1.V.fit.slope,2)]);
  rows.push(['Invaso: minimo · medio · massimo [mm]', '0–75 cm', `${it(ST.NV.min_mm)} · ${it(ST.NV.mean_mm)} · ${it(ST.NV.max_mm)}`, `${it(ST.V.min_mm)} · ${it(ST.V.mean_mm)} · ${it(ST.V.max_mm)}`]);
  rows.push(['Variazione d\'invaso nel drying 2025 (26/04–28/08) [mm]', '0–75 cm', it(ST.drying_2025.NV), it(ST.drying_2025.V)]);
  rows.push(['Variazione d\'invaso nel drying 2026 (01/04–30/07) [mm]', '0–75 cm', it(ST.drying_2026.NV), it(ST.drying_2026.V)]);
  rows.push([`Acqua persa nei periodi senza pioggia (${DT.days} giorni in ${DT.n_spells} periodi) [mm]`, '0–75 cm', it(DT.loss_NV_mm), it(DT.loss_V_mm)]);
  const tj = s => { const t=C.soil_temperature_15cm.find(x=>x.site===s), i=t.months.indexOf('2025-07'); return `${fx(t.T15_mean[i],1)} · ${fx(t.T15_daily_range[i],1)}`; };
  rows.push(['Temperatura del suolo a luglio 2025: media · escursione giornaliera [°C]', '15 cm', tj('NV'), tj('V')]);
  FS.pairs.forEach((P,j) => { const w=P.stats.wet;
    rows.push(['Tempo con suzione praticamente annullata (χ·s sotto 0,5 kPa), ottobre–aprile', PLAB[j], pc(w.NV.frac_suction_stress_below['0.5']), pc(w.V.frac_suction_stress_below['0.5'])]);
    rows.push(['Fattore di sicurezza a pendio indefinito, 5° percentile, ottobre–aprile', PLAB[j], fx(w.NV.p5,2), fx(w.V.p5,2)]); });
  let h = `<thead><tr><th>Grandezza</th><th>Profondità</th><th>${LABEL.NV}</th><th>${LABEL.V}</th></tr></thead><tbody>`;
  rows.forEach(r => h += `<tr><td style="white-space:normal">${r[0]}</td><td>${r[1]}</td><td class="num">${r[2]}</td><td class="num">${r[3]}</td></tr>`);
  $('sumTable').innerHTML = h+'</tbody>';
  // ---- 3 duration table
  h = '<thead><tr><th>Profondità</th><th>Stagione</th><th>Parcella</th><th>Suzione 10° · 50° · 90° percentile [kPa]</th><th>θ 10° · 50° · 90° percentile [m³/m³]</th>'+C.config.suction_thresholds_kPa.map(t=>`<th>Tempo sotto ${t} kPa</th>`).join('')+'<th>Ore in cui la vegetata ha suzione più alta</th></tr></thead><tbody>';
  PAIRS.forEach((p,j) => [['wet','ottobre–aprile'],['dry','maggio–settembre']].forEach(([k,lab]) => SITES.forEach((s,q) => { const st=C.pairs[j].stats[k], x=st[s];
    h += `<tr><td>${PLAB[j]}</td><td>${lab}</td><td>${pill(s)}</td><td class="num">${fx(x.p10_s,0)} · ${fx(x.median_s,0)} · ${fx(x.p90_s,0)}</td><td class="num">${fx(x.p10_theta,3)} · ${fx(x.median_theta,3)} · ${fx(x.p90_theta,3)}</td>`+C.config.suction_thresholds_kPa.map(t=>`<td class="num">${pc(x.frac_below[String(t)])}</td>`).join('')+`<td class="num">${q===1?pc(st.frac_V_drier):''}</td></tr>`; })));
  $('durTable').innerHTML = h+'</tbody>';
  // ---- 4 events table
  h = '<thead><tr><th>Sensore</th><th>Eventi con dati</th><th>Eventi con risposta</th><th>Pioggia più grande senza risposta [mm]</th><th>Pioggia più piccola con risposta [mm]</th><th>Ritardo mediano [h]</th><th>Aumento mediano di θ quando risponde [m³/m³]</th><th>Aumento mediano di S<sub>e</sub> quando risponde</th><th>Eventi con suzione minima sotto 10 kPa</th></tr></thead><tbody>';
  [['NV',15],['V',15],['NV',30],['V',35],['NV',60],['V',60]].forEach(([s,d]) => { const e=ES[`${s}_${d}`];
    h += `<tr><td>${pill(s)} ${d} cm</td><td class="num">${e.n_events}</td><td class="num">${e.n_responded}</td><td class="num">${fx(e.largest_P_without_response,0)}</td><td class="num">${fx(e.smallest_P_with_response,0)}</td><td class="num">${fx(e.median_lag_h,0)}</td><td class="num">${fx(e.median_dtheta_when_responded,3)}</td><td class="num">${fx(e.median_dSe_when_responded,2)}</td><td class="num">${e.n_s_min_below_10kPa}</td></tr>`; });
  $('evTable').innerHTML = h+'</tbody>';
  h = '<thead><tr><th>Acqua accumulata in 0–75 cm negli eventi</th><th>Eventi</th><th>Pioggia [mm]</th><th>Senza vegetazione [mm]</th><th>Vegetata [mm]</th><th>Vegetata / senza veg.</th></tr></thead><tbody>';
  const rowE=(l,n,P,a,b)=>`<tr><td>${l}</td><td class="num">${n}</td><td class="num">${it(P)}</td><td class="num">${it(a)} (${Math.round(a/P*100)}%)</td><td class="num">${it(b)} (${Math.round(b/P*100)}%)</td><td class="num">${fx(b/a,2)}</td></tr>`;
  const dr=EVS['dry_season(May-Sep)'], we=EVS['wet_season(Oct-Apr)'];
  h += rowE('Tutti gli eventi con dati in entrambe le parcelle',EVS.n_both,EVS.sum_P,EVS.sum_dS_NV,EVS.sum_dS_V)+rowE('Maggio–settembre',dr.n,dr.P,dr.dS_NV,dr.dS_V)+rowE('Ottobre–aprile',we.n,we.P,we.dS_NV,we.dS_V);
  $('infTable').innerHTML = h+'</tbody>';
  // ---- 6 gradients table
  h = '<thead><tr><th>Parcella</th><th>Fra i sensori a</th><th>Ore con componente verticale del flusso verso il basso</th></tr></thead><tbody>';
  C.gradients.forEach(g => h += `<tr><td>${pill(g.site)}</td><td>${g.between[0]} e ${g.between[1]} cm</td><td class="num">${pc(g.frac_down_all)}</td></tr>`);
  $('grTable').innerHTML = h+'</tbody>';
  // ---- 7 air table
  const A=C.air; h = `<thead><tr><th>Aria a 40 cm dal suolo, ${dIt(A.period[0])}–${dIt(A.period[1])}</th>`+A.months.map(m=>`<th>${mIt(m)}</th>`).join('')+'</tr></thead><tbody>';
  [['Temperatura in campo aperto [°C]','Air_Temp_OUT'],['Temperatura sotto chioma [°C]','Air_Temp_IN'],['Umidità relativa in campo aperto [%]','Air_RH_OUT'],['Umidità relativa sotto chioma [%]','Air_RH_IN']].forEach(([l,k]) => h += `<tr><td>${l}</td>`+A[k].map(v=>`<td class="num">${fx(v,1)}</td>`).join('')+'</tr>');
  $('airTable').innerHTML = h+'</tbody>';
  // ---- 10 main drying curves
  h = '<thead><tr><th>Strato</th><th>Sensore</th><th>θr</th><th>θs</th><th>α [1/kPa] (IC 95%)</th><th>1/α [kPa]</th><th>n (IC 95%)</th><th>RMSE S<sub>e</sub> curva propria</th><th>RMSE S<sub>e</sub> curva comune</th><th>θr · θs con curva comune</th></tr></thead><tbody>';
  for (const lay of ['A1','A2']) { const sh=SW.shared[lay];
    Object.keys(sh.sensors).forEach(key => { const R=SW.sensors[key], p=R.params, ab=new Set(R.params_at_bound), q=sh.sensors[key];
      h += `<tr><td>${lay}</td><td>${pill(R.site)} ${R.depth_cm} cm</td><td class="num${ab.has('theta_r')?' bound':''}">${fx(p.theta_r,3)}${ab.has('theta_r')?' <span class="flag">vincolo</span>':''}</td><td class="num">${fx(p.theta_s,3)}</td><td class="num">${fx(p.alpha,3)} <span class="muted">(${fx(R.ci95.alpha[0],3)}–${fx(R.ci95.alpha[1],3)})</span></td><td class="num">${fx(1/p.alpha,1)}</td><td class="num">${fx(p.n,2)} <span class="muted">(${fx(R.ci95.n[0],2)}–${fx(R.ci95.n[1],2)})</span></td><td class="num">${fx(R.rmse_Se_env,3)}</td><td class="num">${fx(q.rmse_Se_shared,3)}</td><td class="num">${fx(q.theta_r,3)} · ${fx(q.theta_s,3)}</td></tr>`; });
    h += `<tr><td><b>${lay}</b></td><td><b>curva comune dello strato</b></td><td></td><td></td><td class="num"><b>${fx(sh.alpha,3)}</b></td><td class="num"><b>${fx(1/sh.alpha,1)}</b></td><td class="num"><b>${fx(sh.n,2)}</b></td><td></td><td></td><td></td></tr>`; }
  $('dcTable').innerHTML = h+'</tbody>';
  // ---- 11 K table
  h = '<thead><tr><th>Piano di controllo</th><th>Notti usate</th><th>Campo di suzione [kPa]</th><th>K a 10–40 kPa, mediana [cm/h]</th></tr></thead><tbody>';
  Object.entries(KF.planes).forEach(([k,p]) => { const s=k.split(' ')[0], v=p.points.K_cm_h.filter((_,i)=>p.points.s_kPa[i]>=10&&p.points.s_kPa[i]<=40).sort((a,b)=>a-b), med=v.length?v[Math.floor(v.length/2)]:null;
    h += `<tr><td>${pill(s)} ${k.slice(s.length+1).replace('.',',')}</td><td class="num">${p.n_nights}</td><td class="num">${fx(p.s_range_kPa[0],1)}–${fx(p.s_range_kPa[1],0)}</td><td class="num">${med==null?'–':med.toPrecision(2).replace('.',',')}</td></tr>`; });
  $('kTable').innerHTML = h+'</tbody>';
  // ---- 8 mechanisms
  { const M1=ME.M1, sp=Object.keys(M1.NV.spearman);
    h = '<thead><tr><th>Accumulo = b · (P − P<sub>0</sub>)</th><th>Eventi</th><th>P<sub>0</sub> [mm] (IC 95%)</th><th>b (IC 95%)</th><th>Scarto [mm]</th><th>Accumulo/pioggia con profilo asciutto · intermedio · bagnato</th></tr></thead><tbody>';
    SITES.forEach(s => { const f=M1[s].fit, a=M1[s].by_antecedent_storage;
      h += `<tr><td>${pill(s)}</td><td class="num">${f.n}</td><td class="num">${fx(f.P0_mm,1)} ${ci(f.P0_ci95,0)}</td><td class="num">${fx(f.slope,2)} ${ci(f.slope_ci95,2)}</td><td class="num">${fx(f.rmse_mm,1)}</td><td class="num">${a.map(x=>fx(x.stored_over_rain,2)).join(' · ')}</td></tr>`; });
    h += `<tr><td colspan="6" style="white-space:normal" class="muted">Correlazione per ranghi fra accumulo/pioggia e: `+sp.map(k=>`${k} ${SITES.map(s=>`${s} ${fx(M1[s].spearman[k].rho,2)}`).join(', ')}`).join(' · ')+'.</td></tr>';
    $('thrTable').innerHTML = h+'</tbody>';
    h = `<thead><tr><th>Ritorno stabile sotto ${ME.config.rewet_kPa} kPa, autunno 2025</th><th>Data</th><th>Pioggia dal ${dDM(ME.config.rewet_from)} [mm]</th></tr></thead><tbody>`;
    ME.M3.forEach(r => h += `<tr><td>${pill(r.site)} ${r.depth} cm</td><td class="num">${r.date?dIt(r.date):'–'}</td><td class="num">${it(r.rain_since_mm)}</td></tr>`);
    $('rewetTable').innerHTML = h+'</tbody>';
    h = '<thead><tr><th>Fronte umido</th><th>Eventi</th><th>Fuori ordine</th><th>15 → 30/35 cm [h]</th><th>30/35 → 60 cm [h]</th><th>Velocità [cm/h]</th></tr></thead><tbody>';
    ME.M5.forEach(r => h += `<tr><td>${pill(r.site)}</td><td class="num">${r.n_events}</td><td class="num">${r.n_out_of_order}</td><td class="num">${fx(r.lag_top_mid_h,0)} <span class="muted">(n ${r.n_top_mid})</span></td><td class="num">${fx(r.lag_mid_deep_h,0)} <span class="muted">(n ${r.n_mid_deep})</span></td><td class="num">${fx(r.speed_top_mid_cm_h,1)} → ${fx(r.speed_mid_deep_cm_h,1)}</td></tr>`);
    $('frontTable').innerHTML = h+'</tbody>';
    h = '<thead><tr><th>Perdita nei giorni senza pioggia</th><th>Sensore</th><th>Giorni</th><th>Escursione termica giornaliera [°C]</th><th>Calo di θ di giorno · di notte [10⁻³ m³/m³]</th><th>Quota diurna da θ (IC 95%)</th><th>Quota diurna dalla suzione (IC 95%)</th></tr></thead><tbody>';
    ME.M4.forEach(r => { const art = r.T_daily_range_C > 0.5, sh=(v,c)=> v==null ? '–' : `${pc(v)} ${ci(c.map(x=>x*100),0)}`;
      h += `<tr><td>${r.season}</td><td>${pill(r.site)} ${r.depth} cm</td><td class="num">${r.n_days}</td><td class="num${art?' bound':''}">${fx(r.T_daily_range_C,1)}${art?' <span class="flag">effetto termico</span>':''}</td><td class="num">${fx(r.theta_loss_day_x1000,2)} · ${fx(r.theta_loss_night_x1000,2)}</td><td class="num">${sh(r.theta_day_share,r.theta_day_share_ci95)}</td><td class="num">${sh(r.suction_day_share,r.suction_day_share_ci95)}</td></tr>`; });
    $('dayTable').innerHTML = h+'</tbody>';
    const m2 = (s,d) => ME.M2.find(r=>r.site===s&&r.depth===d), g = (s,d,y,t) => m2(s,d)[`${y}_${t}`];
    const fN=M1.NV.fit, fV=M1.V.fit, r3=ME.M3, rw=(s,d)=>r3.find(r=>r.site===s&&r.depth===d), m4=(se,s,d)=>ME.M4.find(r=>r.season===se&&r.site===s&&r.depth===d);
    const spr='marzo-maggio', f5=ME.M5, a1=SW.shared.A1, a2=SW.shared.A2;
    const mech = [
      `<b>Il terreno è lo stesso, cambia lo stato idrico.</b> In saturazione efficace i sensori dello stesso strato seguono la stessa curva principale di drying nelle due parcelle (sezione 10: A1 con 1/α = ${fx(1/a1.alpha,0)} kPa e n = ${fx(a1.n,2)}; A2 con 1/α = ${fx(1/a2.alpha,0)} kPa e n = ${fx(a2.n,2)}). Le differenze fra le parcelle vanno quindi cercate nei flussi d'acqua (quanta ne entra, quanta ne esce e da dove), non nella curva di ritenzione.`,
      `<b>Sotto bosco entra nel suolo circa metà della pioggia, oltre una soglia più alta.</b> L'acqua accumulata nei primi 75 cm cresce linearmente con la pioggia dell'evento oltre una soglia: senza vegetazione soglia ${fx(fN.P0_mm,0)} mm (${fx(fN.P0_ci95[0],0)}–${fx(fN.P0_ci95[1],0)}) e pendenza ${fx(fN.slope,2)} (${fx(fN.slope_ci95[0],2)}–${fx(fN.slope_ci95[1],2)}); sotto bosco soglia ${fx(fV.P0_mm,0)} mm (${fx(fV.P0_ci95[0],0)}–${fx(fV.P0_ci95[1],0)}) e pendenza ${fx(fV.slope,2)} (${fx(fV.slope_ci95[0],2)}–${fx(fV.slope_ci95[1],2)}). La pendenza sotto bosco è vicina alla frazione di pioggia che attraversa la chioma misurata in sito (49% fra il 15/01 e il 14/02/2026), una misura indipendente: l'intercettazione di chioma e lettiera basta a spiegare l'ordine di grandezza della differenza. <span class="muted">Limiti: gli intervalli delle due soglie si sovrappongono; una pendenza maggiore di 1 senza vegetazione non è possibile con la sola infiltrazione verticale (l'intervallo comprende 1): il sensore a 15 cm rappresenta tutto lo strato 0–22,5 cm e può esserci apporto laterale da monte.</span>`,
      `<b>Senza vegetazione il profilo trattiene meno quando è già bagnato.</b> Il rapporto accumulo/pioggia scende da ${fx(M1.NV.by_antecedent_storage[0].stored_over_rain,2)} con profilo asciutto a ${fx(M1.NV.by_antecedent_storage[2].stored_over_rain,2)} con profilo bagnato: in inverno una parte crescente della pioggia supera i 75 cm o non si infiltra. Sotto bosco non c'è un andamento ordinato (${M1.V.by_antecedent_storage.map(x=>fx(x.stored_over_rain,2)).join(' · ')}). <span class="muted">Limite: la correlazione per ranghi con l'invaso iniziale è debole in entrambe le parcelle.</span>`,
      `<b>L'essiccamento stagionale comincia insieme nelle due parcelle, poi procede in modo diverso.</b> La soglia di 100 kPa è superata quasi negli stessi giorni alle stesse profondità (15 cm: ${dDM(g('NV',15,2025,100))} e ${dDM(g('V',15,2025,100))} nel 2025, ${dDM(g('NV',15,2026,100))} e ${dDM(g('V',15,2026,100))} nel 2026; 60 cm: ${dDM(g('NV',60,2025,100))} e ${dDM(g('V',60,2025,100))}, ${dDM(g('NV',60,2026,100))} e ${dDM(g('V',60,2026,100))}): l'inizio è comandato dal clima e scende dall'alto. Verso i 1000 kPa i percorsi si separano. Senza vegetazione il fronte secco scende dalla superficie: 15, 30 e 60 cm arrivano a 1000 kPa il ${dDM(g('NV',15,2025,1000))}, il ${dDM(g('NV',30,2025,1000))} e il ${dDM(g('NV',60,2025,1000))} nel 2025 (${nDays(g('NV',15,2025,1000),g('NV',60,2025,1000))} giorni fra il primo e l'ultimo) e il ${dDM(g('NV',15,2026,1000))}, il ${dDM(g('NV',30,2026,1000))} e il ${dDM(g('NV',60,2026,1000))} nel 2026 (${nDays(g('NV',15,2026,1000),g('NV',60,2026,1000))} giorni). Sotto bosco le tre profondità arrivano in ${nDays(g('V',15,2025,1000),g('V',60,2025,1000))} giorni nel 2025 (${dDM(g('V',15,2025,1000))}, ${dDM(g('V',35,2025,1000))}, ${dDM(g('V',60,2025,1000))}) e nel 2026 la prima è quella a 35 cm (${dDM(g('V',35,2026,1000))}, contro ${dDM(g('V',15,2026,1000))} a 15 cm e ${dDM(g('V',60,2026,1000))} a 60 cm), cioè la profondità con più radici nei campioni del bosco (3,56 g a 40 cm contro 0,98 g a 20 cm e 0,46 g a 60 cm). È il comportamento atteso da un fronte di evaporazione nel primo caso e da un assorbimento radicale distribuito nel secondo. <span class="muted">Limite: due sole stagioni.</span>`,
      `<b>In profondità l'acqua si perde soprattutto di giorno, in entrambe le parcelle.</b> Nei giorni senza pioggia il calo di θ e l'aumento della suzione si concentrano fra le 6 e le 18: in primavera la quota diurna è ${pc(m4(spr,'V',35).theta_day_share)} a 35 cm e ${pc(m4(spr,'V',60).theta_day_share)} a 60 cm sotto bosco (dalla suzione ${pc(m4(spr,'V',35).suction_day_share)} e ${pc(m4(spr,'V',60).suction_day_share)}), e ${pc(m4(spr,'NV',60).theta_day_share)} a 60 cm senza vegetazione (dalla suzione ${pc(m4(spr,'NV',60).suction_day_share)}). A queste profondità l'escursione termica giornaliera è di 0,1–0,2 °C, quindi non è un effetto della temperatura sulla misura. Il drenaggio per gravità non distingue il giorno dalla notte e darebbe il 50%: la perdita è quindi in gran parte assorbimento radicale. Vale anche per la parcella senza vegetazione, che non si comporta come un suolo nudo: nei campioni di quella parcella le radici ci sono (1,5 g a 20 cm, 0,96 g a 40 cm, 0,36 g a 60 cm). <span class="muted">Limiti: i cali giornalieri valgono uno o pochi passi di risoluzione del sensore, per cui contano solo le medie su decine di giorni; a 15 cm, e d'estate a 30 cm senza vegetazione, il ciclo termico altera la misura; a 60 cm sotto bosco d'estate θ e suzione non concordano.</span>`,
      `<b>In autunno il bosco ritarda la riumidificazione, soprattutto in superficie e a 60 cm.</b> Dopo l'estate 2025 il sensore a 15 cm senza vegetazione torna stabilmente sotto ${ME.config.rewet_kPa} kPa il ${dDM(rw('NV',15).date)}, con ${it(rw('NV',15).rain_since_mm)} mm di pioggia; sotto bosco solo il ${dDM(rw('V',15).date)}, dopo ${it(rw('V',15).rain_since_mm)} mm. A 60 cm: ${dDM(rw('NV',60).date)} (${it(rw('NV',60).rain_since_mm)} mm) contro ${dDM(rw('V',60).date)} (${it(rw('V',60).rain_since_mm)} mm). In quei mesi la mediana mensile della suzione sotto bosco arriva a 22 volte quella senza vegetazione (grafico in alto a sinistra), mentre nel resto dell'anno il rapporto a 30/35 e 60 cm sta per lo più fra 1 e 2, con punte a febbraio e maggio 2026. <span class="muted">Le misure non distinguono fra le cause possibili: intercettazione delle prime piogge, deficit idrico maggiore da colmare in profondità, idrorepellenza della lettiera e del suolo secco. Un solo autunno.</span>`,
      `<b>Il fronte umido avanza in ordine e sotto bosco rallenta in profondità.</b> In nessun evento il sensore profondo risponde prima di quello intermedio (${f5[0].n_out_of_order} casi su ${f5[0].n_events} senza vegetazione, ${f5[1].n_out_of_order} su ${f5[1].n_events} sotto bosco): a scala oraria non ci sono segni di flusso preferenziale che scavalchi i sensori. Senza vegetazione il fronte accelera scendendo (${fx(f5[0].speed_top_mid_cm_h,1)} poi ${fx(f5[0].speed_mid_deep_cm_h,1)} cm/h), sotto bosco rallenta (${fx(f5[1].speed_top_mid_cm_h,1)} poi ${fx(f5[1].speed_mid_deep_cm_h,1)} cm/h), come ci si aspetta se il sottosuolo è più secco e assorbe il fronte. <span class="muted">Limiti: tre sole profondità, pochi eventi che arrivano a 60 cm sotto bosco (n ${f5[1].n_mid_deep}).</span>`,
      `<b>In estate l'effetto del bosco cambia segno con la profondità.</b> A 15 cm il rapporto fra le suzioni scende sotto 1 (suolo ombreggiato, circa 10 °C più fresco a luglio, sezione 7), mentre a 30/35 e 60 cm resta sopra 1: il bosco protegge la superficie dall'evaporazione e prosciuga il sottosuolo.`];
    $('mechList').innerHTML = mech.map(x=>'<li>'+x+'</li>').join(''); }
  // ---- 9 stability
  { const c=FS.config, lim=FS.fs_dry_limit.A2, W=FS.pairs.map(P=>P.stats.wet);
    $('fsIntro').innerHTML = `FS = tan φ′ / tan β + (c′ + χ · s · tan φ′) / (W · sen β · cos β), con s la suzione misurata, χ = S<sub>e</sub> del sensore, W il peso della colonna di terreno sopra il sensore calcolato con il peso secco di laboratorio e il θ misurato, β = ${fx(c.beta_deg,0)}°, φ′ = ${fx(c.soil.A2.phi_deg,1)}°, c′ = ${fx(c.c_kPa,0)}. Quando la suzione si annulla FS scende al valore dato dal solo attrito, tan φ′ / tan β = ${fx(lim,2)}, uguale nelle due parcelle. I sensori non misurano pressioni positive, quindi il calcolo non può scendere sotto questo valore.`;
    h = '<thead><tr><th>Ottobre–aprile</th><th>Parcella</th><th>Peso della colonna W [kPa]</th><th>χ·s mediana [kPa]</th>'+c.suction_stress_thresholds_kPa.map(t=>`<th>Tempo con χ·s sotto ${String(t).replace('.',',')} kPa</th>`).join('')+'<th>FS minimo · 5° percentile · mediana</th>'+c.fs_thresholds.slice(0,2).map(t=>`<th>Tempo con FS sotto ${String(t).replace('.',',')}</th>`).join('')+`<th>Variazione di FS per ${fx(c.sensor_accuracy_kPa,0)} kPa di suzione</th><th>Ore in cui la vegetata ha FS più alto</th></tr></thead><tbody>`;
    FS.pairs.forEach((P,j) => SITES.forEach((s,q) => { const x=P.stats.wet[s];
      h += `<tr><td>${PLAB[j]}</td><td>${pill(s)}</td><td class="num">${fx(P.column_weight_kPa[s],1)}</td><td class="num">${fx(x.suction_stress_median_kPa,1)}</td>`+c.suction_stress_thresholds_kPa.map(t=>`<td class="num">${pc(x.frac_suction_stress_below[t.toFixed(1)])}</td>`).join('')+`<td class="num">${fx(x.min,2)} · ${fx(x.p5,2)} · ${fx(x.median,1)}</td>`+c.fs_thresholds.slice(0,2).map(t=>`<td class="num">${pc(x.frac_below[t.toFixed(1)])}</td>`).join('')+`<td class="num">± ${fx(P.dFS_for_sensor_accuracy[s],1)}</td><td class="num">${q===1?pc(P.stats.wet.frac_V_higher):''}</td></tr>`; }));
    $('fsTable').innerHTML = h+'</tbody>';
    h = '<thead><tr><th>FS minimo negli eventi</th><th>Eventi</th><th>Vegetata più alta</th><th>Mediana: senza veg. · vegetata</th><th>Sotto 1,5: senza veg. · vegetata</th></tr></thead><tbody>';
    FS.event_pairs.forEach((e,j) => h += `<tr><td>${PLAB[j]}</td><td class="num">${e.n_both}</td><td class="num">${e.n_V_higher}</td><td class="num">${fx(e.median_NV,2)} · ${fx(e.median_V,2)}</td><td class="num">${e.n_below_1p5_NV} · ${e.n_below_1p5_V}</td></tr>`);
    $('fsEvTable').innerHTML = h+'</tbody>';
    const chiLab={Se:'S<sub>e</sub> misurata', Sr:'θ / n', SeVG:'S<sub>e</sub> dalla curva'};
    h = '<thead><tr><th rowspan="2">β</th><th rowspan="2">χ</th><th rowspan="2">FS senza suzione</th><th colspan="3" style="text-align:center">Tempo con FS sotto 1,5, ottobre–aprile: senza veg. · vegetata</th></tr><tr>'+PLAB.map(l=>`<th style="text-align:right">${l}</th>`).join('')+'</tr></thead><tbody>';
    FS.sensitivity.forEach(r => h += `<tr><td>${fx(r.beta_deg,0)}°</td><td>${chiLab[r.chi]}</td><td class="num">${fx(r.fs_limit,2)}</td>`+r.pairs.map(p=>`<td class="num">${pc(p.NV.frac_below['1.5'])} · ${pc(p.V.frac_below['1.5'])}</td>`).join('')+'</tr>');
    $('fsSensTable').innerHTML = h+'</tbody>';
    const z=k=>pc(W[k].NV.frac_suction_stress_below['0.5']), zv=k=>pc(W[k].V.frac_suction_stress_below['0.5']);
    const fsn = [
      `<b>Il risultato.</b> Il valore limite di FS è lo stesso nelle due parcelle; cambia quanto spesso e fino a che profondità la suzione si annulla. Da ottobre ad aprile, senza vegetazione il contributo della suzione è praticamente nullo (χ·s sotto 0,5 kPa) per una quota delle ore pari a ${z(0)} a 15 cm, ${z(1)} a 30 cm e ${z(2)} a 60 cm. Sotto bosco succede a 15 cm quanto senza vegetazione (${zv(0)}), ma quasi mai a 35 cm (${zv(1)}) e mai a 60 cm, dove χ·s non scende sotto ${fx(W[2].V.suction_stress_min_kPa,1)} kPa. Negli eventi di pioggia il FS minimo scende sotto 1,5 in ${FS.event_pairs[1].n_below_1p5_NV} eventi su ${FS.event_pairs[1].n_both} a 30 cm senza vegetazione contro ${FS.event_pairs[1].n_below_1p5_V} a 35 cm sotto bosco, e in ${FS.event_pairs[2].n_below_1p5_NV} su ${FS.event_pairs[2].n_both} contro ${FS.event_pairs[2].n_below_1p5_V} a 60 cm. L'effetto del bosco sulla stabilità è quindi in profondità, non in superficie.`,
      `<b>Precisione.</b> Vicino alla saturazione il sensore di suzione ha un'accuratezza dichiarata dell'ordine di ± ${fx(c.sensor_accuracy_kPa,0)} kPa (specifica del costruttore per il TEROS 21 fra 9 e 100 kPa, da verificare per il modello installato). Con colonne di terreno così leggere, ${fx(c.sensor_accuracy_kPa,0)} kPa spostano FS di ${fx(FS.pairs[0].dFS_for_sensor_accuracy.NV,1)} a 15 cm, di circa ${fx(FS.pairs[1].dFS_for_sensor_accuracy.NV,1)} a 30/35 cm e di ${fx(FS.pairs[2].dFS_for_sensor_accuracy.NV,1)} a 60 cm. I valori di FS vicini al limite non sono quindi risolti dalla misura: il confronto solido è sulla frequenza con cui la suzione si annulla, non sui decimali di FS.`,
      `<b>Cosa manca.</b> La superficie più profonda che si può valutare con le misure è a 60 cm, mentre lo strato A2 arriva a circa 1 m e sotto c'è C1: le superfici di scorrimento critiche possono essere più profonde dei sensori. Non sono misurate pressioni positive (falde sospese) e non è incluso il rinforzo delle radici, che aumenterebbe FS solo nella parcella vegetata. Per estendere il confronto sotto i 60 cm servono misure più profonde oppure il solutore, da vincolare a queste misure.`,
      `<b>Sensibilità.</b> Con β = ${fx(FS.sensitivity[0].beta_deg,0)}° l'attrito da solo dà FS = ${fx(FS.sensitivity[0].fs_limit,2)} e nessuna ora scende sotto 1,5; con β = ${fx(FS.sensitivity[FS.sensitivity.length-1].beta_deg,0)}° il limite è ${fx(FS.sensitivity[FS.sensitivity.length-1].fs_limit,2)}. Prendere χ dalla curva principale di drying alla suzione misurata, senza usare θ, dà quasi gli stessi numeri; χ = θ / n (grado di saturazione con la porosità di laboratorio) abbassa FS. In tutti i casi l'ordine fra le parcelle a 30/35 e 60 cm non cambia.`,
      `<b>Ore non valutate.</b> Quando la S<sub>e</sub> misurata è sotto ${String(c.se_min_valid).replace('.',',')} il prodotto χ·s non è valutato: θ<sub>r</sub> è il θ più basso osservato da ogni sensore, quindi lì χ va a zero per costruzione qualunque sia la suzione. Succede solo nei mesi secchi (${PLAB.map((l,j)=>`${it(FS.pairs[j].stats.all.n_hours_not_evaluated)} ore a ${l}`).join(', ')}; nessuna fra ottobre e aprile) e produce i vuoti estivi nel grafico. Per il peso della colonna, dove manca θ a 15 cm sotto bosco (31/01–04/03/2026) è usata la sua mediana invernale; la coppia a 15 cm in quel periodo non è valutata.`];
    $('fsNotes').innerHTML = fsn.map(x=>'<li>'+x+'</li>').join(''); }
  // ---- notes
  const w15=C.pairs[0].stats.wet, w60=C.pairs[2].stats.wet, d15=C.pairs[0].stats.dry, d60=C.pairs[2].stats.dry, a2=SW.shared.A2, a1=SW.shared.A1;
  const notes = [
    `<b>Stagione umida.</b> Da ottobre ad aprile la parcella vegetata ha suzione più alta a tutte le profondità: a 60 cm in ogni ora (${pc(w60.frac_V_drier)}), a 30/35 cm nell'${pc(C.pairs[1].stats.wet.frac_V_drier)} delle ore, a 15 cm nel ${pc(w15.frac_V_drier)}. Il tempo passato sotto 10 kPa, la condizione più vicina alla saturazione, è due o tre volte minore sotto bosco.`,
    `<b>Stagione secca.</b> D'estate la differenza si inverte in superficie: a 15 cm la suzione mediana è ${it(d15.NV.median_s)} kPa senza vegetazione contro ${it(d15.V.median_s)} kPa sotto bosco, il che è coerente con un suolo ombreggiato e molto più fresco. In profondità resta più secca la vegetata (${it(d60.V.median_s)} contro ${it(d60.NV.median_s)} kPa a 60 cm), per l'assorbimento delle radici.`,
    `<b>Risposta alla pioggia.</b> Senza vegetazione il sensore a 15 cm risponde a tutti gli eventi; sotto bosco a poco più della metà, e serve più pioggia perché l'acqua arrivi in profondità (a 60 cm la pioggia più piccola con risposta è ${fx(ES.V_60.smallest_P_with_response,0)} mm contro ${fx(ES.NV_60.smallest_P_with_response,0)} mm). La risposta sotto bosco è anche più lenta e molto più piccola in termini di S<sub>e</sub>. La suzione minima raggiunta nell'evento è più alta sotto bosco in ${EP[2].n_V_smin_higher} eventi su ${EP[2].n_both} a 60 cm, in ${EP[1].n_V_smin_higher} su ${EP[1].n_both} a 30/35 cm e in ${EP[0].n_V_smin_higher} su ${EP[0].n_both} a 15 cm.`,
    `<b>Acqua accumulata.</b> L'accumulo nei primi 75 cm è un limite inferiore dell'infiltrazione: non conta l'acqua che supera i 75 cm né quella che resta sopra il sensore a 15 cm.`,
    `<b>Periodi senza pioggia.</b> La perdita d'invaso è la somma di evapotraspirazione e drenaggio sotto i 75 cm: dai soli dati non si separano. La parcella senza vegetazione perde circa il doppio, ma parte anche da un invaso più alto: sotto bosco entra meno acqua e quindi ce n'è meno da perdere.`,
    `<b>Direzione del flusso.</b> Il segno del gradiente verticale fra due sensori dice solo se la componente verticale del flusso è verso il basso o verso l'alto; con suzioni molto alte e misure a tre sole profondità il valore del gradiente è incerto.`,
    `<b>Temperatura.</b> La chioma attenua molto il riscaldamento del suolo: a luglio 2025 a 15 cm la media è circa 10 °C più bassa e l'escursione giornaliera è quasi annullata. L'aria a 40 cm dal suolo è in media ${fx(-C.air.mean_diff_T_in_minus_out,1)} °C più fresca sotto chioma (marzo–settembre 2025).`,
    `<b>Curve principali di drying.</b> In termini di S<sub>e</sub> i sensori dello stesso strato seguono la stessa curva nelle due parcelle (A1: 1/α = ${fx(1/a1.alpha,0)} kPa, n = ${fx(a1.n,2)}; A2: 1/α = ${fx(1/a2.alpha,0)} kPa, n = ${fx(a2.n,2)}). Le differenze fra le parcelle non stanno quindi nella curva di ritenzione del terreno ma nello stato idrico in cui il terreno si trova.`,
    `<b>Conducibilità dal drenaggio notturno.</b> È una stima dai dati (perdita d'invaso nelle notti senza pioggia divisa per il gradiente misurato), con geometria di pendio indefinito a 32°. Vicino al limite di risoluzione dei sensori i punti sono incerti.`,
    `<b>Dati usati.</b> θ è calibrato per terreno (funzioni ricavate dal file calibrato della parcella senza vegetazione fino al ${dIt(TC.calibrated_file_last_time)} e applicate a tutta la serie di entrambe le parcelle; a 60 cm nella vegetata il ${Math.round(TC.applied.V_60.frac_extrapolated*100)}% delle misure è fuori dal campo della calibrazione). S<sub>e</sub> usa θ<sub>r</sub> e θ<sub>s</sub> di ogni sensore dalla curva principale di drying. A 15 cm nella vegetata θ manca dal 31/01 al 04/03/2026. La pioggia è quella unificata, fino al ${dIt(C.rain_period[1])}.`,
    `<b>Criteri.</b> Evento di pioggia: ore piovose separate da meno di 24 ore senza pioggia, almeno 7,5 mm. Risposta: aumento di θ di almeno ${String(C.config.response_dtheta).replace('.',',')} m³/m³ entro 24 ore dalla fine dell'evento. Periodo senza pioggia: almeno ${C.config.spell_min_dry_h+C.config.spell_min_len_h} ore asciutte, escluse le prime ${C.config.spell_skip_h}.`,
    `<b>Confronto in θ.</b> Con il selettore in alto i grafici delle sezioni 2 e 4 mostrano θ calibrato oppure S<sub>e</sub>. In θ il confronto a 60 cm va letto con cautela: il sensore sotto bosco legge circa 0,2 m³/m³ in meno di quello senza vegetazione anche d'inverno, quando le suzioni sono simili. Quella differenza riflette il terreno attorno al sensore e la calibrazione (lì in parte estrapolata), non la vegetazione; per questo le curve di ritenzione sono confrontate in S<sub>e</sub>. Le variazioni di θ durante gli eventi ne risentono meno.`,
    `<b>Modello numerico.</b> Il solutore alle differenze finite e la sua verifica restano nel repository (cartelle <code>sim/</code> e <code>verify/</code>); non sono usati in questa scheda. La stabilità della sezione 9 è calcolata direttamente dalle misure.`];
  $('cmpNotes').innerHTML = notes.map(x=>'<li>'+x+'</li>').join('');
}

function plots(){
  const fg=css('--fg'), mu=css('--muted'), gr=css('--grid'), ln=css('--line'), pn=css('--panel'), cN=css('--nv'), cV=css('--veg'), cc={NV:cN,V:cV};
  const base = (xt,yt) => ({ paper_bgcolor:'rgba(0,0,0,0)', plot_bgcolor:'rgba(0,0,0,0)', font:{family:css('--f-body'),size:12,color:fg},
    margin:{l:58,r:12,t:30,b:44}, hovermode:'closest', showlegend:true, legend:{orientation:'h',x:0,y:1.02,yanchor:'bottom',font:{size:11,color:mu}},
    xaxis:{title:{text:xt,font:{color:mu}},gridcolor:gr,linecolor:ln,zeroline:false,tickfont:{color:mu}},
    yaxis:{title:{text:yt,font:{color:mu}},gridcolor:gr,linecolor:ln,zeroline:false,tickfont:{color:mu}} });
  const cfgP={displaylogo:false,responsive:true,modeBarButtonsToRemove:['lasso2d','select2d']};
  const axis = (t,dom,extra) => Object.assign({title:{text:t,font:{size:11,color:mu}},domain:dom,gridcolor:gr,linecolor:ln,zeroline:false,tickfont:{color:mu}},extra||{});
  // ---- 2 paired series
  const WV = wvar(), wk = WV==='th' ? 'th' : 'Se', wlab = WV==='th' ? 'θ' : 'S<sub>e</sub>', wfmt = WV==='th' ? '.3f' : '.2f', evk = WV==='th' ? 'dtheta' : 'dSe';
  { const S=C.series, tr=[{type:'bar',x:C.rain_daily.t,y:C.rain_daily.mm,name:'pioggia',marker:{color:css('--wet')},yaxis:'y',hovertemplate:'%{x}<br>%{y:.1f} mm/g<extra></extra>'}];
    PAIRS.forEach((p,j) => SITES.forEach((s,k) => {
      tr.push({type:'scatter',mode:'lines',x:S.t,y:S[`${wk}_${s}_${p[k]}`],name:LABEL[s],legendgroup:s,showlegend:j===0,line:{color:cc[s],width:1.3},yaxis:'y'+(j+2),hovertemplate:`%{x}<br>${wlab} = %{y:${wfmt}}<extra>${s} ${p[k]} cm</extra>`});
      tr.push({type:'scatter',mode:'lines',x:S.t,y:S[`s_${s}_${p[k]}`],legendgroup:s,showlegend:false,line:{color:cc[s],width:1.3},yaxis:'y'+(j+5),hovertemplate:`%{x}<br>s = %{y:.0f} kPa<extra>${s} ${p[k]} cm</extra>`}); }));
    const L={paper_bgcolor:'rgba(0,0,0,0)',plot_bgcolor:'rgba(0,0,0,0)',font:{family:css('--f-body'),size:12,color:fg},margin:{l:66,r:16,t:30,b:36},hovermode:'x unified',bargap:0,
      legend:{orientation:'h',x:0,y:1.02,yanchor:'bottom',font:{size:11,color:mu}}, xaxis:{type:'date',gridcolor:gr,linecolor:ln,tickfont:{color:mu},anchor:'y7'},
      yaxis:axis('pioggia [mm/g]',[0.90,1])};
    const dS=[[0.76,0.875],[0.62,0.735],[0.48,0.595]], dP=[[0.32,0.445],[0.16,0.285],[0,0.125]];
    PAIRS.forEach((p,j) => { L['yaxis'+(j+2)]=axis(`${wlab} ${PLAB[j]}`,dS[j]); L['yaxis'+(j+5)]=axis(`suzione ${PLAB[j]} [kPa]`,dP[j],{type:'log',dtick:1}); });
    Plotly.react('pairPlot',tr,L,cfgP); }
  // ---- 3 duration curves
  PAIRS.forEach((p,j) => { const D=C.pairs[j].duration, tr=SITES.map((s,k)=>({type:'scatter',mode:'lines',x:D.exceedance_pct,y:D[s],name:`${LABEL[s]} · ${p[k]} cm`,line:{color:cc[s],width:2.5},hovertemplate:`${LABEL[s]}<br>suzione superata nel %{x:.0f}% del tempo: %{y:.0f} kPa<extra></extra>`}));
    const L=base('% del tempo in cui la suzione è superata','suzione [kPa]'); L.yaxis.type='log'; L.yaxis.dtick=1; L.xaxis.range=[0,100];
    Plotly.react('dur-'+j,tr,L,cfgP); });
  // ---- 4 events
  PAIRS.forEach((p,j) => { const tr=SITES.map((s,k)=>{ const e=C.events.filter(x=>x[`${s}_${p[k]}`]);
      return {type:'scatter',mode:'markers',x:e.map(x=>x.P_mm),y:e.map(x=>x[`${s}_${p[k]}`][evk]),text:e.map(x=>dIt(x.start)),name:`${LABEL[s]} · ${p[k]} cm`,marker:{size:8,color:cc[s],opacity:.8,symbol:s==='V'?'diamond':'circle',line:{width:1,color:pn}},hovertemplate:'%{text}<br>pioggia %{x:.0f} mm<br>Δ'+wlab+' = %{y:'+wfmt+'}<extra>'+LABEL[s]+'</extra>'}; });
    const L=base('pioggia cumulata dell\'evento [mm]','aumento di '+wlab+(WV==='th'?' [m³/m³]':'')); L.xaxis.range=[0,215];
    Plotly.react('ev-'+j,tr,L,cfgP); });
  { const sh=PCOL, tr=PAIRS.map((p,j)=>{ const e=C.events.filter(x=>x[`NV_${p[0]}`]&&x[`V_${p[1]}`]);
      return {type:'scatter',mode:'markers',x:e.map(x=>Math.max(x[`NV_${p[0]}`].s_min,0.1)),y:e.map(x=>Math.max(x[`V_${p[1]}`].s_min,0.1)),text:e.map(x=>dIt(x.start)+' · '+Math.round(x.P_mm)+' mm'),name:PLAB[j],marker:{size:8,color:sh[j],opacity:.8,symbol:['circle','square','diamond'][j],line:{width:1,color:pn}},hovertemplate:'%{text}<br>senza veg. %{x:.1f} kPa<br>vegetata %{y:.1f} kPa<extra>'+PLAB[j]+'</extra>'}; });
    tr.push({type:'scatter',mode:'lines',x:[0.1,3000],y:[0.1,3000],name:'uguale',line:{color:mu,width:1,dash:'dot'},hoverinfo:'skip'});
    const L=base('suzione minima nell\'evento, senza vegetazione [kPa]','suzione minima nell\'evento, vegetata [kPa]'); L.xaxis.type='log'; L.yaxis.type='log'; L.xaxis.dtick=1; L.yaxis.dtick=1;
    Plotly.react('sminPlot',tr,L,cfgP); }
  { const tr=SITES.map(s=>{ const e=C.events.filter(x=>x['dS_'+s]!=null);
      return {type:'scatter',mode:'markers',x:e.map(x=>x.P_mm),y:e.map(x=>x['dS_'+s]),text:e.map(x=>dIt(x.start)),name:LABEL[s],marker:{size:9,color:cc[s],opacity:.8,symbol:s==='V'?'diamond':'circle',line:{width:1,color:pn}},hovertemplate:'%{text}<br>pioggia %{x:.0f} mm<br>accumulo %{y:.0f} mm<extra>'+LABEL[s]+'</extra>'}; });
    tr.push({type:'scatter',mode:'lines',x:[0,210],y:[0,210],name:'accumulo = pioggia',line:{color:mu,width:1,dash:'dot'},hoverinfo:'skip'});
    const L=base('pioggia cumulata dell\'evento [mm]','acqua accumulata in 0–75 cm [mm]'); L.yaxis.range=[-5,130]; L.xaxis.range=[0,215];
    Plotly.react('infPlot',tr,L,cfgP); }
  // ---- 5 dry spells and storage
  { const M=C.dry_spell_monthly, tr=SITES.map(s=>({type:'bar',x:M.map(m=>mIt(m.month)),y:M.map(m=>m[`loss_${s}_mm_d`]),name:LABEL[s],marker:{color:cc[s],line:{width:2,color:pn}},customdata:M.map(m=>m.days),hovertemplate:'%{x}<br>%{y:.2f} mm/giorno<br>%{customdata} giorni senza pioggia<extra>'+LABEL[s]+'</extra>'}));
    const L=base('','perdita d\'invaso [mm/giorno]'); L.barmode='group'; L.bargap=0.25; L.xaxis.type='category';
    Plotly.react('lossPlot',tr,L,cfgP); }
  { const sd=C.storage_daily, tr=[{type:'bar',x:C.rain_daily.t,y:C.rain_daily.mm,name:'pioggia',marker:{color:css('--wet')},yaxis:'y',hovertemplate:'%{x}<br>%{y:.1f} mm/g<extra></extra>'}]
      .concat(SITES.map(s=>({type:'scatter',mode:'lines',x:sd.t,y:sd[s],name:LABEL[s],line:{color:cc[s],width:2},yaxis:'y2',hovertemplate:'%{x}<br>%{y:.0f} mm<extra>'+LABEL[s]+'</extra>'})));
    const L={paper_bgcolor:'rgba(0,0,0,0)',plot_bgcolor:'rgba(0,0,0,0)',font:{family:css('--f-body'),size:12,color:fg},margin:{l:66,r:16,t:30,b:36},hovermode:'x unified',bargap:0,
      legend:{orientation:'h',x:0,y:1.02,yanchor:'bottom',font:{size:11,color:mu}}, xaxis:{type:'date',gridcolor:gr,linecolor:ln,tickfont:{color:mu},anchor:'y2'},
      yaxis:axis('pioggia [mm/g]',[0.76,1]), yaxis2:axis('invaso 0–75 cm [mm]',[0,0.7])};
    Plotly.react('stoPlot',tr,L,cfgP); }
  // ---- 6 gradients
  { const tr=C.gradients.map((g,j)=>({type:'scatter',mode:'lines+markers',x:g.months.map(m=>m+'-15'),y:g.frac_down.map(v=>v*100),name:`${LABEL[g.site]} · ${g.between[0]}–${g.between[1]} cm`,line:{color:cc[g.site],width:2,dash:j%2?'dash':'solid'},marker:{size:6,symbol:j%2?'diamond':'circle'},hovertemplate:'%{x|%b %Y}<br>%{y:.0f}% delle ore verso il basso<extra>'+LABEL[g.site]+' '+g.between.join('–')+' cm</extra>'}));
    const L=base('','ore con flusso verticale verso il basso [%]'); L.xaxis.type='date'; L.yaxis.range=[-3,103];
    Plotly.react('grPlot',tr,L,cfgP); }
  // ---- 7 temperature
  { const T=C.soil_temperature_15cm, tr=[];
    T.forEach(t=>{ tr.push({type:'scatter',mode:'lines+markers',x:t.months.map(m=>m+'-15'),y:t.T15_mean,name:LABEL[t.site]+' · media',legendgroup:t.site,line:{color:cc[t.site],width:2},marker:{size:5},yaxis:'y',hovertemplate:'%{x|%b %Y}<br>%{y:.1f} °C<extra>'+LABEL[t.site]+'</extra>'});
      tr.push({type:'scatter',mode:'lines+markers',x:t.months.map(m=>m+'-15'),y:t.T15_daily_range,name:LABEL[t.site]+' · escursione giornaliera',legendgroup:t.site,line:{color:cc[t.site],width:2,dash:'dash'},marker:{size:5,symbol:'diamond'},yaxis:'y2',hovertemplate:'%{x|%b %Y}<br>%{y:.1f} °C<extra>'+LABEL[t.site]+'</extra>'}); });
    const L={paper_bgcolor:'rgba(0,0,0,0)',plot_bgcolor:'rgba(0,0,0,0)',font:{family:css('--f-body'),size:12,color:fg},margin:{l:66,r:16,t:44,b:36},hovermode:'x unified',
      legend:{orientation:'h',x:0,y:1.02,yanchor:'bottom',font:{size:11,color:mu}}, xaxis:{type:'date',gridcolor:gr,linecolor:ln,tickfont:{color:mu},anchor:'y2'},
      yaxis:axis('temperatura media a 15 cm [°C]',[0.48,1]), yaxis2:axis('escursione giornaliera [°C]',[0,0.40])};
    Plotly.react('tempPlot',tr,L,cfgP); }
  // ---- 8 mechanisms
  { const tr=ME.M6.map((r,j)=>({type:'scatter',mode:'lines+markers',x:r.months.map(m=>m+'-15'),y:r.suction_ratio_V_over_NV,name:PLAB[j],line:{color:PCOL[j],width:2,dash:PDASH[j]},marker:{size:6,symbol:PSYM[j]},customdata:r.theta_diff_V_minus_NV,hovertemplate:'%{x|%b %Y}<br>suzione vegetata / senza veg. = %{y:.2f}<br>θ vegetata − senza veg. = %{customdata:.3f}<extra>'+PLAB[j]+'</extra>'}));
    const xr=[ME.M6[0].months[0]+'-01', ME.M6[0].months[ME.M6[0].months.length-1]+'-28'];
    tr.push({type:'scatter',mode:'lines',x:xr,y:[1,1],name:'uguale',line:{color:mu,width:1,dash:'dot'},hoverinfo:'skip'});
    const L=base('','suzione vegetata / senza vegetazione'); L.xaxis.type='date'; L.yaxis.type='log'; L.yaxis.tickvals=[0.3,0.5,1,2,5,10,20]; L.yaxis.ticktext=['0,3','0,5','1','2','5','10','20']; L.yaxis.range=[Math.log10(0.25),Math.log10(30)];
    Plotly.react('ratioPlot',tr,L,cfgP); }
  { const tr=[], DEPm={NV:[15,30,60],V:[15,35,60]};
    [2025,2026].forEach((y,q) => SITES.forEach(s => ME.config.dry_thresholds_kPa.forEach((t,k) => { const rr=DEPm[s].map(d=>ME.M2.find(r=>r.site===s&&r.depth===d));
      tr.push({type:'scatter',mode:'lines+markers',x:rr.map(r=>r[`${y}_${t}`]),y:rr.map(r=>r.depth),name:`${LABEL[s]} · ${t} kPa`,legendgroup:s+t,showlegend:q===0,xaxis:q?'x2':'x',line:{color:cc[s],width:2,dash:k?'solid':'dot'},marker:{size:9,symbol:(s==='V'?'diamond':'circle')+(k?'':'-open'),color:cc[s]},hovertemplate:'%{x|%d/%m/%Y}<br>%{y} cm<extra>'+LABEL[s]+' · sopra '+t+' kPa</extra>'}); })));
    const L=base('','profondità [cm]'); L.yaxis.autorange='reversed'; L.yaxis.tickvals=[15,30,35,60]; L.margin.b=50;
    const xa=(dom,y)=>({type:'date',domain:dom,range:[y+'-04-10',y+'-08-05'],tickformat:'%d/%m',dtick:'M1',gridcolor:gr,linecolor:ln,tickfont:{color:mu},title:{text:String(y),font:{color:mu}}});
    L.xaxis=xa([0,0.47],2025); L.xaxis2=xa([0.53,1],2026); L.xaxis2.anchor='y';
    Plotly.react('dryPlot',tr,L,cfgP); }
  { const tr=SITES.map(s=>{ const e=C.events.filter(x=>x['dS_'+s]!=null);
      return {type:'scatter',mode:'markers',x:e.map(x=>x.P_mm),y:e.map(x=>x['dS_'+s]),text:e.map(x=>dIt(x.start)),name:LABEL[s],marker:{size:8,color:cc[s],opacity:.75,symbol:s==='V'?'diamond':'circle',line:{width:1,color:pn}},hovertemplate:'%{text}<br>pioggia %{x:.0f} mm<br>accumulo %{y:.0f} mm<extra>'+LABEL[s]+'</extra>'}; });
    SITES.forEach(s=>{ const f=ME.M1[s].fit, pm=ME.config.p_max_fit_mm;
      tr.push({type:'scatter',mode:'lines',x:[0,f.P0_mm,pm],y:[0,0,f.slope*(pm-f.P0_mm)],name:`${LABEL[s]} · retta con soglia`,line:{color:cc[s],width:2.5},hovertemplate:`accumulo = ${fx(f.slope,2)} · (P − ${fx(f.P0_mm,1)} mm)<extra>${LABEL[s]}</extra>`}); });
    tr.push({type:'scatter',mode:'lines',x:[0,110],y:[0,110],name:'accumulo = pioggia',line:{color:mu,width:1,dash:'dot'},hoverinfo:'skip'});
    const L=base('pioggia cumulata dell\'evento [mm]','acqua accumulata in 0–75 cm [mm]'); L.xaxis.range=[0,105]; L.yaxis.range=[-5,115];
    Plotly.react('thrPlot',tr,L,cfgP); }
  // ---- 9 stability
  { const S=FS.series, lim=FS.fs_dry_limit.A2, tr=[], dom=[[0.70,1],[0.35,0.65],[0,0.30]];
    PAIRS.forEach((p,j) => { SITES.forEach((s,k) => tr.push({type:'scatter',mode:'lines',x:S.t,y:S[`FS_${s}_${p[k]}`],name:LABEL[s],legendgroup:s,showlegend:j===0,line:{color:cc[s],width:1.3},yaxis:j?'y'+(j+1):'y',hovertemplate:`%{x}<br>FS = %{y:.2f}<extra>${s} ${p[k]} cm</extra>`}));
      tr.push({type:'scatter',mode:'lines',x:[S.t[0],S.t[S.t.length-1]],y:[lim,lim],name:'solo attrito (suzione nulla)',legendgroup:'lim',showlegend:j===0,line:{color:mu,width:1,dash:'dot'},yaxis:j?'y'+(j+1):'y',hoverinfo:'skip'}); });
    const L={paper_bgcolor:'rgba(0,0,0,0)',plot_bgcolor:'rgba(0,0,0,0)',font:{family:css('--f-body'),size:12,color:fg},margin:{l:66,r:16,t:30,b:36},hovermode:'x unified',
      legend:{orientation:'h',x:0,y:1.02,yanchor:'bottom',font:{size:11,color:mu}}, xaxis:{type:'date',gridcolor:gr,linecolor:ln,tickfont:{color:mu},anchor:'y3'}};
    PAIRS.forEach((p,j) => { L[j?'yaxis'+(j+1):'yaxis']=axis(`FS ${PLAB[j]}`,dom[j],{type:'log',tickvals:[1,2,5,10,20,50,100,200,500],range:[0,Math.log10(j===0?800:(j===1?400:200))]}); });
    Plotly.react('fsPlot',tr,L,cfgP); }
  FS.pairs.forEach((P,j) => { const D=P.duration, lim=FS.fs_dry_limit.A2, tr=SITES.map((s,k)=>({type:'scatter',mode:'lines',x:D.exceedance_pct,y:D[s],name:`${LABEL[s]} · ${PAIRS[j][k]} cm`,line:{color:cc[s],width:2.5},hovertemplate:`${LABEL[s]}<br>FS superato nel %{x:.0f}% del tempo: %{y:.2f}<extra></extra>`}));
    tr.push({type:'scatter',mode:'lines',x:[0,100],y:[lim,lim],name:'solo attrito',line:{color:mu,width:1,dash:'dot'},hoverinfo:'skip'});
    const L=base('% del tempo in cui FS è superato','fattore di sicurezza FS'); L.yaxis.type='log'; L.yaxis.tickvals=[1,2,5,10,20,50,100,200,500]; L.xaxis.range=[0,100];
    Plotly.react('fsd-'+j,tr,L,cfgP); });
  { const tr=PAIRS.map((p,j)=>{ const e=FS.events.filter(x=>x[`NV_${p[0]}`]!=null&&x[`V_${p[1]}`]!=null);
      return {type:'scatter',mode:'markers',x:e.map(x=>x[`NV_${p[0]}`]),y:e.map(x=>x[`V_${p[1]}`]),text:e.map(x=>dIt(x.start)+' · '+Math.round(x.P_mm)+' mm'),name:PLAB[j],marker:{size:8,color:PCOL[j],opacity:.8,symbol:PSYM[j],line:{width:1,color:pn}},hovertemplate:'%{text}<br>senza veg. FS = %{x:.2f}<br>vegetata FS = %{y:.2f}<extra>'+PLAB[j]+'</extra>'}; });
    tr.push({type:'scatter',mode:'lines',x:[1,300],y:[1,300],name:'uguale',line:{color:mu,width:1,dash:'dot'},hoverinfo:'skip'});
    const L=base('FS minimo nell\'evento, senza vegetazione','FS minimo nell\'evento, vegetata'); L.xaxis.type='log'; L.yaxis.type='log'; L.xaxis.tickvals=L.yaxis.tickvals=[1,2,5,10,20,50,100,200];
    Plotly.react('fsEvPlot',tr,L,cfgP); }
  // ---- 10 Se curves
  ['A1','A2'].forEach(lay => { const sh=SW.shared[lay], tr=[], sym={NV:'circle',V:'diamond'};
    Object.keys(sh.sensors).forEach(key => { const R=SW.sensors[key], nm=`${LABEL[R.site]} ${R.depth_cm} cm`;
      tr.push({type:'scatter',mode:'markers',x:R.envelope.s,y:sh.sensors[key].Se_env,name:nm,marker:{size:8,color:css(SHADE[key]),symbol:sym[R.site],line:{width:1,color:pn}},hovertemplate:nm+'<br>s = %{x:.1f} kPa<br>S<sub>e</sub> = %{y:.2f}<extra>inviluppo</extra>'}); });
    const xs=SW.sensors[Object.keys(sh.sensors)[0]].curve.s;
    tr.push({type:'scatter',mode:'lines',x:xs,y:xs.map(s=>seVG(s,sh.alpha,sh.n)),name:'curva comune '+lay,line:{color:fg,width:2.5},hovertemplate:'curva comune<br>s = %{x:.1f} kPa<br>S<sub>e</sub> = %{y:.2f}<extra></extra>'});
    const L=base('suzione s [kPa]','saturazione efficace S<sub>e</sub>'); L.xaxis.type='log'; L.xaxis.dtick=1; L.xaxis.range=[-0.05,Math.log10(5000)]; L.yaxis.range=[-0.03,1.08];
    Plotly.react('se-'+lay,tr,L,cfgP); });
  // ---- 11 K(s)
  { const tr=[], sy={NV:'circle',V:'diamond'}, cl={'NV 22.5 cm':'--nv','NV 45 cm':'--dry','V 25 cm':'--veg','V 47.5 cm':'--wet'};
    Object.entries(KF.planes).forEach(([k,p]) => { const s=k.split(' ')[0], nm=`${LABEL[s]} · piano a ${k.slice(s.length+1).replace('.',',')}`;
      tr.push({type:'scatter',mode:'markers',x:p.points.s_kPa,y:p.points.K_cm_h,text:p.points.date.map(dIt),name:nm,marker:{size:7,color:css(cl[k]),symbol:sy[s],opacity:.75},hovertemplate:'%{text}<br>s = %{x:.1f} kPa<br>K = %{y:.2g} cm/h<extra>'+nm+'</extra>'}); });
    const L=base('suzione s [kPa]','conducibilità K [cm/h]'); L.xaxis.type='log'; L.yaxis.type='log'; L.xaxis.dtick=1; L.yaxis.dtick=1;
    Plotly.react('kPlot',tr,L,cfgP); }
}
let inited=false;
function activate(){ if(!inited){ inited=true; fill(); document.querySelectorAll('input[name=wvar]').forEach(x=>x.addEventListener('change',plots)); } plots(); }
function redraw(){ if(inited && !$('simview').hidden) plots(); }
window.SimView = { activate, redraw };
})();
</script>
