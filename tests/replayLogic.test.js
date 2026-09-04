import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advanceReplayClock,
  advanceReplayPreroll,
  captureStartFacelets,
  createReplayPrerollSnapshot,
  createReplaySnapshot,
  getReplayEligibility,
  getReplayPrerollDuration,
  moveIndexAtTime,
  timeForMoveIndex
} from '../src/replayLogic.js';

const moves = [
  { move: 'R', elapsedMs: 0, gapMs: 0 },
  { move: 'U', elapsedMs: 1000, gapMs: 1000 },
  { move: "R'", elapsedMs: 11000, gapMs: 10000 },
  { move: 'U2', elapsedMs: 11500, gapMs: 500 }
];

test('maps recorded time to completed move index', () => {
  assert.equal(moveIndexAtTime(moves, -1), -1);
  assert.equal(moveIndexAtTime(moves, 0), 0);
  assert.equal(moveIndexAtTime(moves, 999), 0);
  assert.equal(moveIndexAtTime(moves, 1000), 1);
  assert.equal(moveIndexAtTime(moves, 10999), 1);
  assert.equal(moveIndexAtTime(moves, 11000), 2);
  assert.equal(moveIndexAtTime(moves, 99999), 3);
});

test('maps move index to recorded time', () => {
  assert.equal(timeForMoveIndex(moves, -1), 0);
  assert.equal(timeForMoveIndex(moves, 0), 0);
  assert.equal(timeForMoveIndex(moves, 2), 11000);
  assert.equal(timeForMoveIndex(moves, 50), 11500);
});

test('converts playback speed into recorded clock advancement', () => {
  assert.equal(advanceReplayClock(1000, 1000, 0.5, 10000), 1500);
  assert.equal(advanceReplayClock(1000, 1000, 1, 10000), 2000);
  assert.equal(advanceReplayClock(1000, 1000, 2, 10000), 3000);
  assert.equal(advanceReplayClock(1000, 1000, 4, 10000), 5000);
});

test('clamps replay clock around zero and large gaps', () => {
  assert.equal(advanceReplayClock(9500, 1000, 4, 10000), 10000);
  assert.equal(moveIndexAtTime(moves, 5000), 1);
});

test('creates deterministic replay snapshots from recorded time', () => {
  const solve = { moves, durationMs: 12000 };
  assert.deepEqual(createReplaySnapshot(solve, 5000), {
    phase: 'recorded',
    timeMs: 5000,
    moveIndex: 1,
    moveNumber: 2,
    currentMove: 'U',
    alg: 'R U',
    visualizerTimeMs: 2000
  });
});

test('restart is pre-move state with no active move', () => {
  const solve = { moves, durationMs: 12000 };
  assert.equal(getReplayPrerollDuration(solve), 220);
  assert.deepEqual(createReplayPrerollSnapshot(solve, 0), {
    phase: 'preroll',
    timeMs: 0,
    prerollMs: 0,
    prerollDurationMs: 220,
    moveIndex: -1,
    moveNumber: 0,
    currentMove: null,
    alg: '',
    visualizerTimeMs: 0,
    prerollComplete: false
  });
});

test('play from beginning animates move one during pre-roll', () => {
  const solve = { moves, durationMs: 12000 };
  const snapshot = createReplayPrerollSnapshot(solve, 110);
  assert.equal(snapshot.phase, 'preroll');
  assert.equal(snapshot.timeMs, 0);
  assert.equal(snapshot.moveIndex, -1);
  assert.equal(snapshot.visualizerTimeMs, 500);
  assert.equal(snapshot.prerollComplete, false);
});

test('after pre-roll completes, move one is complete at recorded time zero', () => {
  const solve = { moves, durationMs: 12000 };
  const prerollSnapshot = createReplayPrerollSnapshot(solve, 220);
  assert.equal(prerollSnapshot.timeMs, 0);
  assert.equal(prerollSnapshot.visualizerTimeMs, 1000);
  assert.equal(prerollSnapshot.prerollComplete, true);

  const snapshot = createReplaySnapshot(solve, 0);
  assert.equal(snapshot.phase, 'recorded');
  assert.equal(snapshot.timeMs, 0);
  assert.equal(snapshot.moveIndex, 0);
  assert.equal(snapshot.currentMove, 'R');
  assert.equal(snapshot.visualizerTimeMs, 1000);
});

test('finishes a move animation at its recorded timestamp', () => {
  const solve = { moves, durationMs: 12000 };
  assert.equal(createReplaySnapshot(solve, 779).visualizerTimeMs, 1000);
  assert.equal(createReplaySnapshot(solve, 890).visualizerTimeMs, 1500);
  assert.equal(createReplaySnapshot(solve, 1000).visualizerTimeMs, 2000);
});

test('holds previous state through long gaps until near the next completion', () => {
  const solve = { moves, durationMs: 12000 };
  assert.equal(createReplaySnapshot(solve, 5000).visualizerTimeMs, 2000);
  assert.equal(createReplaySnapshot(solve, 10779).visualizerTimeMs, 2000);
  assert.equal(createReplaySnapshot(solve, 10890).visualizerTimeMs, 2500);
  assert.equal(createReplaySnapshot(solve, 11000).visualizerTimeMs, 3000);
});

test('clamps visual turn duration for fast consecutive moves', () => {
  const solve = { moves, durationMs: 12000 };
  assert.equal(createReplaySnapshot(solve, 11279).visualizerTimeMs, 3000);
  assert.equal(createReplaySnapshot(solve, 11390).visualizerTimeMs, 3750);
  assert.equal(createReplaySnapshot(solve, 11500).visualizerTimeMs, 4500);
});

test('holds final state from the final move timestamp through duration tail', () => {
  const solve = { moves, durationMs: 12000 };
  assert.equal(createReplaySnapshot(solve, 11500).visualizerTimeMs, 4500);
  assert.equal(createReplaySnapshot(solve, 12000).visualizerTimeMs, 4500);
});

test('playback speed advances recorded clock without changing time mapping', () => {
  const solve = { moves, durationMs: 12000 };
  const directRecordedTime = 890;
  const advancedRecordedTime = advanceReplayClock(780, 55, 2, solve.durationMs);
  assert.equal(advancedRecordedTime, directRecordedTime);
  assert.equal(
    createReplaySnapshot(solve, advancedRecordedTime).visualizerTimeMs,
    createReplaySnapshot(solve, directRecordedTime).visualizerTimeMs
  );
});

test('pre-roll scales its wall-clock duration with playback speed', () => {
  const solve = { moves, durationMs: 12000 };
  assert.equal(advanceReplayPreroll(0, 110, 0.5, solve), 55);
  assert.equal(advanceReplayPreroll(0, 110, 1, solve), 110);
  assert.equal(advanceReplayPreroll(0, 110, 2, solve), 220);
  assert.equal(advanceReplayPreroll(0, 110, 4, solve), 220);
  assert.equal(advanceReplayPreroll(0, 440, 0.5, solve), 220);
  assert.equal(advanceReplayPreroll(0, 220, 1, solve), 220);
  assert.equal(advanceReplayPreroll(0, 110, 2, solve), 220);
  assert.equal(advanceReplayPreroll(0, 55, 4, solve), 220);
});

test('allows solved legacy replay with end anchor', () => {
  const eligibility = getReplayEligibility({ moves, reason: 'solved-state' });
  assert.equal(eligibility.ok, true);
  assert.equal(eligibility.mode, 'legacy-solved-end');
  assert.equal(eligibility.setupAnchor, 'end');
});

test('rejects unfinished legacy replay without a recorded start', () => {
  const eligibility = getReplayEligibility({ moves, reason: 'manual' });
  assert.equal(eligibility.ok, false);
  assert.equal(eligibility.mode, 'legacy-unfinished');
});

test('captures startFacelets only from a real live facelet state', () => {
  const facelets = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
  assert.equal(captureStartFacelets(false, facelets), null);
  assert.equal(captureStartFacelets(true, 'too-short'), null);
  assert.equal(captureStartFacelets(true, facelets), facelets);
});
