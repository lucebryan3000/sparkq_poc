import fs from 'fs';
import path from 'path';
import vm from 'vm';

function createFakeElement(tag) {
  return {
    tagName: tag.toUpperCase(),
    children: [],
    style: {},
    className: '',
    textContent: '',
    value: '',
    placeholder: '',
    rows: 0,
    parentNode: null,
    listeners: {},
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
      return child;
    },
    removeChild(child) {
      this.children = this.children.filter((c) => c !== child);
    },
    remove() {
      if (this.parentNode) {
        this.parentNode.removeChild(this);
      }
    },
    querySelector(selector) {
      const match = (node) => {
        if (selector.startsWith('.')) {
          return (node.className || '').includes(selector.slice(1));
        }
        const tagName = selector.replace(/[.#].*$/, '').toUpperCase();
        return node.tagName === tagName;
      };
      const stack = [...this.children];
      while (stack.length) {
        const node = stack.shift();
        if (match(node)) return node;
        stack.push(...(node.children || []));
      }
      return null;
    },
    addEventListener(type, fn) {
      this.listeners[type] = fn;
    },
    dispatchEvent(evt) {
      const fn = this.listeners[evt.type];
      if (fn) fn(evt);
    },
    focus() {},
    select() {},
    click() {
      if (typeof this.onclick === 'function') {
        this.onclick({ preventDefault() {}, target: this });
      }
    },
  };
}

function setupDom() {
  const listeners = {};
  const body = createFakeElement('body');
  const document = {
    body,
    listeners,
    createElement: (tag) => createFakeElement(tag),
    addEventListener: (type, fn) => {
      (listeners[type] = listeners[type] || []).push(fn);
    },
    dispatchEvent: (type, event) => {
      (listeners[type] || []).forEach((fn) => fn(event));
    },
  };
  const window = { document };
  return { window, document, listeners };
}

function loadUtils(window, document) {
  const utilsPath = path.join(process.cwd(), 'sparkq/ui/utils/ui-utils.js');
  const code = fs.readFileSync(utilsPath, 'utf8');
  const context = { window, document, console, setTimeout, clearTimeout };
  vm.runInNewContext(code, context);
  return context.window.Utils;
}

describe('ui-utils modal helpers', () => {
  test('showPrompt resolves with input value on Enter', async () => {
    const { window, document, listeners } = setupDom();
    const Utils = loadUtils(window, document);

    const promise = Utils.showPrompt('Title', 'Message', 'Default Name');

    // simulate Enter key to submit primary button
    const handler = (listeners['keydown'] || [])[0];
    expect(handler).toBeDefined();
    handler({ key: 'Enter', preventDefault() {} });

    const result = await promise;
    expect(result).toBe('Default Name');
  });

  test('showPrompt resolves null on Escape (cancel)', async () => {
    const { window, document, listeners } = setupDom();
    const Utils = loadUtils(window, document);

    const promise = Utils.showPrompt('Title', 'Message', 'Something');
    const handler = (listeners['keydown'] || [])[0];
    expect(handler).toBeDefined();
    handler({ key: 'Escape', preventDefault() {} });

    const result = await promise;
    expect(result).toBeNull();
  });
});
