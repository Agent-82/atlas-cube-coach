import assert from 'node:assert/strict';
import test from 'node:test';
import { detectAtlasStage } from '../src/stageRecognition.js';

const SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';

function baseUnknown() {
  const facelets = Array(54).fill('X');
  for (const [index, token] of [[4, 'U'], [13, 'R'], [22, 'F'], [31, 'D'], [40, 'L'], [49, 'B']]) {
    facelets[index] = token;
  }
  return facelets;
}

function solved() {
  return [...SOLVED];
}

function labelFor(facelets) {
  return detectAtlasStage(facelets.join('')).label;
}

test('detects Step 1 when Daisy is incomplete', () => {
  assert.equal(labelFor(baseUnknown()), 'Make Daisy');
});

test('detects Step 2 when Daisy is complete but White Cross is not', () => {
  const facelets = baseUnknown();
  for (const index of [28, 30, 32, 34]) facelets[index] = 'U';
  assert.equal(labelFor(facelets), 'White Cross');
});

test('detects Step 3 when White Cross is complete but first layer is not', () => {
  const facelets = baseUnknown();
  for (const [whiteIndex, sideIndex, sideToken] of [[1, 46, 'B'], [3, 37, 'L'], [5, 10, 'R'], [7, 19, 'F']]) {
    facelets[whiteIndex] = 'U';
    facelets[sideIndex] = sideToken;
  }
  assert.equal(labelFor(facelets), 'White Corners');
});

test('detects Step 4 when first layer is complete but middle layer is not', () => {
  const facelets = solved();
  facelets[21] = 'X';
  assert.equal(labelFor(facelets), 'Middle-Layer Edges');
});

test('detects Step 5 when first two layers are complete but Yellow Cross is not', () => {
  const facelets = solved();
  facelets[28] = 'X';
  assert.equal(labelFor(facelets), 'Yellow Cross');
});

test('detects Step 6 when Yellow Cross is complete but side colours are not aligned', () => {
  const facelets = solved();
  [facelets[25], facelets[16]] = [facelets[16], facelets[25]];
  assert.equal(labelFor(facelets), 'Yellow Cross Side Colours');
});

test('detects Step 7 when yellow cross side colours are aligned but corners are misplaced', () => {
  const facelets = solved();
  const dfr = [facelets[29], facelets[26], facelets[15]];
  const dlf = [facelets[27], facelets[44], facelets[24]];
  [facelets[29], facelets[26], facelets[15]] = dlf;
  [facelets[27], facelets[44], facelets[24]] = dfr;
  assert.equal(labelFor(facelets), 'Position Yellow Corners');
});

test('detects Step 8 when yellow corners are positioned by colour set but unoriented', () => {
  const facelets = solved();
  [facelets[29], facelets[26], facelets[15]] = [facelets[26], facelets[15], facelets[29]];
  [facelets[27], facelets[44], facelets[24]] = [facelets[44], facelets[24], facelets[27]];
  [facelets[33], facelets[53], facelets[42]] = [facelets[53], facelets[42], facelets[33]];
  [facelets[35], facelets[17], facelets[51]] = [facelets[17], facelets[51], facelets[35]];
  assert.equal(labelFor(facelets), 'Orient Yellow Corners');
});

test('detects solved cube', () => {
  assert.equal(labelFor(solved()), 'Solved');
});

test('derives face tokens from centres for colour-letter facelets', () => {
  const facelets = 'WWWWWWWWWRRRRRRRRRGGGGGGGGGYYYYYYYYYOOOOOOOOOBBBBBBBBB';
  assert.equal(detectAtlasStage(facelets).label, 'Solved');
});
