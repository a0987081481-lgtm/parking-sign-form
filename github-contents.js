(function () {
  const root = typeof globalThis !== 'undefined' ? globalThis : window;
  const ConfigLoader = root.ConfigLoader || {};
  const serializePublicConfig =
    typeof ConfigLoader.serializePublicConfig === 'function'
      ? ConfigLoader.serializePublicConfig
      : (config) => `${JSON.stringify(config, null, 2)}\n`;

  function trimText(value) {
    return String(value ?? '').trim();
  }

  function encodeBase64(text) {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(String(text), 'utf8').toString('base64');
    }

    if (typeof root.btoa === 'function') {
      return root.btoa(unescape(encodeURIComponent(String(text))));
    }

    throw new Error('Base64 encoder is not available.');
  }

  function decodeBase64(text) {
    const raw = String(text ?? '');

    if (typeof Buffer !== 'undefined') {
      return Buffer.from(raw, 'base64').toString('utf8');
    }

    if (typeof root.atob === 'function') {
      return decodeURIComponent(escape(root.atob(raw)));
    }

    throw new Error('Base64 decoder is not available.');
  }

  function buildContentsUrl({ owner, repo, path, branch }) {
    const safeOwner = encodeURIComponent(trimText(owner));
    const safeRepo = encodeURIComponent(trimText(repo));
    const safePath = trimText(path)
      .split('/')
      .filter(Boolean)
      .map((part) => encodeURIComponent(part))
      .join('/');
    const base = `https://api.github.com/repos/${safeOwner}/${safeRepo}/contents/${safePath}`;

    if (!trimText(branch)) {
      return base;
    }

    return `${base}?ref=${encodeURIComponent(trimText(branch))}`;
  }

  function buildAuthHeaders(token) {
    const headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    if (trimText(token)) {
      headers.Authorization = `Bearer ${trimText(token)}`;
    }

    return headers;
  }

  function buildJsonHeaders(token) {
    return {
      ...buildAuthHeaders(token),
      'Content-Type': 'application/json; charset=utf-8',
    };
  }

  function buildContentsUpdatePayload({ owner, repo, path, branch, sha, message, config }) {
    const payload = {
      owner: trimText(owner),
      repo: trimText(repo),
      path: trimText(path),
      branch: trimText(branch),
      sha: trimText(sha),
      message: trimText(message) || 'feat: update config.json',
      content: encodeBase64(serializePublicConfig(config)),
    };

    if (!payload.branch) {
      delete payload.branch;
    }

    if (!payload.sha) {
      delete payload.sha;
    }

    return payload;
  }

  async function fetchCurrentContents(params, fetchImpl = root.fetch) {
    const loader = typeof fetchImpl === 'function' ? fetchImpl : root.fetch;
    if (typeof loader !== 'function') {
      throw new Error('Fetch API is not available.');
    }

    const response = await loader(buildContentsUrl(params), {
      headers: buildAuthHeaders(params && params.token),
    });

    if (!response || !response.ok) {
      const status = response && typeof response.status === 'number' ? response.status : 'unknown';
      const error = new Error(`HTTP ${status}`);
      error.status = status;
      throw error;
    }

    const data = await response.json();
    const rawContent = decodeBase64(data.content || '');
    const parsed = rawContent ? JSON.parse(rawContent) : {};

    return {
      path: data.path || trimText(params.path),
      sha: data.sha || '',
      config: parsed,
      raw: data,
    };
  }

  async function saveContentsToGitHub(params, fetchImpl = root.fetch) {
    const loader = typeof fetchImpl === 'function' ? fetchImpl : root.fetch;
    if (typeof loader !== 'function') {
      throw new Error('Fetch API is not available.');
    }

    const payload = buildContentsUpdatePayload(params);
    const url = buildContentsUrl({
      owner: payload.owner,
      repo: payload.repo,
      path: payload.path,
      branch: '',
    });

    const response = await loader(url, {
      method: 'PUT',
      headers: buildJsonHeaders(params && params.token),
      body: JSON.stringify({
        message: payload.message,
        content: payload.content,
        ...(payload.sha ? { sha: payload.sha } : {}),
        ...(payload.branch ? { branch: payload.branch } : {}),
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

  const GitHubContents = {
    buildContentsUpdatePayload,
    buildContentsUrl,
    fetchCurrentContents,
    saveContentsToGitHub,
  };

  root.GitHubContents = GitHubContents;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = GitHubContents;
  }
})();
