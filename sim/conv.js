// convergence check: same run with tighter tolerance / finer grid; reports max |dtheta|
const fs=require('fs'), S=require('./solver.js');
const F=JSON.parse(fs.readFileSync('forcing.json')), R=JSON.parse(fs.readFileSync('../results_NV.json')), M0=JSON.parse(fs.readFileSync('model_defaults.json'));
const n=+process.argv[2]; const f={P_mm:F.P_mm.slice(0,n),PE_mm:F.PE_mm.slice(0,n)};
const fits={}; for(const k of M0.layerDepthKeys) fits[k]=R.depths[k].fits.drying.params;
const s0={}; for(const k of M0.layerDepthKeys) s0[k]=F.s0_kPa[k];
function go(over){ const M=Object.assign({},M0,over); const t=Date.now(); const o=S.run(S.buildConfig(M,fits,s0),f); o.ms=Date.now()-t; return o; }
const ref=go({}); console.log('base ms',ref.ms,'steps',ref.stats.steps,'mb',JSON.stringify(ref.massBalance));
for (const over of [{tolTheta:1e-6,itGrow:3},{dz_cm:0.5},{dtMax_h:0.25}]){
  const o=go(over); let mx=0; for(const z of [15,30,60]) for(let i=0;i<n;i++) mx=Math.max(mx,Math.abs(o.theta[z][i]-ref.theta[z][i]));
  console.log(JSON.stringify(over),'ms',o.ms,'max|dθ|',mx.toFixed(5),'mbErr',o.massBalance.error_mm.toFixed(3));
}
