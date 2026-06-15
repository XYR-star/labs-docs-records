const state = {
  experiments: [],
  entries: [],
  templates: [],
  locations: [],
  inventory: [],
  selectedExperimentId: '',
  selectedLocationId: null,
  selectedSlot: null,
  editingLocationId: null,
  recording: { enabled: false, started_at: null },
  recordingEvents: []
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: options.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    ...options
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Request failed: ${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

function showShell() {
  $('[data-view="login"]').classList.add('hidden');
  $('[data-view="shell"]').classList.remove('hidden');
}

function renderList(target, items, render) {
  const node = $(target);
  node.innerHTML = items.length
    ? items.map(render).join('')
    : '<div class="list-item"><p>暂无数据</p></div>';
}

function tagsHtml(tags = []) {
  return `<div class="pill-row">${tags.map((tag) => `<span class="pill">${tag}</span>`).join('')}</div>`;
}

function optionHtml(value, label, selectedValue) {
  const selected = String(value || '') === String(selectedValue || '') ? ' selected' : '';
  return `<option value="${escapeHtml(value || '')}"${selected}>${escapeHtml(label)}</option>`;
}

function defaultChildForSlot(parentLocation, slotCode) {
  if (!parentLocation || !slotCode) return null;
  if (parentLocation.kind === 'freezer') {
    return {
      name: `抽屉 ${slotCode}`,
      kind: 'drawer',
      layout_type: 'grid',
      rows: 5,
      columns: 5,
      position_code: slotCode
    };
  }
  if (parentLocation.kind === 'drawer' || parentLocation.kind === 'rack') {
    return {
      name: `盒子 ${slotCode}`,
      kind: 'box',
      layout_type: 'grid',
      rows: 9,
      columns: 9,
      position_code: slotCode
    };
  }
  return null;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function loadDashboard() {
  const data = await api('/api/dashboard');
  $('#metric-experiments').textContent = data.experiments;
  $('#metric-entries').textContent = data.entries;
  $('#metric-events').textContent = data.events;
  $('#metric-inventory').textContent = data.inventory;
  renderList('#low-stock-list', data.low_stock, (item) => `
    <article class="list-item">
      <div><h3>${item.name}</h3><p>${item.quantity} ${item.unit || ''}</p></div>
      <span class="pill">${item.status}</span>
    </article>
  `);
}

async function loadTemplates() {
  state.templates = await api('/api/experiment-templates');
  const select = $('#entry-template');
  select.innerHTML = state.templates
    .map((template) => optionHtml(template.key, template.label, select.value || 'blank'))
    .join('');
  renderTemplateFields();
}

async function loadExperiments(q = '') {
  state.experiments = await api(`/api/experiments${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  const selectedValue = state.selectedExperimentId || $('#entry-experiment')?.value || '';
  $('#entry-experiment').innerHTML = '<option value="">不关联实验</option>' +
    state.experiments.map((experiment) => optionHtml(experiment.id, experiment.title, selectedValue)).join('');
  renderExperiments();
}

function renderExperiments() {
  renderList('#experiments-list', state.experiments, (experiment) => {
    const active = experiment.id === state.selectedExperimentId ? ' active' : '';
    const lastEntry = experiment.last_entry_at ? ` · 最近 ${new Date(experiment.last_entry_at).toLocaleDateString()}` : '';
    return `
      <button class="experiment-card${active}" data-experiment-id="${experiment.id}">
        <strong>${escapeHtml(experiment.title)}</strong>
        <span>${escapeHtml(experiment.status)} · ${experiment.entry_count || 0} 条记录${lastEntry}</span>
        ${experiment.objective ? `<small>${escapeHtml(experiment.objective.slice(0, 120))}</small>` : ''}
        <em>${active ? '正在记录' : '进入记录'}</em>
      </button>
    `;
  });

  $$('.experiment-card').forEach((button) => {
    button.addEventListener('click', async () => {
      state.selectedExperimentId = button.dataset.experimentId;
      $('#entry-experiment').value = state.selectedExperimentId;
      renderExperiments();
      await loadEntries($('#entry-search').value);
    });
  });
}

async function loadRecording() {
  state.recording = await api('/api/recording');
  state.recordingEvents = state.recording.enabled ? await api('/api/recording/events') : [];
  renderRecording();
}

function renderRecording() {
  const button = $('#recording-button');
  const status = $('#recording-status');
  const summary = $('#recording-summary');

  if (state.recording.enabled) {
    const startedAt = new Date(state.recording.started_at).toLocaleString();
    button.textContent = '记录中';
    button.disabled = true;
    button.classList.add('active');
    status.textContent = `开始于 ${startedAt}`;
    summary.textContent = `${state.recordingEvents.length} 条最近记录`;
  } else {
    button.textContent = '开始记录';
    button.disabled = false;
    button.classList.remove('active');
    status.textContent = '未开始记录';
    summary.textContent = '点击开始记录后启用';
  }

  renderList('#recording-events-list', state.recordingEvents, (event) => `
    <article class="list-item">
      <div>
        <h3>${escapeHtml(event.summary || event.action)}</h3>
        <p>${escapeHtml(event.action)} · ${new Date(event.created_at).toLocaleString()}</p>
      </div>
      <span class="pill">${escapeHtml(event.entity_type)}</span>
    </article>
  `);
}

async function loadEntries(q = '') {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (state.selectedExperimentId) params.set('experiment_id', state.selectedExperimentId);
  state.entries = await api(`/api/entries${params.toString() ? `?${params}` : ''}`);
  renderList('#entries-list', state.entries, (entry) => `
    <article class="list-item">
      <h3>${entry.title}</h3>
      <p>${entry.experiment_title || '未关联实验'} · ${new Date(entry.occurred_at).toLocaleString()} · ${entry.status}</p>
      ${entry.template_key && entry.template_key !== 'blank' ? `<p>${templateLabel(entry.template_key)} · ${templateDataSummary(entry.template_data)}</p>` : ''}
      ${linkedInventoryHtml(entry.linked_inventory)}
      <p>${entry.body.slice(0, 220)}</p>
      ${tagsHtml(entry.tags)}
    </article>
  `);
  const select = $('#attachment-entry');
  select.innerHTML = '<option value="">不关联记录</option>' +
    state.entries.map((entry) => `<option value="${entry.id}">${entry.title}</option>`).join('');
  $$('.linked-inventory-chip').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!button.dataset.locationId) return;
      document.querySelector('[data-tab="locations"]').click();
      await selectLocation(button.dataset.locationId);
    });
  });
}

function linkedInventoryHtml(items = []) {
  if (!items.length) return '';
  return `
    <div class="linked-inventory">
      ${items.map((item) => `
        <button class="linked-inventory-chip" data-location-id="${escapeHtml(item.location_id || '')}" type="button">
          ${escapeHtml(item.name)}
          <span>${escapeHtml(item.location_name || '未指定位置')}${item.slot_code ? ` / ${escapeHtml(item.slot_code)}` : ''}</span>
        </button>
      `).join('')}
    </div>
  `;
}

function templateLabel(key) {
  return state.templates.find((template) => template.key === key)?.label || key;
}

function templateDataSummary(data = {}) {
  const values = Object.entries(data || {})
    .filter(([, value]) => value)
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${value}`);
  return values.length ? values.map(escapeHtml).join(' · ') : '参数待补';
}

function renderTemplateFields() {
  const template = state.templates.find((item) => item.key === $('#entry-template').value);
  const fields = template?.fields || [];
  $('#template-fields').innerHTML = fields.length
    ? `
      <div class="template-heading">
        <strong>${escapeHtml(template.label)} 参数</strong>
        <span>${escapeHtml(template.description || '')}</span>
      </div>
      <div class="template-grid">
        ${fields.map((field) => `
          <label>${escapeHtml(field.label)}
            <input name="template_data.${escapeHtml(field.name)}" placeholder="${escapeHtml(field.placeholder || '')}" />
          </label>
        `).join('')}
      </div>
    `
    : '<p class="muted-text">空白模板：直接填写正文即可。</p>';
}

async function loadEvents() {
  const events = await api('/api/events');
  renderList('#events-list', events, (event) => `
    <article class="list-item">
      <h3>${event.title}</h3>
      <p>${event.kind} · ${new Date(event.occurred_at).toLocaleString()}</p>
      <p>${event.body}</p>
    </article>
  `);
}

async function loadLocations() {
  state.locations = await api('/api/locations');
  const options = '<option value="">顶层位置</option>' +
    state.locations.map((location) => `<option value="${location.id}">${location.name}</option>`).join('');
  $('#location-parent').innerHTML = options;
  $('#inventory-location').innerHTML = '<option value="">未指定</option>' +
    state.locations.map((location) => `<option value="${location.id}">${location.name}</option>`).join('');
  $('#location-count').textContent = `${state.locations.length} 个位置`;
  renderLocationTree();
  if (!state.selectedLocationId && state.locations.length) {
    const firstBox = state.locations.find((location) => location.layout_type === 'grid') || state.locations[0];
    await selectLocation(firstBox.id);
  } else if (state.selectedLocationId) {
    await selectLocation(state.selectedLocationId);
  }
}

async function loadInventory(q = '') {
  state.inventory = await api(`/api/inventory${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  renderEntryInventoryOptions();
  renderList('#inventory-list', state.inventory, (item) => `
    <article class="list-item">
      <h3>${item.name}</h3>
      <p>${item.type} · ${item.identifier || '无编号'} · ${item.quantity} ${item.unit || ''}</p>
      <p>${item.location_name || '未指定位置'}${item.slot_code ? ` / ${item.slot_code}` : ''} · ${item.status}${item.stored_on ? ` · 存放 ${new Date(item.stored_on).toLocaleDateString()}` : ''}</p>
      ${tagsHtml(item.tags)}
    </article>
  `);
}

function renderEntryInventoryOptions() {
  const select = $('#entry-inventory-links');
  if (!select) return;
  select.innerHTML = state.inventory.length
    ? state.inventory.map((item) => {
      const label = `${item.name} · ${item.location_name || '未指定位置'}${item.slot_code ? ` / ${item.slot_code}` : ''}`;
      return optionHtml(item.id, label, '');
    }).join('')
    : '<option value="" disabled>暂无库存可链接</option>';
}

function locationDepth(location, byId) {
  let depth = 0;
  let current = location;
  const seen = new Set();
  while (current?.parent_id && byId.has(current.parent_id) && !seen.has(current.parent_id)) {
    seen.add(current.parent_id);
    depth += 1;
    current = byId.get(current.parent_id);
  }
  return depth;
}

function renderLocationTree() {
  const byId = new Map(state.locations.map((location) => [location.id, location]));
  const sorted = [...state.locations].sort((a, b) => {
    const depthA = locationDepth(a, byId);
    const depthB = locationDepth(b, byId);
    return depthA - depthB || a.name.localeCompare(b.name);
  });

  $('#locations-list').innerHTML = sorted.map((location) => {
    const depth = locationDepth(location, byId);
    const icon = location.layout_type === 'grid' ? '▦' : location.kind === 'freezer' ? '▤' : '□';
    const active = location.id === state.selectedLocationId ? ' active' : '';
    return `
      <button class="tree-node${active}" data-location-id="${location.id}" style="--depth:${depth}">
        <span>${icon}</span>
        <strong>${escapeHtml(location.name)}</strong>
        <small>${escapeHtml(location.kind)}${location.position_code ? ` · ${escapeHtml(location.position_code)}` : ''}${location.layout_type === 'grid' ? ` · ${location.rows}x${location.columns}` : ''}</small>
      </button>
    `;
  }).join('') || '<p class="muted-text">暂无位置</p>';

  $$('.tree-node').forEach((button) => {
    button.addEventListener('click', () => selectLocation(button.dataset.locationId));
  });
}

async function selectLocation(locationId) {
  state.selectedLocationId = locationId;
  state.selectedSlot = null;
  renderLocationTree();
  const location = state.locations.find((item) => item.id === locationId);
  if (!location) return;

  $('#selected-location-name').textContent = location.name;
  $('#selected-location-meta').textContent = `${location.kind}${location.layout_type === 'grid' ? ` · ${location.rows} x ${location.columns}` : ''}`;
  $('#slot-detail').innerHTML = '<p class="muted-text">点击一个孔位查看样本和历史。</p>';
  fillLocationForm(location);

  if (location.layout_type !== 'grid') {
    const children = state.locations.filter((item) => item.parent_id === location.id);
    $('#storage-grid').className = 'storage-grid-empty';
    $('#storage-grid').innerHTML = children.length
      ? children.map((child) => `<button class="child-location" data-location-id="${child.id}">${escapeHtml(child.name)}<span>${escapeHtml(child.kind)}</span></button>`).join('')
      : '这个位置下还没有子位置。';
    $$('.child-location').forEach((button) => {
      button.addEventListener('click', () => selectLocation(button.dataset.locationId));
    });
    return;
  }

  const view = await api(`/api/locations/${location.id}/view`);
  renderStorageGrid(view);
}

function renderStorageGrid(view) {
  const grid = $('#storage-grid');
  if (view.location?.kind === 'drawer') {
    renderDrawerGrid(view);
    return;
  }

  grid.className = 'box-grid';
  grid.style.setProperty('--columns', view.columns);
  grid.innerHTML = view.slots.map((slot) => `
    <button class="slot-cell ${slot.state}" data-slot-code="${slot.code}">
      <span class="slot-code">${slot.code}</span>
      <strong>${slot.child ? escapeHtml(slot.child.name) : slot.item ? escapeHtml(slot.item.name) : ''}</strong>
      <small>${slot.child ? escapeHtml(slot.child.kind) : slot.item ? `${slot.item.quantity} ${slot.item.unit || ''}` : '空'}</small>
    </button>
  `).join('');

  $$('.slot-cell').forEach((button) => {
    button.addEventListener('click', () => {
      const slot = view.slots.find((item) => item.code === button.dataset.slotCode);
      showSlotDetail(slot);
    });
  });
}

function renderDrawerGrid(view) {
  const grid = $('#storage-grid');
  grid.className = 'drawer-depth';
  const rows = Array.from({ length: view.rows }, (_, index) => {
    const row = index + 1;
    const rowSlots = view.slots.filter((slot) => slot.row === row);
    return `
      <section class="drawer-shelf-row">
        <div class="drawer-row-label">${rowSlots[0]?.rowLabel || row}</div>
        <div class="drawer-row-track" style="--columns:${view.columns}">
          ${rowSlots.map((slot) => `
            <button class="drawer-box-spine ${slot.state}" data-slot-code="${slot.code}">
              <span class="slot-code">${slot.code}</span>
              <strong>${slot.child ? escapeHtml(slot.child.name) : ''}</strong>
              <small>${slot.child ? escapeHtml(slot.child.kind) : '空'}</small>
            </button>
          `).join('')}
        </div>
      </section>
    `;
  });

  grid.innerHTML = rows.join('');
  $$('.drawer-box-spine').forEach((button) => {
    button.addEventListener('click', () => {
      const slot = view.slots.find((item) => item.code === button.dataset.slotCode);
      showSlotDetail(slot);
    });
  });
}

async function showSlotDetail(slot) {
  state.selectedSlot = slot;
  const parentLocation = state.locations.find((item) => item.id === state.selectedLocationId);
  if (slot.child) {
    $('#slot-detail').innerHTML = `
      <div class="slot-record">
        <span class="slot-badge">${slot.code}</span>
        <h4>${escapeHtml(slot.child.name)}</h4>
        <p>${escapeHtml(slot.child.kind)} · 子位置</p>
        <button id="open-child-button" class="ghost">打开这个位置</button>
      </div>
    `;
    $('#open-child-button').addEventListener('click', () => selectLocation(slot.child.id));
    return;
  }

  if (!slot.item) {
    const childDefault = defaultChildForSlot(parentLocation, slot.code);
    if (childDefault) {
      $('#slot-detail').innerHTML = `
        <div class="empty-slot">
          <span class="slot-badge">${slot.code}</span>
          <h4>空位置</h4>
          <p>在「${escapeHtml(parentLocation.name)}」的 ${slot.code} 创建 ${childDefault.kind === 'drawer' ? '抽屉' : '盒子'}。</p>
          <form id="quick-child-form" class="mini-form">
            <label>名称<input name="name" value="${escapeHtml(childDefault.name)}" required /></label>
            <label>类型
              <select name="kind">
                <option value="drawer" ${childDefault.kind === 'drawer' ? 'selected' : ''}>抽屉</option>
                <option value="rack" ${childDefault.kind === 'rack' ? 'selected' : ''}>层架</option>
                <option value="box" ${childDefault.kind === 'box' ? 'selected' : ''}>存放盒</option>
              </select>
            </label>
            <div class="form-row compact-row">
              <label>行<input name="rows" type="number" value="${childDefault.rows}" min="1" max="26" /></label>
              <label>列<input name="columns" type="number" value="${childDefault.columns}" min="1" max="48" /></label>
            </div>
            <input name="layout_type" type="hidden" value="${childDefault.layout_type}" />
            <input name="position_code" type="hidden" value="${slot.code}" />
            <input name="parent_id" type="hidden" value="${state.selectedLocationId}" />
            <button type="submit" class="ghost">创建并进入</button>
          </form>
        </div>
      `;
      $('#quick-child-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const created = await api('/api/locations', {
          method: 'POST',
          body: JSON.stringify(formJson(event.currentTarget))
        });
        await loadLocations();
        await loadRecording();
        await selectLocation(created.id);
      });
      return;
    }

    $('#slot-detail').innerHTML = `
      <div class="empty-slot">
        <span class="slot-badge">${slot.code}</span>
        <h4>空孔位</h4>
        <p>在当前盒子 ${slot.code} 直接录入细胞、样本或管子。</p>
        <button id="use-slot-button" class="ghost">悬浮填入</button>
      </div>
    `;
    $('#use-slot-button').addEventListener('click', () => {
      openSlotInventoryDialog(slot);
    });
    openSlotInventoryDialog(slot);
    return;
  }

  const movements = await api(`/api/inventory/${slot.item.id}/movements`);
  $('#slot-detail').innerHTML = `
    <div class="slot-record">
      <span class="slot-badge">${slot.code}</span>
      <h4>${escapeHtml(slot.item.name)}</h4>
      <p>${escapeHtml(slot.item.type)} · ${escapeHtml(slot.item.identifier || '无编号')}</p>
      <p>${slot.item.quantity} ${escapeHtml(slot.item.unit || '')} · ${escapeHtml(slot.item.status)}${slot.item.stored_on ? ` · 存放 ${new Date(slot.item.stored_on).toLocaleDateString()}` : ''}</p>
    </div>
    <div class="movement-list">
      <form id="slot-adjust-form" class="mini-form">
        <label>数量变化<input name="delta" type="number" step="0.01" placeholder="-1 或 1" required /></label>
        <label>备注<input name="note" placeholder="取出、补充、盘点修正" /></label>
        <button type="submit" class="ghost">记录变化</button>
      </form>
      <form id="slot-move-form" class="mini-form">
        <label>移动到位置
          <select name="location_id">
            ${state.locations.map((location) => optionHtml(location.id, location.name, slot.item.location_id)).join('')}
          </select>
        </label>
        <label>新孔位<input name="slot_code" value="${escapeHtml(slot.item.slot_code || '')}" /></label>
        <button type="submit" class="ghost">移动/修改位置</button>
      </form>
      ${movements.map((movement) => `
        <article>
          <strong>${escapeHtml(movement.action)}</strong>
          <p>${new Date(movement.created_at).toLocaleString()}</p>
          <p>${escapeHtml(movement.from_location_name || '')}${movement.from_slot_code ? ` / ${movement.from_slot_code}` : ''} → ${escapeHtml(movement.to_location_name || '')}${movement.to_slot_code ? ` / ${movement.to_slot_code}` : ''}</p>
          ${movement.note ? `<p>${escapeHtml(movement.note)}</p>` : ''}
        </article>
      `).join('') || '<p class="muted-text">暂无历史</p>'}
    </div>
  `;

  $('#slot-adjust-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    await api(`/api/inventory/${slot.item.id}/adjust`, {
      method: 'POST',
      body: JSON.stringify(formJson(event.currentTarget))
    });
    await Promise.all([loadDashboard(), loadRecording(), loadInventory(), selectLocation(state.selectedLocationId)]);
  });

  $('#slot-move-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    await api(`/api/inventory/${slot.item.id}/move`, {
      method: 'POST',
      body: JSON.stringify(formJson(event.currentTarget))
    });
    await Promise.all([loadRecording(), loadInventory(), selectLocation(state.selectedLocationId)]);
  });
}

async function refreshAll() {
  await Promise.all([loadTemplates(), loadExperiments()]);
  await Promise.all([
    loadDashboard(),
    loadRecording(),
    loadEntries(),
    loadEvents(),
    loadLocations(),
    loadInventory()
  ]);
}

function formJson(form) {
  const formData = new FormData(form);
  const data = Object.fromEntries(formData);
  if (formData.has('inventory_ids')) {
    data.inventory_ids = formData.getAll('inventory_ids').filter(Boolean);
  }
  const templateData = {};
  Object.entries(data).forEach(([key, value]) => {
    if (!key.startsWith('template_data.')) return;
    const fieldName = key.slice('template_data.'.length);
    templateData[fieldName] = value;
    delete data[key];
  });
  if (Object.keys(templateData).length) data.template_data = templateData;
  if (data.tags) data.tags = data.tags.split(',').map((tag) => tag.trim()).filter(Boolean);
  return data;
}

function fillLocationForm(location) {
  const form = $('#location-form');
  state.editingLocationId = location.id;
  form.name.value = location.name || '';
  form.parent_id.value = location.parent_id || '';
  form.kind.value = location.kind || 'location';
  form.layout_type.value = location.layout_type || 'none';
  form.rows.value = location.rows || 0;
  form.columns.value = location.columns || 0;
  form.position_code.value = location.position_code || '';
  form.notes.value = location.notes || '';
  $('#location-submit').textContent = '保存位置';
}

function resetLocationForm() {
  state.editingLocationId = null;
  $('#location-form').reset();
  $('#location-layout').value = 'none';
  $('#location-submit').textContent = '添加位置';
}

function openSlotInventoryDialog(slot) {
  const location = state.locations.find((item) => item.id === state.selectedLocationId);
  const form = $('#slot-inventory-form');
  form.reset();
  form.location_id.value = state.selectedLocationId;
  form.slot_code.value = slot.code;
  form.unit.value = 'tube';
  $('#slot-inventory-context').textContent = `${location?.name || '当前盒子'} / ${slot.code}`;
  $('#slot-inventory-dialog').showModal();
  form.name.focus();
}

function bindForms() {
  $('#location-kind').addEventListener('change', (event) => {
    if (event.target.value === 'box' || event.target.value === 'freezer' || event.target.value === 'rack' || event.target.value === 'drawer') {
      $('#location-layout').value = 'grid';
      document.querySelector('#location-form [name="rows"]').value = event.target.value === 'box' ? 9 : event.target.value === 'drawer' ? 5 : 4;
      document.querySelector('#location-form [name="columns"]').value = event.target.value === 'box' ? 9 : event.target.value === 'drawer' ? 5 : 6;
    }
  });

  $('#login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api('/api/login', {
        method: 'POST',
        body: JSON.stringify(formJson(event.currentTarget))
      });
      showShell();
      await refreshAll();
    } catch (error) {
      $('#login-message').textContent = error.message;
    }
  });

  $('#slot-inventory-close').addEventListener('click', () => $('#slot-inventory-dialog').close());
  $('#slot-inventory-cancel').addEventListener('click', () => $('#slot-inventory-dialog').close());
  $('#slot-inventory-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    await api('/api/inventory', {
      method: 'POST',
      body: JSON.stringify(formJson(event.currentTarget))
    });
    $('#slot-inventory-dialog').close();
    await Promise.all([loadDashboard(), loadRecording(), loadInventory(), selectLocation(state.selectedLocationId)]);
  });

  $('#experiment-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const created = await api('/api/experiments', { method: 'POST', body: JSON.stringify(formJson(event.currentTarget)) });
    event.currentTarget.reset();
    state.selectedExperimentId = created.id;
    await Promise.all([loadDashboard(), loadRecording(), loadExperiments()]);
    $('#entry-experiment').value = created.id;
    await loadEntries();
  });

  $('#entry-template').addEventListener('change', renderTemplateFields);
  $('#entry-experiment').addEventListener('change', async (event) => {
    state.selectedExperimentId = event.target.value;
    renderExperiments();
    await loadEntries($('#entry-search').value);
  });

  $('#entry-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = formJson(event.currentTarget);
    state.selectedExperimentId = data.experiment_id || state.selectedExperimentId;
    await api('/api/entries', { method: 'POST', body: JSON.stringify(data) });
    event.currentTarget.reset();
    $('#entry-experiment').value = state.selectedExperimentId || '';
    $('#entry-template').value = 'blank';
    renderTemplateFields();
    await Promise.all([loadDashboard(), loadRecording(), loadExperiments(), loadEntries()]);
  });

  $('#event-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    await api('/api/events', { method: 'POST', body: JSON.stringify(formJson(event.currentTarget)) });
    event.currentTarget.reset();
    await Promise.all([loadDashboard(), loadRecording(), loadEvents()]);
  });

  $('#location-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = formJson(event.currentTarget);
    if (state.editingLocationId) {
      await api(`/api/locations/${state.editingLocationId}`, { method: 'PUT', body: JSON.stringify(data) });
    } else {
      await api('/api/locations', { method: 'POST', body: JSON.stringify(data) });
    }
    resetLocationForm();
    await Promise.all([loadRecording(), loadLocations(), loadInventory()]);
  });

  $('#location-reset').addEventListener('click', resetLocationForm);

  $('#location-delete').addEventListener('click', async () => {
    if (!state.selectedLocationId) return;
    const location = state.locations.find((item) => item.id === state.selectedLocationId);
    if (!confirm(`删除位置「${location?.name || ''}」？必须先清空其中的子位置和库存。`)) return;
    await api(`/api/locations/${state.selectedLocationId}`, { method: 'DELETE' });
    state.selectedLocationId = null;
    resetLocationForm();
    await Promise.all([loadRecording(), loadLocations(), loadInventory()]);
  });

  $('#inventory-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    await api('/api/inventory', { method: 'POST', body: JSON.stringify(formJson(event.currentTarget)) });
    event.currentTarget.reset();
    await Promise.all([loadDashboard(), loadRecording(), loadInventory()]);
  });

  $('#attachment-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    await api('/api/attachments', { method: 'POST', body: new FormData(event.currentTarget) });
    event.currentTarget.reset();
    $('#files-message').textContent = '附件已上传到数据盘。';
  });

  $('#external-link-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    await api('/api/external-links', { method: 'POST', body: JSON.stringify(formJson(event.currentTarget)) });
    event.currentTarget.reset();
    $('#files-message').textContent = '外部云盘链接已保存。';
  });
}

function bindNavigation() {
  $$('.nav-button').forEach((button) => {
    button.addEventListener('click', () => {
      $$('.nav-button').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      const tab = button.dataset.tab;
      $('#page-title').textContent = button.textContent;
      $$('.tab-panel').forEach((panel) => {
        panel.classList.toggle('hidden', panel.dataset.panel !== tab);
      });
    });
  });

  $('#experiment-search-button').addEventListener('click', () => loadExperiments($('#experiment-search').value));
  $('#entry-search-button').addEventListener('click', () => loadEntries($('#entry-search').value));
  $('#inventory-search-button').addEventListener('click', () => loadInventory($('#inventory-search').value));
  $('#recording-button').addEventListener('click', async () => {
    if (state.recording.enabled) return;
    if (!confirm('开始正式记录后，后续保存、编辑、存入、取用和删除位置都会写入操作流水。现在开始吗？')) return;
    state.recording = await api('/api/recording/start', { method: 'POST', body: '{}' });
    await loadRecording();
  });
  $('#export-button').addEventListener('click', async () => {
    const result = await api('/api/export/manifest', { method: 'POST', body: '{}' });
    alert(`已导出：${result.filename}`);
  });
  $('#logout-button').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST', body: '{}' });
    location.reload();
  });
}

bindForms();
bindNavigation();

api('/api/dashboard')
  .then(async () => {
    showShell();
    await refreshAll();
  })
  .catch(() => {});

if ('serviceWorker' in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    location.reload();
  });

  navigator.serviceWorker
    .register('/service-worker.js')
    .then((registration) => registration.update())
    .catch(() => {});
}
