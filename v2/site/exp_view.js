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
  const notes=[
    `<b>Validità.</b> Con le curve di drying (sezioni 1–3) il modello riproduce i periodi di essiccamento su cui è calibrato, non l'imbibizione. Per gli eventi (sezione 4) usa un terreno in imbibizione calibrato a parte sul disboscato.`,
    `<b>Controllo sull'autunno 2025.</b> Partendo dai profili misurati del 15/08/2025 con la pioggia reale, le suzioni mensili simulate si scostano molto da quelle misurate: nel bosco a 60 cm ${X.chk.V60_oct} contro ${X.chk.V60_oct_obs} kPa a ottobre e ${X.chk.V60_nov} contro ${X.chk.V60_nov_obs} kPa a novembre; senza vegetazione a 15 cm ${X.chk.NV15_jan} contro ${X.chk.NV15_jan_obs} kPa a gennaio. Per questo non sono mostrate simulazioni continue sul periodo né della riumidificazione autunnale. Gli eventi sono simulati uno per uno, ripartendo ogni volta dai θ misurati (sezione 4). Gli script sono nel repository, cartella <code>exp/</code>.`,
    `<b>Domanda evaporativa.</b> Il fattore di ETP (× ${fx(X.par.NV.eFactor,2)} senza vegetazione, × ${fx(X.par.V.eFactor,2)} nel bosco) viene dalla calibrazione: rappresenta il microclima sotto chioma ma assorbe anche ciò che il modello non descrive.`,
    `<b>Analisi a eventi.</b> Il terreno in imbibizione è lo stesso nelle due parcelle. Una differenza reale del suolo superficiale (strato organico del bosco) finisce quindi nel volume trattenuto C<sub>eff</sub>, che è un limite superiore dell'intercettazione. L'ingresso nel tempo (τ) non è risolto con sensori a 15 cm e dati orari.`];
  $('m-dryNotes').innerHTML = notes.map(x=>'<li>'+x+'</li>').join('');
}
function draw(){ if(!filled){ filled=true; fill(); } window.EventView && window.EventView.draw(); }
window.ExpView={draw};
})();
</script>
