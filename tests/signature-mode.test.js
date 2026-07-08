const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

class FakeClassList {
  constructor(owner) {
    this.owner = owner;
    this.values = new Set();
  }

  add(...tokens) {
    tokens.filter(Boolean).forEach((token) => this.values.add(token));
    this.sync();
  }

  remove(...tokens) {
    tokens.filter(Boolean).forEach((token) => this.values.delete(token));
    this.sync();
  }

  toggle(token, force) {
    if (force === true) {
      this.values.add(token);
      this.sync();
      return true;
    }

    if (force === false) {
      this.values.delete(token);
      this.sync();
      return false;
    }

    if (this.values.has(token)) {
      this.values.delete(token);
      this.sync();
      return false;
    }

    this.values.add(token);
    this.sync();
    return true;
  }

  contains(token) {
    return this.values.has(token);
  }

  sync() {
    this.owner._className = Array.from(this.values).join(' ');
  }
}

function dataAttributeToDatasetKey(attributeName) {
  return attributeName
    .replace(/^data-/, '')
    .split('-')
    .map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join('');
}

function parseSelector(selector) {
  const match = selector.trim().match(/^([a-z0-9-]+)?(?:\[([a-z0-9-]+)(?:="([^"]*)")?\])?$/i);
  if (!match) {
    throw new Error(`Unsupported selector in test DOM: ${selector}`);
  }

  return {
    tagName: match[1] ? match[1].toUpperCase() : null,
    attributeName: match[2] || null,
    attributeValue: typeof match[3] === 'string' ? match[3] : null,
  };
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.attributes = {};
    this.style = {};
    this._className = '';
    this._innerHTML = '';
    this._textContent = '';
    this.id = '';
    this.value = '';
    this.type = '';
    this.placeholder = '';
    this.rows = 0;
    this.required = false;
    this.checked = false;
    this.disabled = false;
    this.src = '';
    this.alt = '';
    this.width = 0;
    this.height = 0;
    this.classList = new FakeClassList(this);
  }

  get className() {
    return this._className;
  }

  set className(value) {
    this._className = String(value || '');
    this.classList.values = new Set(this._className.split(/\s+/).filter(Boolean));
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    this._innerHTML = String(value || '');
    this.children = [];
  }

  get textContent() {
    return this._textContent;
  }

  set textContent(value) {
    this._textContent = String(value || '');
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    const normalizedName = String(name);
    const normalizedValue = String(value);
    this.attributes[normalizedName] = normalizedValue;
    if (normalizedName === 'id') {
      this.id = normalizedValue;
    }
    if (normalizedName.startsWith('data-')) {
      this.dataset[dataAttributeToDatasetKey(normalizedName)] = normalizedValue;
    }
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
  }

  addEventListener() {}

  getBoundingClientRect() {
    return { width: 320, height: 180, top: 0, left: 0, right: 320, bottom: 180 };
  }

  scrollIntoView() {}

  setPointerCapture() {}

  releasePointerCapture() {}

  getContext() {
    if (this.tagName !== 'CANVAS') {
      return null;
    }

    return {
      clearRect() {},
      fillRect() {},
      setTransform() {},
      drawImage() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      stroke() {},
      lineCap: 'round',
      lineJoin: 'round',
      strokeStyle: '#000000',
      fillStyle: '#ffffff',
      lineWidth: 1,
    };
  }

  toDataURL() {
    return 'data:image/png;base64,ZmFrZQ==';
  }

  matchesSelector(selector) {
    const parsed = parseSelector(selector);
    if (parsed.tagName && this.tagName !== parsed.tagName) {
      return false;
    }

    if (!parsed.attributeName) {
      return true;
    }

    const datasetKey = parsed.attributeName.startsWith('data-')
      ? dataAttributeToDatasetKey(parsed.attributeName)
      : null;
    const actualValue = datasetKey
      ? this.dataset[datasetKey]
      : this.attributes[parsed.attributeName];

    if (typeof actualValue === 'undefined') {
      return false;
    }

    if (parsed.attributeValue === null) {
      return true;
    }

    return String(actualValue) === parsed.attributeValue;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      if (node instanceof FakeElement && node.matchesSelector(selector)) {
        matches.push(node);
      }
      node.children.forEach(visit);
    };
    this.children.forEach(visit);
    return matches;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

function createFakeDom() {
  const ids = [
    'app',
    'form-paper',
    'form-header',
    'form-title',
    'basic-section',
    'device-action-section',
    'device-list',
    'note-section',
    'signature-section',
    'form-footer',
    'action-buttons',
    'export-timestamp-value',
  ];

  const body = new FakeElement('body');
  const elements = new Map();
  ids.forEach((id) => {
    const tagName = id === 'form-title' || id === 'export-timestamp-value' ? 'strong' : 'section';
    const element = new FakeElement(tagName);
    element.id = id;
    elements.set(id, element);
  });

  const document = {
    readyState: 'complete',
    body,
    addEventListener() {},
    createElement(tagName) {
      return new FakeElement(tagName);
    },
    getElementById(id) {
      return elements.get(id) || null;
    },
    querySelector(selector) {
      return body.querySelector(selector);
    },
    querySelectorAll(selector) {
      return body.querySelectorAll(selector);
    },
  };

  return { document, elements };
}

function loadApp() {
  const appPath = path.join(__dirname, '..', 'app.js');
  const source = fs.readFileSync(appPath, 'utf8');
  const dom = createFakeDom();

  const context = {
    console,
    document: dom.document,
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
      removeItem() {},
      clear() {},
    },
    navigator: { userAgent: 'node' },
    setTimeout,
    clearTimeout,
    confirm() {
      return true;
    },
    prompt() {
      return '';
    },
    print() {},
    addEventListener() {},
    devicePixelRatio: 1,
  };

  context.window = context;
  context.globalThis = context;
  context.HTMLElement = FakeElement;
  context.HTMLCanvasElement = FakeElement;

  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'app.js' });

  return { app: context.ParkingSignForm, dom };
}

function collectElements(root, predicate, results = []) {
  if (predicate(root)) {
    results.push(root);
  }
  root.children.forEach((child) => collectElements(child, predicate, results));
  return results;
}

test('簽名頁初始化時不應該因為缺少按鈕工廠而炸掉', () => {
  const { dom } = loadApp();
  const signatureSection = dom.elements.get('signature-section');

  assert.equal(signatureSection.dataset.mode, 'summary');
  assert.ok(
    collectElements(signatureSection, (element) => element.className === 'signature-summary-card').length >= 1
  );
});

test('獨立簽名模式一次只顯示一個簽名人', () => {
  const { app, dom } = loadApp();
  const signatureSection = dom.elements.get('signature-section');

  app.setSignatureMode(true);

  const canvases = collectElements(signatureSection, (element) => element.tagName === 'CANVAS');
  const signatureCards = collectElements(signatureSection, (element) => element.className === 'signature-card');
  const switchButtons = collectElements(
    signatureSection,
    (element) => element.tagName === 'BUTTON' && element.dataset.action === 'switch-signature-key'
  );

  assert.equal(signatureSection.dataset.mode, 'editor');
  assert.equal(canvases.length, 1);
  assert.equal(signatureCards.length, 1);
  assert.equal(switchButtons.length, 2);
});

test('簽名模式會保留底部安全空間避免手機工具列遮住畫布', () => {
  const stylePath = path.join(__dirname, '..', 'style.css');
  const css = fs.readFileSync(stylePath, 'utf8');

  assert.match(
    css,
    /body\.signature-mode #signature-section\s*\{[\s\S]*padding-bottom:\s*calc\(22px\s*\+\s*env\(safe-area-inset-bottom\)\s*\+\s*96px\);/,
  );
});

test('簽名模式會把簽名區鎖成固定高度避免手機頁面外捲', () => {
  const stylePath = path.join(__dirname, '..', 'style.css');
  const css = fs.readFileSync(stylePath, 'utf8');

  assert.match(
    css,
    /body\.signature-mode #app\s*\{[\s\S]*height:\s*100dvh;[\s\S]*padding:\s*12px 0;[\s\S]*box-sizing:\s*border-box;[\s\S]*\}[\s\S]*body\.signature-mode \.form-paper\s*\{[\s\S]*height:\s*100%;[\s\S]*min-height:\s*0;[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;[\s\S]*\}[\s\S]*body\.signature-mode #signature-section\s*\{[\s\S]*min-height:\s*0;[\s\S]*overflow-y:\s*auto;[\s\S]*-webkit-overflow-scrolling:\s*touch;[\s\S]*touch-action:\s*pan-y;[\s\S]*overscroll-behavior-y:\s*contain;/,
  );
});
