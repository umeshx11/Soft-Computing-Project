export const scenarios = {
  fan: {
    id: 'fan',
    name: 'Cooling fan controller',
    description: 'Choose a fan speed from the room temperature and humidity.',
    inputLabels: ['Temperature', 'Humidity'],
    outputLabel: 'Fan speed',
    inputUnits: ['°C', '%'],
    outputUnit: '%',
    inputs: [
      {
        id: 'temperature', name: 'Temperature', unit: '°C', min: 0, max: 40, step: 1, defaultValue: 28,
        sets: {
          Low: [0, 0, 10, 20], Medium: [10, 20, 20, 30], High: [20, 30, 40, 40]
        }
      },
      {
        id: 'humidity', name: 'Humidity', unit: '%', min: 0, max: 100, step: 1, defaultValue: 60,
        sets: {
          Low: [0, 0, 25, 50], Medium: [25, 50, 50, 75], High: [50, 75, 100, 100]
        }
      }
    ],
    output: {
      id: 'fanSpeed', name: 'Fan speed', unit: '%', min: 0, max: 100,
      sets: {
        Low: [0, 0, 20, 45], Medium: [25, 45, 55, 75], High: [55, 80, 100, 100]
      }
    },
    // Rows are temperature (Low, Medium, High); columns are humidity (Low, Medium, High).
    rules: [
      ['Low', 'Low', 'Medium'],
      ['Medium', 'Medium', 'High'],
      ['High', 'High', 'High']
    ],
    defaultInputs: [28, 60],
    examples: ['A cool, dry room should use a low fan speed.', 'Hot and humid conditions should produce a high fan speed.']
  },
  heater: {
    id: 'heater',
    name: 'Room heater controller',
    description: 'Choose heater power from room temperature and how quickly the temperature is changing.',
    inputLabels: ['Room temperature', 'Temperature trend'],
    outputLabel: 'Heater power',
    inputUnits: ['°C', '°C/min'],
    outputUnit: '%',
    inputs: [
      {
        id: 'temperature', name: 'Room temperature', unit: '°C', min: 0, max: 35, step: 1, defaultValue: 16,
        sets: {
          Low: [0, 0, 10, 18], Medium: [10, 18, 18, 27], High: [18, 27, 35, 35]
        }
      },
      {
        id: 'trend', name: 'Temperature trend', unit: '°C/min', min: -5, max: 5, step: 0.1, defaultValue: -1,
        sets: {
          Low: [-5, -5, -2, 0], Medium: [-2, 0, 0, 2], High: [0, 2, 5, 5]
        }
      }
    ],
    output: {
      id: 'heaterPower', name: 'Heater power', unit: '%', min: 0, max: 100,
      sets: {
        Low: [0, 0, 20, 45], Medium: [25, 45, 55, 75], High: [55, 80, 100, 100]
      }
    },
    // Low trend means cooling; High trend means warming.
    rules: [
      ['High', 'High', 'Medium'],
      ['High', 'Medium', 'Low'],
      ['Medium', 'Low', 'Low']
    ],
    defaultInputs: [16, -1],
    examples: ['A cold room that is still cooling needs strong heating.', 'A warm room that is already warming needs little or no heating.']
  }
};

export const stages = [
  { id: 'inputs', title: '1. Crisp inputs', short: 'Inputs', explanation: 'The controller receives ordinary numerical measurements. At this point, the values have not yet been described as low, medium, or high.' },
  { id: 'fuzzification', title: '2. Fuzzification', short: 'Fuzzify', explanation: 'Each crisp input is compared with its fuzzy sets. The membership values tell us how strongly a measurement belongs to labels such as Low, Medium, and High.' },
  { id: 'rules', title: '3. Rule evaluation', short: 'Rules', explanation: 'The controller checks every IF–THEN rule. The AND operator combines the two input memberships to calculate how strongly each rule fires.' },
  { id: 'aggregation', title: '4. Implication & aggregation', short: 'Aggregate', explanation: 'Each firing strength limits its output fuzzy set. The resulting output shapes are combined into one fuzzy output using the maximum operator.' },
  { id: 'defuzzification', title: '5. Defuzzification', short: 'Defuzzify', explanation: 'The final fuzzy output is converted into one usable number. The centroid method finds its balance point; mean of maxima averages the output values with the highest membership.' }
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function membership(value, points, method = 'triangular') {
  const [a, b, c, d] = points;
  if (method === 'gaussian') {
    const center = (b + c) / 2;
    const sigma = Math.max((d - a) / 4, 1e-6);
    return Math.exp(-0.5 * ((value - center) / sigma) ** 2);
  }
  if (value < a || value > d) return 0;
  if (value >= b && value <= c) return 1;
  if (value < b) return b === a ? 1 : clamp((value - a) / (b - a), 0, 1);
  return d === c ? 1 : clamp((d - value) / (d - c), 0, 1);
}

export function fuzzify(value, sets, method = 'triangular') {
  return Object.fromEntries(Object.entries(sets).map(([label, points]) => [label, membership(value, points, method)]));
}

function getRuleRows(scenario) {
  const labels = Object.keys(scenario.inputs[0].sets);
  const secondLabels = Object.keys(scenario.inputs[1].sets);
  const rows = [];
  for (let row = 0; row < labels.length; row += 1) {
    for (let column = 0; column < secondLabels.length; column += 1) {
      rows.push({
        id: `${labels[row].toLowerCase()}-${secondLabels[column].toLowerCase()}`,
        first: labels[row], second: secondLabels[column],
        output: scenario.rules[row][column]
      });
    }
  }
  return rows;
}

export function evaluateController({ scenarioId = 'fan', inputs, membershipMethod = 'triangular', andOperator = 'min', defuzzMethod = 'centroid', sampleStep = 0.5 } = {}) {
  const scenario = scenarios[scenarioId];
  if (!scenario) throw new Error(`Unknown controller scenario: ${scenarioId}`);
  const crisp = inputs ?? scenario.defaultInputs;
  if (!Array.isArray(crisp) || crisp.length !== 2 || crisp.some((value) => !Number.isFinite(value))) {
    throw new Error('The controller requires two finite numerical inputs.');
  }
  crisp.forEach((value, index) => {
    const input = scenario.inputs[index];
    if (value < input.min || value > input.max) {
      throw new Error(`${input.name} must be between ${input.min} and ${input.max} ${input.unit}.`);
    }
  });
  if (!['triangular', 'gaussian'].includes(membershipMethod)) throw new Error('Unsupported membership function.');
  if (!['min', 'product'].includes(andOperator)) throw new Error('Unsupported AND operator.');
  if (!['centroid', 'mom'].includes(defuzzMethod)) throw new Error('Unsupported defuzzification method.');
  if (!(sampleStep > 0 && sampleStep <= 2)) throw new Error('Sample step must be greater than 0 and at most 2.');

  const fuzzified = crisp.map((value, index) => fuzzify(value, scenario.inputs[index].sets, membershipMethod));
  const rules = getRuleRows(scenario).map((rule) => {
    const firstDegree = fuzzified[0][rule.first];
    const secondDegree = fuzzified[1][rule.second];
    const firingStrength = andOperator === 'min'
      ? Math.min(firstDegree, secondDegree)
      : firstDegree * secondDegree;
    return { ...rule, firstDegree, secondDegree, firingStrength };
  });

  const output = scenario.output;
  const samples = [];
  const count = Math.round((output.max - output.min) / sampleStep);
  for (let i = 0; i <= count; i += 1) {
    const x = output.min + i * sampleStep;
    const byRule = rules.map((rule) => Math.min(
      rule.firingStrength,
      membership(x, output.sets[rule.output], 'triangular')
    ));
    samples.push({ x, membership: byRule.length ? Math.max(0, ...byRule) : 0 });
  }

  const area = samples.reduce((sum, point) => sum + point.membership, 0) * sampleStep;
  const weightedSum = samples.reduce((sum, point) => sum + point.x * point.membership, 0) * sampleStep;
  const maxMembership = samples.reduce((maximum, point) => Math.max(maximum, point.membership), 0);
  const maxPoints = samples.filter((point) => Math.abs(point.membership - maxMembership) < 1e-9);
  const crispOutput = maxMembership <= 1e-12
    ? null
    : defuzzMethod === 'centroid'
      ? (area > 0 ? weightedSum / area : null)
      : maxPoints.reduce((sum, point) => sum + point.x, 0) / maxPoints.length;

  return {
    scenarioId, crispInputs: [...crisp], fuzzified, rules, samples,
    crispOutput, area, weightedSum, maxMembership,
    activeRules: rules.filter((rule) => rule.firingStrength > 0),
    membershipMethod, andOperator, defuzzMethod, sampleStep
  };
}

export function buildControlSurface({ scenarioId = 'fan', membershipMethod = 'triangular', andOperator = 'min', defuzzMethod = 'centroid', gridSize = 13 } = {}) {
  const scenario = scenarios[scenarioId];
  const [first, second] = scenario.inputs;
  const cells = [];
  for (let row = 0; row < gridSize; row += 1) {
    const y = second.max - (row / (gridSize - 1)) * (second.max - second.min);
    for (let column = 0; column < gridSize; column += 1) {
      const x = first.min + (column / (gridSize - 1)) * (first.max - first.min);
      const result = evaluateController({ scenarioId, inputs: [x, y], membershipMethod, andOperator, defuzzMethod, sampleStep: 1 });
      cells.push({ x, y, output: result.crispOutput });
    }
  }
  return cells;
}

export function runHandCheck() {
  // This is a deliberately preloaded one-rule state, not random initialization.
  const result = evaluateController({
    scenarioId: 'fan', inputs: [20, 50], membershipMethod: 'triangular',
    andOperator: 'min', defuzzMethod: 'centroid', sampleStep: 0.25
  });
  const expected = {
    temperatureMemberships: { Low: 0, Medium: 1, High: 0 },
    humidityMemberships: { Low: 0, Medium: 1, High: 0 },
    activeRuleCount: 1,
    activeRule: 'IF temperature is Medium AND humidity is Medium THEN fan speed is Medium',
    outputCentroid: 50
  };
  const close = (a, b, tolerance = 1e-8) => Math.abs(a - b) <= tolerance;
  const checks = [
    close(result.fuzzified[0].Low, expected.temperatureMemberships.Low),
    close(result.fuzzified[0].Medium, expected.temperatureMemberships.Medium),
    close(result.fuzzified[0].High, expected.temperatureMemberships.High),
    close(result.fuzzified[1].Low, expected.humidityMemberships.Low),
    close(result.fuzzified[1].Medium, expected.humidityMemberships.Medium),
    close(result.fuzzified[1].High, expected.humidityMemberships.High),
    result.activeRules.length === expected.activeRuleCount,
    result.activeRules[0]?.first === 'Medium' && result.activeRules[0]?.second === 'Medium' && result.activeRules[0]?.output === 'Medium',
    result.crispOutput !== null && close(result.crispOutput, expected.outputCentroid)
  ];
  return { pass: checks.every(Boolean), checks, expected, actual: result, tolerance: 1e-8 };
}
