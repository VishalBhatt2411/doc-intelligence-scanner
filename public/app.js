(function () {
  const LS = { baseUrl: 'dis_apiBaseUrl', apiKey: 'dis_apiKey', provider: 'dis_aiProvider' };

  function getSettings() {
    return {
      baseUrl: localStorage.getItem(LS.baseUrl) || window.location.origin,
      apiKey: localStorage.getItem(LS.apiKey) || '',
      provider: localStorage.getItem(LS.provider) || ''
    };
  }

  function saveSettings(s) {
    localStorage.setItem(LS.baseUrl, s.baseUrl);
    localStorage.setItem(LS.apiKey, s.apiKey);
    localStorage.setItem(LS.provider, s.provider);
  }

  async function apiFetch(path, options) {
    const { baseUrl, apiKey } = getSettings();
    const res = await fetch(`${baseUrl}${path}`, {
      ...(options || {}),
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        ...((options && options.headers) || {})
      }
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error((body && body.error) || `Request failed (HTTP ${res.status})`);
    }
    return body;
  }

  // ---- Settings dialog ------------------------------------------------------

  const settingsDialog = document.getElementById('settingsDialog');
  document.getElementById('settingsBtn').addEventListener('click', () => {
    const s = getSettings();
    document.getElementById('apiBaseUrl').value = s.baseUrl;
    document.getElementById('apiKey').value = s.apiKey;
    document.getElementById('aiProviderOverride').value = s.provider;
    settingsDialog.showModal();
  });
  document.getElementById('settingsForm').addEventListener('submit', (e) => {
    if (e.submitter && e.submitter.value === 'save') {
      saveSettings({
        baseUrl: document.getElementById('apiBaseUrl').value.trim() || window.location.origin,
        apiKey: document.getElementById('apiKey').value.trim(),
        provider: document.getElementById('aiProviderOverride').value
      });
    }
  });

  // ---- Dynamic CRM connector registry ----------------------------------------
  // The set of connectable CRMs (Salesforce, HubSpot, ...) and the
  // credential fields each one needs come from the server's registry, not
  // from hardcoded markup - see src/connectors/registry.js. Fetched once and
  // cached; a failure here just means no destination tabs render at all,
  // since CRM connectors are the only destinations offered in this UI.

  let connectorRegistryPromise = null;
  function getConnectorRegistry() {
    if (!connectorRegistryPromise) {
      connectorRegistryPromise = apiFetch('/v1/connectors')
        .then((r) => r.connectors || [])
        .catch((err) => {
          connectorRegistryPromise = null;
          throw err;
        });
    }
    return connectorRegistryPromise;
  }

  // ---- File intake -----------------------------------------------------------

  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const fileListEl = document.getElementById('fileList');
  const cardTemplate = document.getElementById('fileCardTemplate');
  const documentTypeSelect = document.getElementById('documentType');

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') fileInput.click();
  });
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
  });
  fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
    e.target.value = '';
  });

  function handleFiles(fileList) {
    Array.from(fileList).forEach((file) => processFile(file));
  }

  function readAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function guessMimeType(name) {
    const ext = name.toLowerCase().split('.').pop();
    const map = {
      pdf: 'application/pdf',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };
    return map[ext] || 'application/octet-stream';
  }

  let nextId = 0;

  async function processFile(file) {
    const id = `f${nextId++}`;
    const node = cardTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.id = id;
    node.querySelector('.file-name').textContent = file.name;
    fileListEl.prepend(node);

    const state = { fileName: file.name, documentType: '', fields: [] };

    const errorBox = node.querySelector('.error-box');
    const progressBox = node.querySelector('.progress-box');
    const progressText = node.querySelector('.progress-text');
    const resultsBox = node.querySelector('.results-box');
    const statusBadge = node.querySelector('.status-badge');

    function setStatus(text, variant) {
      statusBadge.textContent = text;
      statusBadge.className = `badge status-badge${variant ? ` ${variant}` : ''}`;
    }
    function showError(message) {
      errorBox.hidden = false;
      errorBox.textContent = message;
      progressBox.hidden = true;
      setStatus('Failed', 'error');
    }

    node.querySelector('.remove-btn').addEventListener('click', () => node.remove());

    try {
      progressBox.hidden = false;
      progressText.textContent = 'Reading file…';
      setStatus('Reading…');
      const base64Data = await readAsBase64(file);

      progressText.textContent = 'Extracting with AI…';
      setStatus('Extracting…');
      const documentType = documentTypeSelect.value;
      const { provider } = getSettings();

      const result = await apiFetch('/v1/extract', {
        method: 'POST',
        body: JSON.stringify({
          base64Data,
          mimeType: file.type && file.type !== '' ? file.type : guessMimeType(file.name),
          documentType,
          ...(provider ? { provider } : {})
        })
      });

      if (result.errorMessage) {
        showError(result.errorMessage);
        return;
      }

      progressBox.hidden = true;
      resultsBox.hidden = false;
      setStatus('Extracted', 'success');

      state.documentType = result.documentType || documentType;
      state.fields = (result.fields || []).map((f, idx) => ({
        rowKey: `${id}-${idx}`,
        fieldName: f.fieldName,
        value: f.fieldValue,
        mapTo: f.fieldName,
        confidence: f.confidence
      }));

      node.querySelector('.detected-type').textContent = `Detected type: ${state.documentType || 'Unknown'}`;
      renderFields(node, state);
      wireDestinationTabs(node);
      attachCrmConnectorTabs(node, state);
    } catch (err) {
      showError(err.message || String(err));
    }
  }

  function fieldValuesFromState(state) {
    const out = {};
    state.fields.forEach((row) => {
      const key = (row.mapTo || row.fieldName || '').trim();
      if (key && row.value !== '' && row.value != null) out[key] = row.value;
    });
    return out;
  }

  function renderFields(node, state) {
    const tbody = node.querySelector('.fields-table tbody');
    tbody.innerHTML = '';
    const datalist = node.querySelector('.crm-fields-datalist');
    const datalistId = `crm-fields-${node.dataset.id}`;
    datalist.id = datalistId;

    state.fields.forEach((row) => {
      const tr = document.createElement('tr');

      const nameTd = document.createElement('td');
      nameTd.textContent = row.fieldName;

      const valueTd = document.createElement('td');
      const valueInput = document.createElement('input');
      valueInput.type = 'text';
      valueInput.value = row.value || '';
      valueInput.addEventListener('input', () => {
        row.value = valueInput.value;
      });
      valueTd.appendChild(valueInput);

      const mapTd = document.createElement('td');
      const mapInput = document.createElement('input');
      mapInput.type = 'text';
      mapInput.value = row.mapTo || '';
      mapInput.setAttribute('list', datalistId);
      mapInput.addEventListener('input', () => {
        row.mapTo = mapInput.value;
      });
      mapTd.appendChild(mapInput);

      tr.append(nameTd, valueTd, mapTd);
      tbody.appendChild(tr);
    });
  }

  // ---- Destination tabs -------------------------------------------------------

  function wireDestinationTabs(node) {
    // Delegated (not bound per-button) so CRM tabs appended later by
    // attachCrmConnectorTabs() work without being re-wired.
    const tabsContainer = node.querySelector('.destination-tabs');
    tabsContainer.addEventListener('click', (e) => {
      const tab = e.target.closest('.tab-btn');
      if (!tab || !tabsContainer.contains(tab)) return;
      tabsContainer.querySelectorAll('.tab-btn').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      node.querySelectorAll('.dest-panel').forEach((p) => {
        p.hidden = p.dataset.dest !== tab.dataset.dest;
      });
    });
  }

  function showResult(node, message, ok) {
    const el = node.querySelector('.submit-result');
    el.textContent = message;
    el.className = `submit-result ${ok ? 'success' : 'error'}`;
  }

  // ---- Destination: any registered CRM (Salesforce, HubSpot, ...) -------------
  // One generic implementation drives every connector in the registry - the
  // tab, the credential inputs, and the object/field-mapping flow are all
  // built from connector metadata instead of being hand-written per vendor.

  function credentialsFromPanel(panel) {
    const out = {};
    panel.querySelectorAll('.crm-cred-input').forEach((input) => {
      out[input.dataset.field] = input.value.trim();
    });
    return out;
  }

  function buildCrmTabAndPanel(node, connectorMeta) {
    const tabsContainer = node.querySelector('.destination-tabs');
    const anchor = node.querySelector('.submit-result');

    const tabBtn = document.createElement('button');
    tabBtn.type = 'button';
    tabBtn.className = 'tab-btn';
    tabBtn.dataset.dest = connectorMeta.id;
    tabBtn.textContent = connectorMeta.label;
    tabsContainer.appendChild(tabBtn);

    const panel = document.createElement('div');
    panel.className = 'dest-panel';
    panel.dataset.dest = connectorMeta.id;
    panel.hidden = true;

    (connectorMeta.credentialFields || []).forEach((f) => {
      const label = document.createElement('label');
      label.textContent = f.label;
      const input = document.createElement('input');
      input.type = f.secret ? 'password' : 'text';
      input.className = 'crm-cred-input';
      input.dataset.field = f.name;
      if (f.placeholder) input.placeholder = f.placeholder;
      label.appendChild(input);
      panel.appendChild(label);
    });

    const loadBtn = document.createElement('button');
    loadBtn.type = 'button';
    loadBtn.className = 'btn btn-ghost crm-load-objects-btn';
    loadBtn.textContent = 'Load objects';
    panel.appendChild(loadBtn);

    const objLabel = document.createElement('label');
    objLabel.textContent = 'Object';
    const objSelect = document.createElement('select');
    objSelect.className = 'crm-object-select';
    objLabel.appendChild(objSelect);
    panel.appendChild(objLabel);

    const createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.className = 'btn btn-brand crm-create-btn';
    createBtn.textContent = 'Create Record';
    panel.appendChild(createBtn);

    anchor.before(panel);

    return { panel, loadBtn, objSelect, createBtn };
  }

  function wireCrmConnector(node, state, connectorMeta, els) {
    const { panel, loadBtn, objSelect, createBtn } = els;
    const datalist = node.querySelector('.crm-fields-datalist');

    loadBtn.addEventListener('click', async () => {
      const credentials = credentialsFromPanel(panel);
      try {
        const { objects } = await apiFetch(`/v1/connectors/${connectorMeta.id}/objects`, {
          method: 'POST',
          body: JSON.stringify({ credentials })
        });
        objSelect.innerHTML = '<option value="">Select an object…</option>';
        objects.forEach((o) => {
          const opt = document.createElement('option');
          opt.value = o.value;
          opt.textContent = `${o.label} (${o.value})`;
          objSelect.appendChild(opt);
        });
        showResult(node, `Loaded ${objects.length} object(s) from ${connectorMeta.label}.`, true);
      } catch (err) {
        showResult(node, err.message || String(err), false);
      }
    });

    objSelect.addEventListener('change', async () => {
      const objectApiName = objSelect.value;
      if (!objectApiName) return;
      const credentials = credentialsFromPanel(panel);
      try {
        const { fields } = await apiFetch(`/v1/connectors/${connectorMeta.id}/fields`, {
          method: 'POST',
          body: JSON.stringify({ credentials, objectApiName })
        });
        datalist.innerHTML = '';
        fields.forEach((f) => {
          const opt = document.createElement('option');
          opt.value = f.value;
          opt.label = `${f.label}${f.required ? ' *required' : ''}`;
          datalist.appendChild(opt);
        });
        showResult(node, `Loaded ${fields.length} field(s) for ${objectApiName}. Fill "Map to" per row above.`, true);
      } catch (err) {
        showResult(node, err.message || String(err), false);
      }
    });

    createBtn.addEventListener('click', async () => {
      const objectApiName = objSelect.value;
      if (!objectApiName) {
        showResult(node, 'Load objects and pick one first.', false);
        return;
      }
      const credentials = credentialsFromPanel(panel);
      try {
        const result = await apiFetch(`/v1/connectors/${connectorMeta.id}/create`, {
          method: 'POST',
          body: JSON.stringify({ credentials, objectApiName, fieldValues: fieldValuesFromState(state) })
        });
        showResult(node, `Created ${connectorMeta.label} ${objectApiName} record ${result.id}.`, true);
      } catch (err) {
        showResult(node, err.message || String(err), false);
      }
    });
  }

  function attachCrmConnectorTabs(node, state) {
    getConnectorRegistry()
      .then((connectors) => {
        connectors.forEach((connectorMeta, idx) => {
          const els = buildCrmTabAndPanel(node, connectorMeta);
          wireCrmConnector(node, state, connectorMeta, els);
          // No static tab (Download/Webhook were removed) is active by
          // default, so make the first registered CRM's tab/panel visible
          // as soon as it's built instead of leaving the card blank.
          if (idx === 0) {
            els.panel.hidden = false;
            const tabsContainer = node.querySelector('.destination-tabs');
            tabsContainer.querySelector(`.tab-btn[data-dest="${connectorMeta.id}"]`).classList.add('active');
          }
        });
      })
      .catch((err) => {
        console.warn('Could not load CRM connector registry:', err.message || err);
      });
  }
})();
