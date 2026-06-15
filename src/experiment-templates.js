const TEMPLATES = [
  {
    key: 'blank',
    label: '空白记录',
    description: '自由记录步骤、观察和结果。',
    fields: []
  },
  {
    key: 'pcr',
    label: 'PCR',
    description: '模板、引物、退火温度、循环数和体系。',
    fields: [
      { name: 'template_amount', label: '模板量', placeholder: '例如：2 ul / 50 ng' },
      { name: 'forward_primer', label: 'Forward primer', placeholder: '名称或序列' },
      { name: 'reverse_primer', label: 'Reverse primer', placeholder: '名称或序列' },
      { name: 'polymerase', label: '酶/体系', placeholder: 'Phusion / Q5 / Taq' },
      { name: 'annealing_temp', label: '退火温度', placeholder: '例如：60 C' },
      { name: 'cycles', label: '循环数', placeholder: '例如：30' },
      { name: 'product_size', label: '预期片段', placeholder: '例如：1200 bp' }
    ]
  },
  {
    key: 'homologous_recombination',
    label: '同源重组',
    description: '载体、插入片段、摩尔比、反应条件和转化。',
    fields: [
      { name: 'vector', label: '载体', placeholder: '载体名称/酶切方式' },
      { name: 'insert', label: '插入片段', placeholder: '片段名称/长度' },
      { name: 'molar_ratio', label: '摩尔比', placeholder: '例如：vector:insert = 1:3' },
      { name: 'assembly_mix', label: '重组体系', placeholder: '试剂盒/酶 mix' },
      { name: 'reaction_condition', label: '反应条件', placeholder: '例如：50 C 15 min' },
      { name: 'competent_cells', label: '感受态', placeholder: '菌株/批次' },
      { name: 'screening', label: '筛选方式', placeholder: '菌落 PCR / 测序' }
    ]
  },
  {
    key: 'cell_passage',
    label: '传细胞',
    description: '细胞状态、比例、培养基、瓶/板规格和传代后状态。',
    fields: [
      { name: 'cell_line', label: '细胞系', placeholder: '例如：293T' },
      { name: 'passage_number', label: '代次', placeholder: '例如：P12' },
      { name: 'confluency', label: '融合度', placeholder: '例如：80%' },
      { name: 'split_ratio', label: '传代比例', placeholder: '例如：1:5' },
      { name: 'medium', label: '培养基', placeholder: 'DMEM + 10% FBS' },
      { name: 'vessel', label: '培养容器', placeholder: '6-well / T25 / 10 cm' },
      { name: 'notes_after', label: '传后观察', placeholder: '贴壁、污染、形态' }
    ]
  },
  {
    key: 'mrna_transfection',
    label: '转染 mRNA',
    description: '细胞、mRNA、剂量、试剂比例和观察时间。',
    fields: [
      { name: 'cell_line', label: '细胞系', placeholder: '例如：293T / DC' },
      { name: 'cell_density', label: '细胞密度', placeholder: '例如：2e5/well' },
      { name: 'mrna_name', label: 'mRNA', placeholder: '名称/批次' },
      { name: 'mrna_amount', label: 'mRNA 用量', placeholder: '例如：1 ug' },
      { name: 'reagent', label: '转染试剂', placeholder: 'LNP / Lipofectamine' },
      { name: 'ratio', label: '比例/配方', placeholder: 'mRNA:reagent' },
      { name: 'readout_time', label: '观察时间', placeholder: '例如：24 h / 48 h' }
    ]
  }
];

export function getExperimentTemplates() {
  return TEMPLATES.map((template) => ({
    ...template,
    fields: template.fields.map((field) => ({ ...field }))
  }));
}

export function getExperimentTemplate(key) {
  return getExperimentTemplates().find((template) => template.key === key) || getExperimentTemplates()[0];
}

export function normalizeTemplateData(key, data = {}) {
  const template = getExperimentTemplate(key);
  return Object.fromEntries(
    template.fields
      .map((field) => [field.name, String(data[field.name] || '').trim()])
      .filter(([, value]) => value)
  );
}
