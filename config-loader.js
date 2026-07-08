(function () {
  const root = typeof globalThis !== 'undefined' ? globalThis : window;
  const CORE_FIELD_KEYS = ['projectName', 'siteCode'];

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function trimText(value) {
    return String(value ?? '').trim();
  }

  function uniqueTrimmedItems(items) {
    const result = [];
    const seen = new Set();

    for (const item of Array.isArray(items) ? items : []) {
      const text = trimText(item);
      if (!text || seen.has(text)) {
        continue;
      }
      seen.add(text);
      result.push(text);
    }

    return result;
  }

  function normalizeBasicField(field) {
    if (!isPlainObject(field)) {
      return null;
    }

    const key = trimText(field.key);
    if (!key) {
      return null;
    }

    return {
      key,
      label: trimText(field.label) || key,
      type: trimText(field.type) || 'text',
      required: Boolean(field.required),
      locked: CORE_FIELD_KEYS.includes(key) ? true : Boolean(field.locked),
    };
  }

  function normalizeDeviceType(typeKey, typeConfig) {
    if (!isPlainObject(typeConfig)) {
      return null;
    }

    const key = trimText(typeKey);
    if (!key) {
      return null;
    }

    return {
      label: trimText(typeConfig.label) || key,
      items: uniqueTrimmedItems(typeConfig.items),
    };
  }

  function normalizePublicConfig(input) {
    const source = isPlainObject(input) ? input : {};
    const basicFields = [];
    const basicFieldSource = Array.isArray(source.basicFields) ? source.basicFields : [];

    for (const field of basicFieldSource) {
      const normalized = normalizeBasicField(field);
      if (normalized) {
        basicFields.push(normalized);
      }
    }

    const deviceTypes = {};
    if (isPlainObject(source.deviceTypes)) {
      for (const [typeKey, typeConfig] of Object.entries(source.deviceTypes)) {
        const normalized = normalizeDeviceType(typeKey, typeConfig);
        if (normalized) {
          deviceTypes[trimText(typeKey)] = normalized;
        }
      }
    }

    return {
      version: Number.isFinite(Number(source.version)) ? Number(source.version) : 1,
      title: trimText(source.title),
      basicFields,
      deviceTypes,
    };
  }

  function mergePublicConfig(fallback, remote) {
    const fallbackConfig = normalizePublicConfig(fallback);
    const remoteConfig = normalizePublicConfig(remote);
    const remoteFieldsByKey = new Map(remoteConfig.basicFields.map((field) => [field.key, field]));
    const mergedBasicFields = [];

    for (const coreKey of CORE_FIELD_KEYS) {
      const chosen = remoteFieldsByKey.get(coreKey) || fallbackConfig.basicFields.find((field) => field.key === coreKey);
      if (chosen) {
        mergedBasicFields.push({
          ...chosen,
          locked: true,
        });
      }
    }

    for (const field of remoteConfig.basicFields) {
      if (!CORE_FIELD_KEYS.includes(field.key) && !mergedBasicFields.some((entry) => entry.key === field.key)) {
        mergedBasicFields.push({
          ...field,
          locked: Boolean(field.locked),
        });
      }
    }

    return {
      version: remoteConfig.version || fallbackConfig.version || 1,
      title: remoteConfig.title || fallbackConfig.title,
      basicFields: mergedBasicFields,
      deviceTypes: { ...remoteConfig.deviceTypes },
    };
  }

  async function fetchRemotePublicConfig(fetchImpl = root.fetch) {
    const loader = typeof fetchImpl === 'function' ? fetchImpl : root.fetch;
    if (typeof loader !== 'function') {
      throw new Error('Fetch API is not available.');
    }

    const response = await loader('config.json', { cache: 'no-store' });
    if (!response || !response.ok) {
      const status = response && typeof response.status === 'number' ? response.status : 'unknown';
      throw new Error(`HTTP ${status}`);
    }

    return normalizePublicConfig(await response.json());
  }

  async function resolvePublicConfig(fallback, fetchImpl = root.fetch) {
    try {
      const remote = await fetchRemotePublicConfig(fetchImpl);
      return mergePublicConfig(fallback, remote);
    } catch {
      return normalizePublicConfig(fallback);
    }
  }

  async function resolvePublicConfigStatus(fallback, fetchImpl = root.fetch) {
    try {
      const remote = await fetchRemotePublicConfig(fetchImpl);
      return {
        config: mergePublicConfig(fallback, remote),
        source: 'remote',
        error: null,
      };
    } catch (error) {
      return {
        config: normalizePublicConfig(fallback),
        source: 'fallback',
        error,
      };
    }
  }

  function serializePublicConfig(config) {
    return `${JSON.stringify(normalizePublicConfig(config), null, 2)}\n`;
  }

  const ConfigLoader = {
    fetchRemotePublicConfig,
    mergePublicConfig,
    normalizePublicConfig,
    resolvePublicConfig,
    resolvePublicConfigStatus,
    serializePublicConfig,
  };

  root.ConfigLoader = ConfigLoader;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ConfigLoader;
  }
})();
