const SOLVED_FACELETS = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
const NOMINAL_RECORDED_TURN_MS = 220;

export function clampReplayTime(ms, durationMs) {
  const duration = Number.isFinite(Number(durationMs)) ? Number(durationMs) : 0;
  const value = Number.isFinite(Number(ms)) ? Number(ms) : 0;
  return Math.min(Math.max(0, value), Math.max(0, duration));
}

export function getReplayPrerollDuration(solve) {
  return firstMovePrerollMs(solve?.moves || []);
}

export function moveIndexAtTime(moves, timeMs) {
  if (!Array.isArray(moves) || !moves.length) return -1;
  const time = Number.isFinite(Number(timeMs)) ? Number(timeMs) : 0;
  let low = 0;
  let high = moves.length - 1;
  let result = -1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (Number(moves[mid]?.elapsedMs) <= time) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return result;
}

export function timeForMoveIndex(moves, index) {
  if (!Array.isArray(moves) || !moves.length || index < 0) return 0;
  const move = moves[Math.min(index, moves.length - 1)];
  return Number.isFinite(Number(move?.elapsedMs)) ? Number(move.elapsedMs) : 0;
}

export function advanceReplayClock(currentMs, deltaRealMs, speed, durationMs) {
  const multiplier = Number.isFinite(Number(speed)) && Number(speed) > 0 ? Number(speed) : 1;
  return clampReplayTime(Number(currentMs || 0) + Number(deltaRealMs || 0) * multiplier, durationMs);
}

export function advanceReplayPreroll(currentMs, deltaRealMs, speed, solve) {
  const multiplier = Number.isFinite(Number(speed)) && Number(speed) > 0 ? Number(speed) : 1;
  const duration = getReplayPrerollDuration(solve);
  return Math.min(Math.max(0, Number(currentMs || 0) + Number(deltaRealMs || 0) * multiplier), duration);
}

export function movesToAlg(moves, throughIndex = moves?.length - 1) {
  if (!Array.isArray(moves) || throughIndex < 0) return '';
  return moves
    .slice(0, Math.min(throughIndex + 1, moves.length))
    .map(entry => String(entry?.move || '').trim())
    .filter(isRenderableMove)
    .join(' ');
}

export function getReplayEligibility(solve) {
  if (!solve || !Array.isArray(solve.moves) || !solve.moves.length) {
    return { ok: false, mode: 'none', reason: 'This solve has no recorded moves to replay.' };
  }
  if (solve.reason === 'solved-state') {
    return {
      ok: true,
      mode: 'legacy-solved-end',
      setupAnchor: 'end',
      note: 'Replay derives the starting pattern backwards from the solved final state.'
    };
  }
  if (typeof solve.startFacelets === 'string' && solve.startFacelets.replace(/\s+/g, '').length === 54) {
    return {
      ok: false,
      mode: 'recorded-start-unavailable',
      reason: '3D replay for unfinished solves with recorded starting facelets needs a facelet-to-Twisty setup conversion before Atlas can show it accurately.'
    };
  }
  return {
    ok: false,
    mode: 'legacy-unfinished',
    reason: '3D replay is unavailable for this older unfinished solve because its starting cube state was not recorded.'
  };
}

export function createReplaySnapshot(solve, timeMs) {
  const durationMs = Number(solve?.durationMs || 0);
  const replayTimeMs = clampReplayTime(timeMs, durationMs);
  const moveIndex = moveIndexAtTime(solve?.moves || [], replayTimeMs);
  return {
    phase: 'recorded',
    timeMs: replayTimeMs,
    moveIndex,
    moveNumber: moveIndex + 1,
    currentMove: moveIndex >= 0 ? solve.moves[moveIndex]?.move || null : null,
    alg: movesToAlg(solve?.moves || [], moveIndex),
    visualizerTimeMs: visualizerTimeForReplayTime(solve?.moves || [], replayTimeMs, durationMs)
  };
}

export function createReplayPrerollSnapshot(solve, progressMs) {
  const durationMs = getReplayPrerollDuration(solve);
  const clampedProgressMs = Math.min(Math.max(0, Number(progressMs || 0)), durationMs);
  const progress = durationMs > 0 ? clampedProgressMs / durationMs : 1;
  const firstMoveDurationMs = visualizerMoveDuration(solve?.moves?.[0]?.move);
  return {
    phase: 'preroll',
    timeMs: 0,
    prerollMs: clampedProgressMs,
    prerollDurationMs: durationMs,
    moveIndex: -1,
    moveNumber: 0,
    currentMove: null,
    alg: '',
    visualizerTimeMs: firstMoveDurationMs * progress,
    prerollComplete: progress >= 1
  };
}

export function captureStartFacelets(hasLiveFacelets, currentFacelets) {
  const clean = typeof currentFacelets === 'string' ? currentFacelets.replace(/\s+/g, '').toUpperCase() : '';
  return hasLiveFacelets && clean.length === 54 ? clean : null;
}

export function isSolvedFaceletString(facelets) {
  return String(facelets || '').replace(/\s+/g, '').toUpperCase() === SOLVED_FACELETS;
}

function isRenderableMove(move) {
  return /^[URFDLBMESxyzurfdlb][w]?2?'?$/.test(move) || /^[URFDLBMESxyzurfdlb][w]?'?2?$/.test(move);
}

function visualizerTimeForMoveIndex(moves, index) {
  if (!Array.isArray(moves) || index < 0) return 0;
  return moves.slice(0, Math.min(index + 1, moves.length)).reduce((total, entry) => total + visualizerMoveDuration(entry?.move), 0);
}

function visualizerTimeForReplayTime(moves, timeMs, durationMs) {
  if (!Array.isArray(moves) || !moves.length) return 0;
  const replayTimeMs = clampReplayTime(timeMs, durationMs);
  let previousCompletionMs = 0;
  let visualizerTimeMs = 0;

  for (const [index, move] of moves.entries()) {
    const completionMs = Math.max(previousCompletionMs, Number(move?.elapsedMs || 0));
    const moveDurationMs = visualizerMoveDuration(move?.move);
    const timelineStartMs = visualizerTimeMs;
    const timelineEndMs = timelineStartMs + moveDurationMs;
    const availableGapMs = Math.max(0, completionMs - previousCompletionMs);
    const animationDurationMs = index === 0 && completionMs <= 0
      ? firstMovePrerollMs(moves)
      : Math.min(NOMINAL_RECORDED_TURN_MS, availableGapMs);
    const animationStartMs = completionMs - animationDurationMs;

    if (replayTimeMs < animationStartMs) return timelineStartMs;
    if (replayTimeMs < completionMs) {
      const progress = animationDurationMs > 0 ? (replayTimeMs - animationStartMs) / animationDurationMs : 1;
      return timelineStartMs + moveDurationMs * progress;
    }

    visualizerTimeMs = timelineEndMs;
    previousCompletionMs = completionMs;
  }

  return visualizerTimeMs;
}

function visualizerMoveDuration(move) {
  if (!isRenderableMove(String(move || '').trim())) return 0;
  return String(move || '').includes('2') ? 1500 : 1000;
}

function firstMovePrerollMs(moves) {
  if (!Array.isArray(moves) || !moves.length) return 0;
  const firstMove = moves[0];
  return visualizerMoveDuration(firstMove?.move) > 0 ? NOMINAL_RECORDED_TURN_MS : 0;
}
