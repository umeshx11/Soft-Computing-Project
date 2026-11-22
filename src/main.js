import { scenarios, stages, membership, evaluateController, buildControlSurface, runHandCheck } from './fuzzy.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
window.FuzzyFlowMembership = membership;

const state = {
  scenarioId: 'fan', inputs: [...scenarios.fan.defaultInputs], membershipMethod: 'triangular',
  andOperator: 'min', defuzzMethod: 'centroid', stage: 0, playing: false, timer: null,
  selectedRule: null, result: null
};

const fmt = (value, digits = 2) => Number.isFinite(value) ? Number(value.toFixed(digits)).toString() : '—';
const percent = (value) => `${fmt(value * 100, 1)}%`;
const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const scenario = () => scenarios[state.scenarioId];
const result = () => state.result ?? evaluateController(config());
function config() {
  return {
    scenarioId: state.scenarioId, inputs: [...state.inputs], membershipMethod: state.membershipMethod,
    andOperator: state.andOperator, defuzzMethod: state.defuzzMethod
  };
}
function stopPlayback() {
  state.playing = false;
  if (state.timer) window.clearInterval(state.timer);
  state.timer = null;
  $('#playButton').textContent = '▶ Play';
}
function compute() { state.result = evaluateController(config()); }
function setStage(next) {
  state.stage = Math.max(0, Math.min(stages.length - 1, next));
  renderStage();
  renderResultPanels();
  if (state.stage === stages.length - 1 && state.playing) {
    stopPlayback();
    $('#stageStatus').textContent = 'Complete';
  }
}
function resetSimulation() {
  stopPlayback();
  state.stage = 0;
  state.selectedRule = null;
  compute();
  renderAll();
}
function renderScenario() {
  const s = scenario();
  $('#scenarioDescription').textContent = s.description;
  $('#inputControlOneLabel').textContent = `${s.inputs[0].name} (${s.inputs[0].unit})`;
  $('#inputControlTwoLabel').textContent = `${s.inputs[1].name} (${s.inputs[1].unit})`;
  $('#inputOne').min = s.inputs[0].min;
  $('#inputOne').max = s.inputs[0].max;
  $('#inputOne').step = s.inputs[0].step;
  $('#inputTwo').min = s.inputs[1].min;
  $('#inputTwo').max = s.inputs[1].max;
  $('#inputTwo').step = s.inputs[1].step;
  $('#inputOne').value = state.inputs[0];
  $('#inputTwo').value = state.inputs[1];
  $('#inputOneMin').textContent = fmt(s.inputs[0].min, 1);
  $('#inputOneMax').textContent = fmt(s.inputs[0].max, 1);
  $('#inputOneValue').textContent = `${fmt(state.inputs[0], 1)} ${s.inputs[0].unit}`;
  $('#inputTwoValue').textContent = `${fmt(state.inputs[1], 1)} ${s.inputs[1].unit}`;
  $('#outputMetricLabel').textContent = s.outputLabel;
  $('#inputOneTitle').textContent = s.inputs[0].name;
  $('#inputTwoTitle').textContent = s.inputs[1].name;
  $('#surfaceAxisX').textContent = s.inputs[0].name;
  $('#surfaceAxisY').textContent = s.inputs[1].name;
  $('#surfaceOutputLabel').textContent = s.outputLabel;
}
function lineChartSvg({ sets, min, max, value, method, width = 520, height = 180, prefix = 'mf' }) {
  const pad = { left: 34, right: 12, top: 14, bottom: 27 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const x = (v) => pad.left + ((v - min) / (max - min)) * innerW;
  const y = (v) => pad.top + (1 - v) * innerH;
  const colors = { Low: '#34a6a0', Medium: '#8b7cf6', High: '#f2a65a' };
  const grid = [0, 0.5, 1].map((v) => `<line x1="${pad.left}" y1="${y(v)}" x2="${width - pad.right}" y2="${y(v)}" class="chart-grid"/><text x="${pad.left - 8}" y="${y(v) + 4}" class="chart-axis" text-anchor="end">${v.toFixed(1)}</text>`).join('');
  const curves = Object.entries(sets).map(([label, points]) => {
    const samples = 100;
    const path = Array.from({ length: samples + 1 }, (_, index) => {
      const v = min + (index / samples) * (max - min);
      const degree = window.FuzzyFlowMembership(v, points, method);
      return `${index === 0 ? 'M' : 'L'} ${x(v).toFixed(2)} ${y(degree).toFixed(2)}`;
    }).join(' ');
    return `<path d="${path}" fill="none" stroke="${colors[label]}" stroke-width="2.6" stroke-linecap="round"/><text x="${x((points[1] + points[2]) / 2)}" y="${y(1) - 6}" class="chart-label" text-anchor="middle" fill="${colors[label]}">${label}</text>`;
  }).join('');
  const marker = Number.isFinite(value) ? `<line x1="${x(value)}" y1="${pad.top}" x2="${x(value)}" y2="${height - pad.bottom}" stroke="#fff" stroke-dasharray="4 4" stroke-width="1.5"/><circle cx="${x(value)}" cy="${y(0.04)}" r="4.5" fill="#fff" stroke="#17253c" stroke-width="1.5"/><text x="${x(value)}" y="${height - 7}" class="chart-marker-label" text-anchor="middle">${fmt(value, 1)}</text>` : '';
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Membership function graph">${grid}<line x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}" class="chart-axis-line"/><text x="${pad.left}" y="${height - 8}" class="chart-axis">${fmt(min, 1)}</text><text x="${width - pad.right}" y="${height - 8}" class="chart-axis" text-anchor="end">${fmt(max, 1)}</text>${curves}${marker}</svg>`;
}
function renderMemberships() {
  const s = scenario();
  const r = result();
  const reveal = state.stage >= 1;
  $('#membershipChartOne').innerHTML = lineChartSvg({ sets: s.inputs[0].sets, min: s.inputs[0].min, max: s.inputs[0].max, value: state.inputs[0], method: state.membershipMethod, prefix: 'one' });
  $('#membershipChartTwo').innerHTML = lineChartSvg({ sets: s.inputs[1].sets, min: s.inputs[1].max === 5 ? s.inputs[1].min : s.inputs[1].min, max: s.inputs[1].max, value: state.inputs[1], method: state.membershipMethod, prefix: 'two' });
  $('#membershipValuesOne').innerHTML = Object.entries(r.fuzzified[0]).map(([label, degree]) => `<span class="degree-chip"><i class="dot ${label.toLowerCase()}"></i>${label}: <b>${reveal ? fmt(degree, 3) : '—'}</b></span>`).join('');
  $('#membershipValuesTwo').innerHTML = Object.entries(r.fuzzified[1]).map(([label, degree]) => `<span class="degree-chip"><i class="dot ${label.toLowerCase()}"></i>${label}: <b>${reveal ? fmt(degree, 3) : '—'}</b></span>`).join('');
  $('#membershipRevealNote').textContent = reveal ? 'Membership values calculated from the current inputs.' : 'Step forward to reveal the membership degrees.';
}
function renderRules() {
  const r = result();
  const visible = state.stage >= 2;
  $('#ruleGrid').innerHTML = r.rules.map((rule) => {
    const active = visible && rule.firingStrength > 0;
    const selected = state.selectedRule === rule.id;
    return `<button class="rule-card ${active ? 'is-active' : ''} ${selected ? 'is-selected' : ''}" data-rule="${rule.id}" type="button" aria-pressed="${selected}">
      <span class="rule-number">R${r.rules.indexOf(rule) + 1}</span><span class="rule-sentence">IF <b>${rule.first}</b> AND <b>${rule.second}</b><br>THEN <b>${rule.output}</b></span>
      <span class="rule-strength">${visible ? fmt(rule.firingStrength, 3) : '—'}</span></button>`;
  }).join('');
  $$('.rule-card').forEach((button) => button.addEventListener('click', () => {
    state.selectedRule = state.selectedRule === button.dataset.rule ? null : button.dataset.rule;
    renderRules();
    renderRuleDetail();
  }));
  renderRuleDetail();
}
function renderRuleDetail() {
  const r = result();
  const selected = r.rules.find((rule) => rule.id === state.selectedRule);
  const panel = $('#ruleDetail');
  if (!selected) {
    panel.innerHTML = '<span class="muted">Select a rule card to inspect its two input memberships and firing strength.</span>';
    return;
  }
  const firstWord = state.andOperator === 'min' ? 'minimum' : 'product';
  panel.innerHTML = `<b>Rule detail</b><p>μ(${selected.first}) = ${fmt(selected.firstDegree, 3)} and μ(${selected.second}) = ${fmt(selected.secondDegree, 3)}.</p><p>Using the ${firstWord} AND operator, the rule fires at <strong>${fmt(selected.firingStrength, 3)}</strong>.</p>`;
}
function outputSvg() {
  const s = scenario();
  const r = result();
  const width = 650, height = 220, left = 38, right = 14, top = 15, bottom = 31;
  const x = (v) => left + ((v - s.output.min) / (s.output.max - s.output.min)) * (width - left - right);
  const y = (v) => top + (1 - v) * (height - top - bottom);
  const points = r.samples;
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(point.x).toFixed(2)} ${y(point.membership).toFixed(2)}`).join(' ');
  const area = `${line} L ${x(points[points.length - 1].x)} ${y(0)} L ${x(points[0].x)} ${y(0)} Z`;
  const grid = [0, 0.5, 1].map((v) => `<line x1="${left}" y1="${y(v)}" x2="${width - right}" y2="${y(v)}" class="chart-grid"/>`).join('');
  const marker = state.stage >= 4 && r.crispOutput !== null ? `<line x1="${x(r.crispOutput)}" y1="${top}" x2="${x(r.crispOutput)}" y2="${height - bottom}" stroke="#fff" stroke-width="2" stroke-dasharray="5 4"/><circle cx="${x(r.crispOutput)}" cy="${y(0)}" r="4" fill="#fff" stroke="#1c2b43"/><text x="${x(r.crispOutput)}" y="${top + 10}" class="chart-marker-label" text-anchor="middle">${fmt(r.crispOutput, 1)}</text>` : '';
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Aggregated fuzzy output graph">${grid}<path d="${area}" fill="rgba(90, 196, 178, .20)"/><path d="${line}" fill="none" stroke="#5cc4b2" stroke-width="3" stroke-linejoin="round"/>${marker}<line x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}" class="chart-axis-line"/><text x="${left}" y="${height - 9}" class="chart-axis">0</text><text x="${width - right}" y="${height - 9}" class="chart-axis" text-anchor="end">100</text></svg>`;
}
function renderAggregation() {
  $('#outputChart').innerHTML = state.stage >= 3 ? outputSvg() : '<div class="chart-placeholder"><span class="placeholder-icon">∿</span><p>The combined output shape will appear here after rule evaluation.</p></div>';
  $('#aggregateSummary').textContent = state.stage >= 3
    ? `${result().activeRules.length} active rules combined using maximum aggregation.`
    : 'Waiting for the rule strengths.';
}
function renderCalculation() {
  const r = result();
  const chosen = r.activeRules.slice().sort((a, b) => b.firingStrength - a.firingStrength)[0];
  const output = scenario().output;
  const ruleText = chosen ? `Strongest rule: IF ${chosen.first} AND ${chosen.second} THEN ${chosen.output} (α = ${fmt(chosen.firingStrength, 3)}).` : 'No rule has fired yet.';
  $('#calculationPanel').innerHTML = `
    <div class="calculation-row"><span class="calc-symbol">μ₁</span><div><b>${scenario().inputs[0].name}</b><small>Current input: ${fmt(state.inputs[0], 2)} ${scenario().inputs[0].unit}</small></div><strong>${state.stage >= 1 ? Object.entries(r.fuzzified[0]).map(([label, v]) => `${label} ${fmt(v, 2)}`).join(' · ') : 'Not calculated'}</strong></div>
    <div class="calculation-row"><span class="calc-symbol">μ₂</span><div><b>${scenario().inputs[1].name}</b><small>Current input: ${fmt(state.inputs[1], 2)} ${scenario().inputs[1].unit}</small></div><strong>${state.stage >= 1 ? Object.entries(r.fuzzified[1]).map(([label, v]) => `${label} ${fmt(v, 2)}`).join(' · ') : 'Not calculated'}</strong></div>
    <div class="calculation-row"><span class="calc-symbol">α</span><div><b>Rule firing</b><small>AND operator: ${state.andOperator.toUpperCase()}</small></div><strong>${state.stage >= 2 ? `${r.activeRules.length} rule(s) active` : 'Not calculated'}</strong></div>
    <p class="calculation-note">${state.stage >= 2 ? esc(ruleText) : 'The rule base has not been evaluated yet.'}</p>
    <div class="formula-box"><span>Defuzzification</span><b>${state.defuzzMethod === 'centroid' ? 'z* = ∫ z μ(z) dz / ∫ μ(z) dz' : 'z* = mean of all z values where μ(z) is maximum'}</b><small>${state.stage >= 4 && r.crispOutput !== null ? `Output = ${fmt(r.crispOutput, 2)} ${output.unit}` : 'The crisp output appears at the final step.'}</small></div>`;
}
function renderStage() {
  const current = stages[state.stage];
  $('#stageTitle').textContent = current.title;
  $('#stageExplanation').textContent = current.explanation;
  $('#stageCounter').textContent = `Stage ${state.stage + 1} of ${stages.length}`;
  $('#stageProgress').style.width = `${((state.stage + 1) / stages.length) * 100}%`;
  $('#stageSteps').innerHTML = stages.map((stage, index) => `<button type="button" class="stage-step ${index === state.stage ? 'current' : ''} ${index < state.stage ? 'done' : ''}" data-stage="${index}" aria-label="Go to ${stage.title}"><span>${index < state.stage ? '✓' : index + 1}</span><small>${stage.short}</small></button>`).join('');
  $$('.stage-step').forEach((button) => button.addEventListener('click', () => { stopPlayback(); setStage(Number(button.dataset.stage)); }));
  $('#previousButton').disabled = state.stage === 0;
  $('#stepButton').disabled = state.stage === stages.length - 1;
  $('#stageStatus').textContent = state.stage === stages.length - 1 ? 'Controller output is ready' : state.playing ? 'Playing' : 'Paused';
}
function renderResultPanels() {
  renderMemberships();
  renderRules();
  renderAggregation();
  renderCalculation();
  const r = result();
  $('#liveOutput').textContent = state.stage >= 4 && r.crispOutput !== null ? `${fmt(r.crispOutput, 1)} ${scenario().output.unit}` : '—';
  $('#liveOutputCaption').textContent = state.stage >= 4 ? 'Crisp controller output' : 'Complete the steps to calculate';
  $('#activeRuleCount').textContent = state.stage >= 2 ? r.activeRules.length : '—';
  $('#membershipMethodText').textContent = state.membershipMethod === 'gaussian' ? 'Gaussian' : 'Triangular / shoulder';
  $('#defuzzMethodText').textContent = state.defuzzMethod === 'centroid' ? 'Centroid' : 'Mean of maxima';
  $('#outputMetricLabel').textContent = scenario().outputLabel;
  $('#resultValue').textContent = state.stage >= 4 && r.crispOutput !== null ? `${fmt(r.crispOutput, 2)} ${scenario().output.unit}` : 'Pending';
  $('#resultMetricName').textContent = scenario().outputLabel;
  $('#resultMetricCaption').textContent = state.stage >= 4 ? 'Calculated from the aggregated fuzzy output.' : 'Advance to the final stage to reveal the crisp output.';
}
function renderSurface() {
  const s = scenario();
  const cells = buildControlSurface({ ...config(), gridSize: 13 });
  const outputs = cells.map((cell) => cell.output ?? 0);
  const min = Math.min(...outputs), max = Math.max(...outputs);
  const normalize = (value) => max === min ? 0.5 : (value - min) / (max - min);
  const color = (t) => {
    const hue = 190 - 160 * t;
    return `hsl(${hue} 62% ${32 + t * 18}%)`;
  };
  const size = 25, gap = 2, offset = 28;
  const rects = cells.map((cell, index) => {
    const row = Math.floor(index / 13), column = index % 13;
    const n = normalize(cell.output ?? 0);
    return `<rect x="${offset + column * (size + gap)}" y="${offset + row * (size + gap)}" width="${size}" height="${size}" rx="4" fill="${color(n)}"><title>${s.inputs[0].name}: ${fmt(cell.x, 1)} ${s.inputs[0].unit}; ${s.inputs[1].name}: ${fmt(cell.y, 1)} ${s.inputs[1].unit}; output: ${cell.output === null ? 'undefined' : fmt(cell.output, 1)} ${s.output.unit}</title></rect>`;
  }).join('');
  $('#controlSurface').innerHTML = `<svg viewBox="0 0 385 385" role="img" aria-label="Fuzzy controller output surface heatmap">${rects}<text x="190" y="379" class="surface-axis" text-anchor="middle">${esc(s.inputs[0].name)}</text><text x="12" y="190" class="surface-axis" text-anchor="middle" transform="rotate(-90 12 190)">${esc(s.inputs[1].name)}</text></svg>`;
  $('#surfaceRange').textContent = `${fmt(min, 1)}–${fmt(max, 1)} ${s.output.unit}`;
  $('#surfaceLegend').innerHTML = `<span>Lower ${esc(s.outputLabel.toLowerCase())}</span><span class="gradient-bar"></span><span>Higher ${esc(s.outputLabel.toLowerCase())}</span>`;
}
function renderExperiment() {
  const s = scenario();
  const base = evaluateController({ scenarioId: state.scenarioId, inputs: state.inputs, membershipMethod: 'triangular', andOperator: 'min', defuzzMethod: 'centroid' });
  const gaussian = evaluateController({ scenarioId: state.scenarioId, inputs: state.inputs, membershipMethod: 'gaussian', andOperator: 'min', defuzzMethod: 'centroid' });
  const product = evaluateController({ scenarioId: state.scenarioId, inputs: state.inputs, membershipMethod: 'triangular', andOperator: 'product', defuzzMethod: 'centroid' });
  const mom = evaluateController({ scenarioId: state.scenarioId, inputs: state.inputs, membershipMethod: 'triangular', andOperator: 'min', defuzzMethod: 'mom' });
  const experiments = [
    { name: 'Triangular + minimum', detail: 'Baseline configuration', output: base.crispOutput, active: base.activeRules.length, tone: 'teal' },
    { name: 'Gaussian + minimum', detail: 'Smooth membership curves', output: gaussian.crispOutput, active: gaussian.activeRules.length, tone: 'violet' },
    { name: 'Triangular + product', detail: 'AND strengths are multiplied', output: product.crispOutput, active: product.activeRules.length, tone: 'amber' },
    { name: 'Triangular + mean of maxima', detail: 'Alternative crisp-output method', output: mom.crispOutput, active: mom.activeRules.length, tone: 'blue' }
  ];
  $('#experimentCards').innerHTML = experiments.map((item) => `<article class="experiment-card"><div class="experiment-card-top"><span class="experiment-dot ${item.tone}"></span><b>${item.name}</b></div><p>${item.detail}</p><div class="experiment-output">${item.output === null ? 'No output' : `${fmt(item.output, 2)} ${s.output.unit}`}</div><small>${item.active} active rules · same input values</small></article>`).join('');
  $('#experimentNote').textContent = `All four runs use ${fmt(state.inputs[0], 1)} ${s.inputs[0].unit} and ${fmt(state.inputs[1], 1)} ${s.inputs[1].unit}. They are deterministic, side-by-side calculations; a different result is not automatically a better result.`;
}
function renderHandCheck() {
  const check = runHandCheck();
  const actual = check.actual;
  $('#validationStatus').innerHTML = check.pass ? '<span class="status-pill pass">✓ PASS · numerical comparison succeeded</span>' : '<span class="status-pill fail">✕ FAIL · inspect the values</span>';
  $('#validationRows').innerHTML = [
    ['Temperature memberships', 'Low 0 · Medium 1 · High 0', Object.entries(actual.fuzzified[0]).map(([k, v]) => `${k} ${fmt(v, 3)}`).join(' · ')],
    ['Humidity memberships', 'Low 0 · Medium 1 · High 0', Object.entries(actual.fuzzified[1]).map(([k, v]) => `${k} ${fmt(v, 3)}`).join(' · ')],
    ['Active rules', '1 rule: Medium AND Medium → Medium', `${actual.activeRules.length} active rule(s)`],
    ['Output centroid', '50.00%', actual.crispOutput === null ? '—' : `${fmt(actual.crispOutput, 2)}%`]
  ].map(([name, expected, actualValue]) => `<div class="validation-row"><b>${name}</b><span>${expected}</span><strong>${actualValue}</strong></div>`).join('');
  $('#validationCheckCount').textContent = `${check.checks.filter(Boolean).length}/${check.checks.length} checks passed`;
}
function renderAll() {
  renderScenario();
  renderStage();
  renderResultPanels();
  renderSurface();
  renderExperiment();
  renderHandCheck();
}

// The membership SVGs and numerical engine share the same membership function.

$('#scenarioSelect').addEventListener('change', (event) => {
  stopPlayback();
  state.scenarioId = event.target.value;
  state.inputs = [...scenario().defaultInputs];
  resetSimulation();
});
['inputOne', 'inputTwo'].forEach((id, index) => {
  $(`#${id}`).addEventListener('input', (event) => {
    state.inputs[index] = Number(event.target.value);
    state.stage = 0;
    state.selectedRule = null;
    stopPlayback();
    compute();
    renderScenario();
    renderStage();
    renderResultPanels();
    renderSurface();
    renderExperiment();
  });
});
$('#membershipSelect').addEventListener('change', (event) => { state.membershipMethod = event.target.value; resetSimulation(); });
$('#andSelect').addEventListener('change', (event) => { state.andOperator = event.target.value; resetSimulation(); });
$('#defuzzSelect').addEventListener('change', (event) => { state.defuzzMethod = event.target.value; resetSimulation(); });
$('#stepButton').addEventListener('click', () => { stopPlayback(); setStage(state.stage + 1); });
$('#previousButton').addEventListener('click', () => { stopPlayback(); setStage(state.stage - 1); });
$('#resetButton').addEventListener('click', resetSimulation);
$('#playButton').addEventListener('click', () => {
  if (state.playing) { stopPlayback(); renderStage(); return; }
  if (state.stage === stages.length - 1) state.stage = 0;
  state.playing = true;
  $('#playButton').textContent = 'Ⅱ Pause';
  setStage(state.stage);
  state.timer = window.setInterval(() => setStage(state.stage + 1), 1350);
});
$('#inputDefaultsButton').addEventListener('click', () => {
  state.inputs = [...scenario().defaultInputs];
  resetSimulation();
});
$('#restoreDefaultsButton').addEventListener('click', () => {
  state.membershipMethod = 'triangular'; state.andOperator = 'min'; state.defuzzMethod = 'centroid';
  $('#membershipSelect').value = state.membershipMethod;
  $('#andSelect').value = state.andOperator;
  $('#defuzzSelect').value = state.defuzzMethod;
  state.inputs = [...scenario().defaultInputs];
  resetSimulation();
});
$('#runValidationButton').addEventListener('click', () => {
  const check = runHandCheck();
  $('#validationStatus').scrollIntoView({ behavior: 'smooth', block: 'center' });
  renderHandCheck();
  $('#validationStatus').setAttribute('aria-live', 'polite');
  if (!check.pass) console.error('Hand calculation validation failed.', check);
});
$$('[data-scroll]').forEach((button) => button.addEventListener('click', () => $(button.dataset.scroll).scrollIntoView({ behavior: 'smooth' })));
$$('.nav-link').forEach((link) => link.addEventListener('click', () => {
  $$('.nav-link').forEach((item) => item.classList.remove('active'));
  link.classList.add('active');
}));

// Ensure the first render is immediate if the module import completes after DOM parsing.
renderAll();
