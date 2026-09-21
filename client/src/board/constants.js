export const PALETTE = [
  '#ffd166', // sun
  '#ff8fab', // rose
  '#7ae582', // mint
  '#6cc4ff', // sky
  '#b69cff', // violet
  '#ff9f68', // tangerine
  '#f4f4f5', // paper
  '#a1a1aa', // slate
];

export const DEFAULT_COLOR = PALETTE[0];

export const TOOLS = [
  { id: 'select', label: 'Select', key: 'V', icon: 'select' },
  { id: 'hand', label: 'Pan', key: 'H', icon: 'hand' },
  { id: 'sticky', label: 'Sticky note', key: 'N', icon: 'sticky' },
  { id: 'rect', label: 'Rectangle', key: 'R', icon: 'rect' },
  { id: 'ellipse', label: 'Ellipse', key: 'O', icon: 'ellipse' },
  { id: 'text', label: 'Text', key: 'T', icon: 'text' },
  { id: 'arrow', label: 'Arrow', key: 'A', icon: 'arrow' },
  { id: 'pen', label: 'Pen', key: 'P', icon: 'pen' },
];

export const BOX_TYPES = ['sticky', 'rect', 'ellipse', 'text'];
export const TEXT_TYPES = ['sticky', 'rect', 'ellipse', 'text'];
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;
