import cytoscape, { type Core, type ElementDefinition, type NodeSingular } from 'cytoscape';
import type { Corpus, Edge } from '../model.ts';
import type { Partition } from '../analysis/clustering.ts';
import type { Positions } from '../analysis/layout.ts';
export const colors = ['#27675d', '#7653a5', '#216d9b', '#996126', '#a3476b', '#597036', '#4c5baf', '#805b37', '#a4493c', '#397e7b'];

export function createRenderer(host: HTMLElement, data: Corpus, onTerm: (id: string) => void, onEdge: (id: string) => void, onMove: (id: string, point: { x: number; y: number }) => void, onRendered: () => void) {
  host.tabIndex = 0; host.setAttribute('role', 'group'); host.setAttribute('aria-label', '関係グラフ。矢印キーで表示を移動、プラスとマイナスで拡大縮小。Shift と矢印キーで選択用語を移動。');
  const terms = new Map(data.terms.map(term => [term.id, term]));
  const cy: Core = cytoscape({ container: host, elements: [], layout: { name: 'preset' }, minZoom: .02, maxZoom: 5, boxSelectionEnabled: false,
    style: [
      { selector: 'node', style: { 'background-color': 'data(color)', width: 16, height: 16, label: 'data(label)', color: '#203e48', 'font-size': 12, 'min-zoomed-font-size': 8, 'text-valign': 'bottom', 'text-margin-y': 5, 'text-wrap': 'wrap', 'text-max-width': '125px', 'text-background-color': '#f7faf9', 'text-background-opacity': .9, 'text-background-padding': '2px' } },
      { selector: 'edge', style: { width: 1.1, 'line-color': '#9aafb5', 'target-arrow-color': '#718b93', 'target-arrow-shape': 'triangle', 'curve-style': 'bezier', 'arrow-scale': .8, opacity: .6 } },
      { selector: 'edge.lexical', style: { 'line-style': 'dashed' } },
      { selector: '.muted', style: { opacity: .22 } },
      { selector: 'node.chosen', style: { width: 24, height: 24, 'border-width': 3, 'border-color': '#102f3e', 'font-weight': 'bold', 'min-zoomed-font-size': 0, 'z-index': 5 } },
      { selector: 'node.hovered', style: { 'min-zoomed-font-size': 0, 'text-background-opacity': 1, 'z-index': 6 } },
      { selector: 'edge.connected', style: { width: 2, 'line-color': '#306c79', 'target-arrow-color': '#306c79', opacity: 1, 'z-index': 4 } },
    ],
  });
  // Readiness means pixels have been drawn, not just that elements were queued.
  cy.on('render', () => { if (cy.nodes().length) onRendered(); });
  let selected: string | null = null, allowGestures = true, hasFit = false;
  // Keep Cytoscape's touch handlers from claiming article scrolling while the
  // embedded graph is inactive. Native scrolling and page pinch remain enabled.
  const touchEvents = ['touchstart', 'touchmove', 'touchend', 'touchcancel'];
  const passThroughTouch = (event: Event) => { if (!allowGestures) event.stopImmediatePropagation(); };
  for (const type of touchEvents) host.addEventListener(type, passThroughTouch, { capture: true });
  cy.on('mouseover', 'node', event => event.target.addClass('hovered'));
  cy.on('mouseout', 'node', event => event.target.removeClass('hovered'));
  cy.on('tap', 'node', event => onTerm(event.target.id()));
  cy.on('tap', 'edge', event => onEdge(event.target.data('relation')));
  cy.on('dragfree', 'node', event => { const node = event.target as NodeSingular; onMove(node.id(), { ...node.position() }); });
  let previousWidth = host.clientWidth, previousHeight = host.clientHeight;
  const resize = new ResizeObserver(() => {
    const changed = host.clientWidth !== previousWidth || host.clientHeight !== previousHeight;
    previousWidth = host.clientWidth; previousHeight = host.clientHeight; cy.resize();
    if (changed && hasFit) {
      const node = selected ? cy.getElementById(selected) : null;
      if (node?.length) cy.center(node); else fit();
    }
  }); resize.observe(host);
  function fit() { if (cy.nodes().length && host.clientWidth && host.clientHeight) { cy.resize(); cy.fit(cy.elements(), 45); hasFit = true; } }
  function zoom(factor: number) { cy.zoom({ level: Math.max(cy.minZoom(), Math.min(cy.maxZoom(), cy.zoom() * factor)), renderedPosition: { x: host.clientWidth / 2, y: host.clientHeight / 2 } }); }
  const keydown = (event: KeyboardEvent) => {
    const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (directions[event.key]) {
      event.preventDefault(); const [x, y] = directions[event.key];
      if (event.shiftKey && selected && cy.getElementById(selected).length) {
        const node = cy.getElementById(selected), current = node.position(), point = { x: current.x + x * 15 / cy.zoom(), y: current.y + y * 15 / cy.zoom() };
        node.position(point); onMove(selected, point);
      } else cy.panBy({ x: -x * 35, y: -y * 35 });
    } else if (['+', '=', '-', '0'].includes(event.key)) { event.preventDefault(); if (event.key === '0') fit(); else zoom(event.key === '-' ? 1 / 1.25 : 1.25); }
  };
  host.addEventListener('keydown', keydown);
  function highlight() {
    cy.elements().removeClass('muted chosen connected');
    if (!selected || !cy.getElementById(selected).length) return;
    const node = cy.getElementById(selected), neighborhood = node.closedNeighborhood();
    cy.elements().not(neighborhood).addClass('muted'); node.addClass('chosen'); node.connectedEdges().addClass('connected');
  }
  return {
    update(ids: string[], edges: Edge[], partition: Partition, positions: Positions, selection: string | null, group: number | null, shouldFit: boolean) {
      selected = selection;
      const membership = new Map(partition.groups.flatMap((members, i) => members.map(id => [id, i] as const)));
      const elements: ElementDefinition[] = ids.map(id => ({ data: { id, label: terms.get(id)!.heading, color: colors[membership.get(id)! % colors.length] }, position: positions[id] }));
      for (const edge of edges) for (const kind of new Set(edge.entries.map(entry => entry.reference.kind))) {
        elements.push({ data: { id: `${edge.id}:${kind}`, source: edge.source, target: edge.target, relation: edge.id }, classes: kind });
      }
      cy.batch(() => {
        cy.elements().remove(); cy.add(elements);
        if (group === null) highlight();
        else {
          cy.nodes().filter(node => membership.get(node.id()) !== group).addClass('muted');
          cy.edges().forEach(edge => {
            const internal = membership.get(edge.source().id()) === group && membership.get(edge.target().id()) === group;
            edge.addClass(internal ? 'connected' : 'muted');
          });
        }
      });
      host.dataset.nodes = String(ids.length); host.dataset.edges = String(edges.length);
      if (shouldFit) fit();
    },
    select(id: string | null) { selected = id; cy.batch(highlight); },
    fit, zoom,
    gestures(enabled: boolean) { allowGestures = enabled; cy.userPanningEnabled(enabled); cy.userZoomingEnabled(enabled); cy.autoungrabify(!enabled); host.style.touchAction = enabled ? 'none' : 'pan-y pinch-zoom'; },
    activate() { cy.resize(); if (!hasFit) fit(); },
    positions(): Positions { return Object.fromEntries(cy.nodes().map(node => [node.id(), { ...node.position() }])); },
    destroy() { resize.disconnect(); host.removeEventListener('keydown', keydown); for (const type of touchEvents) host.removeEventListener(type, passThroughTouch, true); cy.destroy(); },
    get gesturesEnabled() { return allowGestures; },
  };
}
