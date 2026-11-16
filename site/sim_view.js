<script>
(function(){
'use strict';
const S = window.SIM;
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const $ = id => document.getElementById(id);
const F = S.forcing, depths = S.model.outDepths_cm.map(String), nH = F.n_hours;
const t0ms = Date.parse(F.t0.replace(' ','T')+'Z');
const pad = x => String(x).padStart(2,'0');
const tstr = i => { const d = new Date(t0ms + i*3.6e6); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:00`; };
const T = Array.from({length:nH}, (_,i)=>tstr(i));
const iCal = S.calib.iCal;
const fmtKs = v => { const k = Math.pow(10, v); return `${k < 0.1 ? k.toPrecision(2) : k.toFixed(k<10?2:1)} cm/h · ${(k/360000).toExponential(1)} m/s`; };
// daily rain
const days=[], rainD=[]; { let cur=null; for(let i=0;i<nH;i++){ const d=T[i].slice(0,10); if(d!==cur){ days.push(d); rainD.push(0); cur=d; } rainD[rainD.length-1]+=F.P_mm[i]; } }
// missing-rain intervals (consecutive hour indices)
const missIv=[]; { const m=F.rain_missing; for(let k=0;k<m.length;k++){ if(k===0||m[k]!==m[k-1]+1) missIv.push([m[k],m[k]]); else missIv[missIv.length-1][1]=m[k]; } }

$('sm-L').textContent=S.model.L_cm; $('sm-dz').textContent=S.model.dz_cm; $('sm-hs').textContent=S.model.hs_cm;
$('sm-hc').textContent=S.model.hCrit_cm.toLocaleString('it-IT'); $('sm-cal').textContent=S.calib.calibEnd.split('-').reverse().join('/');
$('sm-t0').textContent=S.t_init.slice(0,16).replace(/(\d+)-(\d+)-(\d+)/,'$3/$2/$1');

const best = S.calib.best;
const ctl = [['ks1',0],['ks2',1],['ks3',2]];
function setControls(ks, ef){ ctl.forEach(([id,j])=>{ $(id).value=Math.log10(ks[j]).toFixed(2); $(id+'o').textContent=fmtKs(+$(id).value); }); $('ef').value=ef; $('efo').textContent=(+ef).toFixed(2); }
function readControls(){ return { Ks_cm_h: ctl.map(([id])=>Math.pow(10,+$(id).value)), eFactor:+$('ef').value }; }

// worker built from the same solver source the page uses
let worker=null, jobId=0, last=null;
try {
  const src = $('solver-src').textContent + `\nonmessage=function(e){var d=e.data;try{var cfg=RichardsSolver.buildConfig(d.model,d.fits,d.s0);var o=RichardsSolver.run(cfg,d.forcing);postMessage({id:d.id,ok:true,theta:o.theta,mb:o.massBalance,steps:o.stats.steps});}catch(err){postMessage({id:d.id,ok:false,error:String(err.message||err)});}};`;
  worker = new Worker(URL.createObjectURL(new Blob([src],{type:'text/javascript'})));
} catch(e) { worker = null; }

function status(txt, cls){ const el=$('simStatus'); el.textContent=txt; el.className='status'+(cls?' '+cls:''); }
function runSim(){
  const p = readControls(), model = Object.assign({}, S.model, p), id=++jobId;
  status('Simulazione in corso…','busy');
  const msg = { id, model, fits:S.fits, s0:S.s0_kPa, forcing:{P_mm:F.P_mm, PE_mm:F.PE_mm} };
  const done = r => { if(r.id!==jobId) return; if(!r.ok){ status('Errore del solutore: '+r.error,'err'); return; } last={...r, params:p}; status(`Fatto: ${r.steps.toLocaleString('it-IT')} passi temporali`); show(); };
  if (worker) { worker.onmessage = e => done(e.data); worker.postMessage(msg); }
  else setTimeout(()=>{ try{ const o=RichardsSolver.run(RichardsSolver.buildConfig(model,S.fits,S.s0_kPa),msg.forcing); done({id,ok:true,theta:o.theta,mb:o.massBalance,steps:o.stats.steps}); } catch(err){ done({id,ok:false,error:err.message}); } }, 30);
}
function metrics(sim, obs, i0, i1){
  let e=0,b=0,n=0; for(let i=i0;i<i1;i++){ const o=obs[i]; if(o==null) continue; const d=sim[i]-o; e+=d*d; b+=d; n++; }
  return { rmse: Math.sqrt(e/n), bias: b/n, n };
}
const f3 = x => x.toFixed(3), f4 = x => (x>=0?'+':'')+x.toFixed(3);
function show(){
  if(!last) return;
  let h = '<thead><tr><th>Profondità</th><th>RMSE calibrazione</th><th>RMSE validazione</th><th>Bias calibrazione</th><th>Bias validazione</th></tr></thead><tbody>';
  for (const d of depths){ const s=last.theta[d], o=F.obs[d], c=metrics(s,o,0,iCal), v=metrics(s,o,iCal,nH);
    h += `<tr><td>${d} cm</td><td class="num">${f3(c.rmse)}</td><td class="num">${f3(v.rmse)}</td><td class="num">${f4(c.bias)}</td><td class="num">${f4(v.bias)}</td></tr>`; }
  $('simTable').innerHTML = h + '</tbody>';
  const mb = last.mb, P = F.P_mm.reduce((a,b)=>a+b,0), Eact = P - mb.runoff_mm - mb.netSurface_mm;
  const r1 = x => Math.round(x).toLocaleString('it-IT');
  $('simMB').innerHTML = `<span>pioggia <b>${r1(P)}</b> mm</span><span>evaporazione reale <b>${r1(Eact)}</b> mm</span><span>ruscellamento <b>${r1(mb.runoff_mm)}</b> mm</span><span>drenaggio a 1 m <b>${r1(mb.drainage_mm)}</b> mm</span><span>variazione d'invaso <b>${r1(mb.dS_mm)}</b> mm</span><span>errore di bilancio <b>${mb.error_mm.toFixed(3)}</b> mm</span>`;
  redraw();
}
function redraw(){
  if(!last || $('simview').hidden) return;
  const fg=css('--fg'), mu=css('--muted'), gr=css('--grid'), ln=css('--line'), simC=css('--sim'), obsC=css('--obs'), wet=css('--wet'), band=css('--band'), und=css('--undet');
  const ax = (title, domain) => ({ title:{text:title,font:{color:mu,size:11}}, domain, gridcolor:gr, linecolor:ln, zeroline:false, tickfont:{color:mu} });
  const tr = [{ type:'bar', x:days, y:rainD, marker:{color:wet}, name:'pioggia', xaxis:'x', yaxis:'y', hovertemplate:'%{x}<br>%{y:.1f} mm/giorno<extra></extra>' }];
  const doms = [[0.54,0.75],[0.27,0.48],[0,0.21]];
  depths.forEach((d,j)=>{
    const ya = 'y'+(j+2);
    tr.push({ type:'scatter', mode:'lines', x:T, y:F.obs[d], name:'osservato', legendgroup:'obs', showlegend:j===0, line:{color:obsC,width:1}, xaxis:'x', yaxis:ya, hovertemplate:'%{x}<br>θ oss = %{y:.3f}<extra>'+d+' cm</extra>' });
    tr.push({ type:'scatter', mode:'lines', x:T, y:Array.from(last.theta[d]), name:'simulato', legendgroup:'sim', showlegend:j===0, line:{color:simC,width:1.6}, xaxis:'x', yaxis:ya, hovertemplate:'%{x}<br>θ sim = %{y:.3f}<extra>'+d+' cm</extra>' });
  });
  const shapes = [{ type:'rect', xref:'x', yref:'paper', x0:T[iCal], x1:T[nH-1], y0:0, y1:1, fillcolor:band, line:{width:0}, layer:'below' }];
  missIv.forEach(([a,b])=>{ if(b-a>=6) shapes.push({ type:'rect', xref:'x', yref:'paper', x0:T[a], x1:T[b], y0:0.79, y1:1, fillcolor:und, opacity:.35, line:{width:0}, layer:'below' }); });
  const L = { paper_bgcolor:'rgba(0,0,0,0)', plot_bgcolor:'rgba(0,0,0,0)', font:{family:css('--f-body'),size:12,color:fg},
    margin:{l:64,r:16,t:30,b:36}, hovermode:'x unified', showlegend:true, bargap:0,
    legend:{orientation:'h', x:0, y:1.04, yanchor:'bottom', font:{size:11,color:mu}},
    xaxis:{ type:'date', gridcolor:gr, linecolor:ln, tickfont:{color:mu}, anchor:'y4' },
    yaxis: ax('pioggia [mm/g]',[0.79,1]), shapes,
    annotations:[{ xref:'x', yref:'paper', x:T[Math.round(iCal/2)], y:1.0, text:'calibrazione', showarrow:false, font:{size:11,color:mu}, yanchor:'bottom' },
                 { xref:'x', yref:'paper', x:T[Math.round((iCal+nH)/2)], y:1.0, text:'validazione', showarrow:false, font:{size:11,color:mu}, yanchor:'bottom' }] };
  depths.forEach((d,j)=>{ L['yaxis'+(j+2)] = ax('θ '+d+' cm',doms[j]); });
  Plotly.react('simPlot', tr, L, {displaylogo:false, responsive:true, modeBarButtonsToRemove:['lasso2d','select2d']});
}
let inited=false;
function activate(){
  if(!inited){
    inited=true; setControls(best.Ks_cm_h, best.eFactor);
    ctl.forEach(([id])=>{ $(id).addEventListener('input',()=>$(id+'o').textContent=fmtKs(+$(id).value)); $(id).addEventListener('change',runSim); });
    $('ef').addEventListener('input',()=>$('efo').textContent=(+$('ef').value).toFixed(2)); $('ef').addEventListener('change',runSim);
    $('simReset').addEventListener('click',()=>{ setControls(best.Ks_cm_h,best.eFactor); runSim(); });
    runSim();
  } else redraw();
}
window.SimView = { activate, redraw };
})();
</script>
