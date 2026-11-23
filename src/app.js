import {
  LABELS, scenarios, stages, membership, fuzzify, singletonMembership, discreteFuzzify, evaluateController, buildControlSurface,
  runHandCheck, normalizedEntropy, combineMembership, analyzeRuleBase, computeSugenoComparison
} from './engine.js';

const $ = (id) => id.startsWith('.') ? document.querySelector(id) : document.getElementById(id);
const fmt = (value, digits = 2) => Number.isFinite(value) ? Number(value).toFixed(digits) : '—';
const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const state = {
  scenarioId: 'fan', inputs: [...scenarios.fan.defaultInputs], membershipMethod: 'triangular', andOperator: 'min',
  implication: 'clip', aggregation: 'max', defuzzMethod: 'centroid', alphaCut: .5, stage: 0,
  playing: false, timer: null, selectedRule: 'medium-medium', rules: scenarios.fan.rules.map((r) => [...r]), customRules: false,
  filterPrevious: 24, selectedSurfaceCell: null
};

function scenario() { return scenarios[state.scenarioId]; }
function config(overrides = {}) { return { scenarioId: state.scenarioId, inputs: state.inputs, membershipMethod: state.membershipMethod, andOperator: state.andOperator, implication: state.implication, aggregation: state.aggregation, defuzzMethod: state.defuzzMethod, alphaCut: state.alphaCut, rules: state.rules, ...overrides }; }
function result(overrides = {}) { return evaluateController(config(overrides)); }
function labelClass(label) { return String(label).toLowerCase(); }
function currentRuleId(i, j) { return `${LABELS[i].toLowerCase()}-${LABELS[j].toLowerCase()}`; }
function currentRulesFlat() { return state.rules.flatMap((row, i) => row.map((output, j) => ({ id: currentRuleId(i,j), first: LABELS[i], second: LABELS[j], output, row: i, column: j }))); }

function setRangeFill(input) {
  if (!input || !input.min || !input.max) return;
  const min = Number(input.min), max = Number(input.max), value = Number(input.value);
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;
  input.style.setProperty('--fill', `${pct}%`);
}
function updateAllRangeFills() { document.querySelectorAll('input.range').forEach(setRangeFill); }
function bindRange(id, callback) {
  const el = $(id);
  el.addEventListener('input', () => { setRangeFill(el); callback(Number(el.value)); });
  setRangeFill(el);
}

function membershipPath(points, xMap, yMap, method, setPoints) {
  const coords = [];
  const start = points[0], end = points[1];
  for (let i = 0; i <= 100; i += 1) {
    const x = start + (end - start) * i / 100;
    coords.push(`${i === 0 ? 'M' : 'L'}${xMap(x).toFixed(2)},${yMap(membership(x, setPoints, method)).toFixed(2)}`);
  }
  return coords.join(' ');
}
function membershipSVG(inputIndex, value, method = state.membershipMethod, compact = false) {
  const s = scenario().inputs[inputIndex], W = compact ? 420 : 460, H = compact ? 160 : 190;
  const pad = { l: 31, r: 12, t: 11, b: 26 }, iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const xMap = (x) => pad.l + (x - s.min) / (s.max - s.min) * iw;
  const yMap = (y) => pad.t + (1 - y) * ih;
  const colors = { Low: '#1f5fbf', Medium: '#7850c9', High: '#bf570d' };
  const curves = LABELS.map((name) => {
    const path = membershipPath([s.min, s.max], xMap, yMap, method, s.sets[name]);
    return `<path d="${path}" fill="none" stroke="${colors[name]}" stroke-width="2.5" stroke-linecap="round"/><text x="${xMap((s.sets[name][1] + s.sets[name][2]) / 2)}" y="${Math.max(10, yMap(1) - 5)}" text-anchor="middle" fill="${colors[name]}" font-size="9">${name}</text>`;
  }).join('');
  const degrees = fuzzify(value, s.sets, method);
  const marker = `<line x1="${xMap(value)}" x2="${xMap(value)}" y1="${pad.t}" y2="${pad.t + ih}" stroke="var(--text)" stroke-dasharray="4 4" stroke-width="1.3"/><circle cx="${xMap(value)}" cy="${yMap(Math.max(...Object.values(degrees)))}" r="4.5" fill="var(--surface)" stroke="var(--accent)" stroke-width="2.5"/><text x="${clamp(xMap(value), 40, W - 38)}" y="${H - 7}" text-anchor="middle" fill="var(--accent)" font-size="9">${fmt(value,1)}</text>`;
  const grid = [0, .5, 1].map((v) => `<line class="grid" x1="${pad.l}" x2="${W-pad.r}" y1="${yMap(v)}" y2="${yMap(v)}"/><text x="${pad.l-7}" y="${yMap(v)+3}" text-anchor="end">${v.toFixed(1)}</text>`).join('');
  const ticks = [0, .5, 1].map((v) => { const x = s.min + v * (s.max - s.min); return `<text x="${xMap(x)}" y="${H-7}" text-anchor="middle">${fmt(x,0)}</text>`; }).join('');
  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Membership function chart for ${esc(s.name)} at ${fmt(value,1)} ${esc(s.unit)}">${grid}<line class="axis" x1="${pad.l}" y1="${pad.t+ih}" x2="${W-pad.r}" y2="${pad.t+ih}"/>${curves}${marker}${ticks}</svg>`;
}
function outputSVG(r, showComponents = true) {
  const W = 620, H = 225, pad = {l:38,r:15,t:13,b:30};
  const s = scenario().output, iw = W-pad.l-pad.r, ih = H-pad.t-pad.b;
  const xMap = (x) => pad.l + (x-s.min)/(s.max-s.min)*iw;
  const yMap = (y) => pad.t + (1-y)*ih;
  const colors = ['#1f5fbf','#7850c9','#bf570d'];
  const baseSets = LABELS.map((label, i) => {
    const pts = [];
    for (let x=s.min; x<=s.max; x+=1) pts.push(`${pts.length?'L':'M'}${xMap(x).toFixed(2)},${yMap(membership(x,s.sets[label])).toFixed(2)}`);
    return `<path d="${pts.join(' ')}" fill="none" stroke="${colors[i]}" stroke-width="1.25" stroke-dasharray="4 4" opacity=".25"/>`;
  }).join('');
  const perRule = showComponents ? r.rules.filter((rule) => rule.firingStrength > 0).slice(0, 7).map((rule, i) => {
    const vals = r.samples.map((p) => p.contributions[r.rules.findIndex((q) => q.id === rule.id)] || 0);
    const path = vals.map((v, j) => `${j?'L':'M'}${xMap(r.samples[j].x).toFixed(2)},${yMap(v).toFixed(2)}`).join(' ');
    return `<path d="${path}" fill="none" stroke="${colors[LABELS.indexOf(rule.output)]}" stroke-width="1.4" opacity=".55"/>`;
  }).join('') : '';
  const aggregatePath = r.samples.map((p,i)=>`${i?'L':'M'}${xMap(p.x).toFixed(2)},${yMap(p.membership).toFixed(2)}`).join(' ');
  const areaPath = `${aggregatePath} L${xMap(s.max)},${yMap(0)} L${xMap(s.min)},${yMap(0)} Z`;
  const centroid = r.crispOutput !== null ? `<line x1="${xMap(r.crispOutput)}" x2="${xMap(r.crispOutput)}" y1="${pad.t}" y2="${pad.t+ih}" stroke="var(--accent)" stroke-width="2" stroke-dasharray="5 4"/><circle cx="${xMap(r.crispOutput)}" cy="${yMap(0)}" r="4" fill="var(--accent)"/><text x="${clamp(xMap(r.crispOutput),75,W-70)}" y="${pad.t+12}" fill="var(--accent)" text-anchor="middle" font-size="10">${fmt(r.crispOutput,1)} ${esc(s.unit)}</text>` : '';
  const grid = [0,.5,1].map(v=>`<line class="grid" x1="${pad.l}" x2="${W-pad.r}" y1="${yMap(v)}" y2="${yMap(v)}"/><text x="${pad.l-8}" y="${yMap(v)+3}" text-anchor="end">${v.toFixed(1)}</text>`).join('');
  const ticks=[0,.25,.5,.75,1].map(t=>`<text x="${xMap(s.min+t*(s.max-s.min))}" y="${H-8}" text-anchor="middle">${Math.round(t*100)}</text>`).join('');
  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Aggregated fuzzy output membership function">${grid}<line class="axis" x1="${pad.l}" y1="${yMap(0)}" x2="${W-pad.r}" y2="${yMap(0)}"/>${baseSets}${perRule}<path d="${areaPath}" fill="var(--accent)" opacity=".16"/><path d="${aggregatePath}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linejoin="round"/>${centroid}${ticks}<text x="${W/2}" y="${H-1}" text-anchor="middle">Output universe (${esc(s.unit)})</text></svg>`;
}

function renderScenarioControls() {
  const s = scenario();
  $('scenarioDescription').textContent = s.description;
  $('inputOneLabel').textContent = s.inputs[0].name;
  $('inputTwoLabel').textContent = s.inputs[1].name;
  $('inputOne').min = s.inputs[0].min; $('inputOne').max = s.inputs[0].max; $('inputOne').step = s.inputs[0].step;
  $('inputTwo').min = s.inputs[1].min; $('inputTwo').max = s.inputs[1].max; $('inputTwo').step = s.inputs[1].step;
  $('inputOneMin').textContent = s.inputs[0].min; $('inputOneMax').textContent = s.inputs[0].max;
  $('inputTwoMin').textContent = s.inputs[1].min; $('inputTwoMax').textContent = s.inputs[1].max;
  $('inputOne').value = state.inputs[0]; $('inputTwo').value = state.inputs[1];
  updateInputLabels();
}
function updateInputLabels() {
  const s=scenario();
  $('inputOneValue').textContent=`${fmt(state.inputs[0], s.inputs[0].step < 1 ? 1 : 0)} ${s.inputs[0].unit}`;
  $('inputTwoValue').textContent=`${fmt(state.inputs[1], s.inputs[1].step < 1 ? 1 : 0)} ${s.inputs[1].unit}`;
  $('heroInputOneTitle').textContent=s.inputs[0].name.toUpperCase();$('heroInputTwoTitle').textContent=s.inputs[1].name.toUpperCase();$('heroOutputTitle').textContent=s.outputLabel.toUpperCase();
  $('heroTemp').textContent=`${fmt(state.inputs[0],1)}${s.inputs[0].unit}`;
  $('heroHumidity').textContent=`${fmt(state.inputs[1],1)}${s.inputs[1].unit}`;
  const live=result(); $('heroOutput').textContent=live.crispOutput===null?'—':`${fmt(live.crispOutput,1)}${s.output.unit}`;
  setRangeFill($('inputOne')); setRangeFill($('inputTwo'));
}
function stageMembershipMarkup(r) {
  const s=scenario();
  return `<div class="stage-membership-grid">${[0,1].map((i)=>`<div class="chart-panel"><h5>${esc(s.inputs[i].name)} · ${fmt(state.inputs[i],1)} ${esc(s.inputs[i].unit)}</h5>${membershipSVG(i,state.inputs[i])}<div class="degree-row">${Object.entries(r.fuzzified[i]).map(([k,v])=>`<span class="degree-chip ${labelClass(k)}">${k} ${fmt(v,2)}</span>`).join('')}</div></div>`).join('')}</div>`;
}
function stageRulesMarkup(r) {
  return `<div class="stage-rule-grid">${r.rules.map(rule=>`<div class="stage-rule-cell ${rule.firingStrength>0?'active':''}"><b>${rule.first} / ${rule.second}</b><span>α = ${fmt(rule.firingStrength,2)}</span><small>THEN ${rule.output}</small></div>`).join('')}</div>`;
}
function renderCalculation(r) {
  const s=scenario(); const stage=state.stage;
  const lines=[];
  if(stage>=1){
    const f0=r.fuzzified[0],f1=r.fuzzified[1];
    lines.push(['Fuzzification',`${s.inputs[0].name}: ${LABELS.map(k=>`${k} ${fmt(f0[k],2)}`).join(' · ')}`]);
    lines.push(['Second input',`${s.inputs[1].name}: ${LABELS.map(k=>`${k} ${fmt(f1[k],2)}`).join(' · ')}`]);
  }
  if(stage>=2){
    const active=r.activeRules.slice().sort((a,b)=>b.firingStrength-a.firingStrength).slice(0,4);
    lines.push(['Rule strength',`α = ${state.andOperator==='min'?'min(μ₁, μ₂)':'μ₁ × μ₂'}`]);
    active.forEach(rule=>lines.push([`${rule.first} ∧ ${rule.second}`,`${state.andOperator==='min'?`min(${fmt(rule.firstDegree,2)}, ${fmt(rule.secondDegree,2)})`:`${fmt(rule.firstDegree,2)} × ${fmt(rule.secondDegree,2)}`} = ${fmt(rule.firingStrength,3)} → ${rule.output}`]));
  }
  if(stage>=3){
    lines.push(['Implication',state.implication==='clip'?'μ′(z) = min(α, μB(z))':'μ′(z) = α × μB(z)']);
    lines.push(['Aggregation',state.aggregation==='max'?'μout(z) = max of individual rule outputs':'μout(z) = min(1, sum of individual rule outputs)']);
    lines.push(['Aggregated area',`Σ μ(z) Δz = ${fmt(r.area,2)}`]);
  }
  if(stage>=4){
    const formula=state.defuzzMethod==='centroid'?'z* = Σ z μ(z) / Σ μ(z)':state.defuzzMethod==='mom'?'z* = mean of z values where μ(z) is maximal':state.defuzzMethod==='thresholdMidpoint'?`z* = (first α-cut point + last α-cut point) / 2, α = ${fmt(state.alphaCut,2)}`:`z* = mean of z values where μ(z) ≥ ${fmt(state.alphaCut,2)}`;
    lines.push(['Defuzzification',formula]);
    lines.push(['Crisp output',`${fmt(r.crispOutput,2)} ${s.output.unit}`]);
  }
  $('calculationPanel').innerHTML=lines.length?lines.map(([title,detail])=>`<div class="trace-line"><b>${esc(title)}</b><small>${esc(detail)}</small></div>`).join(''):'<p>Move through the stages to reveal the controller\'s calculations.</p>';
}
function renderStage() {
  const r=result(); const current=stages[state.stage];
  $('stageCounter').textContent=`STAGE ${state.stage+1} OF ${stages.length}`;
  $('stageTitle').textContent=current.title; $('stageExplanation').textContent=current.explanation;
  $('stageProgress').style.width=`${(state.stage+1)/stages.length*100}%`;
  $('stageTabs').querySelectorAll('[data-stage]').forEach(btn=>{
    const i=Number(btn.dataset.stage); btn.classList.toggle('active',i===state.stage); btn.classList.toggle('done',i<state.stage);
    btn.setAttribute('aria-selected',i===state.stage?'true':'false'); btn.tabIndex=i===state.stage?0:-1;
  });
  $('previousButton').disabled=state.stage===0; $('stepButton').disabled=state.stage===stages.length-1;
  $('runState').classList.toggle('playing',state.playing); $('runState').innerHTML=`<i></i> ${state.playing?'PLAYING':state.stage===4?'COMPLETE':'PAUSED'}`;
  const visual=$('stageVisual');
  if(state.stage===0){
    visual.innerHTML=`<div class="input-visual"><div class="visual-value"><small>INPUT 01</small><b>${fmt(state.inputs[0],1)}${esc(scenario().inputs[0].unit)}</b><span>${esc(scenario().inputs[0].name)}</span></div><div class="visual-connector">+</div><div class="visual-value"><small>INPUT 02</small><b>${fmt(state.inputs[1],1)}${esc(scenario().inputs[1].unit)}</b><span>${esc(scenario().inputs[1].name)}</span></div><div class="visual-arrow">→</div><div class="visual-destination"><small>READY FOR FUZZIFICATION</small><b>μ(x)</b></div></div>`;
  } else if(state.stage===1){ visual.innerHTML=stageMembershipMarkup(r); }
  else if(state.stage===2){ visual.innerHTML=stageRulesMarkup(r); }
  else if(state.stage===3){ visual.innerHTML=`<div class="stage-output-wrap">${outputSVG(r,true)}<div class="degree-row"><span class="degree-chip low">Low consequent</span><span class="degree-chip medium">Medium consequent</span><span class="degree-chip high">High consequent</span><span class="degree-chip">Bold line: aggregated output</span></div></div>`; }
  else { visual.innerHTML=`<div class="stage-output-wrap">${outputSVG(r,true)}<div class="output-metric-banner"><div><small>DEFUZZIFIED ${scenario().outputLabel.toUpperCase()}</small><div>Centroid / selected method</div></div><b>${fmt(r.crispOutput,2)} ${scenario().output.unit}</b></div></div>`; }
  renderCalculation(r); renderMetrics(r);
}
function renderMetrics(r) {
  const s=scenario();
  $('liveOutput').textContent=state.stage>=4&&r.crispOutput!==null?`${fmt(r.crispOutput,1)} ${s.output.unit}`:'—';
  $('liveOutputCaption').textContent=state.stage>=4?'Crisp control decision':'Advance to defuzzification';
  $('activeRuleCount').textContent=state.stage>=2?`${r.activeRules.length} / 9`:'—';
  const dominant=state.stage>=2&&r.activeRules.length?r.activeRules.slice().sort((a,b)=>b.firingStrength-a.firingStrength)[0].output:'—';
  $('dominantSet').textContent=dominant; $('ledgerAnd').textContent=state.andOperator==='min'?'Minimum':'Product';
  $('ledgerImplication').textContent=state.implication==='clip'?'Clipping':'Scaling';
}
function setStage(index) { state.stage=clamp(index,0,4); renderStage(); }
function stopPlayback(){ if(state.timer){clearInterval(state.timer);state.timer=null;} state.playing=false; }
function togglePlayback(){ if(state.playing){stopPlayback();renderStage();return;} if(state.stage>=4)state.stage=0;state.playing=true;renderStage();state.timer=setInterval(()=>{if(state.stage>=4){stopPlayback();renderStage();return;}state.stage+=1;renderStage();if(state.stage===4){stopPlayback();renderStage();}},Number($('playSpeed').value)); }
function refreshAfterInput(){updateInputLabels();renderStage();renderLearning();renderSurface();renderArchitectureRelated();renderProperties();}

function renderRuleSelector(){
  const rules=currentRulesFlat();$('ruleSelector').innerHTML=rules.map(r=>`<option value="${r.id}">IF ${r.first} AND ${r.second} → ${r.output}</option>`).join('');
  if(!rules.some(r=>r.id===state.selectedRule))state.selectedRule=rules[0].id;
  $('ruleSelector').value=state.selectedRule;renderRuleComposition();
}
function renderRuleComposition(){
  const r=result();const rule=r.rules.find(x=>x.id===$('ruleSelector').value)||r.rules[0];
  state.selectedRule=rule.id;
  const formula=state.andOperator==='min'?`min(${fmt(rule.firstDegree,2)}, ${fmt(rule.secondDegree,2)})`:`${fmt(rule.firstDegree,2)} × ${fmt(rule.secondDegree,2)}`;
  $('ruleComposition').innerHTML=`<div class="rule-part"><small>${esc(rule.first)} degree</small><b>${fmt(rule.firstDegree,2)}</b></div><div class="rule-part"><small>${esc(rule.second)} degree</small><b>${fmt(rule.secondDegree,2)}</b></div><div class="rule-part"><small>Firing α</small><b>${fmt(rule.firingStrength,2)}</b></div><p class="micro-note" style="grid-column:1/-1">IF ${rule.first} AND ${rule.second} THEN ${rule.output}. Firing strength = ${formula} = <b>${fmt(rule.firingStrength,3)}</b>.</p>`;
}
function renderFuzzExplorer(){
  const method=$('fuzzMethod').value;const s=scenario().inputs[0];$('fuzzValue').min=s.min;$('fuzzValue').max=s.max;$('fuzzValue').value=clamp(Number($('fuzzValue').value),s.min,s.max);const value=Number($('fuzzValue').value);$('fuzzValueText').textContent=`${fmt(value,1)} ${s.unit}`;setRangeFill($('fuzzValue'));
  const graph=$('fuzzGraph');
  if(method==='singleton'){
    const singletonGrade=singletonMembership(value,value);
    const x=31+value/s.max*(420-43);graph.innerHTML=`<svg class="chart-svg" viewBox="0 0 420 145" role="img" aria-label="Singleton fuzzy set spike at current crisp input"><line class="axis" x1="31" y1="112" x2="408" y2="112"/><line x1="${x}" y1="112" x2="${x}" y2="22" stroke="var(--accent)" stroke-width="3"/><circle cx="${x}" cy="22" r="5" fill="var(--accent)"/><text x="${clamp(x,50,385)}" y="14" text-anchor="middle">μ = 1 at input</text><text x="31" y="130">${s.min}</text><text x="408" y="130" text-anchor="end">${s.max} ${s.unit}</text></svg>`;
    $('fuzzReadout').innerHTML=`<span class="degree-chip">Singleton μ(x) = ${singletonGrade} at x = ${fmt(value,1)}</span><span class="degree-chip">μ(x) = 0 elsewhere (idealized)</span>`;
    $('fuzzMethodNote').textContent='Singleton fuzzification represents a crisp input as a spike (a singleton set). It is useful in discrete or computational formulations; it is not the same as assigning Low/Medium/High linguistic grades.';
  }else if(method==='discrete'){
    const discrete=discreteFuzzify(value,s.sets,1,'triangular');const degrees=discrete.memberships;
    const bars=LABELS.map(label=>`<div class="property-metric"><small>${label} @ ${fmt(discrete.sampledInput,0)} ${s.unit}</small><b>${fmt(degrees[label],2)}</b><span>Lookup at nearest discrete sample</span></div>`).join('');
    graph.innerHTML=`<div class="property-metrics">${bars}</div><p class="micro-note">Discrete case: the input universe is sampled at integer points and the membership grade is read from the table. Here the displayed lookup point is ${Math.round(value)} ${s.unit}.</p>`;
    $('fuzzReadout').innerHTML=LABELS.map(label=>`<span class="degree-chip ${labelClass(label)}">μ${label[0]} = ${fmt(degrees[label],2)}</span>`).join('');
    $('fuzzMethodNote').textContent='A discrete fuzzy set stores membership values at individual universe elements instead of requiring a continuous curve.';
  }else{
    graph.innerHTML=membershipSVG(0,value,method,true);
    const degrees=fuzzify(value,s.sets,method);
    $('fuzzReadout').innerHTML=Object.entries(degrees).map(([label,v])=>`<span class="degree-chip ${labelClass(label)}">μ${label[0]} = ${fmt(v,3)}</span>`).join('');
    $('fuzzMethodNote').textContent=method==='gaussian'?'Gaussian membership uses a smooth bell-shaped curve. Its tails may remain above zero at the domain boundary, so several rules can receive small firing strengths.':'Triangular and trapezoidal sets use linear ramps and optional flat tops. Adjacent sets can overlap, allowing more than one linguistic label to apply.';
  }
}
function renderDefuzzCompare(){
  const methods=[['Centroid','centroid','Balance point of area'],['Mean of maxima','mom','Average of maximum locations'],['α-cut mean','threshold','Mean of points above α'],['α-cut midpoint','thresholdMidpoint','Midpoint of α-cut extent']];
  $('defuzzCompare').innerHTML=methods.map(([name,key,detail])=>{const out=result({defuzzMethod:key});return `<div class="defuzz-item"><small>${name.toUpperCase()}</small><b>${fmt(out.crispOutput,1)}</b><span>${detail}</span></div>`;}).join('');
}
function renderExtension(){
  const r=result({implication:$('extensionImplication').value,aggregation:$('extensionAggregation').value});
  $('extensionVisual').innerHTML=outputSVG(r,true);
  const sugeno=computeSugenoComparison(r,state.scenarioId);
  $('extensionSummary').textContent=`At the current inputs, ${r.activeRules.length} rules contribute. ${r.implication==='clip'?'Clipping caps each consequent at its firing strength.':'Product scaling shrinks each consequent proportionally.'} ${r.aggregation==='max'?'Maximum keeps the strongest grade at each output location.':'Bounded sum adds grades up to 1, so overlapping rule contributions can reinforce one another.'} Mamdani crisp output: ${fmt(r.crispOutput,1)} ${scenario().output.unit}; zero-order Sugeno-style weighted-average contrast: ${fmt(sugeno,1)} ${scenario().output.unit} (illustrative constants 22, 50, 82).`;
}
function renderLearning(){
  renderFuzzExplorer();renderRuleComposition();renderDefuzzCompare();renderExtension();renderRuleSelector();
  // The selector call already renders its selected rule; this keeps the selected rule synchronized after engine changes.
}

function colorFor(value,min,max){
  const t=max===min?.5:(value-min)/(max-min);
  const stops=[[31,95,191],[54,141,157],[229,173,81]];
  const a=t<.5?stops[0]:stops[1],b=t<.5?stops[1]:stops[2],u=t<.5?t*2:(t-.5)*2;
  const rgb=a.map((v,i)=>Math.round(v+(b[i]-v)*u));return `rgb(${rgb.join(',')})`;
}
let surfaceCache=null; let surfaceCacheKey='';
function renderSurface(){
  const cacheKey=JSON.stringify({scenarioId:state.scenarioId,membershipMethod:state.membershipMethod,andOperator:state.andOperator,implication:state.implication,aggregation:state.aggregation,defuzzMethod:state.defuzzMethod,alphaCut:state.alphaCut,rules:state.rules});
  if(!surfaceCache || surfaceCacheKey!==cacheKey){surfaceCache=buildControlSurface({...config(),gridSize:17});surfaceCacheKey=cacheKey;}
  const cells=surfaceCache;
  const values=cells.map(c=>c.output).filter(Number.isFinite);const min=Math.min(...values),max=Math.max(...values);const s=scenario();
  $('surfaceOutputTitle').textContent=`${s.outputLabel} across the input space`;$('surfaceDescription').textContent=`Every cell is evaluated from the ${state.customRules?'edited':'active'} rule table using ${state.membershipMethod} input memberships, ${state.andOperator} AND, ${state.implication==='clip'?'clipping':'scaling'}, and ${state.aggregation} aggregation.`;
  $('surfaceXAxis').textContent=s.inputs[0].name;$('surfaceYAxis').textContent=s.inputs[1].name;
  const current=result();$('surfaceCurrentOutput').textContent=current.crispOutput===null?'No output':`${fmt(current.crispOutput,1)} ${s.output.unit}`;
  $('surfaceCurrentInputs').textContent=`${s.inputs[0].name}: ${fmt(state.inputs[0],1)} ${s.inputs[0].unit} · ${s.inputs[1].name}: ${fmt(state.inputs[1],1)} ${s.inputs[1].unit}`;
  $('surfaceMinMax').textContent=`Sampled output range: ${fmt(min,1)}–${fmt(max,1)} ${s.output.unit}`;
  const html=cells.map(c=>{
    const isCurrent=Math.abs(c.x-state.inputs[0])<=(s.inputs[0].max-s.inputs[0].min)/32 && Math.abs(c.y-state.inputs[1])<=(s.inputs[1].max-s.inputs[1].min)/32;
    return `<button class="surface-cell ${isCurrent?'current':''}" style="background:${colorFor(c.output,min,max)}" data-surface-x="${c.x}" data-surface-y="${c.y}" title="${esc(s.inputs[0].name)} ${fmt(c.x,1)} ${esc(s.inputs[0].unit)} · ${esc(s.inputs[1].name)} ${fmt(c.y,1)} ${esc(s.inputs[1].unit)} → ${fmt(c.output,1)} ${esc(s.output.unit)}" aria-label="Set inputs to ${fmt(c.x,1)} and ${fmt(c.y,1)}, output ${fmt(c.output,1)}"><span>${fmt(c.output,1)}</span></button>`;
  }).join('');
  $('controlSurface').innerHTML=html;
  $('controlSurface').querySelectorAll('[data-surface-x]').forEach(btn=>btn.addEventListener('click',()=>{
    state.inputs=[Number(btn.dataset.surfaceX),Number(btn.dataset.surfaceY)];$('inputOne').value=state.inputs[0];$('inputTwo').value=state.inputs[1];state.stage=0;stopPlayback();renderScenarioControls();refreshAfterInput();$('studio').scrollIntoView({behavior:'smooth'});
  }));
  $('miniSurfacePreview').style.background=`linear-gradient(100deg,${colorFor(min,min,max)},${colorFor((min+max)/2,min,max)},${colorFor(max,min,max)})`;
}

function renderArchitectureDiagram(mode='flat'){
  const flat=`<div class="diagram-flow"><div class="diagram-node"><strong>Sensor inputs</strong><small>crisp measurements</small></div><span class="diagram-arrow">→</span><div class="diagram-node accent"><strong>Fuzzification</strong><small>membership grades</small></div><span class="diagram-arrow">→</span><div class="diagram-node"><strong>Rule base</strong><small>IF–THEN knowledge</small></div><span class="diagram-arrow">→</span><div class="diagram-node accent"><strong>Inference</strong><small>aggregate output</small></div><span class="diagram-arrow">→</span><div class="diagram-node"><strong>Defuzzifier</strong><small>crisp command</small></div></div><p class="micro-note">A flat architecture processes the input variables together in one rule base. As the number of variables grows, the rule table can grow rapidly.</p>`;
  const hierarchical=`<div class="diagram-flow"><div class="diagram-node"><strong>Temperature</strong><small>sensor variable</small></div><div class="diagram-node"><strong>Humidity</strong><small>sensor variable</small></div><span class="diagram-arrow">↘</span><div class="diagram-node accent"><strong>Level 1 · Functional</strong><small>thermal comfort estimate</small></div><span class="diagram-arrow">→</span><div class="diagram-node accent"><strong>Level 2 · Control</strong><small>fan / heater demand</small></div><span class="diagram-arrow">→</span><div class="diagram-node"><strong>Actuator</strong><small>physical response</small></div></div><p class="micro-note">A hierarchical fuzzy system decomposes a large mapping into linked smaller systems. Its intermediate variables and interfaces need careful design to avoid information loss.</p>`;
  $('architectureDiagram').innerHTML=mode==='flat'?flat:hierarchical;
}
function renderFilter(){
  const sensor=Number($('sensorInput').value),alpha=Number($('filterAlpha').value),next=alpha*sensor+(1-alpha)*state.filterPrevious;
  $('sensorInputText').textContent=fmt(sensor,1);$('filterAlphaText').textContent=fmt(alpha,2);$('previousFiltered').textContent=fmt(state.filterPrevious,1);$('newFiltered').textContent=fmt(next,1);
  setRangeFill($('sensorInput'));setRangeFill($('filterAlpha'));
}
function renderProcessing(){
  const raw=Number($('processingInput').value),mode=$('processingMode').value;
  let processed=raw, label='No processing';
  if(mode==='quantized'){processed=Math.round(raw/5)*5;label='Quantized to nearest 5';}
  if(mode==='average'){processed=(raw+22)/2;label='Mean of current and previous sample (22)';}
  if(mode==='filtered'){processed=.35*raw+.65*22;label='Exponential smoothing with α = 0.35';}
  const sets=scenario().inputs[0].sets;const rawMu=fuzzify(clamp(raw,scenario().inputs[0].min,scenario().inputs[0].max),sets);const procMu=fuzzify(clamp(processed,scenario().inputs[0].min,scenario().inputs[0].max),sets);
  const hRaw=normalizedEntropy(Object.values(rawMu)),hProc=normalizedEntropy(Object.values(procMu));
  $('processingInputText').textContent=fmt(raw,1);setRangeFill($('processingInput'));
  $('processingResult').innerHTML=`<div class="processing-values"><div><small>PROCESSED INPUT · ${esc(label.toUpperCase())}</small><b>${fmt(processed,2)} °C</b></div><div><small>NORMALIZED OVERLAP ENTROPY</small><b>${fmt(hProc,3)}</b></div></div><div class="ledger-row"><span>Raw input entropy</span><b>${fmt(hRaw,3)}</b></div><div class="entropy-bar"><span style="width:${hProc*100}%"></span></div><div class="degree-row">${LABELS.map(k=>`<span class="degree-chip ${labelClass(k)}">${k}: ${fmt(procMu[k],2)}</span>`).join('')}</div>`;
}
function renderCombination(){
  const a=Number($('combineA').value),b=Number($('combineB').value),op=$('combineOperator').value,out=combineMembership(a,b,op);
  $('combineAText').textContent=fmt(a,2);$('combineBText').textContent=fmt(b,2);setRangeFill($('combineA'));setRangeFill($('combineB'));
  const ambiguity=normalizedEntropy([out,1-out]);
  $('combineResult').innerHTML=`<div class="processing-values"><div><small>COMBINED MEMBERSHIP</small><b>${fmt(out,3)}</b></div><div><small>BINARY AMBIGUITY INDEX</small><b>${fmt(ambiguity,3)}</b></div></div><div class="degree-row"><span class="degree-chip">A = ${fmt(a,2)}</span><span class="degree-chip">B = ${fmt(b,2)}</span><span class="degree-chip medium">Result = ${fmt(out,2)}</span></div>`;
}
function renderArchitectureRelated(){renderFilter();renderProcessing();renderCombination();}

function renderTuner(){
  $('tunerTable').innerHTML=LABELS.map((row,i)=>`<tr><td>${row}</td>${LABELS.map((col,j)=>`<td><select aria-label="${row} temperature and ${col} humidity rule" data-rule-row="${i}" data-rule-col="${j}">${LABELS.map(out=>`<option value="${out}" ${state.rules[i][j]===out?'selected':''}>${out}</option>`).join('')}</select></td>`).join('')}</tr>`).join('');
  $('tunerStatus').textContent=state.customRules?'Custom decision table applied':'Default decision table';
  $('tunerMessage').textContent=state.customRules?'Your edited consequences are active in the controller and control surface.':'Each cell represents one IF–THEN rule. Change the outputs and apply the table to update the live engine.';
}
function applyTuner(){
  const next=LABELS.map(()=>Array(3).fill('Low'));
  $('tunerTable').querySelectorAll('select').forEach(sel=>{next[Number(sel.dataset.ruleRow)][Number(sel.dataset.ruleCol)]=sel.value;});
  state.rules=next;state.customRules=true;state.stage=0;stopPlayback();$('tunerStatus').textContent='Custom decision table applied';renderTuner();refreshAfterInput();
}
function resetTuner(){state.rules=scenario().rules.map(row=>[...row]);state.customRules=false;state.stage=0;renderTuner();refreshAfterInput();}

let propertyCache=null; let propertyCacheKey='';
function renderProperties(){
  const cacheKey=JSON.stringify({scenarioId:state.scenarioId,rules:state.rules,membershipMethod:state.membershipMethod,andOperator:state.andOperator,implication:state.implication,aggregation:state.aggregation,defuzzMethod:state.defuzzMethod,alphaCut:state.alphaCut});
  if(!propertyCache || propertyCacheKey!==cacheKey){propertyCache=analyzeRuleBase({scenarioId:state.scenarioId,rules:state.rules,membershipMethod:state.membershipMethod,andOperator:state.andOperator,implication:state.implication,aggregation:state.aggregation,defuzzMethod:state.defuzzMethod,alphaCut:state.alphaCut,gridSize:17});propertyCacheKey=cacheKey;}
  const a=propertyCache;
  const metrics=[
    ['Completeness',`${(a.completeness*100).toFixed(1)}%`,a.complete?'Every sampled point is covered':'Some sampled points have no active rule',a.complete?'SAMPLED PASS':'CHECK'],
    ['Continuity diagnostic',fmt(a.continuityMaxStep,2), 'Largest neighboring output change on grid', 'MEASURED'],
    ['Consistency', 'No duplicate pairs', 'One consequent per unique antecedent pair in table', 'STRUCTURAL'],
    ['Rule validity',a.ruleValidity?'9 / 9 valid':'Invalid entries','All consequents match defined output labels',a.ruleValidity?'PASS':'CHECK'],
    ['Rule interaction',`${fmt(a.interactionShare*100,1)}%`,`${a.maxInteraction} maximum simultaneous active rules`, 'OVERLAP'],
    ['Decoupling residual',fmt(a.decouplingResidual,2),a.decoupledEquivalent?'Additive factorization found':'Coupled mapping is not additively separable','TEST']
  ];
  $('propertyMetrics').innerHTML=metrics.map(([name,value,detail,status])=>`<div class="property-metric"><small>${esc(name.toUpperCase())}</small><b>${esc(value)}</b><span>${esc(detail)}</span><em>${esc(status)}</em></div>`).join('');
  const ord={Low:0,Medium:1,High:2};
  $('coupledGrid').innerHTML=state.rules.map(row=>row.map(out=>`<span>${out==='Low'?'L':out==='Medium'?'M':'H'}</span>`).join('')).join('');
  $('uncoupledDiagram').innerHTML=`<div>Input 1 component → row term</div><div>Input 2 component → column term</div><div>Combine independent terms</div>`;
  $('decouplingResult').textContent=a.decoupledEquivalent?'The current ordinal rule table passes the additive factorization check. This is a necessary condition for this simplified separable representation.':'The current rule table does not pass the additive factorization check (non-zero interaction residual). Replacing it with independent row and column contributions would change at least one rule consequence.';
  $('interactionSummary').innerHTML=`<b>${fmt(a.interactionShare*100,1)}%</b><span>of sampled input points activate multiple rules. This overlap is how fuzzy transitions are blended instead of switched abruptly.</span>`;
}

function renderValidation(){
  const check=runHandCheck();const a=check.actual;const pass=check.pass;
  $('validationStatus').textContent=pass?'✓ PASS · engine agrees with the hand calculation':'✕ FAIL · at least one numerical check does not match';$('validationStatus').classList.toggle('fail',!pass);
  const rows=[
    ['Temperature memberships','Low 0 · Medium 1 · High 0',LABELS.map(k=>`${k} ${fmt(a.fuzzified[0][k],2)}`).join(' · '),check.checks.slice(0,3).every(Boolean)],
    ['Humidity memberships','Low 0 · Medium 1 · High 0',LABELS.map(k=>`${k} ${fmt(a.fuzzified[1][k],2)}`).join(' · '),check.checks.slice(3,6).every(Boolean)],
    ['Active rules','1 · Medium AND Medium → Medium',`${a.activeRules.length} active · ${a.activeRules[0]?.output??'none'}`,check.checks[6]&&check.checks[7]],
    ['Centroid','50.00%',`${fmt(a.crispOutput,2)}% · Δ ${fmt(Math.abs(a.crispOutput-50),8)}`,check.checks[8]]
  ];
  $('validationRows').innerHTML=rows.map(([name,expected,actual,ok])=>`<div class="validation-row"><b>${esc(name)}</b><span>${esc(expected)}</span><span>${esc(actual)}</span><b class="${ok?'pass-text':'fail-text'}">${ok?'PASS':'FAIL'}</b></div>`).join('');
  $('validationCount').textContent=`${check.checks.filter(Boolean).length}/${check.checks.length} checks passed`;
  const multi=evaluateController({scenarioId:'fan',inputs:[28,60],sampleStep:.25});
  $('multiCheckOutput').textContent=`${fmt(multi.crispOutput,2)}%`;$('multiCheckRules').textContent=String(multi.activeRules.length);
  $('multiRuleTrace').innerHTML=multi.activeRules.sort((x,y)=>y.firingStrength-x.firingStrength).slice(0,5).map(rule=>`<div class="multi-rule-line"><span>${rule.first} ∧ ${rule.second} → ${rule.output}</span><b>α ${fmt(rule.firingStrength,2)}</b></div>`).join('');
}
function renderEverything(){
  renderScenarioControls();renderStage();renderLearning();renderSurface();renderArchitectureDiagram();renderArchitectureRelated();renderTuner();renderProperties();renderValidation();updateAllRangeFills();
}

// Scenario and controller settings.
$('scenarioSelect').addEventListener('change',e=>{
  stopPlayback();state.scenarioId=e.target.value;state.inputs=[...scenario().defaultInputs];state.rules=scenario().rules.map(row=>[...row]);state.customRules=false;state.stage=0;state.selectedRule='medium-medium';renderEverything();
});
$('inputOne').addEventListener('input',e=>{state.inputs[0]=Number(e.target.value);refreshAfterInput();});
$('inputTwo').addEventListener('input',e=>{state.inputs[1]=Number(e.target.value);refreshAfterInput();});
for(const [id,key] of [['membershipSelect','membershipMethod'],['andSelect','andOperator'],['implicationSelect','implication'],['aggregationSelect','aggregation'],['defuzzSelect','defuzzMethod']]){
  $(id).addEventListener('change',e=>{state[key]=e.target.value;if(key==='defuzzMethod')$('alphaSetting').classList.toggle('hidden',!state.defuzzMethod.startsWith('threshold'));updateInputLabels();if(key==='membershipMethod')renderFuzzExplorer();renderStage();renderLearning();renderSurface();renderProperties();});
}
$('alphaCut').addEventListener('input',e=>{state.alphaCut=Number(e.target.value);$('alphaValue').textContent=fmt(state.alphaCut,2);setRangeFill(e.target);updateInputLabels();renderStage();renderDefuzzCompare();renderSurface();renderProperties();});
$('restoreAll').addEventListener('click',()=>{stopPlayback();state.scenarioId='fan';$('scenarioSelect').value='fan';state.inputs=[...scenarios.fan.defaultInputs];state.membershipMethod='triangular';state.andOperator='min';state.implication='clip';state.aggregation='max';state.defuzzMethod='centroid';state.alphaCut=.5;state.rules=scenarios.fan.rules.map(row=>[...row]);state.customRules=false;state.stage=0;$('membershipSelect').value='triangular';$('andSelect').value='min';$('implicationSelect').value='clip';$('aggregationSelect').value='max';$('defuzzSelect').value='centroid';$('alphaCut').value=.5;$('alphaValue').textContent='0.50';$('alphaSetting').classList.add('hidden');renderEverything();});

// Stage player.
$('stageTabs').querySelectorAll('[data-stage]').forEach(btn=>btn.addEventListener('click',()=>{stopPlayback();setStage(Number(btn.dataset.stage));}));
$('playButton').addEventListener('click',togglePlayback);
$('stepButton').addEventListener('click',()=>{stopPlayback();setStage(state.stage+1);});
$('previousButton').addEventListener('click',()=>{stopPlayback();setStage(state.stage-1);});
$('resetButton').addEventListener('click',()=>{stopPlayback();setStage(0);});
$('playSpeed').addEventListener('change',()=>{if(state.playing){stopPlayback();togglePlayback();}});
document.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName))return;if(e.code==='Space'){e.preventDefault();togglePlayback();}if(e.code==='ArrowRight'){stopPlayback();setStage(state.stage+1);}if(e.code==='ArrowLeft'){stopPlayback();setStage(state.stage-1);}});

// Learning modules.
$('fuzzMethod').addEventListener('change',renderFuzzExplorer);bindRange('fuzzValue',renderFuzzExplorer);
$('ruleSelector').addEventListener('change',()=>{renderRuleComposition();});
$('extensionImplication').addEventListener('change',renderExtension);$('extensionAggregation').addEventListener('change',renderExtension);

// Architecture modules.
document.querySelectorAll('[data-arch]').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('[data-arch]').forEach(b=>b.classList.toggle('active',b===btn));renderArchitectureDiagram(btn.dataset.arch);}));
bindRange('sensorInput',renderFilter);bindRange('filterAlpha',renderFilter);
$('filterStep').addEventListener('click',()=>{state.filterPrevious=Number($('newFiltered').textContent);renderFilter();});
bindRange('processingInput',renderProcessing);$('processingMode').addEventListener('change',renderProcessing);
bindRange('combineA',renderCombination);bindRange('combineB',renderCombination);$('combineOperator').addEventListener('change',renderCombination);
$('applyRules').addEventListener('click',applyTuner);$('resetRules').addEventListener('click',resetTuner);
$('runAnalysis').addEventListener('click',renderProperties);
$('surfaceRefresh').addEventListener('click',renderSurface);

// Theme, responsive nav and active section indicator.
$('themeToggle').addEventListener('click',()=>{const dark=document.documentElement.dataset.theme!=='dark';document.documentElement.dataset.theme=dark?'dark':'light';$('themeToggle').textContent=dark?'☼':'◐';});
$('mobileMenu').addEventListener('click',()=>{$('.main-nav').classList.toggle('open');});
document.querySelectorAll('.main-nav a').forEach(a=>a.addEventListener('click',()=>$('.main-nav').classList.remove('open')));
if('IntersectionObserver' in window){
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){document.querySelectorAll('.main-nav a').forEach(a=>a.classList.toggle('active',a.getAttribute('href')===`#${entry.target.id}`));}}),{rootMargin:'-25% 0px -65% 0px'});
  ['overview','studio','learning','architecture','properties','validation'].forEach(id=>{const el=$(id);if(el)observer.observe(el);});
}

renderEverything();
