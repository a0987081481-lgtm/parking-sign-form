(function () {
  const root = typeof globalThis !== 'undefined' ? globalThis : window;
  const ConfigLoader = root.ConfigLoader || {};
  const MaintenanceSync = root.MaintenanceSync || {};
  const AdminConfigForm = root.AdminConfigForm || {};

  const normalizePublicConfig =
    typeof ConfigLoader.normalizePublicConfig === 'function'
      ? ConfigLoader.normalizePublicConfig
      : (input) => {
          const source = input && typeof input === 'object' ? input : {};
          return {
            version: Number.isFinite(Number(source.version)) ? Number(source.version) : 1,
            title: String(source.title ?? '').trim(),
            basicFields: Array.isArray(source.basicFields) ? source.basicFields : [],
            deviceTypes: source.deviceTypes && typeof source.deviceTypes === 'object' ? source.deviceTypes : {},
          };
        };

  const FALLBACK_SETTINGS = {
    apiBaseUrl: '',
    owner: '',
    repo: '',
    branch: 'main',
    path: 'config.json',
    token: '',
    rememberToken: false,
  };

  const normalizeMaintenanceSettings =
    typeof MaintenanceSync.normalizeMaintenanceSettings === 'function'
      ? MaintenanceSync.normalizeMaintenanceSettings
      : (input) => {
          const source = input && typeof input === 'object' ? input : {};
          return {
            apiBaseUrl: String(source.apiBaseUrl ?? '').trim(),
            owner: String(source.owner ?? '').trim(),
            repo: String(source.repo ?? '').trim(),
            branch: String(source.branch ?? '').trim() || FALLBACK_SETTINGS.branch,
            path: String(source.path ?? '').trim() || FALLBACK_SETTINGS.path,
            token: String(source.token ?? '').trim(),
            rememberToken: Boolean(source.rememberToken),
          };
        };

  const isWorkerMode =
    typeof MaintenanceSync.isWorkerMode === 'function'
      ? MaintenanceSync.isWorkerMode
      : (settings) => Boolean(String(settings && settings.apiBaseUrl ? settings.apiBaseUrl : '').trim());

  const buildWorkerConfigUrl =
    typeof MaintenanceSync.buildWorkerConfigUrl === 'function'
      ? MaintenanceSync.buildWorkerConfigUrl
      : (apiBaseUrl) => `${String(apiBaseUrl ?? '').trim().replace(/\/+$/, '')}/config`;

  const fetchCurrentContents =
    typeof MaintenanceSync.fetchCurrentContents === 'function'
      ? MaintenanceSync.fetchCurrentContents
      : async () => {
          throw new Error('MaintenanceSync helper is not available.');
        };

  const saveContentsToBackend =
    typeof MaintenanceSync.saveContentsToBackend === 'function'
      ? MaintenanceSync.saveContentsToBackend
      : async () => {
          throw new Error('MaintenanceSync helper is not available.');
        };

  const createFormState =
    typeof AdminConfigForm.createFormState === 'function'
      ? AdminConfigForm.createFormState
      : (config, fallback) => {
          const source = normalizePublicConfig(config);
          const base = normalizePublicConfig(fallback);
          const mergedBasicFields = [...base.basicFields, ...source.basicFields];
          const mergedDeviceTypes = { ...base.deviceTypes, ...source.deviceTypes };
          return {
            version: source.version || base.version || 1,
            title: source.title || base.title,
            basicFields: mergedBasicFields,
            deviceTypes: mergedDeviceTypes,
          };
        };

  const buildPublicConfig =
    typeof AdminConfigForm.buildPublicConfig === 'function'
      ? AdminConfigForm.buildPublicConfig
      : (state) => state;

  const validateFormState =
    typeof AdminConfigForm.validateFormState === 'function'
      ? AdminConfigForm.validateFormState
      : () => ({ ok: true, errors: [] });

  const createBlankBasicField =
    typeof AdminConfigForm.createBlankBasicField === 'function'
      ? AdminConfigForm.createBlankBasicField
      : () => ({
          id: `basic-${Date.now().toString(36)}`,
          key: '',
          label: '',
          type: 'text',
          required: false,
          locked: false,
        });

  const createBlankDeviceType =
    typeof AdminConfigForm.createBlankDeviceType === 'function'
      ? AdminConfigForm.createBlankDeviceType
      : () => ({
          id: `device-${Date.now().toString(36)}`,
          key: '',
          label: '',
          items: [
            {
              id: `item-${Date.now().toString(36)}`,
              label: '',
            },
          ],
        });

  const createBlankDeviceItem =
    typeof AdminConfigForm.createBlankDeviceItem === 'function'
      ? AdminConfigForm.createBlankDeviceItem
      : () => ({
          id: `item-${Date.now().toString(36)}`,
          label: '',
        });

  const CORE_FIELD_KEYS = Array.isArray(AdminConfigForm.CORE_FIELD_KEYS)
    ? AdminConfigForm.CORE_FIELD_KEYS
    : ['projectName', 'siteCode'];
  const CORE_FIELD_SET = new Set(CORE_FIELD_KEYS);

  const BASIC_FIELD_TYPES = [
    { value: 'text', label: '文字' },
    { value: 'date', label: '日期' },
  ];

  const FALLBACK_CONFIG = normalizePublicConfig(root.FORM_CONFIG || {
    version: 1,
    title: '',
    basicFields: [],
    deviceTypes: {},
  });

  const SETTINGS_KEY = 'parking-sign-admin-settings-v1';
  const DEFAULT_SETTINGS = normalizeMaintenanceSettings(root.MAINTENANCE_SETTINGS || FALLBACK_SETTINGS);

  let elements = {};
  let state = {
    settings: { ...DEFAULT_SETTINGS },
    formState: createFormState(FALLBACK_CONFIG, FALLBACK_CONFIG),
    loadedConfig: createFormState(FALLBACK_CONFIG, FALLBACK_CONFIG),
    loadedSha: '',
  };

  function trimText(value) {
    return String(value ?? '').trim();
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function cloneState(value) {
    if (typeof structuredClone === 'function') {
      return structuredClone(value);
    }

    return JSON.parse(JSON.stringify(value));
  }

  function cacheElements() {
    elements = {
      apiBaseUrl: document.getElementById('api-base-url'),
      backendModePill: document.getElementById('backend-mode-pill'),
      backendHint: document.getElementById('backend-hint'),
      owner: document.getElementById('repo-owner'),
      repo: document.getElementById('repo-name'),
      branch: document.getElementById('repo-branch'),
      path: document.getElementById('config-path'),
      token: document.getElementById('github-token'),
      rememberToken: document.getElementById('remember-token'),
      loadButton: document.getElementById('load-button'),
      saveButton: document.getElementById('save-button'),
      resetButton: document.getElementById('reset-button'),
      addBasicFieldButton: document.getElementById('add-basic-field'),
      addDeviceTypeButton: document.getElementById('add-device-type'),
      configTitle: document.getElementById('config-title'),
      coreBasicFields: document.getElementById('core-basic-fields'),
      basicFieldsList: document.getElementById('basic-fields-list'),
      deviceTypesList: document.getElementById('device-types-list'),
      status: document.getElementById('admin-status'),
    };
  }

  function updateStatus(message, tone = 'info') {
    if (!elements.status) {
      return;
    }

    elements.status.textContent = message;
    elements.status.dataset.tone = tone;
  }

  function updateBackendSummary(settings = state.settings || DEFAULT_SETTINGS) {
    const normalized = normalizeMaintenanceSettings(settings);
    const workerMode = isWorkerMode(normalized);

    if (elements.backendModePill) {
      elements.backendModePill.textContent = workerMode ? 'Worker 模式' : 'GitHub 直連';
      elements.backendModePill.classList.toggle('field-pill--locked', !workerMode);
    }

    if (elements.backendHint) {
      elements.backendHint.textContent = workerMode
        ? `會透過 ${buildWorkerConfigUrl(normalized.apiBaseUrl)} 同步到所有人的公版頁面。`
        : '目前還沒填 Worker API 網址，會退回直接連 GitHub；直連儲存需要 GitHub Token。';
    }
  }

  function loadSettings() {
    try {
      const raw = root.localStorage && root.localStorage.getItem(SETTINGS_KEY);
      if (!raw) {
        return { ...DEFAULT_SETTINGS };
      }

      const parsed = JSON.parse(raw);
      return normalizeMaintenanceSettings({
        ...DEFAULT_SETTINGS,
        apiBaseUrl: trimText(parsed.apiBaseUrl) || DEFAULT_SETTINGS.apiBaseUrl,
        owner: trimText(parsed.owner) || DEFAULT_SETTINGS.owner,
        repo: trimText(parsed.repo) || DEFAULT_SETTINGS.repo,
        branch: trimText(parsed.branch) || DEFAULT_SETTINGS.branch,
        path: trimText(parsed.path) || DEFAULT_SETTINGS.path,
        rememberToken: Boolean(parsed.rememberToken),
        token: Boolean(parsed.rememberToken) ? trimText(parsed.token) : '',
      });
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettingsToStorage() {
    const payload = normalizeMaintenanceSettings({
      apiBaseUrl: trimText(elements.apiBaseUrl.value),
      owner: trimText(elements.owner.value),
      repo: trimText(elements.repo.value),
      branch: trimText(elements.branch.value) || DEFAULT_SETTINGS.branch,
      path: trimText(elements.path.value) || DEFAULT_SETTINGS.path,
      rememberToken: Boolean(elements.rememberToken.checked),
      token: Boolean(elements.rememberToken.checked) ? trimText(elements.token.value) : '',
    });

    try {
      root.localStorage && root.localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload));
    } catch {
      // 本機儲存失敗時不阻擋表單操作。
    }

    state.settings = payload;
    updateBackendSummary(payload);
    return payload;
  }

  function applySettingsToForm(settings) {
    elements.apiBaseUrl.value = settings.apiBaseUrl || '';
    elements.owner.value = settings.owner;
    elements.repo.value = settings.repo;
    elements.branch.value = settings.branch;
    elements.path.value = settings.path;
    elements.token.value = settings.token;
    elements.rememberToken.checked = settings.rememberToken;
    updateBackendSummary(settings);
  }

  function getSettingsFromForm() {
    return {
      apiBaseUrl: trimText(elements.apiBaseUrl.value),
      owner: trimText(elements.owner.value),
      repo: trimText(elements.repo.value),
      branch: trimText(elements.branch.value) || DEFAULT_SETTINGS.branch,
      path: trimText(elements.path.value) || DEFAULT_SETTINGS.path,
      token: trimText(elements.token.value),
      rememberToken: Boolean(elements.rememberToken.checked),
    };
  }

  function getBasicFieldTypeLabel(value) {
    const found = BASIC_FIELD_TYPES.find((item) => item.value === value);
    return found ? found.label : value;
  }

  function createFieldBlock(labelText, controlElement, helpText) {
    const field = document.createElement('div');
    field.className = 'field';

    const label = document.createElement('label');
    label.textContent = labelText;
    field.appendChild(label);
    field.appendChild(controlElement);

    if (helpText) {
      const help = document.createElement('p');
      help.className = 'field-help';
      help.textContent = helpText;
      field.appendChild(help);
    }

    return field;
  }

  function applyDataset(element, dataset = {}) {
    Object.entries(dataset).forEach(([key, value]) => {
      element.dataset[key] = value;
    });
    return element;
  }

  function createTextInput(value, dataset = {}, placeholder, disabled = false) {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value || '';
    if (placeholder) {
      input.placeholder = placeholder;
    }
    if (disabled) {
      input.disabled = true;
    }
    return applyDataset(input, dataset);
  }

  function createCheckboxControl(checked, dataset = {}, disabled = false) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = Boolean(checked);
    if (disabled) {
      input.disabled = true;
    }
    return applyDataset(input, dataset);
  }

  function createSelectControl(value, dataset = {}, disabled = false) {
    const select = document.createElement('select');
    const knownValues = new Set(BASIC_FIELD_TYPES.map((option) => option.value));
    for (const option of BASIC_FIELD_TYPES) {
      const opt = document.createElement('option');
      opt.value = option.value;
      opt.textContent = option.label;
      if (option.value === value) {
        opt.selected = true;
      }
      select.appendChild(opt);
    }
    if (value && !knownValues.has(value)) {
      const custom = document.createElement('option');
      custom.value = value;
      custom.textContent = `${value}（目前值）`;
      custom.selected = true;
      select.appendChild(custom);
    }
    if (disabled) {
      select.disabled = true;
    }
    return applyDataset(select, dataset);
  }

  function createActionButton(labelText, action, className, dataset = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = labelText;
    button.className = className;
    button.dataset.action = action;
    Object.entries(dataset).forEach(([key, value]) => {
      button.dataset[key] = value;
    });
    return button;
  }

  function createEmptyState(message) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = message;
    return empty;
  }

  function getBasicFieldById(fieldId) {
    return state.formState.basicFields.find((field) => field.id === fieldId) || null;
  }

  function getDeviceTypeById(typeId) {
    return state.formState.deviceTypes.find((type) => type.id === typeId) || null;
  }

  function getDeviceItemById(typeRow, itemId) {
    return typeRow.items.find((item) => item.id === itemId) || null;
  }

  function renderTitleField() {
    if (!elements.configTitle) {
      return;
    }

    elements.configTitle.value = state.formState.title || '';
  }

  function renderBasicFieldRow(field) {
    const row = document.createElement('article');
    row.className = `field-row${field.locked ? ' field-row--locked' : ''}`;
    row.dataset.basicFieldId = field.id;

    const keyControl = createTextInput(field.key, { basicFieldProp: 'key' }, '例如 testerName', field.locked);
    const keyField = createFieldBlock('欄位代號', keyControl);

    const labelControl = createTextInput(field.label, { basicFieldProp: 'label' }, '例如 測試人員', field.locked);
    const labelField = createFieldBlock('顯示名稱', labelControl);

    const typeControl = createSelectControl(field.type || 'text', { basicFieldProp: 'type' }, field.locked);
    const typeField = createFieldBlock('型態', typeControl);

    const requiredWrap = document.createElement('label');
    requiredWrap.className = 'checkbox-inline field-inline';
    const requiredControl = createCheckboxControl(field.required, { basicFieldProp: 'required' }, field.locked);
    requiredWrap.appendChild(requiredControl);
    requiredWrap.appendChild(document.createTextNode('必填'));

    const meta = document.createElement('div');
    meta.className = 'field-row__meta';

    const pill = document.createElement('span');
    pill.className = 'field-pill';
    pill.textContent = field.locked ? (CORE_FIELD_SET.has(field.key) ? '核心欄位' : '鎖定欄位') : getBasicFieldTypeLabel(field.type || 'text');
    meta.appendChild(pill);

    if (!field.locked) {
      meta.appendChild(createActionButton('刪除', 'remove-basic-field', 'danger small', { basicFieldId: field.id }));
    }

    row.appendChild(keyField);
    row.appendChild(labelField);
    row.appendChild(typeField);
    row.appendChild(requiredWrap);
    row.appendChild(meta);
    return row;
  }

  function renderBasicFieldSections() {
    const lockedFields = state.formState.basicFields.filter((field) => field.locked || CORE_FIELD_SET.has(field.key));
    const editableFields = state.formState.basicFields.filter((field) => !(field.locked || CORE_FIELD_SET.has(field.key)));

    if (elements.coreBasicFields) {
      elements.coreBasicFields.innerHTML = '';
      if (!lockedFields.length) {
        elements.coreBasicFields.appendChild(createEmptyState('目前沒有鎖定欄位。'));
      } else {
        lockedFields.forEach((field) => {
          elements.coreBasicFields.appendChild(renderBasicFieldRow(field));
        });
      }
    }

    if (elements.basicFieldsList) {
      elements.basicFieldsList.innerHTML = '';
      if (!editableFields.length) {
        elements.basicFieldsList.appendChild(createEmptyState('目前還沒有可編輯欄位，按「新增欄位」就能開始。'));
      } else {
        editableFields.forEach((field) => {
          elements.basicFieldsList.appendChild(renderBasicFieldRow(field));
        });
      }
    }
  }

  function renderDeviceItemRow(typeId, item) {
    const row = document.createElement('div');
    row.className = 'device-item-row';
    row.dataset.deviceItemId = item.id;
    row.dataset.deviceTypeId = typeId;

    const labelControl = createTextInput(item.label, { deviceItemProp: 'label' }, '例如 車牌辨識');
    const labelField = createFieldBlock('項目文字', labelControl);
    labelField.classList.add('device-item-row__field');

    const actions = document.createElement('div');
    actions.className = 'field-row__meta';
    actions.appendChild(createActionButton('刪除', 'remove-device-item', 'danger small', {
      deviceTypeId: typeId,
      deviceItemId: item.id,
    }));

    row.appendChild(labelField);
    row.appendChild(actions);
    return row;
  }

  function renderDeviceTypeCard(typeRow) {
    const card = document.createElement('article');
    card.className = 'device-type-card';
    card.dataset.deviceTypeId = typeRow.id;

    const head = document.createElement('div');
    head.className = 'device-type-card__head';

    const keyControl = createTextInput(typeRow.key, { deviceTypeProp: 'key' }, '例如 entrance');
    const keyField = createFieldBlock('類型代號', keyControl);

    const labelControl = createTextInput(typeRow.label, { deviceTypeProp: 'label' }, '例如 入口設備');
    const labelField = createFieldBlock('顯示名稱', labelControl);

    head.appendChild(keyField);
    head.appendChild(labelField);
    head.appendChild(createActionButton('刪除此類型', 'remove-device-type', 'danger small', {
      deviceTypeId: typeRow.id,
    }));

    const items = document.createElement('div');
    items.className = 'device-item-list';

    if (!typeRow.items.length) {
      items.appendChild(createEmptyState('目前沒有項目，按「新增項目」補上。'));
    } else {
      typeRow.items.forEach((item) => {
        items.appendChild(renderDeviceItemRow(typeRow.id, item));
      });
    }

    const actions = document.createElement('div');
    actions.className = 'inline-actions device-type-actions';
    actions.appendChild(createActionButton('新增項目', 'add-device-item', 'secondary small', {
      deviceTypeId: typeRow.id,
    }));

    card.appendChild(head);
    card.appendChild(items);
    card.appendChild(actions);
    return card;
  }

  function renderDeviceTypes() {
    if (!elements.deviceTypesList) {
      return;
    }

    elements.deviceTypesList.innerHTML = '';

    if (!state.formState.deviceTypes.length) {
      elements.deviceTypesList.appendChild(createEmptyState('目前沒有設備類型，按「新增類型」開始。'));
      return;
    }

    state.formState.deviceTypes.forEach((typeRow) => {
      elements.deviceTypesList.appendChild(renderDeviceTypeCard(typeRow));
    });
  }

  function renderAll() {
    renderTitleField();
    renderBasicFieldSections();
    renderDeviceTypes();
  }

  function updateBasicField(fieldId, prop, rawValue) {
    state.formState.basicFields = state.formState.basicFields.map((field) => {
      if (field.id !== fieldId) {
        return field;
      }

      if (field.locked) {
        return field;
      }

      const next = { ...field };
      if (prop === 'required') {
        next.required = Boolean(rawValue);
        return next;
      }

      next[prop] = rawValue;
      return next;
    });
  }

  function updateDeviceType(typeId, prop, rawValue) {
    state.formState.deviceTypes = state.formState.deviceTypes.map((typeRow) => {
      if (typeRow.id !== typeId) {
        return typeRow;
      }

      return {
        ...typeRow,
        [prop]: rawValue,
      };
    });
  }

  function updateDeviceItem(typeId, itemId, rawValue) {
    state.formState.deviceTypes = state.formState.deviceTypes.map((typeRow) => {
      if (typeRow.id !== typeId) {
        return typeRow;
      }

      return {
        ...typeRow,
        items: typeRow.items.map((item) => {
          if (item.id !== itemId) {
            return item;
          }

          return {
            ...item,
            label: rawValue,
          };
        }),
      };
    });
  }

  function removeBasicField(fieldId) {
    state.formState.basicFields = state.formState.basicFields.filter((field) => field.locked || field.id !== fieldId);
  }

  function addBasicField() {
    state.formState.basicFields = [...state.formState.basicFields, createBlankBasicField()];
  }

  function removeDeviceType(typeId) {
    state.formState.deviceTypes = state.formState.deviceTypes.filter((typeRow) => typeRow.id !== typeId);
  }

  function addDeviceType() {
    state.formState.deviceTypes = [...state.formState.deviceTypes, createBlankDeviceType()];
  }

  function addDeviceItem(typeId) {
    state.formState.deviceTypes = state.formState.deviceTypes.map((typeRow) => {
      if (typeRow.id !== typeId) {
        return typeRow;
      }

      return {
        ...typeRow,
        items: [...typeRow.items, createBlankDeviceItem()],
      };
    });
  }

  function removeDeviceItem(typeId, itemId) {
    state.formState.deviceTypes = state.formState.deviceTypes.map((typeRow) => {
      if (typeRow.id !== typeId) {
        return typeRow;
      }

      return {
        ...typeRow,
        items: typeRow.items.filter((item) => item.id !== itemId),
      };
    });
  }

  function handleFormInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (['api-base-url', 'repo-owner', 'repo-name', 'repo-branch', 'config-path', 'github-token', 'remember-token'].includes(target.id)) {
      saveSettingsToStorage();
      return;
    }

    if (target.id === 'config-title') {
      state.formState.title = target.value;
      return;
    }

    const basicFieldId = target.dataset.basicFieldId || target.closest('[data-basic-field-id]')?.dataset.basicFieldId;
    const basicFieldProp = target.dataset.basicFieldProp;
    if (basicFieldId && basicFieldProp) {
      const value = target.type === 'checkbox' ? target.checked : target.value;
      updateBasicField(basicFieldId, basicFieldProp, value);
      return;
    }

    const deviceTypeId = target.dataset.deviceTypeId || target.closest('[data-device-type-id]')?.dataset.deviceTypeId;
    const deviceTypeProp = target.dataset.deviceTypeProp;
    if (deviceTypeId && deviceTypeProp) {
      updateDeviceType(deviceTypeId, deviceTypeProp, target.value);
      return;
    }

    const deviceItemId = target.dataset.deviceItemId || target.closest('[data-device-item-id]')?.dataset.deviceItemId;
    const deviceItemProp = target.dataset.deviceItemProp;
    if (deviceTypeId && deviceItemId && deviceItemProp) {
      updateDeviceItem(deviceTypeId, deviceItemId, target.value);
    }
  }

  function handleFormChange(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (target.id === 'config-title') {
      state.formState.title = target.value;
      return;
    }

    if (['api-base-url', 'repo-owner', 'repo-name', 'repo-branch', 'config-path', 'github-token', 'remember-token'].includes(target.id)) {
      saveSettingsToStorage();
    }
  }

  function handleClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) {
      return;
    }

    const action = button.dataset.action;
    if (action === 'load-from-github') {
      void loadFromGitHub();
      return;
    }

    if (action === 'save-to-github') {
      void saveToGitHub();
      return;
    }

    if (action === 'reset-loaded-version') {
      resetToLoaded();
      return;
    }

    if (action === 'add-basic-field') {
      addBasicField();
      renderAll();
      return;
    }

    if (action === 'remove-basic-field') {
      const fieldId = button.dataset.basicFieldId;
      removeBasicField(fieldId);
      renderAll();
      return;
    }

    if (action === 'add-device-type') {
      addDeviceType();
      renderAll();
      return;
    }

    if (action === 'remove-device-type') {
      const typeId = button.dataset.deviceTypeId;
      removeDeviceType(typeId);
      renderAll();
      return;
    }

    if (action === 'add-device-item') {
      const typeId = button.dataset.deviceTypeId;
      addDeviceItem(typeId);
      renderAll();
      return;
    }

    if (action === 'remove-device-item') {
      const typeId = button.dataset.deviceTypeId;
      const itemId = button.dataset.deviceItemId;
      removeDeviceItem(typeId, itemId);
      renderAll();
    }
  }

  function resetToLoaded() {
    state.formState = cloneState(state.loadedConfig);
    renderAll();
    updateStatus('已還原成已載入版本。', 'info');
  }

  async function loadFromGitHub(showStatus = true) {
    const settings = saveSettingsToStorage();
    if (!settings.apiBaseUrl && (!settings.owner || !settings.repo || !settings.path)) {
      updateStatus('請先填入 Worker API 網址，或打開進階設定補齊 GitHub 連線資訊。', 'warn');
      return null;
    }

    if (showStatus) {
      updateStatus(
        isWorkerMode(settings) ? '正在從 Worker 讀取目前的公版設定...' : '正在從 GitHub 讀取目前的公版設定...',
        'info',
      );
    }

    try {
      const result = await fetchCurrentContents(settings);
      state.loadedSha = result.sha || '';
      state.loadedConfig = createFormState(result.config, FALLBACK_CONFIG);
      state.formState = cloneState(state.loadedConfig);
      renderAll();
      updateStatus(
        `已載入${isWorkerMode(settings) ? ' Worker' : ' GitHub'} 版本，sha：${state.loadedSha || '無'}`,
        'success',
      );
      return result;
    } catch (error) {
      if (error && error.status === 404) {
        updateStatus('找不到 config.json，儲存時會直接建立新檔。', 'warn');
        return null;
      }

      updateStatus(`載入失敗：${error.message}`, 'error');
      return null;
    }
  }

  async function saveToGitHub() {
    const settings = saveSettingsToStorage();
    if (!settings.apiBaseUrl && (!settings.owner || !settings.repo || !settings.path)) {
      updateStatus('請先填入 Worker API 網址，或打開進階設定補齊 GitHub 連線資訊。', 'warn');
      return;
    }

    const validation = validateFormState(state.formState);
    if (!validation.ok) {
      updateStatus(`請先修正以下問題：${validation.errors.join(' ')}`, 'error');
      return;
    }

    if (!isWorkerMode(settings) && !settings.token) {
      updateStatus('直連 GitHub 儲存需要 Token；建議改用 Worker API。', 'warn');
      return;
    }

    const config = buildPublicConfig(state.formState);
    updateStatus(
      isWorkerMode(settings) ? '正在透過 Worker 同步到雲端...' : '正在檢查雲端版本並儲存...',
      'info',
    );

    let currentSha = '';
    try {
      const current = await fetchCurrentContents(settings);
      currentSha = current.sha || '';
    } catch (error) {
      if (!error || error.status !== 404) {
        updateStatus(`無法確認目前雲端版本：${error.message}`, 'error');
        return;
      }
    }

    try {
      const result = await saveContentsToBackend({
        ...settings,
        sha: currentSha,
        message: `feat: update ${settings.path}`,
        config,
      });

      state.loadedConfig = createFormState(config, FALLBACK_CONFIG);
      state.formState = cloneState(state.loadedConfig);
      state.loadedSha = result && result.content && result.content.sha ? result.content.sha : currentSha;
      renderAll();
      updateStatus(isWorkerMode(settings) ? '已同步到所有人的公版頁面。' : '已儲存到雲端。', 'success');
    } catch (error) {
      updateStatus(`儲存失敗：${error.message}`, 'error');
    }
  }
  function bindEvents() {
    elements.loadButton.addEventListener('click', () => {
      void loadFromGitHub();
    });

    elements.saveButton.addEventListener('click', () => {
      void saveToGitHub();
    });

    elements.resetButton.addEventListener('click', resetToLoaded);

    elements.addBasicFieldButton.addEventListener('click', () => {
      addBasicField();
      renderAll();
    });

    elements.addDeviceTypeButton.addEventListener('click', () => {
      addDeviceType();
      renderAll();
    });

    document.addEventListener('input', handleFormInput);
    document.addEventListener('change', handleFormChange);
    document.addEventListener('click', handleClick);
  }

  async function init() {
    cacheElements();
    state.settings = loadSettings();
    applySettingsToForm(state.settings);
    bindEvents();
    renderAll();
    updateBackendSummary(state.settings);

    if (state.settings.owner && state.settings.repo && state.settings.path) {
      await loadFromGitHub(false);
    } else {
      updateStatus('請先填入 Worker API 網址，或在進階設定補齊 GitHub 連線資訊。', 'info');
    }
  }

  const AdminPage = {
    init,
  };

  root.AdminPage = AdminPage;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      void init();
    }
  }
})();

