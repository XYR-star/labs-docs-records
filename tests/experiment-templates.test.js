import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getExperimentTemplates,
  normalizeTemplateData
} from '../src/experiment-templates.js';

test('provides common molecular biology experiment templates', () => {
  const templates = getExperimentTemplates();
  const keys = templates.map((template) => template.key);

  assert.deepEqual(keys, ['blank', 'pcr', 'homologous_recombination', 'cell_passage', 'mrna_transfection']);
  assert.ok(templates.find((template) => template.key === 'pcr').fields.some((field) => field.name === 'annealing_temp'));
});

test('normalizes submitted template data to declared fields only', () => {
  const normalized = normalizeTemplateData('pcr', {
    template_amount: '2 ul',
    annealing_temp: '60 C',
    unexpected: 'drop me'
  });

  assert.deepEqual(normalized, {
    template_amount: '2 ul',
    annealing_temp: '60 C'
  });
});
