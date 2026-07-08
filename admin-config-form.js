(function () {
  const root = typeof globalThis !== 'undefined' ? globalThis : window;
  const ConfigLoader = root.ConfigLoader || {};

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

  const mergePublicConfig =
    typeof ConfigLoader.mergePublicConfig === 'function' ? ConfigLoader.mergePublicConfig : null;

  const CORE_FIELD_KEYS = ['projectName', 'siteCode'];
  const DEFAULT_BASIC_FIELD_TYPE = 'text';

  function trimText(value) {
    return String(value ?? '').trim();
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function mergeWithCoreFields(fallbackConfig, remoteConfig) {
    const fallback = normalizePublicConfig(fallbackConfig);
    const remote = normalizePublicConfig(remoteConfig);
    const fallbackByKey = new Map(fallback.basicFields.map((field) => [trimText(field.key), field]));
    const remoteByKey = new Map(remote.basicFields.map((field) => [trimText(field.key), field]));
    const mergedBasicFields = [];

    for (const coreKey of CORE_FIELD_KEYS) {
      const chosen = remoteByKey.get(coreKey) || fallbackByKey.get(coreKey);
      if (chosen) {
        mergedBasicFields.push({
          ...chosen,
          locked: true,
        });
      }
    }

    for (const field of remote.basicFields) {
      if (!CORE_FIELD_KEYS.includes(field.key) && !mergedBasicFields.some((entry) => entry.key === field.key)) {
        mergedBasicFields.push({
          ...field,
          locked: Boolean(field.locked),
        });
      }
    }

    return {
      version: remote.version || fallback.version || 1,
      title: remote.title || fallback.title,
      basicFields: mergedBasicFields,
      deviceTypes: { ...remote.deviceTypes },
    };
  }

  function createId(prefix) {
    if (root.crypto && typeof root.crypto.randomUUID === 'function') {
      return `${prefix}-${root.crypto.randomUUID()}`;
    }

    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function createBlankBasicField(overrides = {}) {
    return {
      id: createId('basic'),
      key: '',
      label: '',
      type: DEFAULT_BASIC_FIELD_TYPE,
      required: false,
      locked: false,
      ...overrides,
    };
  }

  function createBlankDeviceItem(overrides = {}) {
    return {
      id: createId('item'),
      label: '',
      ...overrides,
    };
  }

  function createBlankDeviceType(overrides = {}) {
    return {
      id: createId('device'),
      key: '',
      label: '',
      items: [createBlankDeviceItem()],
      ...overrides,
    };
  }

  function normalizeBasicFieldRow(field, fallbackField = {}) {
    const source = isPlainObject(field) ? field : {};
    const fallback = isPlainObject(fallbackField) ? fallbackField : {};
    const key = trimText(source.key) || trimText(fallback.key);
    const locked = CORE_FIELD_KEYS.includes(key) ? true : Boolean(source.locked ?? fallback.locked);

    return {
      id: trimText(source.id) || createId('basic'),
      key,
      label: trimText(source.label) || trimText(fallback.label) || key,
      type: trimText(source.type) || trimText(fallback.type) || DEFAULT_BASIC_FIELD_TYPE,
      required: Boolean(source.required ?? fallback.required),
      locked,
    };
  }

  function normalizeDeviceItemRow(item, fallbackItem = {}) {
    const source = isPlainObject(item) ? item : {};
    const fallback = isPlainObject(fallbackItem) ? fallbackItem : {};
    const sourceLabel = typeof item === 'string' ? item : '';
    const fallbackLabel = typeof fallbackItem === 'string' ? fallbackItem : '';

    return {
      id: trimText(source.id) || createId('item'),
      label: trimText(source.label) || sourceLabel.trim() || trimText(fallback.label) || fallbackLabel.trim(),
    };
  }

  function normalizeDeviceTypeRow(typeRow, fallbackType = {}) {
    const source = isPlainObject(typeRow) ? typeRow : {};
    const fallback = isPlainObject(fallbackType) ? fallbackType : {};
    const rawItems = Array.isArray(source.items) ? source.items : Array.isArray(fallback.items) ? fallback.items : [];

    return {
      id: trimText(source.id) || createId('device'),
      key: trimText(source.key) || trimText(fallback.key),
      label: trimText(source.label) || trimText(fallback.label) || trimText(source.key) || trimText(fallback.key),
      items: rawItems.map((item, index) => normalizeDeviceItemRow(item, fallback.items && fallback.items[index])),
    };
  }

  function normalizeBasicFieldRows(basicFields, fallbackFields = []) {
    const rows = [];
    const seen = new Set();
    const fallbackByKey = new Map(
      (Array.isArray(fallbackFields) ? fallbackFields : []).map((field) => [trimText(field && field.key), field]),
    );

    for (const field of Array.isArray(basicFields) ? basicFields : []) {
      const row = normalizeBasicFieldRow(field, fallbackByKey.get(trimText(field && field.key)));
      if (!row.key || seen.has(row.key)) {
        continue;
      }

      rows.push(row);
      seen.add(row.key);
    }

    for (const coreKey of CORE_FIELD_KEYS) {
      if (seen.has(coreKey)) {
        continue;
      }

      const fallbackField = fallbackByKey.get(coreKey) || { key: coreKey, label: coreKey, type: DEFAULT_BASIC_FIELD_TYPE, locked: true };
      const row = normalizeBasicFieldRow(
        {
          key: coreKey,
          label: fallbackField.label,
          type: fallbackField.type,
          required: fallbackField.required,
          locked: true,
        },
        fallbackField,
      );

      rows.unshift(row);
      seen.add(coreKey);
    }

    const orderedCoreRows = CORE_FIELD_KEYS.map((coreKey) => rows.find((row) => row.key === coreKey)).filter(Boolean);
    const extraRows = rows.filter((row) => !CORE_FIELD_KEYS.includes(row.key));

    return [...orderedCoreRows, ...extraRows];
  }

  function normalizeDeviceTypeRows(deviceTypes) {
    const rows = [];
    const seen = new Set();
    const sourceRows = Array.isArray(deviceTypes)
      ? deviceTypes
      : isPlainObject(deviceTypes)
        ? Object.entries(deviceTypes).map(([key, value]) => ({
            key,
            ...(isPlainObject(value) ? value : {}),
          }))
        : [];

    for (const row of sourceRows) {
      const normalized = normalizeDeviceTypeRow(row);
      if (!normalized.key || seen.has(normalized.key)) {
        continue;
      }

      normalized.items = normalized.items.filter((item) => trimText(item.label));
      rows.push(normalized);
      seen.add(normalized.key);
    }

    return rows;
  }

  function createFormState(config, fallbackConfig = root.FORM_CONFIG || {}) {
    const fallback = normalizePublicConfig(fallbackConfig);
    const source = mergePublicConfig ? mergePublicConfig(fallback, config) : mergeWithCoreFields(fallback, config);

    return {
      version: source.version || 1,
      title: trimText(source.title),
      basicFields: normalizeBasicFieldRows(source.basicFields, fallback.basicFields),
      deviceTypes: normalizeDeviceTypeRows(source.deviceTypes),
    };
  }

  function buildPublicConfig(state) {
    const source = isPlainObject(state) ? state : {};
    const version = Number.isFinite(Number(source.version)) ? Number(source.version) : 1;
    const title = trimText(source.title);

    const basicFields = [];
    const seenBasicKeys = new Set();
    for (const field of Array.isArray(source.basicFields) ? source.basicFields : []) {
      const key = trimText(field && field.key);
      if (!key || seenBasicKeys.has(key)) {
        continue;
      }

      const locked = CORE_FIELD_KEYS.includes(key) ? true : Boolean(field && field.locked);
      basicFields.push({
        key,
        label: trimText(field && field.label) || key,
        type: trimText(field && field.type) || DEFAULT_BASIC_FIELD_TYPE,
        required: Boolean(field && field.required),
        locked,
      });
      seenBasicKeys.add(key);
    }

    const deviceTypes = {};
    const seenDeviceKeys = new Set();
    for (const typeRow of Array.isArray(source.deviceTypes) ? source.deviceTypes : []) {
      const key = trimText(typeRow && typeRow.key);
      if (!key || seenDeviceKeys.has(key)) {
        continue;
      }

      const seenItems = new Set();
      const items = [];
      for (const item of Array.isArray(typeRow.items) ? typeRow.items : []) {
        const text = trimText(item && item.label);
        if (!text || seenItems.has(text)) {
          continue;
        }
        seenItems.add(text);
        items.push(text);
      }

      deviceTypes[key] = {
        label: trimText(typeRow && typeRow.label) || key,
        items,
      };
      seenDeviceKeys.add(key);
    }

    return {
      version,
      title,
      basicFields,
      deviceTypes,
    };
  }

  function validateFormState(state) {
    const source = isPlainObject(state) ? state : {};
    const errors = [];

    if (!trimText(source.title)) {
      errors.push('公版標題不能空白。');
    }

    const basicFields = Array.isArray(source.basicFields) ? source.basicFields : [];
    const seenBasicKeys = new Set();
    let hasProjectName = false;
    let hasSiteCode = false;

    basicFields.forEach((field, index) => {
      const key = trimText(field && field.key);
      const label = trimText(field && field.label);
      const displayIndex = index + 1;

      if (!key) {
        errors.push(`基本欄位第 ${displayIndex} 列的代號不能空白。`);
      } else if (seenBasicKeys.has(key)) {
        errors.push(`基本欄位代號重複：${key}`);
      } else {
        seenBasicKeys.add(key);
      }

      if (!label) {
        errors.push(`基本欄位 ${key || `第 ${displayIndex} 列`} 的顯示名稱不能空白。`);
      }

      if (key === 'projectName') {
        hasProjectName = true;
      }
      if (key === 'siteCode') {
        hasSiteCode = true;
      }
    });

    if (!hasProjectName) {
      errors.push('必須保留 projectName。');
    }
    if (!hasSiteCode) {
      errors.push('必須保留 siteCode。');
    }

    const deviceTypes = Array.isArray(source.deviceTypes) ? source.deviceTypes : [];
    const seenDeviceKeys = new Set();

    deviceTypes.forEach((typeRow, index) => {
      const key = trimText(typeRow && typeRow.key);
      const label = trimText(typeRow && typeRow.label);
      const displayIndex = index + 1;

      if (!key) {
        errors.push(`設備類型第 ${displayIndex} 列的代號不能空白。`);
      } else if (seenDeviceKeys.has(key)) {
        errors.push(`設備類型代號重複：${key}`);
      } else {
        seenDeviceKeys.add(key);
      }

      if (!label) {
        errors.push(`設備類型 ${key || `第 ${displayIndex} 列`} 的顯示名稱不能空白。`);
      }

      const seenItems = new Set();
      (Array.isArray(typeRow && typeRow.items) ? typeRow.items : []).forEach((item, itemIndex) => {
        const text = trimText(item && item.label);
        const itemDisplay = itemIndex + 1;
        if (!text) {
          errors.push(`設備類型 ${label || key || `第 ${displayIndex} 列`} 的第 ${itemDisplay} 個項目不能空白。`);
          return;
        }

        if (seenItems.has(text)) {
          errors.push(`設備類型 ${label || key || `第 ${displayIndex} 列`} 的項目重複：${text}`);
          return;
        }

        seenItems.add(text);
      });
    });

    return {
      ok: errors.length === 0,
      errors,
    };
  }

  const AdminConfigForm = {
    CORE_FIELD_KEYS,
    buildPublicConfig,
    createBlankBasicField,
    createBlankDeviceItem,
    createBlankDeviceType,
    createFormState,
    validateFormState,
  };

  root.AdminConfigForm = AdminConfigForm;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AdminConfigForm;
  }
})();
