export function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}
export function button(text: string, action: () => void, className = '') {
  const node = el('button', text, className); node.type = 'button'; node.addEventListener('click', action); return node;
}
export function link(text: string, href: string) { const node = el('a', text); node.href = href; return node; }
export function disclosure(title: string, ...children: Node[]) {
  const node = el('details'); node.append(el('summary', title), ...children); return node;
}
let nextId = 0;
export function field(label: string, input: HTMLInputElement | HTMLSelectElement) {
  input.id ||= `field-${++nextId}`;
  const wrapper = el('div', '', 'field'), title = el('label', label); title.htmlFor = input.id;
  wrapper.append(title, input); return wrapper;
}
export function select(options: { id: string; label: string }[], value: string, change: (value: string) => void) {
  const node = el('select');
  for (const option of options) { const item = el('option', option.label); item.value = option.id; node.append(item); }
  node.value = value; node.addEventListener('change', () => change(node.value)); return node;
}
export function message(host: HTMLElement, text: string, error = false) {
  const node = el('p', text, error ? 'error' : 'note'); node.setAttribute('role', error ? 'alert' : 'status'); host.replaceChildren(node);
}
