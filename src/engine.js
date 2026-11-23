export const LABELS = ['Low', 'Medium', 'High'];

export const scenarios = {
  fan: {
    id: 'fan', name: 'Cooling fan controller', description: 'Choose a fan speed from room temperature and humidity.',
    inputLabels: ['Temperature', 'Humidity'], inputUnits: ['°C', '%'], outputLabel: 'Fan speed', outputUnit: '%',
    inputs: [
      { name: 'Temperature', unit: '°C', min: 0, max: 40, step: 1, defaultValue: 28, sets: { Low: [0, 0, 10, 20], Medium: [10, 20, 20, 30], High: [20, 30, 40, 40] } },
      { name: 'Humidity', unit: '%', min: 0, max: 100, step: 1, defaultValue: 60, sets: { Low: [0, 0, 25, 50], Medium: [25, 50, 50, 75], High: [50, 75, 100, 100] } }
    ],
    output: { name: 'Fan speed', unit: '%', min: 0, max: 100, sets: { Low: [0, 0, 20, 45], Medium: [25, 45, 55, 75], High: [55, 80, 100, 100] } },
    rules: [['Low', 'Low', 'Medium'], ['Medium', 'Medium', 'High'], ['High', 'High', 'High']], defaultInputs: [28, 60]
  },
  heater: {
    id: 'heater', name: 'Room heater controller', description: 'Choose heater power from room temperature and temperature trend.',
    inputLabels: ['Room temperature', 'Temperature trend'], inputUnits: ['°C', '°C/min'], outputLabel: 'Heater power', outputUnit: '%',
    inputs: [
      { name: 'Room temperature', unit: '°C', min: 0, max: 35, step: 1, defaultValue: 16, sets: { Low: [0, 0, 10, 18], Medium: [10, 18, 18, 27], High: [18, 27, 35, 35] } },
      { name: 'Temperature trend', unit: '°C/min', min: -5, max: 5, step: 0.1, defaultValue: -1, sets: { Low: [-5, -5, -2, 0], Medium: [-2, 0, 0, 2], High: [0, 2, 5, 5] } }
    ],
    output: { name: 'Heater power', unit: '%', min: 0, max: 100, sets: { Low: [0, 0, 20, 45], Medium: [25, 45, 55, 75], High: [55, 80, 100, 100] } },
    rules: [['High', 'High', 'Medium'], ['High', 'Medium', 'Low'], ['Medium', 'Low', 'Low']], defaultInputs: [16, -1]
  }
};

export const stages = [
  { id: 'inputs', title: 'Crisp inputs', short: 'Inputs', explanation: 'The controller receives ordinary measured values. These are crisp numbers, not fuzzy labels.' },
  { id: 'fuzzification', title: 'Fuzzification', short: 'Fuzzify', explanation: 'Each input is compared with its linguistic sets. Membership values describe how strongly a value belongs to Low, Medium, and High.' },
  { id: 'rules', title: 'Rule evaluation', short: 'Rules', explanation: 'Every IF–THEN rule combines its antecedent memberships using the selected AND operator.' },
  { id: 'aggregation', title: 'Implication & aggregation', short: 'Aggregate', explanation: 'Each rule shapes its output set. The individual rule outputs are combined into one fuzzy set.' },
  { id: 'defuzzification', title: 'Defuzzification', short: 'Crisp result', explanation: 'The aggregated fuzzy set is converted into one actionable output using the selected method.' }
];

const clampMembership = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const finite = (x, name) => { if (!Number.isFinite(x)) throw new Error(`${name} must be a finite number.`); };

export function membership(x, points, method = 'triangular') {
  const [a, b, c, d] = points;
  if (method === 'gaussian') {
    const center = (b + c) / 2;
    const sigma = Math.max((d - a) / 4, 1e-6);
    return Math.exp(-0.5 * ((x - center) / sigma) ** 2);
  }
  if (method !== 'triangular') throw new Error(`Unsupported membership method: ${method}`);
  if (x < a || x > d) return 0;
  if (x >= b && x <= c) return 1;
  if (x < b) return b === a ? 1 : clampMembership((x - a) / (b - a), 0, 1);
  return d === c ? 1 : clampMembership((d - x) / (d - c), 0, 1);
}

export function fuzzify(x, sets, method = 'triangular') {
  finite(x, 'Input');
  return Object.fromEntries(Object.entries(sets).map(([label, points]) => [label, membership(x, points, method)]));
}

export function singletonMembership(x, centre, tolerance = 0) {
  finite(x, 'Input'); finite(centre, 'Singleton centre');
  if (!(tolerance >= 0 && Number.isFinite(tolerance))) throw new Error('Singleton tolerance must be non-negative.');
  return Math.abs(x - centre) <= tolerance ? 1 : 0;
}

export function discreteFuzzify(x, sets, sampleStep = 1, method = 'triangular') {
  finite(x, 'Input');
  if (!(sampleStep > 0 && Number.isFinite(sampleStep))) throw new Error('Discrete sample step must be positive.');
  const sampledInput = Math.round(x / sampleStep) * sampleStep;
  return { sampledInput, memberships: fuzzify(sampledInput, sets, method) };
}

function makeRules(scenario, customRules) {
  const matrix = customRules ?? scenario.rules;
  return matrix.flatMap((row, i) => row.map((output, j) => ({
    id: `${LABELS[i].toLowerCase()}-${LABELS[j].toLowerCase()}`,
    first: LABELS[i], second: LABELS[j], output, row: i, column: j
  })));
}

export function aggregateAt(x, rules, outputSets, implication = 'clip', aggregation = 'max') {
  const byRule = rules.map((rule) => {
    const base = membership(x, outputSets[rule.output], 'triangular');
    return implication === 'scale' ? rule.firingStrength * base : Math.min(rule.firingStrength, base);
  });
  if (aggregation === 'boundedSum') return Math.min(1, byRule.reduce((sum, value) => sum + value, 0));
  return Math.max(0, ...byRule);
}

export function evaluateController({
  scenarioId = 'fan', inputs, membershipMethod = 'triangular', andOperator = 'min',
  implication = 'clip', aggregation = 'max', defuzzMethod = 'centroid', alphaCut = 0.5,
  rules: customRules, sampleStep = 0.25
} = {}) {
  const scenario = scenarios[scenarioId];
  if (!scenario) throw new Error(`Unknown scenario: ${scenarioId}`);
  const crisp = inputs ?? scenario.defaultInputs;
  if (!Array.isArray(crisp) || crisp.length !== 2) throw new Error('Exactly two inputs are required.');
  crisp.forEach((value, i) => {
    finite(value, scenario.inputs[i].name);
    if (value < scenario.inputs[i].min || value > scenario.inputs[i].max) throw new Error(`${scenario.inputs[i].name} is outside its allowed range.`);
  });
  if (!['triangular', 'gaussian'].includes(membershipMethod)) throw new Error('Choose triangular or Gaussian membership in the controller.');
  if (!['min', 'product'].includes(andOperator)) throw new Error('Unsupported AND operator.');
  if (!['clip', 'scale'].includes(implication)) throw new Error('Unsupported implication method.');
  if (!['max', 'boundedSum'].includes(aggregation)) throw new Error('Unsupported aggregation method.');
  if (!['centroid', 'mom', 'threshold', 'thresholdMidpoint'].includes(defuzzMethod)) throw new Error('Unsupported defuzzification method.');
  if (!(sampleStep > 0 && sampleStep <= 2)) throw new Error('Sample step must be greater than 0 and at most 2.');
  if (!(alphaCut > 0 && alphaCut <= 1)) throw new Error('Threshold α must be greater than 0 and at most 1.');

  const fuzzified = crisp.map((value, index) => fuzzify(value, scenario.inputs[index].sets, membershipMethod));
  const rules = makeRules(scenario, customRules).map((rule) => {
    const firstDegree = fuzzified[0][rule.first];
    const secondDegree = fuzzified[1][rule.second];
    const firingStrength = andOperator === 'min' ? Math.min(firstDegree, secondDegree) : firstDegree * secondDegree;
    return { ...rule, firstDegree, secondDegree, firingStrength };
  });
  const samples = [];
  const count = Math.round((scenario.output.max - scenario.output.min) / sampleStep);
  for (let i = 0; i <= count; i += 1) {
    const x = scenario.output.min + i * sampleStep;
    const contributions = rules.map((rule) => {
      const base = membership(x, scenario.output.sets[rule.output], 'triangular');
      return implication === 'scale' ? rule.firingStrength * base : Math.min(rule.firingStrength, base);
    });
    const value = aggregation === 'boundedSum' ? Math.min(1, contributions.reduce((a, b) => a + b, 0)) : Math.max(0, ...contributions);
    samples.push({ x, membership: value, contributions });
  }
  const area = samples.reduce((sum, p) => sum + p.membership, 0) * sampleStep;
  const weightedSum = samples.reduce((sum, p) => sum + p.x * p.membership, 0) * sampleStep;
  const maxMembership = Math.max(0, ...samples.map((p) => p.membership));
  const maxPoints = samples.filter((p) => Math.abs(p.membership - maxMembership) < 1e-9);
  const thresholdPoints = samples.filter((p) => p.membership >= alphaCut);
  let crispOutput = null;
  if (maxMembership > 1e-12) {
    if (defuzzMethod === 'centroid') crispOutput = area > 0 ? weightedSum / area : null;
    if (defuzzMethod === 'mom') crispOutput = maxPoints.reduce((sum, p) => sum + p.x, 0) / maxPoints.length;
    if (defuzzMethod === 'threshold') crispOutput = thresholdPoints.length ? thresholdPoints.reduce((sum, p) => sum + p.x, 0) / thresholdPoints.length : null;
    if (defuzzMethod === 'thresholdMidpoint') crispOutput = thresholdPoints.length ? (thresholdPoints[0].x + thresholdPoints[thresholdPoints.length - 1].x) / 2 : null;
  }
  return {
    scenarioId, crispInputs: [...crisp], fuzzified, rules, samples, crispOutput, area, weightedSum,
    maxMembership, maxPoints, thresholdPoints, activeRules: rules.filter((r) => r.firingStrength > 0),
    membershipMethod, andOperator, implication, aggregation, defuzzMethod, alphaCut, sampleStep
  };
}

export function buildControlSurface({ scenarioId = 'fan', membershipMethod = 'triangular', andOperator = 'min', implication = 'clip', aggregation = 'max', defuzzMethod = 'centroid', rules, gridSize = 17 } = {}) {
  const s = scenarios[scenarioId];
  const cells = [];
  for (let row = 0; row < gridSize; row += 1) {
    const y = s.inputs[1].max - row / (gridSize - 1) * (s.inputs[1].max - s.inputs[1].min);
    for (let col = 0; col < gridSize; col += 1) {
      const x = s.inputs[0].min + col / (gridSize - 1) * (s.inputs[0].max - s.inputs[0].min);
      const result = evaluateController({ scenarioId, inputs: [x, y], membershipMethod, andOperator, implication, aggregation, defuzzMethod, rules, sampleStep: 1 });
      cells.push({ x, y, output: result.crispOutput, row, col });
    }
  }
  return cells;
}

export function runHandCheck() {
  const actual = evaluateController({ scenarioId: 'fan', inputs: [20, 50], membershipMethod: 'triangular', andOperator: 'min', implication: 'clip', aggregation: 'max', defuzzMethod: 'centroid', sampleStep: 0.25 });
  const expected = { temperature: { Low: 0, Medium: 1, High: 0 }, humidity: { Low: 0, Medium: 1, High: 0 }, activeRules: 1, centroid: 50 };
  const close = (a, b, tol = 1e-8) => Math.abs(a - b) <= tol;
  const checks = [
    close(actual.fuzzified[0].Low, expected.temperature.Low), close(actual.fuzzified[0].Medium, expected.temperature.Medium), close(actual.fuzzified[0].High, expected.temperature.High),
    close(actual.fuzzified[1].Low, expected.humidity.Low), close(actual.fuzzified[1].Medium, expected.humidity.Medium), close(actual.fuzzified[1].High, expected.humidity.High),
    actual.activeRules.length === expected.activeRules,
    actual.activeRules[0]?.output === 'Medium',
    close(actual.crispOutput, expected.centroid)
  ];
  return { actual, expected, checks, pass: checks.every(Boolean), tolerance: 1e-8 };
}

export function normalizedEntropy(values) {
  const positive = values.map((v) => Math.max(0, v));
  const total = positive.reduce((a, b) => a + b, 0);
  if (total <= 1e-12) return 0;
  const probabilities = positive.map((v) => v / total).filter((p) => p > 0);
  if (probabilities.length <= 1) return 0;
  const h = -probabilities.reduce((sum, p) => sum + p * Math.log(p), 0);
  return h / Math.log(values.length);
}

export function combineMembership(a, b, operator) {
  if (operator === 'intersection') return Math.min(a, b);
  if (operator === 'union') return Math.max(a, b);
  if (operator === 'probabilisticSum') return a + b - a * b;
  if (operator === 'boundedSum') return Math.min(1, a + b);
  throw new Error('Unknown fuzzy signal combination operator.');
}

export function analyzeRuleBase({ scenarioId = 'fan', rules = scenarios[scenarioId].rules, membershipMethod = 'triangular', andOperator = 'min', implication = 'clip', aggregation = 'max', defuzzMethod = 'centroid', alphaCut = 0.5, gridSize = 19 } = {}) {
  const s = scenarios[scenarioId];
  let covered = 0, total = 0, interactionCases = 0, maxInteraction = 0, maxNeighborJump = 0;
  let validConsequents = true;
  const ruleKeys = new Set();
  const ruleReach = new Set();
  rules.forEach((row, i) => row.forEach((out, j) => {
    if (!LABELS.includes(out)) validConsequents = false;
    const key = `${i}-${j}`;
    if (ruleKeys.has(key)) validConsequents = false;
    ruleKeys.add(key);
  }));
  const matrix = [];
  for (let yi = 0; yi < gridSize; yi += 1) {
    const y = s.inputs[1].min + yi / (gridSize - 1) * (s.inputs[1].max - s.inputs[1].min);
    const row = [];
    for (let xi = 0; xi < gridSize; xi += 1) {
      const x = s.inputs[0].min + xi / (gridSize - 1) * (s.inputs[0].max - s.inputs[0].min);
      const r = evaluateController({ scenarioId, inputs: [x, y], membershipMethod, andOperator, implication, aggregation, defuzzMethod, alphaCut, rules, sampleStep: 1 });
      total += 1;
      if (r.activeRules.length > 0 && r.maxMembership > 0) covered += 1;
      if (r.activeRules.length > 1) interactionCases += 1;
      r.activeRules.forEach((activeRule) => ruleReach.add(activeRule.id));
      maxInteraction = Math.max(maxInteraction, r.activeRules.length);
      row.push(r.crispOutput);
      if (xi > 0 && r.crispOutput !== null && row[xi - 1] !== null) maxNeighborJump = Math.max(maxNeighborJump, Math.abs(r.crispOutput - row[xi - 1]));
    }
    matrix.push(row);
  }
  for (let yi = 1; yi < gridSize; yi += 1) for (let xi = 0; xi < gridSize; xi += 1) {
    const a = matrix[yi - 1][xi], b = matrix[yi][xi];
    if (a !== null && b !== null) maxNeighborJump = Math.max(maxNeighborJump, Math.abs(a - b));
  }
  const ord = Object.fromEntries(LABELS.map((label, i) => [label, i]));
  const numeric = rules.map((row) => row.map((label) => ord[label]));
  const additive = numeric.every((row) => row.every(Number.isFinite));
  const residuals = [];
  if (additive) for (let i = 1; i < 3; i += 1) for (let j = 1; j < 3; j += 1) residuals.push(numeric[i][j] - numeric[i][0] - numeric[0][j] + numeric[0][0]);
  const decouplingResidual = residuals.length ? Math.max(...residuals.map(Math.abs)) : Infinity;
  return {
    completeness: covered / total, complete: covered === total, continuityMaxStep: maxNeighborJump,
    ruleValidity: validConsequents && ruleKeys.size === 9 && ruleReach.size === 9, reachableRules: ruleReach.size, maxInteraction, interactionShare: interactionCases / total,
    decouplingResidual, decoupledEquivalent: decouplingResidual === 0, gridPoints: total
  };
}

export function computeSugenoComparison(result, scenarioId = 'fan') {
  const s = scenarios[scenarioId];
  const centers = { Low: 22, Medium: 50, High: 82 };
  const numerator = result.activeRules.reduce((sum, r) => sum + r.firingStrength * centers[r.output], 0);
  const denominator = result.activeRules.reduce((sum, r) => sum + r.firingStrength, 0);
  return denominator > 0 ? numerator / denominator : null;
}
