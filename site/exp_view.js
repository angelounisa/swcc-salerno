<script>
/* Model tab, experiments: rendered after the model view (ids prefixed x-). Data: window.EXP (exp/*.json). */
(function(){
'use strict';
const X = window.EXP; if (!X) return;
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const $ = id => document.getElementById(id);
const fx = (x,k) => (x==null||!isFinite(x)) ? '–' : Number(x).toFixed(k).replace('.',',');
const it = x => (x==null||!isFinite(x)) ? '–' : Math.round(x).toLocaleString('it-IT');
const pp = x => (x==null||!isFinite(x)) ? '–' : (x*100).toFixed(1).replace('.',',');
const dIt = s => s ? s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4) : '–';
const isDark = () => document.documentElement.dataset.theme==='dark' || (document.documentElement.dataset.theme!=='light' && matchMedia('(prefers-color-scheme: dark)').matches);
// ordinal blue ramp of the reference palette for depths
const DRAMP = () => isDark() ? ['#9ec5f4','#6da7ec','#3987e5','#256abf','#184f95'] : ['#86b6ef','#5598e7','#2a78d6','#1c5cab','#104281'];
const FL = {I:'Intercettazione',T:'Quota di traspirazione',R:'Radici',E:'Domanda evaporativa',S:'Stato iniziale'};
let filled=false;
function fill(){
  const E=X.ev, M=X.mem, K=X.kdata, keys=Object.keys(M.single);
  // ---- design storms table
  const Cm=String(E.config.interception_capacity_mm), Cr=E.config.interception_capacity_range_mm.map(String);
  let h=`<thead><tr><th>Suzione iniziale [kPa]</th><th>Profondità</th><th>Pioggia critica senza veg. [mm]</th><th>Pioggia critica bosco [mm]</th><th>k del modello</th><th>k con serbatoio ${fx(+Cr[0],1)}–${fx(+Cr[1],0)} mm</th></tr></thead><tbody>`;
  E.pcrit.forEach(r=>{ const f=r.forest[Cm]; h+=`<tr><td class="num">${r.s0}</td><td>${r.depth} cm</td><td class="num">${fx(r.P_crit_CC_mm,0)}</td><td class="num">${fx(f.P_crit_F_mm,0)}</td><td class="num">${fx(f.k,2)}</td><td class="num">${fx(r.forest[Cr[1]].k,2)}–${fx(r.forest[Cr[0]].k,2)}</td></tr>`; });
  $('x-pcTable').innerHTML=h+'</tbody>';
  // ---- experiment 3 table
  const md=['15','30','35','60','100','120'], R=M.runs, ob=M.observed;
  const cell=v=>v?`${v.date.slice(8,10)}/${v.date.slice(5,7)} <span class="muted">${it(v.rain_mm)} mm</span>`:'–';
  h='<thead><tr><th>Simulazione</th>'+md.map(d=>`<th>${d} cm</th>`).join('')+'</tr></thead><tbody>';
  [['Misurato, senza vegetazione',{15:ob.NV['15'],30:ob.NV['30'],60:ob.NV['60']}],['Misurato, bosco',{15:ob.V['15'],35:ob.V['35'],60:ob.V['60']}],
   ['Colonna senza veg., stato iniziale senza veg.',R.NV_CC.rewet],['Colonna senza veg., stato iniziale del bosco',R.V_CC.rewet],['Colonna bosco, stato iniziale del bosco',R.V_F.rewet],['Colonna bosco, stato iniziale senza veg.',R.NV_F.rewet],
   ...keys.map(k=>[`Colonna senza veg. + solo ${FL[k].toLowerCase()}`,M.single[k]])].forEach(([l,r],i)=>{
    h+=`<tr${i<2?' style="font-weight:600"':''}><td>${l}</td>`+md.map(d=>`<td class="num">${cell(r[d])}</td>`).join('')+'</tr>'; });
  $('x-memTable').innerHTML=h+'</tbody>';
  // ---- notes
  const k30=E.pcrit.find(r=>r.s0===30&&r.depth===30).forest[Cm].k, k10=E.pcrit.filter(r=>r.s0===10&&[15,30,60].includes(r.depth)).map(r=>fx(r.forest[Cm].k,2)), kd=K.base.map(r=>fx(r.k_equivalent_rain,2));
  const notes=[
    `<b>A cosa serve il modello qui.</b> Nelle parcelle vere intercettazione, traspirazione, radici, microclima e stato iniziale cambiano tutti insieme. Nel modello il terreno è identico (curve principali di drying, K di campo, pendio a ${fx(E.slope_deg,0)}°) e i fattori del bosco si accendono uno alla volta. I parametri sono quelli della calibrazione sul drying (sezione 2): negli esperimenti non si ricalibra nulla. Il modello non è usato per la stagione umida: senza ramo di wetting (isteresi) sottostima di molto il tempo con suzione bassa.`,
    `<b>Eventi di progetto: k dipende dalla suzione iniziale.</b> Con suzione iniziale 10 kPa il fattore di pioggia equivalente del modello è ${k10.join(', ')} a 15, 30 e 60 cm, vicino a quello stimato dalle misure (${kd.join(', ')}). Con suzione iniziale più alta k cresce (${fx(k30,2)} a 30 cm con 30 kPa): il serbatoio di intercettazione toglie una quantità fissa d'acqua, che pesa poco sulle piogge grandi necessarie a bagnare un suolo asciutto. È una previsione verificabile sui dati: il modello logistico delle misure assume k costante.`,
    `<b>Eventi di progetto: eventi estremi.</b> Con suolo già bagnato (suzione iniziale ${E.config.s0_kPa[0]} kPa) e piogge di 80–120 mm la suzione scende a pochi kPa fino a 120 cm in entrambe le colonne e il fattore di sicurezza minimo a 120 cm è quasi uguale (${(()=>{ const g=(s0,P,f)=>E.grid.find(r=>r.s0===s0&&r.P===P&&r.forest===f).depth['120'].fs_min; return fx(g(10,120,false),2)+' senza vegetazione, '+fx(g(10,120,true),2)+' bosco con 120 mm; con suzione iniziale 30 kPa resta un margine: '+fx(g(30,120,false),2)+' contro '+fx(g(30,120,true),2); })()}). Il vantaggio del bosco riguarda gli eventi medi e i suoli non ancora bagnati, non gli eventi estremi su suolo già umido. Il modello, con drenaggio libero alla base, non produce pressioni positive: FS non scende sotto il limite di solo attrito (1,50).`,
    `<b>Memoria: il ritardo autunnale è intercettazione, non memoria.</b> Il modello riproduce le date di riumidificazione misurate a 60 cm in entrambe le parcelle. Scambiare lo stato iniziale di metà agosto non cambia le date; la sola intercettazione le sposta come il bosco intero. A metà agosto 2025 entrambi i profili erano oltre 1000 kPa, vicino al contenuto residuo: in acqua la differenza fra i due stati era piccola. In un'estate meno estrema lo stato iniziale potrebbe contare di più.`,
    `<b>Domanda evaporativa.</b> Il fattore di ETP (× ${fx(X.par.NV.eFactor,2)} senza vegetazione, × ${fx(X.par.V.eFactor,2)} nel bosco) viene dalla calibrazione: rappresenta il microclima sotto chioma (suolo più fresco) ma assorbe anche ciò che il modello non descrive. Pesa sui risultati che dipendono dall'evapotraspirazione, poco sugli eventi di progetto (48 h dopo la pioggia).`];
  $('m-dryNotes').innerHTML = notes.map(x=>'<li>'+x+'</li>').join('');
}
function plots(){
  const E=X.ev, K=X.kdata, fg=css('--fg'), mu=css('--muted'), gr=css('--grid'), ln=css('--line'), DR=DRAMP();
  const base=(xt,yt)=>({paper_bgcolor:'rgba(0,0,0,0)',plot_bgcolor:'rgba(0,0,0,0)',font:{family:css('--f-body'),size:12,color:fg},margin:{l:62,r:12,t:30,b:46},hovermode:'closest',showlegend:true,
    legend:{orientation:'h',x:0,y:1.02,yanchor:'bottom',font:{size:11,color:mu}},xaxis:{title:{text:xt,font:{color:mu}},gridcolor:gr,linecolor:ln,zeroline:false,tickfont:{color:mu}},
    yaxis:{title:{text:yt,font:{color:mu}},gridcolor:gr,linecolor:ln,zeroline:true,zerolinecolor:ln,tickfont:{color:mu}}});
  const cfgP={displaylogo:false,responsive:true,modeBarButtonsToRemove:['lasso2d','select2d']};
  // experiment 2: k vs antecedent suction
  const Cm=String(E.config.interception_capacity_mm), Cr=E.config.interception_capacity_range_mm.map(String), dk=[15,30,60,100,120], s0s=E.config.s0_kPa;
  const t2=[];
  dk.forEach((d,j)=>{ const rows=s0s.map(s=>E.pcrit.find(r=>r.s0===s&&r.depth===d));
    t2.push({type:'scatter',mode:'lines+markers',name:`modello ${d} cm`,x:s0s,y:rows.map(r=>r.forest[Cm].k),line:{color:DR[j],width:2.2},marker:{size:7,color:DR[j]},
      error_y:{type:'data',symmetric:false,array:rows.map(r=>r.forest[Cr[0]].k-r.forest[Cm].k),arrayminus:rows.map(r=>r.forest[Cm].k-r.forest[Cr[1]].k),color:DR[j],thickness:1,width:3},
      hovertemplate:`${d} cm, suzione iniziale %{x} kPa<br>k = %{y:.2f}<extra>serbatoio ${E.config.interception_capacity_mm} mm (barre: ${Cr[0]}–${Cr[1]} mm)</extra>`}); });
  const sd=K.s0_common_kPa;
  t2.push({type:'scatter',mode:'markers',name:'misurato (15, 30/35, 60 cm)',x:K.base.map((r,j)=>sd[j]*(1+0.06*(j-1))),y:K.base.map(r=>r.k_equivalent_rain),
    error_y:{type:'data',symmetric:false,array:K.base.map(r=>r.k_ci95[1]-r.k_equivalent_rain),arrayminus:K.base.map(r=>r.k_equivalent_rain-r.k_ci95[0]),color:fg,thickness:1.4,width:5},
    marker:{size:10,symbol:'diamond',color:css('--panel'),line:{width:2,color:fg}},text:['15 cm','30/35 cm','60 cm'],hovertemplate:'misurato %{text}<br>k = %{y:.2f}<extra>suzione iniziale mediana dei dati</extra>'});
  let L=base('suzione iniziale uniforme [kPa]','fattore di pioggia equivalente k'); L.xaxis.type='log'; L.xaxis.tickvals=[10,30,100]; L.yaxis.range=[0,1.05];
  Plotly.react('x-k',t2,L,cfgP);
  // experiment 2: FS at 120 cm vs rain
  const t3=[], lim=Math.tan(38.5*Math.PI/180)/Math.tan(E.slope_deg*Math.PI/180);
  [10,30].forEach((s0,q)=>[false,true].forEach(fo=>{ const g=E.grid.filter(r=>r.s0===s0&&r.forest===fo).sort((a,b)=>a.P-b.P);
    t3.push({type:'scatter',mode:'lines+markers',name:`${fo?'bosco':'senza veg.'}, ${s0} kPa`,x:g.map(r=>r.P),y:g.map(r=>r.depth['120'].fs_min),line:{color:fo?css('--veg'):css('--nv'),width:2.2,dash:q?'dash':'solid'},marker:{size:6,symbol:fo?'diamond':'circle'},hovertemplate:`P %{x} mm<br>FS min %{y:.2f}<extra>${fo?'bosco':'senza veg.'}, suzione iniziale ${s0} kPa</extra>`}); }));
  t3.push({type:'scatter',mode:'lines',name:'solo attrito',x:[0,125],y:[lim,lim],line:{color:mu,width:1,dash:'dot'},hoverinfo:'skip'});
  L=base('pioggia dell\'evento in 24 h [mm]','FS minimo a 120 cm'); L.yaxis.type='log'; L.yaxis.tickvals=[1.5,2,3,5,10]; L.xaxis.range=[0,125];
  Plotly.react('x-fs',t3,L,cfgP);
}
function draw(){ if(!filled){ filled=true; fill(); } plots(); }
window.ExpView={draw};
})();
</script>
