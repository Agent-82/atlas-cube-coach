export const ATLAS_STAGE_NAMES = [
  'Make Daisy',
  'White Cross',
  'White Corners',
  'Middle-Layer Edges',
  'Yellow Cross',
  'Yellow Cross Side Colours',
  'Position Yellow Corners',
  'Orient Yellow Corners'
];

export const SOLVED_STAGE = {
  key: 'solved',
  index: 9,
  label: 'Solved',
  display: 'SOLVED'
};

const STAGES = ATLAS_STAGE_NAMES.map((label, index) => ({
  key: `step-${index + 1}`,
  index: index + 1,
  label,
  display: `Step ${index + 1} · ${label}`
}));

const FACE_STARTS = { U: 0, R: 9, F: 18, D: 27, L: 36, B: 45 };
const FACE_ORDER = ['U', 'R', 'F', 'D', 'L', 'B'];
const U_EDGES = [
  { u: 1, side: 46, face: 'B' },
  { u: 3, side: 37, face: 'L' },
  { u: 5, side: 10, face: 'R' },
  { u: 7, side: 19, face: 'F' }
];
const D_EDGES = [
  { d: 28, side: 25, face: 'F' },
  { d: 30, side: 43, face: 'L' },
  { d: 32, side: 16, face: 'R' },
  { d: 34, side: 52, face: 'B' }
];
const D_CORNERS = [
  { name: 'DFR', stickers: [29, 26, 15], faces: ['D', 'F', 'R'] },
  { name: 'DLF', stickers: [27, 44, 24], faces: ['D', 'L', 'F'] },
  { name: 'DBL', stickers: [33, 53, 42], faces: ['D', 'B', 'L'] },
  { name: 'DRB', stickers: [35, 17, 51], faces: ['D', 'R', 'B'] }
];

export function detectAtlasStage(facelets) {
  const clean = normalizeFacelets(facelets);
  if (clean.length !== 54) return STAGES[0];

  const centers = getCenters(clean);
  if (isSolved(clean, centers)) return SOLVED_STAGE;

  const firstLayer = hasFirstLayer(clean, centers);
  const firstTwoLayers = firstLayer && hasMiddleLayer(clean, centers);
  const yellowCross = hasYellowCross(clean, centers);
  const yellowEdgesAligned = yellowCross && hasYellowEdgesAligned(clean, centers);

  if (firstTwoLayers && yellowEdgesAligned && hasPositionedYellowCorners(clean, centers)) return STAGES[7];
  if (firstTwoLayers && yellowEdgesAligned) return STAGES[6];
  if (firstTwoLayers && yellowCross) return STAGES[5];
  if (firstTwoLayers) return STAGES[4];
  if (firstLayer) return STAGES[3];
  if (hasWhiteCross(clean, centers)) return STAGES[2];
  if (hasDaisy(clean, centers)) return STAGES[1];
  return STAGES[0];
}

export function normalizeFacelets(value) {
  if (typeof value === 'string') return value.replace(/\s+/g, '').toUpperCase();
  if (Array.isArray(value)) return value.join('').toUpperCase();
  return String(value || '').replace(/\s+/g, '').toUpperCase();
}

function getCenters(facelets) {
  return {
    U: facelets[4],
    R: facelets[13],
    F: facelets[22],
    D: facelets[31],
    L: facelets[40],
    B: facelets[49]
  };
}

function isSolved(facelets, centers) {
  return FACE_ORDER.every(face => {
    const start = FACE_STARTS[face];
    return indexes(start, start + 8).every(index => facelets[index] === centers[face]);
  });
}

function hasDaisy(facelets, centers) {
  return [28, 30, 32, 34].every(index => facelets[index] === centers.U);
}

function hasWhiteCross(facelets, centers) {
  return U_EDGES.every(edge => (
    facelets[edge.u] === centers.U &&
    facelets[edge.side] === centers[edge.face]
  ));
}

function hasFirstLayer(facelets, centers) {
  const uFaceSolved = indexes(0, 8).every(index => facelets[index] === centers.U);
  const sideTopRowsSolved = ['R', 'F', 'L', 'B'].every(face => {
    const start = FACE_STARTS[face];
    return [start, start + 1, start + 2].every(index => facelets[index] === centers[face]);
  });
  return uFaceSolved && sideTopRowsSolved;
}

function hasMiddleLayer(facelets, centers) {
  return ['R', 'F', 'L', 'B'].every(face => {
    const start = FACE_STARTS[face];
    return [start + 3, start + 4, start + 5].every(index => facelets[index] === centers[face]);
  });
}

function hasYellowCross(facelets, centers) {
  return [28, 30, 32, 34].every(index => facelets[index] === centers.D);
}

function hasYellowEdgesAligned(facelets, centers) {
  return D_EDGES.every(edge => facelets[edge.side] === centers[edge.face]);
}

function hasPositionedYellowCorners(facelets, centers) {
  return D_CORNERS.every(corner => {
    const actual = sortedTokens(corner.stickers.map(index => facelets[index]));
    const expected = sortedTokens(corner.faces.map(face => centers[face]));
    return actual === expected;
  });
}

function sortedTokens(tokens) {
  return tokens.slice().sort().join('');
}

function indexes(start, end) {
  return Array.from({ length: end - start + 1 }, (_, offset) => start + offset);
}
