<script>
/* Model tab, section 4: event-scale inverse analysis (ids prefixed e-). Data: window.EVT = {soil: exp/ev_soil_summary.json, ev: exp/ev_summary.json}. */
(function(){
'use strict';
const D = window.EVT; if (!D) return;
const SO = D.soil, E = D.ev;
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const $ = id => document.getElementById('e-'+id);
const fx = (x,k) => (x==null||!isFinite(x)) ? '–' : Number(x).toFixed(k).replace('.',',');
const pc = x => (x==null||!isFinite(x)) ? '–' : Math.round(100*x)+'%';
const dIt = s => s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4);
const isDark = () => document.documentElement.dataset.theme==='dark' || (document.documentElement.dataset.theme!=='light' && matchMedia('(prefers-color-scheme: dark)').matches);
const DRAMP = () => isDark() ? ['#9ec5f4','#3987e5','#184f95'] : ['#86b6ef','#2a78d6','#104281'];   // ordinal blue ramp: 15, 30/35, 60 cm
const LABEL = {NV:'Senza vegetazione', V:'Vegetata'}, COL = {NV:'--nv', V:'--veg'};
const ok = E.events.filter(e => !e.bad.length), bad = E.events.filter(e => e.bad.length);
const sum = (a,f) => a.reduce((s,x)=>s+f(x),0);
const cfgP = {displaylogo:false,responsive:true,modeBarButtonsToRemove:['lasso2d','select2d']};
function base(xt,yt){ const fg=css('--fg'), mu=css('--muted'), gr=css('--grid'), ln=css('--line');
  return { paper_bgcolor:'rgba(0,0,0,0)', plot_bgcolor:'rgba(0,0,0,0)', font:{family:css('--f-body'),size:12,color:fg},
    margin:{l:56,r:12,t:30,b:44}, hovermode:'closest', showlegend:true, legend:{orientation:'h',x:0,y:1.02,yanchor:'bottom',font:{size:11,color:mu}},
    xaxis:{title:{text:xt,font:{color:mu}},gridcolor:gr,linecolor:ln,zeroline:false,tickfont:{color:mu}},
    yaxis:{title:{text:yt,font:{color:mu}},gridcolor:gr,linecolor:ln,zeroline:false,tickfont:{color:mu}} }; }
const TH = E.thresholdFit, TOT = E.totals, ch = SO.chosen;

let filled=false;
function fill(){
  $('intro').innerHTML = `Due passi. <b>1</b>: sul disboscato, dove l'acqua che arriva al suolo è la pioggia misurata, si calibra il terreno in imbibizione sui ${SO.n_events} eventi. <b>2</b>: con lo stesso terreno, per ogni evento si cerca quanta pioggia deve arrivare al suolo del bosco per riprodurre i sensori. La pioggia lorda passa per un serbatoio di capacità C che evapora alla domanda potenziale; ciò che trabocca entra nel suolo con un ritardo τ (serbatoio lineare). La stessa inversione è ripetuta sul disboscato come controllo: lì il metodo deve restituire C ≈ 0. Obiettivo: RMSE di S<sub>e</sub> (scala del drying, può superare 1) ai tre sensori.`;
  // soil table
  let h = `<thead><tr><th>Terreno in imbibizione</th><th>Valore</th><th>Da dove viene</th></tr></thead><tbody>
    <tr><td>θ<sub>s,w</sub> = θr + g (θ<sub>s,d</sub> − θr)</td><td class="num">g = ${fx(ch.g,2)}</td><td style="white-space:normal">calibrato; negli eventi θ supera il θs di drying nel ${pc(SO.aboveThetaS[15])} delle ore a 15 cm, ${pc(SO.aboveThetaS[30])} a 30 cm, ${pc(SO.aboveThetaS[60])} a 60 cm</td></tr>
    <tr><td>α<sub>w</sub> = f<sub>A</sub> α<sub>d</sub></td><td class="num">f<sub>A</sub> = ${fx(ch.fA,1)}</td><td style="white-space:normal">poco influente: J cambia meno di 0,002 fra 1,5 e 3</td></tr>
    <tr><td>K di matrice rispetto al drying</td><td class="num">× ${fx(Math.pow(10,ch.log10K),2)}</td><td style="white-space:normal">calibrato; compensa g lungo una valle (g 1,75 con × 10 dà lo stesso J)</td></tr>
    <tr><td><b>J medio sugli eventi</b></td><td class="num"><b>${fx(ch.J,3)}</b></td><td style="white-space:normal">persistenza (S<sub>e</sub> ferma al valore iniziale) ${fx(SO.persistence.J,3)}; con il θs di drying (g = 1) ${fx(SO.unimodal_g1.J,3)}; curva bimodale con macropori ${fx(Math.min(...SO.bimodal.map(r=>r.J)),3)}</td></tr></tbody>`;
  $('soilTable').innerHTML = h;
  h = `<thead><tr><th>Sensore</th><th>RMSE S<sub>e</sub> modello</th><th>RMSE S<sub>e</sub> persistenza</th><th>RMSE log₁₀ suzione</th></tr></thead><tbody>`;
  for (const k of ['15','30','60']) { const m=SO.perSensor[k].rmse_Se, p=SO.persistence[k];
    h += `<tr><td>senza vegetazione ${k} cm</td><td class="num">${fx(m,3)}${m>p?' <span class="flag">peggio della persistenza</span>':''}</td><td class="num">${fx(p,3)}</td><td class="num">${fx(SO.perSensor[k].rmse_log10s,2)}</td></tr>`; }
  $('sensTable').innerHTML = h+'</tbody>';
  // example selector
  $('exSel').innerHTML = Object.keys(E.examples).map(k => { const e=E.events.find(v=>v.start===k); return `<option value="${k}">${dIt(k)} · ${fx(e.P,0)} mm</option>`; }).join('');
  $('exSel').addEventListener('change', exPlot);
  // events table
  h = `<thead><tr><th>Inizio</th><th>Pioggia [mm]</th><th>i<sub>max</sub> [mm/h]</th><th>NV: C [mm]</th><th>NV: entrata [mm]</th><th>NV: J (con tutta la pioggia)</th><th>V: C [mm]</th><th>V: τ [h]</th><th>V: entrata [mm] (campo accettabile)</th><th>V: J (con tutta la pioggia)</th><th>Note</th></tr></thead><tbody>`;
  for (const e of E.events) { const fl = e.bad.length ? `<span class="flag">escluso: ${e.bad.map(s=>s==='V'?'bosco':'disboscato').join(' e ')} non riprodott${e.bad.length>1?'i':'o'}</span>` : '';
    h += `<tr><td>${dIt(e.start)}</td><td class="num">${fx(e.P,0)}</td><td class="num">${fx(e.imax,1)}</td><td class="num">${e.NV.C}</td><td class="num">${fx(e.NV.net,0)}</td><td class="num">${fx(e.NV.J,3)} (${fx(e.NV.J0,3)})</td><td class="num">${e.V.C}</td><td class="num">${e.V.tau}</td><td class="num">${fx(e.V.net,0)} (${fx(e.V.acc.net_mm[0],0)}–${fx(e.V.acc.net_mm[1],0)})</td><td class="num">${fx(e.V.J,3)} (${fx(e.V.J0,3)})</td><td>${fl}</td></tr>`; }
  $('evTable').innerHTML = h+'</tbody>';
  // interpretation
  const by = E.bySize, sf = Object.fromEntries(E.seasonFit.map(r=>[r.season,r])), tf = E.throughfall, rr = E.residRho;
  const big = ok.filter(e=>e.P>=40), tau0 = big.filter(e=>e.V.tau===0).length;
  const items = [
    `<b>Il terreno si bagna oltre la curva di drying.</b> Durante gli eventi il contenuto d'acqua supera spesso il θs ricavato dal drying, che è un'estrapolazione da suzioni misurabili. Il modello ha bisogno di un θs in imbibizione ${fx(ch.g,1)} volte più ampio (in S<sub>e</sub>) e di una conducibilità di matrice ${fx(Math.pow(10,ch.log10K),1)} volte quella del drying. I due parametri si compensano, quindi è identificata la loro combinazione, non ciascuno. Il modello dimezza l'errore della persistenza a 15 e 30 cm. A 60 cm non fa meglio (variazioni piccole) e la suzione non è riprodotta: sotto ~10 kPa il TEROS 21 non è affidabile e i picchi rapidi di θ indicano flusso nei macropori. Una curva bimodale con macropori non migliora il risultato.`,
    `<b>Il controllo funziona.</b> Sulla parcella senza vegetazione l'inversione dà C ≈ ${fx(TH.NV.C,0)} mm (IC 95% ${fx(TH.NV.ci95[0],1)}–${fx(TH.NV.ci95[1],1)}), e l'acqua entrata è il ${pc(TOT.netNV/TOT.P)} della pioggia. Lo scarto dal 100% è l'errore del metodo (evaporazione del serbatoio, errori del terreno), quindi l'effetto del bosco si legge per differenza con il controllo.`,
    `<b>Nel bosco entra nel suolo il ${pc(TOT.netV/TOT.P)} della pioggia contro il ${pc(TOT.netNV/TOT.P)} del disboscato</b> (${ok.length} eventi validi, ${fx(TOT.P,0)} mm). La differenza è un volume quasi fisso per evento, non una frazione. L'acqua entrata segue max(0, P − C<sub>eff</sub>) con C<sub>eff</sub> = ${fx(TH.V.C,0)} mm (IC 95% ${fx(TH.V.ci95[0],1)}–${fx(TH.V.ci95[1],1)}, scarto ${fx(TH.V.rmse,0)} mm). Per questo l'effetto è massimo negli eventi piccoli: sotto 20 mm entra il ${pc(by[0].netV/by[0].P)} contro il ${pc(by[0].netNV/by[0].P)}, sopra 40 mm il ${pc(by[2].netV/by[2].P)} contro il ${pc(by[2].netNV/by[2].P)}.`,
    `<b>Cosa c'è dentro C<sub>eff</sub>.</b> ${fx(TH.V.C,0)} mm sono più di quanto trattengono chioma, arbusti e lettiera secondo la letteratura riportata nelle slide ALERT (2–5 + 1–3 + 5–15 mm). C<sub>eff</sub> è l'acqua che non arriva ai sensori. Comprende l'intercettazione e anche: lo strato organico superficiale 0–15 cm del bosco, che il modello non distingue dal terreno del disboscato; lo stemflow, che porta acqua alla base dei fusti lontano dai sensori; l'evaporazione durante l'evento. Va letto come limite superiore dell'intercettazione.`,
    `<b>Il ritardo τ non è identificabile.</b> Nei ${big.length} eventi oltre 40 mm il serbatoio si riempie nelle prime ore e i picchi successivi passano: τ = 0 in ${tau0} su ${big.length}, e l'intensità massima in ingresso al suolo resta vicina a quella della pioggia. Questi dati quindi non confermano né escludono la forte riduzione delle intensità massime ricavata nello studio ALERT (11 contro 2 mm/h). Con sensori a 15 cm e dati orari la distribuzione nel tempo dell'input non è risolta.`,
    `<b>Stagione.</b> Il volume trattenuto è più alto in autunno (C<sub>eff</sub> ${fx(sf.autunno.C,0)} mm, ${sf.autunno.n} eventi): dopo l'estate lettiera e strato superficiale del bosco vanno ribagnati. In inverno è ${fx(sf.inverno.C,0)} mm e in primavera ${fx(sf.primavera.C,0)} mm. In estate gli eventi sono tutti piccoli (massimo ${fx(sf.estate.Pmax,0)} mm), quindi il valore (${fx(sf.estate.C,0)} mm) è poco vincolato. Tolta la dipendenza dalla dimensione dell'evento, il residuo non è legato a intensità massima, durata, domanda evaporativa o stato iniziale a 15 cm (|ρ| ≤ ${fx(Math.max(...Object.values(rr).map(Math.abs)),2)}).`,
    `<b>Due controlli indipendenti.</b> Il pluviometro sotto chioma (${dIt(tf.period.start)}–${dIt(tf.period.end)}) ha misurato il ${pc(tf.period.ratio)} della pioggia. Nello stesso periodo l'inversione dà il ${pc(tf.netV/tf.P)} della pioggia (${pc(tf.netV/tf.netNV)} del controllo) su ${tf.events.length} eventi, ${fx(tf.P,0)} mm: le due stime concordano. Nello studio ALERT 2025 l'evento di 84 mm dava 56 mm in ingresso al bosco: 28 mm trattenuti, dentro l'intervallo di C<sub>eff</sub>.`,
    `<b>Robustezza.</b> Con l'altro estremo della valle g–K (g 1,75, K × 10) l'acqua entrata cambia poco: bosco ${fx(TOT.netV_alt,0)} contro ${fx(TOT.netV,0)} mm, disboscato ${fx(TOT.netNV_alt,0)} contro ${fx(TOT.netNV,0)} mm. Esclusi ${bad.length} eventi in cui il modello non segue i sensori nemmeno con l'input libero (J > ${fx(E.Q.J_MAX,2)}): ${bad.map(e=>dIt(e.start)).join(', ')}. Il 10/09/2025 (43 mm/h su terreno secco) non è riprodotto in nessuna delle due parcelle. Il 25/10 e il 18/11/2025 il bosco a 60 cm è nel periodo segnalato come non in equilibrio dal controllo di qualità.`];
  $('interp').innerHTML = items.map(x=>'<li>'+x+'</li>').join('');
}

function exPlot(){
  const k = $('exSel').value, X = E.examples[k], e = E.events.find(v=>v.start===k), fg=css('--fg'), mu=css('--muted'), gr=css('--grid'), ln=css('--line'), R=DRAMP();
  for (const site of ['NV','V']) { const S = X[site], tr=[], hrs = X.P.map((_,i)=>i+1);
    tr.push({type:'bar',x:hrs,y:X.P,name:'pioggia lorda',marker:{color:css('--wet'),opacity:.45},yaxis:'y2',hovertemplate:'ora %{x}<br>%{y:.1f} mm/h<extra>pioggia lorda</extra>'});
    tr.push({type:'scatter',mode:'lines',x:hrs,y:S.input,name:'entrata nel suolo (calibrata)',line:{color:css(COL[site]),width:2,shape:'hv'},yaxis:'y2',hovertemplate:'ora %{x}<br>%{y:.1f} mm/h<extra>entrata nel suolo</extra>'});
    Object.keys(S.obs).forEach((d,j) => {
      tr.push({type:'scatter',mode:'lines',x:hrs,y:S.obs[d],name:d+' cm misurato',legendgroup:d,line:{color:R[j],width:2.5},hovertemplate:'ora %{x}<br>S<sub>e</sub> %{y:.2f}<extra>'+d+' cm misurato</extra>'});
      tr.push({type:'scatter',mode:'lines',x:hrs,y:S.sim[d],name:j===0?'simulato con l\'entrata calibrata':'',showlegend:j===0,legendgroup:'sim',line:{color:R[j],width:2,dash:'dash'},hovertemplate:'ora %{x}<br>S<sub>e</sub> %{y:.2f}<extra>'+d+' cm, entrata calibrata</extra>'});
      tr.push({type:'scatter',mode:'lines',x:hrs,y:S.sim0[d],name:j===0?'simulato con tutta la pioggia':'',showlegend:j===0,legendgroup:'sim0',line:{color:R[j],width:1.5,dash:'dot'},hovertemplate:'ora %{x}<br>S<sub>e</sub> %{y:.2f}<extra>'+d+' cm, tutta la pioggia</extra>'}); });
    const L = base('ore dall\'inizio della finestra','S<sub>e</sub> (scala del drying)'); L.legend.font.size=10; L.margin.t=60; L.bargap=0; L.hovermode='x unified';
    L.title={text:`${LABEL[site]} · C = ${e[site].C} mm, τ = ${e[site].tau} h · entrata ${fx(e[site].net,0)} di ${fx(e.P,0)} mm`,font:{size:12,color:fg},x:0,xanchor:'left',y:0.995,yanchor:'top'};
    L.yaxis.domain=[0,0.68]; L.yaxis2={title:{text:'mm/h',font:{color:mu}},domain:[0.74,1],gridcolor:gr,linecolor:ln,tickfont:{color:mu},zeroline:false};
    Plotly.react($('ex-'+site), tr, L, cfgP); }
}

function plots(){
  const fg=css('--fg'), mu=css('--muted'), pn=css('--panel');
  // J map at fA = chosen
  { const rows = SO.grid.filter(r=>r.fA===ch.fA), gs=[...new Set(rows.map(r=>r.g))].sort((a,b)=>a-b), ks=[...new Set(rows.map(r=>r.log10K))].sort((a,b)=>a-b);
    const z = gs.map(g => ks.map(k => { const r=rows.find(q=>q.g===g&&q.log10K===k); return r ? r.J : null; }));
    const ramp = isDark() ? ['#184f95','#256abf','#3987e5','#6da7ec','#9ec5f4','#1a1f1c'] : ['#104281','#1c5cab','#2a78d6','#5598e7','#86b6ef','#eef4fc'];
    const tr=[{type:'heatmap',x:ks.map(k=>'× '+fx(Math.pow(10,k),2)),y:gs.map(g=>'g '+fx(g,2)),z,zmin:0.07,zmax:0.2,colorscale:ramp.map((c,i)=>[i/(ramp.length-1),c]),xgap:2,ygap:2,
      colorbar:{title:{text:'J',font:{color:mu}},tickfont:{color:mu},thickness:12,outlinewidth:0},hovertemplate:'K %{x}<br>%{y}<br>J = %{z:.3f}<extra></extra>',hoverongaps:false},
      {type:'scatter',mode:'markers',x:['× '+fx(Math.pow(10,ch.log10K),2)],y:['g '+fx(ch.g,2)],marker:{symbol:'circle-open',size:22,color:fg,line:{width:2.5}},name:'scelto',hoverinfo:'skip'}];
    const L=base('K di matrice rispetto al drying','θ<sub>s,w</sub>: fattore g'); L.showlegend=false; L.xaxis.type='category'; L.yaxis.type='category'; L.margin.l=70;
    Plotly.react($('jmap'),tr,L,cfgP); }
  // net vs P
  { const tr=[], xmax=Math.max(...E.events.map(e=>e.P))*1.05, xs=Array.from({length:101},(_,i)=>i*xmax/100);
    for (const s of ['NV','V']) { const c=css(COL[s]), sym=s==='V'?'diamond':'circle';
      for (const [set,lab,open] of [[ok,LABEL[s],false],[bad,LABEL[s]+' · escluso',true]]) { if(!set.length) continue;
        tr.push({type:'scatter',mode:'markers',x:set.map(e=>e.P),y:set.map(e=>e[s].net),text:set.map(e=>dIt(e.start)),name:lab,legendgroup:s+open,
          error_y:{type:'data',symmetric:false,array:set.map(e=>e[s].acc.net_mm[1]-e[s].net),arrayminus:set.map(e=>e[s].net-e[s].acc.net_mm[0]),color:c,thickness:1.2,width:0},
          marker:{size:9,symbol:open?sym+'-open':sym,color:c,line:{width:open?1.8:1,color:open?c:pn}},hovertemplate:'%{text}<br>pioggia %{x:.0f} mm<br>entrata %{y:.0f} mm<extra>'+lab+'</extra>'}); }
      tr.push({type:'scatter',mode:'lines',x:xs,y:xs.map(x=>Math.max(0,x-TH[s].C)),name:`max(0, P − ${fx(TH[s].C,0)} mm)`,legendgroup:s+'f',line:{color:c,width:2,dash:'dash'},hoverinfo:'skip'}); }
    tr.push({type:'scatter',mode:'lines',x:[0,xmax],y:[0,xmax],name:'entrata = pioggia',line:{color:mu,width:1,dash:'dot'},hoverinfo:'skip'});
    const L=base('pioggia dell\'evento P [mm]','acqua entrata nel suolo [mm]'); L.legend.font.size=10; L.margin.t=70; L.xaxis.range=[0,xmax]; L.yaxis.range=[-3,xmax];
    Plotly.react($('netPlot'),tr,L,cfgP); }
  // by size class
  { const lab = E.bySize.map(b => (b.range[1]>1e6?`oltre ${b.range[0]} mm`:`${b.range[0]}–${b.range[1]} mm`)+` (${b.n})`);
    const tr = ['NV','V'].map(s => ({type:'bar',x:lab,y:E.bySize.map(b=>b['net'+s]/b.P*100),name:LABEL[s],marker:{color:css(COL[s]),cornerradius:4,line:{width:2,color:pn}},
      text:E.bySize.map(b=>Math.round(b['net'+s]/b.P*100)+'%'),textposition:'outside',textfont:{color:fg,size:11},cliponaxis:false,hovertemplate:'%{x}<br>%{y:.0f}% della pioggia<extra>'+LABEL[s]+'</extra>'}));
    const L=base('classe di pioggia dell\'evento (numero di eventi)','% della pioggia entrata nel suolo'); L.barmode='group'; L.bargap=0.3; L.bargroupgap=0.08; L.yaxis.range=[0,110];
    Plotly.react($('sizePlot'),tr,L,cfgP); }
  exPlot();
}
function draw(){ if(!filled){ filled=true; fill(); } plots(); }
window.EventView = { draw };
})();
</script>
