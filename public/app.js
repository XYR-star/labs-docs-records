const state = {
  entries: [],
  locations: [],
  inventory: []
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

async function loadDashboard() {
  const data = await api('/api/dashboard');
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

async function loadEntries(q = '') {
  state.entries = await api(`/api/entries${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  renderList('#entries-list', state.entries, (entry) => `
    <article class="list-item">
      <h3>${entry.title}</h3>
      <p>${new Date(entry.occurred_at).toLocaleString()} · ${entry.status}</p>
      <p>${entry.body.slice(0, 220)}</p>
      ${tagsHtml(entry.tags)}
    </article>
  `);
  const select = $('#attachment-entry');
  select.innerHTML = '<option value="">不关联记录</option>' +
    state.entries.map((entry) => `<option value="${entry.id}">${entry.title}</option>`).join('');
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
  renderList('#locations-list', state.locations, (location) => `
    <article class="list-item">
      <h3>${location.name}</h3>
      <p>${location.kind}${location.position_code ? ` · ${location.position_code}` : ''}</p>
      <p>${location.notes}</p>
    </article>
  `);
}

async function loadInventory(q = '') {
  state.inventory = await api(`/api/inventory${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  renderList('#inventory-list', state.inventory, (item) => `
    <article class="list-item">
      <h3>${item.name}</h3>
      <p>${item.type} · ${item.identifier || '无编号'} · ${item.quantity} ${item.unit || ''}</p>
      <p>${item.location_name || '未指定位置'} · ${item.status}</p>
      ${tagsHtml(item.tags)}
    </article>
  `);
}

async function refreshAll() {
  await Promise.all([
    loadDashboard(),
    loadEntries(),
    loadEvents(),
    loadLocations(),
    loadInventory()
  ]);
}

function formJson(form) {
  const data = Object.fromEntries(new FormData(form));
  if (data.tags) data.tags = data.tags.split(',').map((tag) => tag.trim()).filter(Boolean);
  return data;
}

function bindForms() {
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

  $('#entry-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    await api('/api/entries', { method: 'POST', body: JSON.stringify(formJson(event.currentTarget)) });
    event.currentTarget.reset();
    await Promise.all([loadDashboard(), loadEntries()]);
  });

  $('#event-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    await api('/api/events', { method: 'POST', body: JSON.stringify(formJson(event.currentTarget)) });
    event.currentTarget.reset();
    await Promise.all([loadDashboard(), loadEvents()]);
  });

  $('#location-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    await api('/api/locations', { method: 'POST', body: JSON.stringify(formJson(event.currentTarget)) });
    event.currentTarget.reset();
    await Promise.all([loadLocations(), loadInventory()]);
  });

  $('#inventory-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    await api('/api/inventory', { method: 'POST', body: JSON.stringify(formJson(event.currentTarget)) });
    event.currentTarget.reset();
    await Promise.all([loadDashboard(), loadInventory()]);
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

  $('#entry-search-button').addEventListener('click', () => loadEntries($('#entry-search').value));
  $('#inventory-search-button').addEventListener('click', () => loadInventory($('#inventory-search').value));
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
  navigator.serviceWorker.register('/service-worker.js').catch(() => {});
}
