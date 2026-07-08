(function () {
  const root = typeof globalThis !== 'undefined' ? globalThis : window;

  const DEFAULT_CONFIG = {
    title: '停車場設備功能測試完成簽認單',
    basicFields: [
      { key: 'projectName', label: '案場名稱', type: 'text', required: true },
      { key: 'siteCode', label: '場地代號', type: 'text', required: false },
      { key: 'checkDate', label: '檢查日期', type: 'date', required: true },
      { key: 'testerName', label: '測試人員', type: 'text', required: false },
      { key: 'ownerName', label: '業主／現場代表', type: 'text', required: false },
    ],
    deviceTypes: {
      entrance: {
        label: '入口',
        items: [
          '車牌辨識',
          '臨停入場',
          '月租入場',
          '柵欄機開啟',
          '柵欄機關閉',
          '遠端開閘',
        ],
      },
      exit: {
        label: '出口',
        items: [
          '車牌辨識',
          '臨停出場',
          '月租出場',
          '已繳費放行',
          '未繳費攔阻',
          '柵欄機開啟',
          '柵欄機關閉',
          '遠端開閘',
        ],
      },
      payment: {
        label: '繳費機',
        items: [
          '入車資料查詢',
          '現金付款',
          '信用卡付款',
          '電子票證付款',
          '行動支付',
          '折扣功能',
          '發票列印',
          '對講功能',
        ],
      },
      control: {
        label: '中控',
        items: [
          '場地資料設定',
          '費率設定',
          '月租資料設定',
          '設備連線確認',
          '圖控操作',
          '報表查詢',
          '遠端連線',
        ],
      },
    },
  };

  const FORM_CONFIG_SAFE = typeof root.FORM_CONFIG !== 'undefined' ? root.FORM_CONFIG : DEFAULT_CONFIG;
  const CONFIG_LOADER = root.ConfigLoader || {};
  const normalizeConfig = typeof CONFIG_LOADER.normalizePublicConfig === 'function'
    ? CONFIG_LOADER.normalizePublicConfig
    : (input) => (input && typeof input === 'object' ? input : DEFAULT_CONFIG);
  const resolvePublicConfigStatus = typeof CONFIG_LOADER.resolvePublicConfigStatus === 'function'
    ? CONFIG_LOADER.resolvePublicConfigStatus
    : async (fallback) => ({ config: fallback, source: 'fallback', error: new Error('Config loader unavailable') });
  const STORAGE_KEY = 'parking-sign-form-state-v1';
  const PDF_SUFFIX = '功能測試完成簽認單';
  const FALLBACK_PROJECT_NAME = '未命名案場';
  const SIGNATURE_KEYS = ['tester', 'owner'];

  let activeConfig = normalizeConfig(FORM_CONFIG_SAFE);
  let state = null;
  let elements = {};
  let exportTimestampBackup = null;
  let resizeTimer = null;
  let signatureMode = false;

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function getActiveConfig() {
    return activeConfig || FORM_CONFIG_SAFE;
  }

  function setActiveConfig(nextConfig) {
    activeConfig = normalizeConfig(nextConfig);
  }

  function getDateFieldDefault(field) {
    return field.type === 'date' ? formatDateInputValue(new Date()) : '';
  }

  function formatDateInputValue(date) {
    const actual = date instanceof Date ? date : new Date(date);
    return [
      actual.getFullYear(),
      pad2(actual.getMonth() + 1),
      pad2(actual.getDate()),
    ].join('-');
  }

  function formatDateTimeValue(date) {
    const actual = date instanceof Date ? date : new Date(date);
    return [
      formatDateInputValue(actual),
      [pad2(actual.getHours()), pad2(actual.getMinutes()), pad2(actual.getSeconds())].join(':'),
    ].join(' ');
  }

  function normalizeFilenamePart(value) {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) {
      return '';
    }

    return trimmed
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
      .replace(/\s+/g, ' ')
      .replace(/_+/g, '_')
      .replace(/^[_\s]+|[_\s]+$/g, '');
  }

  function buildPdfFilename(checkDate, projectName) {
    const datePart = normalizeFilenamePart(checkDate || formatDateInputValue(new Date())) || formatDateInputValue(new Date());
    const projectPart = normalizeFilenamePart(projectName) || FALLBACK_PROJECT_NAME;
    return `${datePart}_${projectPart}_${PDF_SUFFIX}.pdf`;
  }

  function createId(prefix) {
    const random = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${Date.now().toString(36)}-${random}`;
  }

  function createBasicFieldDefaults(config = getActiveConfig()) {
    return config.basicFields.reduce((acc, field) => {
      acc[field.key] = getDateFieldDefault(field);
      return acc;
    }, {});
  }

  function createDeviceItem(label, custom = false, overrides = {}) {
    return {
      id: overrides.id || createId('item'),
      label,
      checked: Boolean(overrides.checked),
      custom: Boolean(custom || overrides.custom),
    };
  }

  function createDeviceCard(typeKey, overrides = {}) {
    const typeConfig = getActiveConfig().deviceTypes[typeKey] || {
      label: overrides.typeLabel || typeKey || '設備',
      items: [],
    };

    const defaultItems = (typeConfig.items || []).map((label) => createDeviceItem(label, false));
    const itemsSource = Array.isArray(overrides.items) && overrides.items.length ? overrides.items : defaultItems;

    return {
      id: overrides.id || createId('device'),
      typeKey,
      typeLabel: typeConfig.label || overrides.typeLabel || typeKey || '設備',
      name: overrides.name || '',
      code: overrides.code || '',
      items: itemsSource
        .map((item) => {
          if (!item || !item.label) {
            return null;
          }
          return createDeviceItem(item.label, item.custom, item);
        })
        .filter(Boolean),
    };
  }

  function createInitialState() {
    return {
      basic: createBasicFieldDefaults(),
      devices: [],
      note: '',
      signatures: {
        tester: '',
        owner: '',
      },
    };
  }

  function normalizeLoadedState(saved) {
    const initial = createInitialState();

    if (!saved || typeof saved !== 'object') {
      return initial;
    }

    const basic = { ...initial.basic };
    if (saved.basic && typeof saved.basic === 'object') {
      for (const field of getActiveConfig().basicFields) {
        const value = saved.basic[field.key];
        if (typeof value === 'string') {
          basic[field.key] = value;
        }
      }
    }

    if (!basic.checkDate) {
      basic.checkDate = formatDateInputValue(new Date());
    }

    const devices = Array.isArray(saved.devices)
      ? saved.devices
          .map((device) => {
            if (!device || typeof device !== 'object') {
              return null;
            }
            const typeKey = device.typeKey || device.type || '';
            return createDeviceCard(typeKey, {
              id: device.id,
              typeLabel: device.typeLabel,
              name: typeof device.name === 'string' ? device.name : '',
              code: typeof device.code === 'string' ? device.code : '',
              items: Array.isArray(device.items) ? device.items : [],
            });
          })
          .filter(Boolean)
      : [];

    const signatures = {
      tester: saved.signatures && typeof saved.signatures.tester === 'string' ? saved.signatures.tester : '',
      owner: saved.signatures && typeof saved.signatures.owner === 'string' ? saved.signatures.owner : '',
    };

    return {
      basic,
      devices,
      note: typeof saved.note === 'string' ? saved.note : '',
      signatures,
    };
  }

  function loadState() {
    try {
      const raw = root.localStorage && root.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return createInitialState();
      }
      return normalizeLoadedState(JSON.parse(raw));
    } catch (error) {
      return createInitialState();
    }
  }

  function saveState() {
    if (!state) {
      return;
    }

    try {
      root.localStorage && root.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      // 在隱私限制環境中，本機儲存可能不可用。
    }
  }

  function cacheElements() {
    elements = {
      app: document.getElementById('app'),
      formPaper: document.getElementById('form-paper'),
      formHeader: document.getElementById('form-header'),
      formTitle: document.getElementById('form-title'),
      configStatus: document.getElementById('config-status'),
      basicSection: document.getElementById('basic-section'),
      deviceActionSection: document.getElementById('device-action-section'),
      deviceList: document.getElementById('device-list'),
      noteSection: document.getElementById('note-section'),
      signatureSection: document.getElementById('signature-section'),
      formFooter: document.getElementById('form-footer'),
      actionButtons: document.getElementById('action-buttons'),
      exportTimestamp: document.getElementById('export-timestamp-value'),
    };
  }

  function createSectionTitle(title, description) {
    const wrapper = document.createElement('div');
    wrapper.className = 'section-title';

    const headingBlock = document.createElement('div');
    const heading = document.createElement('h2');
    heading.textContent = title;
    headingBlock.appendChild(heading);

    if (description) {
      const help = document.createElement('p');
      help.textContent = description;
      headingBlock.appendChild(help);
    }

    wrapper.appendChild(headingBlock);
    return wrapper;
  }

  function createFieldWrapper(field) {
    const wrapper = document.createElement('div');
    wrapper.className = 'field';

    const label = document.createElement('label');
    label.setAttribute('for', `field-${field.key}`);
    label.innerHTML = `${field.label}${field.required ? '<span class="required-mark">*</span>' : ''}`;

    const input = document.createElement('input');
    input.id = `field-${field.key}`;
    input.type = field.type || 'text';
    input.dataset.fieldKey = field.key;
    input.value = state.basic[field.key] || '';
    if (field.required) {
      input.required = true;
    }
    if (field.type === 'date' && !input.value) {
      input.value = formatDateInputValue(new Date());
    }

    wrapper.appendChild(label);
    wrapper.appendChild(input);

    if (field.key === 'projectName') {
      const help = document.createElement('p');
      help.className = 'field-help';
      help.textContent = '這個欄位會用在 PDF 檔名中。';
      wrapper.appendChild(help);
    }

    return wrapper;
  }

  function renderBasicSection() {
    const container = elements.basicSection;
    container.innerHTML = '';
    container.appendChild(createSectionTitle('基本資料', '案場名稱與檢查日期會帶入 PDF 檔名與內容。'));

    const grid = document.createElement('div');
    grid.className = 'field-grid';

    getActiveConfig().basicFields.forEach((field) => {
      grid.appendChild(createFieldWrapper(field));
    });

    container.appendChild(grid);
  }

  function renderDeviceActions() {
    const container = elements.deviceActionSection;
    container.innerHTML = '';
    container.appendChild(createSectionTitle('設備新增區', '會依照 config.js 自動產生新增按鈕。'));

    const grid = document.createElement('div');
    grid.className = 'device-action-grid';

    const deviceTypes = getActiveConfig().deviceTypes || {};
    const entries = Object.entries(deviceTypes);

    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = '目前沒有可新增的設備類型。';
      grid.appendChild(empty);
    } else {
      entries.forEach(([typeKey, typeConfig]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'secondary no-print';
        button.dataset.action = 'add-device';
        button.dataset.deviceType = typeKey;
        button.textContent = `＋新增${typeConfig.label}`;
        grid.appendChild(button);
      });
    }

    container.appendChild(grid);
  }

  function createDeviceItemElement(deviceId, item) {
    const label = document.createElement('label');
    label.className = 'check-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.deviceId = deviceId;
    checkbox.dataset.itemId = item.id;
    checkbox.checked = Boolean(item.checked);

    const span = document.createElement('span');
    span.textContent = item.label;
    if (item.custom) {
      span.textContent = `${item.label}（自訂）`;
    }

    label.appendChild(checkbox);
    label.appendChild(span);
    return label;
  }

  function createDeviceCardElement(device) {
    const card = document.createElement('article');
    card.className = 'device-card';
    card.dataset.deviceId = device.id;

    const head = document.createElement('div');
    head.className = 'device-card__head';

    const titleWrap = document.createElement('div');
    const title = document.createElement('h3');
    title.className = 'device-card__title';
    title.textContent = `${device.typeLabel}設備`;
    const meta = document.createElement('div');
    meta.className = 'device-card__meta';
    meta.textContent = `設備類型：${device.typeLabel}`;
    titleWrap.appendChild(title);
    titleWrap.appendChild(meta);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'danger small no-print';
    deleteButton.dataset.action = 'delete-device';
    deleteButton.dataset.deviceId = device.id;
    deleteButton.textContent = '刪除此設備';

    head.appendChild(titleWrap);
    head.appendChild(deleteButton);

    const fields = document.createElement('div');
    fields.className = 'device-fields';

    const nameField = document.createElement('div');
    nameField.className = 'device-field';
    const nameLabel = document.createElement('label');
    nameLabel.setAttribute('for', `device-${device.id}-name`);
    nameLabel.textContent = '設備名稱／位置';
    const nameInput = document.createElement('input');
    nameInput.id = `device-${device.id}-name`;
    nameInput.type = 'text';
    nameInput.placeholder = '例如：B1入口';
    nameInput.value = device.name || '';
    nameInput.dataset.deviceId = device.id;
    nameInput.dataset.deviceField = 'name';
    nameField.appendChild(nameLabel);
    nameField.appendChild(nameInput);

    const codeField = document.createElement('div');
    codeField.className = 'device-field';
    const codeLabel = document.createElement('label');
    codeLabel.setAttribute('for', `device-${device.id}-code`);
    codeLabel.textContent = '設備編號';
    const codeInput = document.createElement('input');
    codeInput.id = `device-${device.id}-code`;
    codeInput.type = 'text';
    codeInput.placeholder = '例如：EN-01';
    codeInput.value = device.code || '';
    codeInput.dataset.deviceId = device.id;
    codeInput.dataset.deviceField = 'code';
    codeField.appendChild(codeLabel);
    codeField.appendChild(codeInput);

    fields.appendChild(nameField);
    fields.appendChild(codeField);

    const items = document.createElement('div');
    items.className = 'device-items';

    device.items.forEach((item) => {
      items.appendChild(createDeviceItemElement(device.id, item));
    });

    const actions = document.createElement('div');
    actions.className = 'device-actions';

    const addCustomButton = document.createElement('button');
    addCustomButton.type = 'button';
    addCustomButton.className = 'secondary small no-print empty-state-action';
    addCustomButton.dataset.action = 'add-custom-item';
    addCustomButton.dataset.deviceId = device.id;
    addCustomButton.textContent = '＋新增自訂項目';

    actions.appendChild(addCustomButton);

    card.appendChild(head);
    card.appendChild(fields);
    card.appendChild(items);
    card.appendChild(actions);
    return card;
  }

  function renderDeviceList() {
    const container = elements.deviceList;
    container.innerHTML = '';

    if (!state.devices.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = '尚未新增設備。';
      container.appendChild(empty);
      return;
    }

    state.devices.forEach((device) => {
      container.appendChild(createDeviceCardElement(device));
    });
  }

  function renderNoteSection() {
    const container = elements.noteSection;
    container.innerHTML = '';
    container.appendChild(createSectionTitle('整體備註', '非必填，可輸入現場說明或補充事項。'));

    const field = document.createElement('div');
    field.className = 'field';

    const label = document.createElement('label');
    label.setAttribute('for', 'overall-note');
    label.textContent = '整體備註';

    const textarea = document.createElement('textarea');
    textarea.id = 'overall-note';
    textarea.rows = 5;
    textarea.placeholder = '可填寫整體備註';
    textarea.value = state.note || '';
    textarea.dataset.noteField = 'overallNote';

    const help = document.createElement('p');
    help.className = 'field-help';
    help.textContent = '此欄位會一起輸出到 PDF。';

    field.appendChild(label);
    field.appendChild(textarea);
    field.appendChild(help);
    container.appendChild(field);
  }

  function createSignatureCard(signatureKey, titleText) {
    const card = document.createElement('article');
    card.className = 'signature-card';
    card.dataset.signatureKey = signatureKey;

    const head = document.createElement('div');
    head.className = 'signature-card__head';

    const titleBlock = document.createElement('div');
    const title = document.createElement('h3');
    title.className = 'signature-card__title';
    title.textContent = titleText;
    const note = document.createElement('p');
    note.className = 'signature-card__note';
    note.textContent = '支援滑鼠與觸控簽名。';
    titleBlock.appendChild(title);
    titleBlock.appendChild(note);

    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = 'ghost small no-print signature-actions';
    clearButton.dataset.action = 'clear-signature';
    clearButton.dataset.signatureKey = signatureKey;
    clearButton.textContent = '清除簽名';

    head.appendChild(titleBlock);
    head.appendChild(clearButton);

    const canvas = document.createElement('canvas');
    canvas.className = 'signature-canvas';
    canvas.dataset.signatureKey = signatureKey;
    canvas.setAttribute('aria-label', titleText);

    card.appendChild(head);
    card.appendChild(canvas);
    return card;
  }

  function renderSignatureSection() {
    const container = elements.signatureSection;
    container.innerHTML = '';

    container.appendChild(createSectionTitle('電子簽名', '確認上述功能項目已完成測試。'));

    const intro = document.createElement('p');
    intro.className = 'signature-intro';
    intro.textContent = '確認上述功能項目已完成測試。';
    container.appendChild(intro);

    const grid = document.createElement('div');
    grid.className = 'signature-grid';
    grid.id = 'signature-grid';

    grid.appendChild(createSignatureCard('tester', '測試人員簽名'));
    grid.appendChild(createSignatureCard('owner', '業主／現場代表簽名'));

    container.appendChild(grid);
  }

  function buildSignatureSectionModel(isSignatureMode = signatureMode, signatures = state && state.signatures ? state.signatures : {}) {
    const mode = isSignatureMode ? 'editor' : 'summary';
    const signerTitles = {
      tester: '皜祈岫鈭箏簽名',
      owner: '璆凋蜓嚗?港誨銵?簽名',
    };

    return {
      mode,
      title: mode === 'editor' ? '獨立簽名畫面' : '簽名總覽',
      intro:
        mode === 'editor'
          ? '只會顯示簽名工作區，簽完按儲存並返回。'
          : '先看簽名摘要，確認沒問題後再進入簽名畫面。',
      primaryActionLabel: mode === 'editor' ? '儲存並返回' : '進入簽名畫面',
      secondaryActionLabel: mode === 'editor' ? '返回總覽' : '',
      clearAllLabel: mode === 'editor' ? '清除所有簽名' : '',
      signers: SIGNATURE_KEYS.map((signatureKey) => {
        const dataUrl = String(signatures[signatureKey] || '');
        return {
          key: signatureKey,
          title: signerTitles[signatureKey] || signatureKey,
          statusLabel: dataUrl ? '已簽名' : '尚未簽名',
          hasPreview: Boolean(dataUrl),
          previewDataUrl: dataUrl,
        };
      }),
    };
  }

  function createSignatureSummaryCard(signer) {
    const card = document.createElement('article');
    card.className = `signature-summary-card${signer.hasPreview ? ' signature-summary-card--signed' : ''}`;
    card.dataset.signatureKey = signer.key;

    const head = document.createElement('div');
    head.className = 'signature-summary-card__head';

    const title = document.createElement('h3');
    title.className = 'signature-summary-card__title';
    title.textContent = signer.title;

    const status = document.createElement('span');
    status.className = `signature-summary-card__status${signer.hasPreview ? ' signature-summary-card__status--signed' : ''}`;
    status.textContent = signer.statusLabel;

    head.appendChild(title);
    head.appendChild(status);

    const preview = document.createElement('div');
    preview.className = `signature-preview${signer.hasPreview ? ' signature-preview--signed' : ''}`;

    if (signer.hasPreview) {
      const image = document.createElement('img');
      image.src = signer.previewDataUrl;
      image.alt = `${signer.title}預覽`;
      preview.appendChild(image);
    } else {
      const empty = document.createElement('p');
      empty.className = 'signature-preview__empty';
      empty.textContent = '尚未簽名';
      preview.appendChild(empty);
    }

    card.appendChild(head);
    card.appendChild(preview);
    return card;
  }

  function renderSignatureSectionV2() {
    const container = elements.signatureSection;
    container.innerHTML = '';

    const model = buildSignatureSectionModel();
    container.dataset.mode = model.mode;

    container.appendChild(createSectionTitle(model.title, model.mode === 'editor' ? '簽名時只保留簽名畫面，避免誤按其他欄位。' : '先看摘要，確認簽名狀態後再進入獨立簽名畫面。'));

    const intro = document.createElement('p');
    intro.className = 'signature-intro';
    intro.textContent = model.intro;
    container.appendChild(intro);

    if (model.mode === 'summary') {
      const summaryGrid = document.createElement('div');
      summaryGrid.className = 'signature-summary-grid';
      summaryGrid.id = 'signature-summary-grid';

      model.signers.forEach((signer) => {
        summaryGrid.appendChild(createSignatureSummaryCard(signer));
      });

      container.appendChild(summaryGrid);

      const actions = document.createElement('div');
      actions.className = 'inline-actions signature-summary-actions';
      actions.appendChild(createActionButton(model.primaryActionLabel, 'enter-signature-mode', 'primary'));
      container.appendChild(actions);
      return;
    }

    const toolbar = document.createElement('div');
    toolbar.className = 'signature-editor-toolbar';
    toolbar.appendChild(createActionButton(model.primaryActionLabel, 'save-signatures-return', 'primary'));
    toolbar.appendChild(createActionButton(model.secondaryActionLabel, 'exit-signature-mode', 'ghost'));
    toolbar.appendChild(createActionButton(model.clearAllLabel, 'clear-all-signatures', 'secondary'));
    container.appendChild(toolbar);

    const workspace = document.createElement('div');
    workspace.className = 'signature-workspace';
    workspace.id = 'signature-workspace';

    workspace.appendChild(createSignatureCard('tester', '皜祈岫鈭箏簽名'));
    workspace.appendChild(createSignatureCard('owner', '璆凋蜓嚗?港誨銵?簽名'));

    container.appendChild(workspace);
  }

  function setSignatureMode(nextMode) {
    signatureMode = Boolean(nextMode);
    if (document.body && document.body.classList) {
      document.body.classList.toggle('signature-mode', signatureMode);
    }
    renderAll();
    if (elements.signatureSection && typeof elements.signatureSection.scrollIntoView === 'function') {
      elements.signatureSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function renderActionButtons() {
    const container = elements.actionButtons;
    container.innerHTML = '';

    const generateButton = document.createElement('button');
    generateButton.type = 'button';
    generateButton.className = 'primary';
    generateButton.dataset.action = 'generate-pdf';
    generateButton.textContent = '產生 PDF';

    const printButton = document.createElement('button');
    printButton.type = 'button';
    printButton.className = 'secondary';
    printButton.dataset.action = 'print-form';
    printButton.textContent = '列印';

    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = 'ghost';
    clearButton.dataset.action = 'clear-form';
    clearButton.textContent = '清空重填';

    container.appendChild(generateButton);
    container.appendChild(printButton);
    container.appendChild(clearButton);
  }

  function renderAll() {
    if (!elements.formTitle) {
      return;
    }

    elements.formTitle.textContent = getActiveConfig().title || '停車場設備功能測試完成簽認單';
    renderBasicSection();
    renderDeviceActions();
    renderDeviceList();
    renderNoteSection();
    renderSignatureSectionV2();
    renderActionButtons();
    if (signatureMode) {
      hydrateSignatureCanvases();
    }
  }

  function persistAndMaybeRender(render = false) {
    saveState();
    if (render) {
      renderAll();
    }
  }

  function getDeviceById(deviceId) {
    return state.devices.find((device) => device.id === deviceId) || null;
  }

  function handleBasicInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.dataset.fieldKey) {
      return;
    }
    state.basic[target.dataset.fieldKey] = target.value;
    saveState();
  }

  function handleDeviceActionClick(event) {
    const button = event.target.closest('button[data-action="add-device"]');
    if (!button) {
      return;
    }
    addDeviceCard(button.dataset.deviceType);
  }

  function handleDeviceListInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.dataset.deviceId || !target.dataset.deviceField) {
      return;
    }

    const device = getDeviceById(target.dataset.deviceId);
    if (!device) {
      return;
    }

    device[target.dataset.deviceField] = target.value;
    saveState();
  }

  function handleDeviceListChange(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.tagName !== 'INPUT' || target.type !== 'checkbox') {
      return;
    }

    const deviceId = target.dataset.deviceId;
    const itemId = target.dataset.itemId;
    if (!deviceId || !itemId) {
      return;
    }

    const device = getDeviceById(deviceId);
    if (!device) {
      return;
    }

    const item = device.items.find((entry) => entry.id === itemId);
    if (!item) {
      return;
    }

    item.checked = target.checked;
    saveState();
  }

  function handleDeviceListClick(event) {
    const addCustomButton = event.target.closest('button[data-action="add-custom-item"]');
    if (addCustomButton) {
      addCustomItem(addCustomButton.dataset.deviceId);
      return;
    }

    const deleteButton = event.target.closest('button[data-action="delete-device"]');
    if (deleteButton) {
      removeDeviceCard(deleteButton.dataset.deviceId);
    }
  }

  function handleNoteInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.dataset.noteField) {
      return;
    }
    state.note = target.value;
    saveState();
  }

  function handleSignatureClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) {
      return;
    }

    const action = button.dataset.action;
    if (action === 'enter-signature-mode') {
      setSignatureMode(true);
      return;
    }

    if (action === 'save-signatures-return') {
      saveState();
      setSignatureMode(false);
      return;
    }

    if (action === 'exit-signature-mode') {
      setSignatureMode(false);
      return;
    }

    if (action === 'clear-all-signatures') {
      state.signatures = {
        tester: '',
        owner: '',
      };
      saveState();
      renderAll();
      return;
    }

    if (action === 'clear-signature') {
      clearSignature(button.dataset.signatureKey);
    }
  }

  function handleActionButtonsClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) {
      return;
    }

    const action = button.dataset.action;
    if (action === 'generate-pdf') {
      generatePDF();
      return;
    }
    if (action === 'print-form') {
      window.print();
      return;
    }
    if (action === 'clear-form') {
      clearForm();
    }
  }

  function setupEventDelegation() {
    elements.basicSection.addEventListener('input', handleBasicInput);
    elements.deviceActionSection.addEventListener('click', handleDeviceActionClick);
    elements.deviceList.addEventListener('input', handleDeviceListInput);
    elements.deviceList.addEventListener('change', handleDeviceListChange);
    elements.deviceList.addEventListener('click', handleDeviceListClick);
    elements.noteSection.addEventListener('input', handleNoteInput);
    elements.signatureSection.addEventListener('click', handleSignatureClick);
    elements.actionButtons.addEventListener('click', handleActionButtonsClick);
  }

  function addDeviceCard(deviceTypeKey) {
    if (!deviceTypeKey || !getActiveConfig().deviceTypes[deviceTypeKey]) {
      return;
    }

    state.devices.push(createDeviceCard(deviceTypeKey));
    saveState();
    renderAll();
  }

  function removeDeviceCard(deviceId) {
    if (!deviceId) {
      return;
    }

    const index = state.devices.findIndex((device) => device.id === deviceId);
    if (index < 0) {
      return;
    }

    state.devices.splice(index, 1);
    saveState();
    renderAll();
  }

  function addCustomItem(deviceId) {
    const device = getDeviceById(deviceId);
    if (!device) {
      return;
    }

    const promptMessage = '請輸入測試項目名稱';
    const result = window.prompt ? window.prompt(promptMessage) : '';
    const trimmed = String(result ?? '').trim();
    if (!trimmed) {
      return;
    }

    device.items.push(createDeviceItem(trimmed, true));
    saveState();
    renderAll();
  }

  function clearSignature(signatureKey) {
    if (!SIGNATURE_KEYS.includes(signatureKey)) {
      return;
    }

    state.signatures[signatureKey] = '';
    saveState();
    const canvas = elements.signatureSection.querySelector(`canvas[data-signature-key="${signatureKey}"]`);
    if (canvas) {
      clearCanvas(canvas);
    }
  }

  function clearCanvas(canvas) {
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    const width = canvas.width;
    const height = canvas.height;
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
  }

  function resizeCanvasToDisplaySize(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const displayWidth = Math.max(1, Math.round(rect.width));
    const displayHeight = Math.max(1, Math.round(rect.height));
    const width = Math.round(displayWidth * dpr);
    const height = Math.round(displayHeight * dpr);
    const sizeChanged = canvas.width !== width || canvas.height !== height;

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (context) {
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.imageSmoothingEnabled = true;
    }

    return { sizeChanged, displayWidth, displayHeight };
  }

  function drawSignatureData(canvas, dataUrl) {
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    const { displayWidth, displayHeight } = resizeCanvasToDisplaySize(canvas);
    context.clearRect(0, 0, displayWidth, displayHeight);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, displayWidth, displayHeight);

    if (!dataUrl) {
      return;
    }

    const image = new Image();
    image.onload = () => {
      context.drawImage(image, 0, 0, displayWidth, displayHeight);
    };
    image.src = dataUrl;
  }

  function attachSignatureCanvas(canvas) {
    if (canvas.dataset.bound === 'true') {
      return;
    }

    const signatureKey = canvas.dataset.signatureKey;
    const context = canvas.getContext('2d');
    if (!context || !SIGNATURE_KEYS.includes(signatureKey)) {
      return;
    }

    let isDrawing = false;
    let lastPoint = null;

    const getPoint = (event) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    };

    const beginStroke = (event) => {
      event.preventDefault();
      isDrawing = true;
      canvas.setPointerCapture(event.pointerId);
      lastPoint = getPoint(event);
      context.beginPath();
      context.moveTo(lastPoint.x, lastPoint.y);
    };

    const continueStroke = (event) => {
      if (!isDrawing) {
        return;
      }
      event.preventDefault();
      const point = getPoint(event);
      context.lineWidth = 2.4;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.strokeStyle = '#1f2937';
      context.beginPath();
      context.moveTo(lastPoint.x, lastPoint.y);
      context.lineTo(point.x, point.y);
      context.stroke();
      lastPoint = point;
    };

    const endStroke = (event) => {
      if (!isDrawing) {
        return;
      }
      event.preventDefault();
      isDrawing = false;
      lastPoint = null;
      state.signatures[signatureKey] = canvas.toDataURL('image/png');
      saveState();
    };

    canvas.addEventListener('pointerdown', beginStroke);
    canvas.addEventListener('pointermove', continueStroke);
    canvas.addEventListener('pointerup', endStroke);
    canvas.addEventListener('pointercancel', endStroke);
    canvas.addEventListener('pointerleave', endStroke);
    canvas.dataset.bound = 'true';
  }

  function hydrateSignatureCanvases() {
    const canvases = elements.signatureSection.querySelectorAll('canvas[data-signature-key]');
    canvases.forEach((canvas) => {
      const signatureKey = canvas.dataset.signatureKey;
      attachSignatureCanvas(canvas);
      drawSignatureData(canvas, state.signatures[signatureKey]);
    });
  }

  function waitForLayout() {
    return new Promise((resolve) => {
      if (typeof window.requestAnimationFrame !== 'function') {
        resolve();
        return;
      }

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(resolve);
      });
    });
  }

  function getPdfDependencies() {
    const jsPdfCtor = root.jspdf && root.jspdf.jsPDF ? root.jspdf.jsPDF : null;
    const canvasToPdf = typeof root.html2canvas === 'function' ? root.html2canvas : null;
    return { jsPdfCtor, canvasToPdf };
  }

  function setExportMode(enabled) {
    document.body.classList.toggle('exporting', enabled);
  }

  function updateExportTimestampDisplay(text) {
    if (!elements.exportTimestamp) {
      return;
    }
    elements.exportTimestamp.textContent = text;
  }

  function captureBlock(node, html2canvasFn) {
    return html2canvasFn(node, {
      backgroundColor: '#ffffff',
      scale: Math.min(2, window.devicePixelRatio || 1),
      useCORS: true,
      scrollX: 0,
      scrollY: -window.scrollY,
    });
  }

  function getPdfBlockNodes() {
    const blocks = [];
    blocks.push(elements.formHeader);
    blocks.push(elements.basicSection);

    if (state.devices.length) {
      state.devices.forEach((device) => {
        const node = elements.deviceList.querySelector(`[data-device-id="${device.id}"]`);
        if (node) {
          blocks.push(node);
        }
      });
    } else {
      blocks.push(elements.deviceList);
    }

    blocks.push(elements.noteSection);
    blocks.push(elements.signatureSection);
    blocks.push(elements.formFooter);
    return blocks.filter(Boolean);
  }

  function addCanvasSliceToPdf(pdf, canvas, options) {
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const contentWidth = pageWidth - options.marginLeft - options.marginRight;
    const availableHeight = pageHeight - options.marginTop - options.marginBottom;
    const imgHeight = (canvas.height * contentWidth) / canvas.width;
    const fullImage = canvas.toDataURL('image/png');

    if (options.cursorY + imgHeight <= pageHeight - options.marginBottom) {
      pdf.addImage(fullImage, 'PNG', options.marginLeft, options.cursorY, contentWidth, imgHeight);
      return options.cursorY + imgHeight;
    }

    if (imgHeight <= availableHeight) {
      if (options.cursorY > options.marginTop) {
        pdf.addPage();
        options.cursorY = options.marginTop;
      }
      pdf.addImage(fullImage, 'PNG', options.marginLeft, options.cursorY, contentWidth, imgHeight);
      return options.cursorY + imgHeight;
    }

    const sliceCanvasHeight = Math.max(1, Math.floor((canvas.width * availableHeight) / contentWidth));
    let offset = 0;
    let currentY = options.cursorY > options.marginTop ? options.marginTop : options.cursorY;

    while (offset < canvas.height) {
      if (currentY > options.marginTop) {
        pdf.addPage();
        currentY = options.marginTop;
      }

      const sliceHeight = Math.min(sliceCanvasHeight, canvas.height - offset);
      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = sliceHeight;
      const sliceContext = sliceCanvas.getContext('2d');
      sliceContext.drawImage(canvas, 0, offset, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

      const sliceImageHeight = (sliceHeight * contentWidth) / canvas.width;
      pdf.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', options.marginLeft, currentY, contentWidth, sliceImageHeight);

      offset += sliceHeight;
      currentY += sliceImageHeight;

      if (offset < canvas.height) {
        pdf.addPage();
        currentY = options.marginTop;
      }
    }

    return currentY;
  }

  async function generatePDF() {
    const projectName = String(state.basic.projectName || '').trim();
    const checkDate = String(state.basic.checkDate || '').trim();

    if (!projectName) {
      window.alert('請填寫案場名稱');
      return;
    }

    if (!checkDate) {
      window.alert('請填寫檢查日期');
      return;
    }

    if (!state.devices.length && !window.confirm('目前尚未新增設備，是否仍要產生 PDF？')) {
      return;
    }

    const { jsPdfCtor, canvasToPdf } = getPdfDependencies();
    if (!jsPdfCtor || !canvasToPdf) {
      window.alert('PDF 相關函式庫尚未載入完成');
      return;
    }

    exportTimestampBackup = elements.exportTimestamp ? elements.exportTimestamp.textContent : null;
    updateExportTimestampDisplay(formatDateTimeValue(new Date()));
    setExportMode(true);
    await waitForLayout();

    try {
      const pdf = new jsPdfCtor('p', 'mm', 'a4');
      const pageHeight = pdf.internal.pageSize.getHeight();
      const marginTop = 10;
      const marginBottom = 10;
      const marginLeft = 10;
      const marginRight = 10;
      let cursorY = marginTop;

      const blocks = getPdfBlockNodes();
      for (const node of blocks) {
        const canvas = await captureBlock(node, canvasToPdf);
        cursorY = addCanvasSliceToPdf(pdf, canvas, {
          cursorY,
          marginTop,
          marginBottom,
          marginLeft,
          marginRight,
          pageHeight,
        });
        cursorY += 4;
        if (cursorY > pageHeight - marginBottom) {
          pdf.addPage();
          cursorY = marginTop;
        }
      }

      pdf.save(buildPdfFilename(checkDate, projectName));
    } finally {
      setExportMode(false);
      if (exportTimestampBackup !== null) {
        updateExportTimestampDisplay(exportTimestampBackup);
        exportTimestampBackup = null;
      }
      await waitForLayout();
      hydrateSignatureCanvases();
    }
  }

  function clearForm() {
    if (!window.confirm('確定要清空整張表單嗎？')) {
      return;
    }

    state = createInitialState();
    signatureMode = false;
    if (document.body && document.body.classList) {
      document.body.classList.remove('signature-mode');
    }
    saveState();
    renderAll();
    updateExportTimestampDisplay('尚未產生');
  }

  function syncStateToConfig(config) {
    if (!state) {
      return;
    }

    const mergedBasic = {
      ...createBasicFieldDefaults(config),
      ...state.basic,
    };

    state.basic = mergedBasic;
    state.devices = state.devices.map((device) => {
      const typeConfig = config.deviceTypes[device.typeKey];
      if (!typeConfig) {
        return device;
      }

      return {
        ...device,
        typeLabel: typeConfig.label || device.typeLabel,
      };
    });
    saveState();
  }

  function updateConfigStatus(message, tone = 'info') {
    if (!elements.configStatus) {
      return;
    }

    elements.configStatus.textContent = message;
    elements.configStatus.dataset.tone = tone;
  }

  async function refreshPublicConfig() {
    if (typeof resolvePublicConfigStatus !== 'function') {
      updateConfigStatus('雲端公版模組尚未載入，已使用本機預設。', 'warn');
      return;
    }

    updateConfigStatus('正在載入雲端公版…', 'info');
    const result = await resolvePublicConfigStatus(getActiveConfig());
    setActiveConfig(result.config);
    syncStateToConfig(result.config);
    renderAll();

    if (result.source === 'remote') {
      updateConfigStatus('已載入雲端公版。', 'success');
      return;
    }

    updateConfigStatus('雲端公版載入失敗，已使用本機預設。', 'error');
  }

  function init() {
    cacheElements();
    setupEventDelegation();
    state = loadState();
    renderAll();
    updateExportTimestampDisplay(elements.exportTimestamp.textContent || '尚未產生');
    refreshPublicConfig();

    window.addEventListener('resize', () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        hydrateSignatureCanvases();
      }, 120);
    });
  }

  const ParkingSignForm = {
    buildPdfFilename,
    buildSignatureSectionModel,
    createInitialState,
    formatDateInputValue,
    formatDateTimeValue,
    generatePDF,
    init,
    loadState,
    normalizeFilenamePart,
    saveState,
    clearForm,
    setSignatureMode,
  };

  root.ParkingSignForm = ParkingSignForm;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})();
