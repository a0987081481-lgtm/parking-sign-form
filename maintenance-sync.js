(function () {
  const root = typeof globalThis !== 'undefined' ? globalThis : window;
  const ConfigLoader = root.ConfigLoader || {};
  const GitHubContents = root.GitHubContents || {};
  const DEFAULT_SETTINGS = root.MAINTENANCE_SETTINGS || {};

  function trimText(value) {
    return String(value ?? '').trim();
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function normalizeBaseUrl(value) {
    return trimText(value).replace(/\/+$/, '');
  }

  function normalizeMaintenanceSettings(input = {}) {
    const source = isPlainObject(input) ? input : {};

    return {
      apiBaseUrl: normalizeBaseUrl(source.apiBaseUrl || DEFAULT_SETTINGS.apiBaseUrl),
      owner: trimText(source.owner || DEFAULT_SETTINGS.owner),
      repo: trimText(source.repo || DEFAULT_SETTINGS.repo),
      branch: trimText(source.branch || DEFAULT_SETTINGS.branch) || 'main',
      path: trimText(source.path || DEFAULT_SETTINGS.path) || 'config.json',
      token: trimText(source.token || DEFAULT_SETTINGS.token),
      rememberToken: Boolean(source.rememberToken ?? DEFAULT_SETTINGS.rememberToken),
    };
  }

  function isWorkerMode(settings) {
    return Boolean(normalizeBaseUrl(settings && settings.apiBaseUrl));
  }

  function buildWorkerConfigUrl(apiBaseUrl) {
    return `${normalizeBaseUrl(apiBaseUrl)}/config`;
  }

  function getCurrentGithubFetch() {
    return typeof GitHubContents.fetchCurrentContents === 'function'
      ? GitHubContents.fetchCurrentContents
      : null;
  }

  function getCurrentGithubSave() {
    return typeof GitHubContents.saveContentsToGitHub === 'function'
      ? GitHubContents.saveContentsToGitHub
      : null;
  }

  async function fetchCurrentContents(settings, fetchImpl = root.fetch) {
    const normalized = normalizeMaintenanceSettings(settings);
    const loader = typeof fetchImpl === 'function' ? fetchImpl : root.fetch;

    if (isWorkerMode(normalized)) {
      if (typeof loader !== 'function') {
        throw new Error('Fetch API is not available.');
      }

      const response = await loader(buildWorkerConfigUrl(normalized.apiBaseUrl), {
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response || !response.ok) {
        const status = response && typeof response.status === 'number' ? response.status : 'unknown';
        const error = new Error(`HTTP ${status}`);
        error.status = status;
        throw error;
      }

      const data = await response.json();
      const config = isPlainObject(data) && isPlainObject(data.config) ? data.config : data;

      return {
        path: trimText(data && data.path) || normalized.path,
        sha: trimText(data && data.sha) || '',
        config,
        raw: data,
      };
    }

    const githubFetch = getCurrentGithubFetch();
    if (!githubFetch) {
      throw new Error('GitHubContents helper is not available.');
    }

    return githubFetch(
      {
        owner: normalized.owner,
        repo: normalized.repo,
        branch: normalized.branch,
        path: normalized.path,
        token: normalized.token,
      },
      loader,
    );
  }

  async function saveContentsToBackend(params, fetchImpl = root.fetch) {
    const normalized = normalizeMaintenanceSettings(params);
    const loader = typeof fetchImpl === 'function' ? fetchImpl : root.fetch;

    if (isWorkerMode(normalized)) {
      if (typeof loader !== 'function') {
        throw new Error('Fetch API is not available.');
      }

      const response = await loader(buildWorkerConfigUrl(normalized.apiBaseUrl), {
        method: 'PUT',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          config: params && params.config,
          message: trimText(params && params.message),
          sha: trimText(params && params.sha),
          branch: normalized.branch,
          path: normalized.path,
        }),
      });

      if (!response || !response.ok) {
        const status = response && typeof response.status === 'number' ? response.status : 'unknown';
        const error = new Error(`HTTP ${status}`);
        error.status = status;
        throw error;
      }

      return response.json();
    }

    const githubSave = getCurrentGithubSave();
    if (!githubSave) {
      throw new Error('GitHubContents helper is not available.');
    }

    return githubSave(
      {
        owner: normalized.owner,
        repo: normalized.repo,
        branch: normalized.branch,
        path: normalized.path,
        token: normalized.token,
        sha: trimText(params && params.sha),
        message: trimText(params && params.message),
        config: params && params.config,
      },
      loader,
    );
  }

  const MaintenanceSync = {
    buildWorkerConfigUrl,
    fetchCurrentContents,
    isWorkerMode,
    normalizeMaintenanceSettings,
    saveContentsToBackend,
  };

  root.MaintenanceSync = MaintenanceSync;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MaintenanceSync;
  }
})();
