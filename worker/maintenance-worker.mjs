function trimText(value) {
  return String(value ?? '').trim();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeEnv(env = {}) {
  return {
    token: trimText(env.GITHUB_TOKEN),
    owner: trimText(env.GITHUB_REPO_OWNER),
    repo: trimText(env.GITHUB_REPO_NAME),
    branch: trimText(env.GITHUB_REPO_BRANCH) || 'main',
    path: trimText(env.GITHUB_CONFIG_PATH) || 'config.json',
  };
}

export function encodeUtf8Base64(text) {
  const value = String(text ?? '');

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'utf8').toString('base64');
  }

  if (typeof TextEncoder !== 'undefined' && typeof btoa === 'function') {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }

  throw new Error('Base64 encoder is not available.');
}

export function decodeUtf8Base64(text) {
  const value = String(text ?? '');

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'base64').toString('utf8');
  }

  if (typeof atob === 'function' && typeof TextDecoder !== 'undefined') {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new TextDecoder().decode(bytes);
  }

  throw new Error('Base64 decoder is not available.');
}

export function buildContentsUrl(env, includeBranch = true) {
  const safeOwner = encodeURIComponent(env.owner);
  const safeRepo = encodeURIComponent(env.repo);
  const safePath = trimText(env.path)
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/');
  const base = `https://api.github.com/repos/${safeOwner}/${safeRepo}/contents/${safePath}`;

  if (!includeBranch || !trimText(env.branch)) {
    return base;
  }

  return `${base}?ref=${encodeURIComponent(env.branch)}`;
}

export function buildGithubHeaders(token) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'parking-sign-form',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (trimText(token)) {
    headers.Authorization = `Bearer ${trimText(token)}`;
  }

  return headers;
}

export function buildCorsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,PUT,OPTIONS',
    'access-control-allow-headers': 'Accept, Content-Type, Authorization, X-GitHub-Api-Version',
    'access-control-max-age': '600',
  };
}

export function buildAdminPageUrl(env) {
  const githubEnv = normalizeEnv(env);
  const owner = trimText(githubEnv.owner);
  const repo = trimText(githubEnv.repo);

  if (!owner || !repo) {
    return 'https://github.com';
  }

  return `https://${encodeURIComponent(owner)}.github.io/${encodeURIComponent(repo)}/admin.html`;
}

export function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: {
      ...buildCorsHeaders(),
      'content-type': 'application/json; charset=utf-8',
      ...(init.headers || {}),
    },
  });
}

export async function decodeGithubConfig(env, fetchImpl) {
  const githubEnv = normalizeEnv(env);
  if (!githubEnv.owner || !githubEnv.repo || !githubEnv.path) {
    const error = new Error('GitHub repo settings are incomplete.');
    error.status = 500;
    throw error;
  }

  const response = await fetchImpl(buildContentsUrl(githubEnv, true), {
    headers: buildGithubHeaders(githubEnv.token),
  });

  if (!response || !response.ok) {
    const status = response && typeof response.status === 'number' ? response.status : 'unknown';
    const error = new Error(`HTTP ${status}`);
    error.status = status;
    throw error;
  }

  const data = await response.json();
  const rawContent = String(data.content || '');
  const parsed = rawContent ? JSON.parse(decodeUtf8Base64(rawContent)) : {};

  return {
    path: data.path || githubEnv.path,
    sha: data.sha || '',
    config: parsed,
    raw: data,
  };
}

export async function saveGithubConfig(env, config, message, sha, fetchImpl) {
  const githubEnv = normalizeEnv(env);
  if (!githubEnv.owner || !githubEnv.repo || !githubEnv.path) {
    const error = new Error('GitHub repo settings are incomplete.');
    error.status = 500;
    throw error;
  }

  const payload = {
    message: trimText(message) || 'feat: update config.json',
    content: encodeUtf8Base64(`${JSON.stringify(isPlainObject(config) ? config : {}, null, 2)}\n`),
  };

  if (trimText(sha)) {
    payload.sha = trimText(sha);
  }

  const response = await fetchImpl(buildContentsUrl(githubEnv, false), {
    method: 'PUT',
    headers: {
      ...buildGithubHeaders(githubEnv.token),
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(payload),
  });

  if (!response || !response.ok) {
    const status = response && typeof response.status === 'number' ? response.status : 'unknown';
    const error = new Error(`HTTP ${status}`);
    error.status = status;
    throw error;
  }

  return response.json();
}

export async function handleMaintenanceRequest(request, env = {}, fetchImpl = fetch) {
  const method = request.method.toUpperCase();
  const pathname = new URL(request.url).pathname;

  if ((method === 'GET' || method === 'HEAD') && pathname === '/') {
    return new Response(null, {
      status: 302,
      headers: {
        Location: buildAdminPageUrl(env),
      },
    });
  }

  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: buildCorsHeaders(),
    });
  }

  if (method === 'GET' && (pathname.endsWith('/config') || pathname.endsWith('/config.json'))) {
    const result = await decodeGithubConfig(env, fetchImpl);
    return jsonResponse({
      config: result.config,
      sha: result.sha,
      path: result.path,
      source: 'github',
    });
  }

  if (method === 'PUT' && (pathname.endsWith('/config') || pathname.endsWith('/config.json'))) {
    const body = await request.json().catch(() => ({}));
    const config = isPlainObject(body) && isPlainObject(body.config) ? body.config : body;
    let currentSha = trimText(isPlainObject(body) ? body.sha : '');

    if (!currentSha) {
      try {
        const current = await decodeGithubConfig(env, fetchImpl);
        currentSha = current.sha || '';
      } catch (error) {
        if (!error || error.status !== 404) {
          throw error;
        }
      }
    }

    const result = await saveGithubConfig(env, config, body && body.message, currentSha, fetchImpl);
    return jsonResponse({
      ok: true,
      result,
    });
  }

  return jsonResponse(
    {
      ok: false,
      error: 'Not found',
    },
    { status: 404 },
  );
}

export default {
  fetch(request, env, ctx) {
    return handleMaintenanceRequest(request, env, ctx && typeof ctx.fetch === 'function' ? ctx.fetch : fetch);
  },
};
