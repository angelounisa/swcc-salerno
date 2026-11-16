<script>
(function(){
'use strict';
const C = window.CMP.cmp, SW = window.CMP.swcc, KF = window.CMP.kfield, TC = window.CMP.thetaCal, EVS = window.CMP.eventsSummary;
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

function fill(){
  // ---- 1 summary
  const rows = [];
  PAIRS.forEach((p,j) => { const w=C.pairs[j].stats.wet, d=C.pairs[j].stats.dry;
    rows.push(['Suzione mediana, ottobre–aprile [kPa]', PLAB[j], fx(w.NV.median_s,0), fx(w.V.median_s,0)]);
    rows.push(['Tempo con suzione sotto 10 kPa, ottobre–aprile', PLAB[j], pc(w.NV.frac_below['10']), pc(w.V.frac_below['10'])]);
    rows.push(['Suzione mediana, maggio–settembre [kPa]', PLAB[j], it(d.NV.median_s), it(d.V.median_s)]); });
  PAIRS.forEach((p,j) => { const e=EP[j];
    rows.push([`Eventi di pioggia con risposta di θ (su ${e.n_both} eventi comuni)`, PLAB[j], e.n_resp_NV, e.n_resp_V]);
    rows.push(['Aumento mediano di S<sub>e</sub> per evento', PLAB[j], fx(e.median_dSe_NV,2), fx(e.median_dSe_V,2)]); });
  [['NV_15','V_15'],['NV_30','V_35'],['NV_60','V_60']].forEach((k,j) => {
    rows.push(['Pioggia più piccola che ha dato risposta [mm]', PLAB[j], fx(ES[k[0]].smallest_P_with_response,0), fx(ES[k[1]].smallest_P_with_response,0)]);
    rows.push(['Ritardo mediano della risposta dall\'inizio della pioggia [h]', PLAB[j], fx(ES[k[0]].median_lag_h,0), fx(ES[k[1]].median_lag_h,0)]);
    rows.push(['Eventi in cui la suzione scende sotto 10 kPa', PLAB[j], ES[k[0]].n_s_min_below_10kPa, ES[k[1]].n_s_min_below_10kPa]); });
  rows.push(['Acqua accumulata negli eventi di pioggia, in % della pioggia', '0–75 cm', pc(EVS.frac_NV), pc(EVS.frac_V)]);
  rows.push(['Invaso: minimo · medio · massimo [mm]', '0–75 cm', `${it(ST.NV.min_mm)} · ${it(ST.NV.mean_mm)} · ${it(ST.NV.max_mm)}`, `${it(ST.V.min_mm)} · ${it(ST.V.mean_mm)} · ${it(ST.V.max_mm)}`]);
  rows.push(['Variazione d\'invaso nel drying 2025 (26/04–28/08) [mm]', '0–75 cm', it(ST.drying_2025.NV), it(ST.drying_2025.V)]);
  rows.push(['Variazione d\'invaso nel drying 2026 (01/04–30/07) [mm]', '0–75 cm', it(ST.drying_2026.NV), it(ST.drying_2026.V)]);
  rows.push([`Acqua persa nei periodi senza pioggia (${DT.days} giorni in ${DT.n_spells} periodi) [mm]`, '0–75 cm', it(DT.loss_NV_mm), it(DT.loss_V_mm)]);
  const tj = s => { const t=C.soil_temperature_15cm.find(x=>x.site===s), i=t.months.indexOf('2025-07'); return `${fx(t.T15_mean[i],1)} · ${fx(t.T15_daily_range[i],1)}`; };
  rows.push(['Temperatura del suolo a luglio 2025: media · escursione giornaliera [°C]', '15 cm', tj('NV'), tj('V')]);
  let h = `<thead><tr><th>Grandezza</th><th>Profondità</th><th>${LABEL.NV}</th><th>${LABEL.V}</th></tr></thead><tbody>`;
  rows.forEach(r => h += `<tr><td style="white-space:normal">${r[0]}</td><td>${r[1]}</td><td class="num">${r[2]}</td><td class="num">${r[3]}</td></tr>`);
  $('sumTable').innerHTML = h+'</tbody>';
  // ---- 3 duration table
  h = '<thead><tr><th>Profondità</th><th>Stagione</th><th>Parcella</th><th>Suzione 10° · 50° · 90° percentile [kPa]</th>'+C.config.suction_thresholds_kPa.map(t=>`<th>Tempo sotto ${t} kPa</th>`).join('')+'<th>Ore in cui la vegetata ha suzione più alta</th></tr></thead><tbody>';
  PAIRS.forEach((p,j) => [['wet','ottobre–aprile'],['dry','maggio–settembre']].forEach(([k,lab]) => SITES.forEach((s,q) => { const st=C.pairs[j].stats[k], x=st[s];
    h += `<tr><td>${PLAB[j]}</td><td>${lab}</td><td>${pill(s)}</td><td class="num">${fx(x.p10_s,0)} · ${fx(x.median_s,0)} · ${fx(x.p90_s,0)}</td>`+C.config.suction_thresholds_kPa.map(t=>`<td class="num">${pc(x.frac_below[String(t)])}</td>`).join('')+`<td class="num">${q===1?pc(st.frac_V_drier):''}</td></tr>`; })));
  $('durTable').innerHTML = h+'</tbody>';
  // ---- 4 events table
  h = '<thead><tr><th>Sensore</th><th>Eventi con dati</th><th>Eventi con risposta</th><th>Pioggia più grande senza risposta [mm]</th><th>Pioggia più piccola con risposta [mm]</th><th>Ritardo mediano [h]</th><th>Aumento mediano di S<sub>e</sub> quando risponde</th><th>Eventi con suzione minima sotto 10 kPa</th></tr></thead><tbody>';
  [['NV',15],['V',15],['NV',30],['V',35],['NV',60],['V',60]].forEach(([s,d]) => { const e=ES[`${s}_${d}`];
    h += `<tr><td>${pill(s)} ${d} cm</td><td class="num">${e.n_events}</td><td class="num">${e.n_responded}</td><td class="num">${fx(e.largest_P_without_response,0)}</td><td class="num">${fx(e.smallest_P_with_response,0)}</td><td class="num">${fx(e.median_lag_h,0)}</td><td class="num">${fx(e.median_dSe_when_responded,2)}</td><td class="num">${e.n_s_min_below_10kPa}</td></tr>`; });
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
  // ---- 8 main drying curves
  h = '<thead><tr><th>Strato</th><th>Sensore</th><th>θr</th><th>θs</th><th>α [1/kPa] (IC 95%)</th><th>1/α [kPa]</th><th>n (IC 95%)</th><th>RMSE S<sub>e</sub> curva propria</th><th>RMSE S<sub>e</sub> curva comune</th><th>θr · θs con curva comune</th></tr></thead><tbody>';
  for (const lay of ['A1','A2']) { const sh=SW.shared[lay];
    Object.keys(sh.sensors).forEach(key => { const R=SW.sensors[key], p=R.params, ab=new Set(R.params_at_bound), q=sh.sensors[key];
      h += `<tr><td>${lay}</td><td>${pill(R.site)} ${R.depth_cm} cm</td><td class="num${ab.has('theta_r')?' bound':''}">${fx(p.theta_r,3)}${ab.has('theta_r')?' <span class="flag">vincolo</span>':''}</td><td class="num">${fx(p.theta_s,3)}</td><td class="num">${fx(p.alpha,3)} <span class="muted">(${fx(R.ci95.alpha[0],3)}–${fx(R.ci95.alpha[1],3)})</span></td><td class="num">${fx(1/p.alpha,1)}</td><td class="num">${fx(p.n,2)} <span class="muted">(${fx(R.ci95.n[0],2)}–${fx(R.ci95.n[1],2)})</span></td><td class="num">${fx(R.rmse_Se_env,3)}</td><td class="num">${fx(q.rmse_Se_shared,3)}</td><td class="num">${fx(q.theta_r,3)} · ${fx(q.theta_s,3)}</td></tr>`; });
    h += `<tr><td><b>${lay}</b></td><td><b>curva comune dello strato</b></td><td></td><td></td><td class="num"><b>${fx(sh.alpha,3)}</b></td><td class="num"><b>${fx(1/sh.alpha,1)}</b></td><td class="num"><b>${fx(sh.n,2)}</b></td><td></td><td></td><td></td></tr>`; }
  $('dcTable').innerHTML = h+'</tbody>';
  // ---- 9 K table
  h = '<thead><tr><th>Piano di controllo</th><th>Notti usate</th><th>Campo di suzione [kPa]</th><th>K a 10–40 kPa, mediana [cm/h]</th></tr></thead><tbody>';
  Object.entries(KF.planes).forEach(([k,p]) => { const s=k.split(' ')[0], v=p.points.K_cm_h.filter((_,i)=>p.points.s_kPa[i]>=10&&p.points.s_kPa[i]<=40).sort((a,b)=>a-b), med=v.length?v[Math.floor(v.length/2)]:null;
    h += `<tr><td>${pill(s)} ${k.slice(s.length+1).replace('.',',')}</td><td class="num">${p.n_nights}</td><td class="num">${fx(p.s_range_kPa[0],1)}–${fx(p.s_range_kPa[1],0)}</td><td class="num">${med==null?'–':med.toPrecision(2).replace('.',',')}</td></tr>`; });
  $('kTable').innerHTML = h+'</tbody>';
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
    `<b>Modello numerico.</b> Il solutore alle differenze finite e la sua verifica restano nel repository (cartelle <code>sim/</code> e <code>verify/</code>) per un eventuale confronto in termini di stabilità; non sono usati in questa scheda.`];
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
  { const S=C.series, tr=[{type:'bar',x:C.rain_daily.t,y:C.rain_daily.mm,name:'pioggia',marker:{color:css('--wet')},yaxis:'y',hovertemplate:'%{x}<br>%{y:.1f} mm/g<extra></extra>'}];
    PAIRS.forEach((p,j) => SITES.forEach((s,k) => {
      tr.push({type:'scatter',mode:'lines',x:S.t,y:S[`Se_${s}_${p[k]}`],name:LABEL[s],legendgroup:s,showlegend:j===0,line:{color:cc[s],width:1.3},yaxis:'y'+(j+2),hovertemplate:`%{x}<br>S<sub>e</sub> = %{y:.2f}<extra>${s} ${p[k]} cm</extra>`});
      tr.push({type:'scatter',mode:'lines',x:S.t,y:S[`s_${s}_${p[k]}`],legendgroup:s,showlegend:false,line:{color:cc[s],width:1.3},yaxis:'y'+(j+5),hovertemplate:`%{x}<br>s = %{y:.0f} kPa<extra>${s} ${p[k]} cm</extra>`}); }));
    const L={paper_bgcolor:'rgba(0,0,0,0)',plot_bgcolor:'rgba(0,0,0,0)',font:{family:css('--f-body'),size:12,color:fg},margin:{l:66,r:16,t:30,b:36},hovermode:'x unified',bargap:0,
      legend:{orientation:'h',x:0,y:1.02,yanchor:'bottom',font:{size:11,color:mu}}, xaxis:{type:'date',gridcolor:gr,linecolor:ln,tickfont:{color:mu},anchor:'y7'},
      yaxis:axis('pioggia [mm/g]',[0.90,1])};
    const dS=[[0.76,0.875],[0.62,0.735],[0.48,0.595]], dP=[[0.32,0.445],[0.16,0.285],[0,0.125]];
    PAIRS.forEach((p,j) => { L['yaxis'+(j+2)]=axis(`S<sub>e</sub> ${PLAB[j]}`,dS[j]); L['yaxis'+(j+5)]=axis(`suzione ${PLAB[j]} [kPa]`,dP[j],{type:'log',dtick:1}); });
    Plotly.react('pairPlot',tr,L,cfgP); }
  // ---- 3 duration curves
  PAIRS.forEach((p,j) => { const D=C.pairs[j].duration, tr=SITES.map((s,k)=>({type:'scatter',mode:'lines',x:D.exceedance_pct,y:D[s],name:`${LABEL[s]} · ${p[k]} cm`,line:{color:cc[s],width:2.5},hovertemplate:`${LABEL[s]}<br>suzione superata nel %{x:.0f}% del tempo: %{y:.0f} kPa<extra></extra>`}));
    const L=base('% del tempo in cui la suzione è superata','suzione [kPa]'); L.yaxis.type='log'; L.yaxis.dtick=1; L.xaxis.range=[0,100];
    Plotly.react('dur-'+j,tr,L,cfgP); });
  // ---- 4 events
  PAIRS.forEach((p,j) => { const tr=SITES.map((s,k)=>{ const e=C.events.filter(x=>x[`${s}_${p[k]}`]);
      return {type:'scatter',mode:'markers',x:e.map(x=>x.P_mm),y:e.map(x=>x[`${s}_${p[k]}`].dSe),text:e.map(x=>dIt(x.start)),name:`${LABEL[s]} · ${p[k]} cm`,marker:{size:8,color:cc[s],opacity:.8,symbol:s==='V'?'diamond':'circle',line:{width:1,color:pn}},hovertemplate:'%{text}<br>pioggia %{x:.0f} mm<br>ΔS<sub>e</sub> = %{y:.2f}<extra>'+LABEL[s]+'</extra>'}; });
    const L=base('pioggia cumulata dell\'evento [mm]','aumento di S<sub>e</sub>'); L.xaxis.range=[0,215];
    Plotly.react('ev-'+j,tr,L,cfgP); });
  { const sh=['#c9a227','#8a5a9e','#2b7a8c'], tr=PAIRS.map((p,j)=>{ const e=C.events.filter(x=>x[`NV_${p[0]}`]&&x[`V_${p[1]}`]);
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
  // ---- 8 Se curves
  ['A1','A2'].forEach(lay => { const sh=SW.shared[lay], tr=[], sym={NV:'circle',V:'diamond'};
    Object.keys(sh.sensors).forEach(key => { const R=SW.sensors[key], nm=`${LABEL[R.site]} ${R.depth_cm} cm`;
      tr.push({type:'scatter',mode:'markers',x:R.envelope.s,y:sh.sensors[key].Se_env,name:nm,marker:{size:8,color:css(SHADE[key]),symbol:sym[R.site],line:{width:1,color:pn}},hovertemplate:nm+'<br>s = %{x:.1f} kPa<br>S<sub>e</sub> = %{y:.2f}<extra>inviluppo</extra>'}); });
    const xs=SW.sensors[Object.keys(sh.sensors)[0]].curve.s;
    tr.push({type:'scatter',mode:'lines',x:xs,y:xs.map(s=>seVG(s,sh.alpha,sh.n)),name:'curva comune '+lay,line:{color:fg,width:2.5},hovertemplate:'curva comune<br>s = %{x:.1f} kPa<br>S<sub>e</sub> = %{y:.2f}<extra></extra>'});
    const L=base('suzione s [kPa]','saturazione efficace S<sub>e</sub>'); L.xaxis.type='log'; L.xaxis.dtick=1; L.xaxis.range=[-0.05,Math.log10(5000)]; L.yaxis.range=[-0.03,1.08];
    Plotly.react('se-'+lay,tr,L,cfgP); });
  // ---- 9 K(s)
  { const tr=[], sy={NV:'circle',V:'diamond'}, cl={'NV 22.5 cm':'--nv','NV 45 cm':'--dry','V 25 cm':'--veg','V 47.5 cm':'--wet'};
    Object.entries(KF.planes).forEach(([k,p]) => { const s=k.split(' ')[0], nm=`${LABEL[s]} · piano a ${k.slice(s.length+1).replace('.',',')}`;
      tr.push({type:'scatter',mode:'markers',x:p.points.s_kPa,y:p.points.K_cm_h,text:p.points.date.map(dIt),name:nm,marker:{size:7,color:css(cl[k]),symbol:sy[s],opacity:.75},hovertemplate:'%{text}<br>s = %{x:.1f} kPa<br>K = %{y:.2g} cm/h<extra>'+nm+'</extra>'}); });
    const L=base('suzione s [kPa]','conducibilità K [cm/h]'); L.xaxis.type='log'; L.yaxis.type='log'; L.xaxis.dtick=1; L.yaxis.dtick=1;
    Plotly.react('kPlot',tr,L,cfgP); }
}
let inited=false;
function activate(){ if(!inited){ inited=true; fill(); } plots(); }
function redraw(){ if(inited && !$('simview').hidden) plots(); }
window.SimView = { activate, redraw };
})();
</script>
