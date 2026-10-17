import cytoscape, { type Core, type ElementDefinition, type NodeSingular } from 'cytoscape';
import type { Corpus, Edge } from '../model.ts';
import type { Partition } from '../analysis/clustering.ts';
import type { Positions } from '../analysis/layout.ts';
export const colors = ['#27675d', '#7653a5', '#216d9b', '#996126', '#a3476b', '#597036', '#4c5baf', '#805b37', '#a4493c', '#397e7b'];

export function createRenderer(host: HTMLElement, data: Corpus, onTerm: (id: string) => void, onEdge: (id: string) => void, onMove: (id: string, point: { x: number; y: number }) => void, onRendered: () => void) {
  host.tabIndex = 0; host.setAttribute('role', 'group'); host.setAttribute('aria-label', '用語の関係グラフ。矢印キーで表示を移動できます。プラスキーとマイナスキーで拡大・縮小し、Shift キーと矢印キーで選択した用語を動かせます。');
  const terms = new Map(data.terms.map(term => [term.id, term]));
  const cy: Core = cytoscape({ container: host, elements: [], layout: { name: 'preset' }, minZoom: .02, maxZoom: 5, boxSelectionEnabled: false,
    style: [
      { selector: 'node', style: { 'background-color': 'data(color)', width: 16, height: 16, label: 'data(label)', color: '#203e48', 'font-size': 12, 'min-zoomed-font-size': 8, 'text-valign': 'bottom', 'text-margin-y': 5, 'text-wrap': 'wrap', 'text-max-width': '125px', 'text-background-color': '#f7faf9', 'text-background-opacity': .9, 'text-background-padding': '2px' } },
      { selector: 'edge', style: { width: 1.1, 'line-color': '#bfcdd0', 'target-arrow-color': '#a7b7bc', 'target-arrow-shape': 'triangle', 'curve-style': 'straight', 'arrow-scale': .8, opacity: 1 } },
      { selector: 'edge.parallel, edge:loop', style: { 'curve-style': 'bezier' } },
      { selector: 'edge.lexical', style: { 'line-style': 'dashed', 'line-dash-pattern': [16, 8] } },
      { selector: '.muted', style: { opacity: .22 } },
      { selector: 'node.chosen', style: { width: 24, height: 24, 'border-width': 3, 'border-color': '#102f3e', 'font-weight': 'bold', 'min-zoomed-font-size': 0, 'z-index': 5 } },
      { selector: 'node.hovered', style: { 'min-zoomed-font-size': 0, 'text-background-opacity': 1, 'z-index': 6 } },
      { selector: 'edge.connected', style: { width: 2, 'line-color': '#306c79', 'target-arrow-color': '#306c79', opacity: 1, 'z-index': 4 } },
    ],
  });
  let selected: string | null = null, allowGestures = true, hasFit = false;
  let preparationFrame = 0, preparing = false, prepared = false, stableFrames = 0, previousFrame = 0, stableSince = 0, preparationStarted = 0;
  function applyGestures() {
    const enabled = prepared && allowGestures;
    cy.userPanningEnabled(enabled); cy.userZoomingEnabled(enabled); cy.autoungrabify(!enabled);
    host.style.touchAction = enabled ? 'none' : 'pan-y pinch-zoom';
  }
  // Prepare raster caches during loading rather than on the first interaction.
  // Require a stable presentation window, with a one-second cap on slow devices.
  function prepare() {
    const now = performance.now();
    if (previousFrame && now - previousFrame < 40) stableFrames++;
    else { stableFrames = 0; stableSince = now; }
    previousFrame = now;
    if (now - preparationStarted >= 1000 || stableFrames >= 8 && now - stableSince >= 250) {
      preparationFrame = 0; prepared = true; applyGestures(); onRendered(); return;
    }
    cy.forceRender(); preparationFrame = requestAnimationFrame(prepare);
  }
  cy.on('render', () => {
    if (preparing || prepared || !cy.nodes().length) return;
    preparing = true; preparationStarted = performance.now(); preparationFrame = requestAnimationFrame(prepare);
  });
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
  function zoom(factor: number) { if (!prepared) return; cy.zoom({ level: Math.max(cy.minZoom(), Math.min(cy.maxZoom(), cy.zoom() * factor)), renderedPosition: { x: host.clientWidth / 2, y: host.clientHeight / 2 } }); }
  const keydown = (event: KeyboardEvent) => {
    if (!prepared) return;
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
      // Preserve separate paths for reverse references and mixed evidence kinds.
      const pairKey = (source: string, target: string) => JSON.stringify([source, target].sort());
      const counts = new Map<string, number>();
      for (const edge of edges) {
        const key = pairKey(edge.source, edge.target);
        counts.set(key, (counts.get(key) || 0) + new Set(edge.entries.map(entry => entry.reference.kind)).size);
      }
      for (const edge of edges) for (const kind of new Set(edge.entries.map(entry => entry.reference.kind))) {
        elements.push({ data: { id: `${edge.id}:${kind}`, source: edge.source, target: edge.target, relation: edge.id }, classes: `${kind}${counts.get(pairKey(edge.source, edge.target))! > 1 ? ' parallel' : ''}` });
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
    gestures(enabled: boolean) { allowGestures = enabled; applyGestures(); },
    activate() { cy.resize(); if (!hasFit) fit(); },
    positions(): Positions { return Object.fromEntries(cy.nodes().map(node => [node.id(), { ...node.position() }])); },
    destroy() { cancelAnimationFrame(preparationFrame); resize.disconnect(); host.removeEventListener('keydown', keydown); for (const type of touchEvents) host.removeEventListener(type, passThroughTouch, true); cy.destroy(); },
    get gesturesEnabled() { return allowGestures; },
  };
}
