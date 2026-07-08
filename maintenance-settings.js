(function () {
  const root = typeof globalThis !== 'undefined' ? globalThis : window;

  root.MAINTENANCE_SETTINGS = {
    apiBaseUrl: '',
    owner: 'a0987081481-lgtm',
    repo: 'parking-sign-form',
    branch: 'main',
    path: 'config.json',
    token: '',
    rememberToken: false,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root.MAINTENANCE_SETTINGS;
  }
})();
