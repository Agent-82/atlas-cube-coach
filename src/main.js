import './styles.css';
import { connectSmartCube } from 'smartcube-web-bluetooth';
import { detectAtlasStage } from './stageRecognition.js';
import {
  advanceReplayClock,
  advanceReplayPreroll,
  captureStartFacelets,
  createReplayPrerollSnapshot,
  createReplaySnapshot,
  getReplayEligibility,
  getReplayPrerollDuration,
  movesToAlg,
  timeForMoveIndex
} from './replayLogic.js';

const STORAGE_KEY = 'atlasCubeCoach.solves.v1';
const PROFILES_KEY = 'atlasCubeCoach.profiles.v1';
const ACTIVE_PROFILE_KEY = 'atlasCubeCoach.activeProfile.v1';
const SOLVED_FACELETS = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
const MATTHEW_PROFILE_ID = 'profile-matthew';
const DEFAULT_PROFILE = {
  id: MATTHEW_PROFILE_ID,
  name: 'Matthew',
  method: 'Atlas 8-step beginner',
  experience: 'Learning algorithms',
  helpLevel: 'Mostly analyse',
  progress: {
    step1Daisy: 'comfortable',
    step2WhiteCross: 'comfortable',
    step3WhiteCorners: 'comfortable',
    step4MiddleLayer: 'comfortable',
    step5YellowCross: 'nearly memorised',
    step6YellowCrossSideColours: 'learning / uses notes',
    step7PositionYellowCorners: 'learning / uses notes',
    step8OrientYellowCorners: 'learning / uses notes',
    currentFocus: 'Remove note dependence and internalise the later algorithms'
  },
  createdAt: '2026-09-04T00:00:00.000Z'
};

const initialData = initializeLocalProfiles();

const state = {
  connection: null,
  subscription: null,
  connected: false,
  deviceName: null,
  battery: null,
  capabilities: null,
  currentFacelets: SOLVED_FACELETS,
  hasLiveFacelets: false,
  cubeResetPending: false,
  cubeResetSuppressSolvedUntil: 0,
  cubeFeedbackTimer: null,
  armed: false,
  running: false,
  solveProfileId: null,
  solveStartFacelets: null,
  startedAt: null,
  moves: [],
  lastMove: null,
  timerHandle: null,
  solves: initialData.solves,
  profiles: initialData.profiles,
  activeProfileId: initialData.activeProfileId,
  trackedStage: null,
  displayedStageKey: null,
  stageRecognitionAvailableLogged: false,
  replaySolveId: null,
  replayIndex: -1,
  reviewSolveId: null,
  reviewPlayer: null,
  reviewPhase: 'recorded',
  reviewPrerollMs: 0,
  reviewPlaying: false,
  reviewTimeMs: 0,
  reviewSpeed: 1,
  reviewAnimationHandle: null,
  reviewLastFrameAt: null,
  diagnostics: [],
  demoRunning: false
};

const app = document.querySelector('#app');

app.innerHTML = `
  <main class="shell">
    <header class="hero">
      <div>
        <p class="eyebrow">ATLAS LABS · PROTOTYPE 0.3A · SOLVE REPLAY</p>
        <h1>Atlas Cube Coach</h1>
        <p class="lede">First make the cube talk. Then make the coaching clever.</p>
      </div>
      <div class="hero-actions">
        <div class="profile-menu">
          <span class="profile-label">Profile</span>
          <button class="profile-trigger" id="profileMenuBtn" aria-haspopup="true" aria-expanded="false">Matthew ▾</button>
          <div class="profile-options" id="profileOptions" hidden></div>
        </div>
        <div class="hero-badge" id="browserBadge">Checking Bluetooth…</div>
      </div>
    </header>

    <section class="grid top-grid">
      <article class="card connection-card">
        <div class="card-heading">
          <div>
            <span class="section-kicker">01 · CONNECTION</span>
            <h2>Rubik's Connected</h2>
          </div>
          <span class="status-dot idle" id="statusDot"></span>
        </div>

        <div class="connection-status">
          <div>
            <span class="muted">Status</span>
            <strong id="connectionStatus">Not connected</strong>
          </div>
          <div>
            <span class="muted">Battery</span>
            <strong id="batteryStatus">—</strong>
          </div>
          <div>
            <span class="muted">Device</span>
            <strong id="deviceStatus">—</strong>
          </div>
        </div>

        <div class="button-row">
          <button class="primary" id="connectBtn">Connect cube</button>
          <button class="secondary" id="resetCubeBtn" disabled>Reset cube</button>
          <button class="secondary" id="demoBtn">Run demo</button>
        </div>
        <p class="cube-feedback" id="cubeFeedback">Connect a compatible cube to reset cube state.</p>
        <p class="fine-print">Bluetooth requires Chrome/Edge on a supported device and an HTTPS page. The connect button must be pressed by you.</p>
      </article>

      <article class="card cube-card">
        <div class="card-heading compact">
          <div>
            <span class="section-kicker">LIVE STATE</span>
            <h2>Cube feed</h2>
          </div>
          <span class="move-pill" id="liveMove">—</span>
        </div>
        <div class="cube-net" id="cubeNet" aria-label="2D cube state"></div>
        <div class="facelet-readout">
          <span>Facelets</span>
          <code id="faceletText">Waiting for cube…</code>
        </div>
        <div class="stage-card" id="stageCard">
          <span class="section-kicker" id="stageKicker">CURRENT STAGE</span>
          <strong id="stageText">Connect cube to detect stage</strong>
          <span id="stageNote">Waiting for real cube facelets.</span>
        </div>
      </article>
    </section>

    <section class="card recorder-card">
      <div class="card-heading">
        <div>
          <span class="section-kicker">02 · RECORDER</span>
          <h2>Capture a solve</h2>
        </div>
        <div class="rec-state" id="recordingState">IDLE</div>
      </div>

      <div class="timer" id="timer">0:00.000</div>

      <div class="stats-strip">
        <div><span>Moves</span><strong id="moveCount">0</strong></div>
        <div><span>TPS</span><strong id="tps">0.00</strong></div>
        <div><span>Longest pause</span><strong id="longestPause">—</strong></div>
        <div><span>Pauses &gt; 2s</span><strong id="pauseCount">0</strong></div>
      </div>

      <div class="button-row recorder-buttons">
        <button class="primary" id="armBtn">Arm solve</button>
        <button class="secondary" id="finishBtn" disabled>Finish & save</button>
        <button class="secondary" id="reviewSolveBtn" hidden>▶ Review solve</button>
        <button class="ghost" id="resetBtn">Reset</button>
      </div>

      <div class="move-stream" id="moveStream">
        <span class="empty-state">Moves will appear here as the cube turns.</span>
      </div>
    </section>

    <section class="grid lower-grid">
      <article class="card history-card">
        <div class="card-heading compact">
          <div>
            <span class="section-kicker">03 · HISTORY</span>
            <h2>Saved solves</h2>
          </div>
          <button class="text-btn" id="clearHistoryBtn">Clear</button>
        </div>
        <div id="historyList" class="history-list"></div>
      </article>

      <article class="card replay-card">
        <div class="card-heading compact">
          <div>
            <span class="section-kicker">04 · REPLAY</span>
            <h2>Move timeline</h2>
          </div>
          <span class="move-pill" id="replayMove">—</span>
        </div>
        <div class="replay-time" id="replayTime">Select a saved solve</div>
        <input id="replaySlider" class="replay-slider" type="range" min="0" max="0" value="0" disabled />
        <div class="replay-sequence" id="replaySequence"></div>
        <div class="analysis-preview" id="analysisPreview">
          <span class="section-kicker">EARLY COACHING SIGNAL</span>
          <p>Once a solve is selected, Atlas will flag basic timing patterns here. Proper method/stage coaching comes after the Bluetooth recorder is proven.</p>
        </div>
      </article>
    </section>

    <section class="card diagnostics-card">
      <details>
        <summary>
          <span><span class="section-kicker">TESTING</span> Connection diagnostics</span>
          <span class="muted">Useful for our first real-cube test</span>
        </summary>
        <div class="diagnostic-actions">
          <button class="secondary small" id="copyDiagnosticsBtn">Copy diagnostics</button>
          <button class="ghost small" id="clearDiagnosticsBtn">Clear log</button>
        </div>
        <pre id="diagnosticLog">No events yet.</pre>
      </details>
    </section>

    <div class="modal-backdrop" id="profileModal" hidden>
      <section class="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profileModalTitle">
        <div class="card-heading compact">
          <div>
            <span class="section-kicker">PROFILE</span>
            <h2 id="profileModalTitle">Add profile</h2>
          </div>
          <button class="ghost small" id="cancelProfileBtn" type="button">Cancel</button>
        </div>
        <form id="profileForm" class="profile-form">
          <label>
            <span>Name</span>
            <input id="profileNameInput" name="name" type="text" autocomplete="off" maxlength="40" required />
          </label>
          <label>
            <span>Have you solved a cube before?</span>
            <select id="profileExperienceInput" name="experience">
              <option>Never solved</option>
              <option>Can solve with help</option>
              <option>Can solve independently</option>
              <option selected>Learning algorithms</option>
            </select>
          </label>
          <label>
            <span>What method are you using?</span>
            <select id="profileMethodInput" name="method">
              <option selected>Atlas 8-step beginner</option>
              <option>Another method</option>
              <option>Not sure</option>
            </select>
          </label>
          <label>
            <span>How much help do you want from Atlas?</span>
            <select id="profileHelpInput" name="helpLevel">
              <option>Teach me everything</option>
              <option>Coach me when I struggle</option>
              <option selected>Mostly analyse</option>
            </select>
          </label>
          <p class="form-error" id="profileFormError"></p>
          <div class="button-row profile-form-actions">
            <button class="primary" type="submit">Add profile</button>
          </div>
        </form>
      </section>
    </div>

    <div class="modal-backdrop replay-backdrop" id="replayModal" hidden>
      <section class="solve-replay-modal" role="dialog" aria-modal="true" aria-labelledby="solveReplayTitle">
        <div class="replay-header">
          <div>
            <span class="section-kicker">SOLVE REVIEW</span>
            <h2 id="solveReplayTitle">Solve Replay</h2>
            <p id="reviewMeta">Select a solve to review.</p>
          </div>
          <button class="ghost small" id="closeReplayBtn" type="button">Close</button>
        </div>
        <div class="twisty-wrap" id="twistyWrap"></div>
        <div class="review-status">
          <strong id="reviewMoveLabel">Move 0 of 0</strong>
          <span id="reviewTimeLabel">0:00.000 / 0:00.000</span>
        </div>
        <input id="reviewScrubber" class="replay-slider" type="range" min="0" max="0" value="0" step="1" />
        <div class="review-controls">
          <button class="secondary" id="reviewRestartBtn" type="button">|◀ Restart</button>
          <button class="secondary" id="reviewPrevBtn" type="button">◀ Previous move</button>
          <button class="primary" id="reviewPlayBtn" type="button">▶ Play</button>
          <button class="secondary" id="reviewNextBtn" type="button">▶| Next move</button>
          <button class="ghost" id="reviewStopBtn" type="button">■ Stop</button>
          <select id="reviewSpeedSelect" aria-label="Playback speed">
            <option value="0.5">0.5×</option>
            <option value="1" selected>1×</option>
            <option value="2">2×</option>
            <option value="4">4×</option>
          </select>
        </div>
        <div class="review-warning" id="reviewWarning" hidden></div>
        <div class="review-move-strip" id="reviewMoveStrip"></div>
        <div class="review-stats" id="reviewStats"></div>
      </section>
    </div>

    <footer>
      <span>Atlas Cube Coach · local-first prototype</span>
      <span>No accounts or cloud sync required for v0.2</span>
    </footer>
  </main>
`;

const els = Object.fromEntries([
  'browserBadge','profileMenuBtn','profileOptions','profileModal','profileForm','profileNameInput',
  'profileExperienceInput','profileMethodInput','profileHelpInput','profileFormError','cancelProfileBtn',
  'statusDot','connectionStatus','batteryStatus','deviceStatus','connectBtn','demoBtn',
  'resetCubeBtn','cubeFeedback',
  'cubeNet','liveMove','faceletText','stageCard','stageKicker','stageText','stageNote',
  'recordingState','timer','moveCount','tps','longestPause','pauseCount',
  'armBtn','finishBtn','reviewSolveBtn','resetBtn','moveStream','historyList','clearHistoryBtn','replayMove','replayTime',
  'replaySlider','replaySequence','analysisPreview','diagnosticLog','copyDiagnosticsBtn','clearDiagnosticsBtn'
  ,'replayModal','solveReplayTitle','closeReplayBtn','twistyWrap','reviewMeta','reviewMoveLabel','reviewTimeLabel','reviewScrubber',
  'reviewRestartBtn','reviewPrevBtn','reviewPlayBtn','reviewNextBtn','reviewStopBtn','reviewSpeedSelect',
  'reviewWarning','reviewMoveStrip','reviewStats'
].map(id => [id, document.getElementById(id)]));

function loadSolves() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSolves() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.solves));
}

function loadProfiles() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROFILES_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(profile => profile?.id && profile?.name) : [];
  } catch {
    return [];
  }
}

function initializeLocalProfiles() {
  const solves = loadSolves();
  const existingProfilesRaw = localStorage.getItem(PROFILES_KEY);
  let profiles = loadProfiles();
  let activeProfileId = localStorage.getItem(ACTIVE_PROFILE_KEY);

  if (!existingProfilesRaw || !profiles.length) {
    profiles = [{ ...DEFAULT_PROFILE, progress: { ...DEFAULT_PROFILE.progress } }];
    activeProfileId = MATTHEW_PROFILE_ID;
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
    localStorage.setItem(ACTIVE_PROFILE_KEY, activeProfileId);

    let migratedSolves = false;
    for (const solve of solves) {
      if (solve && !solve.profileId) {
        solve.profileId = MATTHEW_PROFILE_ID;
        migratedSolves = true;
      }
    }
    if (migratedSolves) localStorage.setItem(STORAGE_KEY, JSON.stringify(solves));
  } else if (!profiles.some(profile => profile.id === activeProfileId)) {
    activeProfileId = profiles[0].id;
    localStorage.setItem(ACTIVE_PROFILE_KEY, activeProfileId);
  }

  return { solves, profiles, activeProfileId };
}

function saveProfiles() {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(state.profiles));
}

function saveActiveProfile() {
  localStorage.setItem(ACTIVE_PROFILE_KEY, state.activeProfileId);
}

function createProfileId(name) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'profile';
  const suffix = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `profile-${base}-${suffix}`;
}

function getActiveProfile() {
  return state.profiles.find(profile => profile.id === state.activeProfileId) || state.profiles[0];
}

function getProfileById(profileId) {
  return state.profiles.find(profile => profile.id === profileId);
}

function getVisibleSolves() {
  return state.solves.filter(solve => solve.profileId === state.activeProfileId);
}

function formatTime(ms) {
  if (!Number.isFinite(ms)) return '0:00.000';
  const total = Math.max(0, ms);
  const mins = Math.floor(total / 60000);
  const secs = Math.floor((total % 60000) / 1000);
  const millis = Math.floor(total % 1000);
  return `${mins}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function shortTime(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
}

function now() {
  return performance.now();
}

function logDiagnostic(message, data) {
  const stamp = new Date().toLocaleTimeString();
  let detail = '';
  if (data !== undefined) {
    try { detail = ` ${JSON.stringify(data)}`; }
    catch { detail = ` ${String(data)}`; }
  }
  state.diagnostics.unshift(`[${stamp}] ${message}${detail}`);
  state.diagnostics = state.diagnostics.slice(0, 120);
  els.diagnosticLog.textContent = state.diagnostics.join('\n') || 'No events yet.';
}

function setConnectionUi(mode, message) {
  els.connectionStatus.textContent = message;
  els.statusDot.className = `status-dot ${mode}`;
  if (mode === 'connected') els.connectBtn.textContent = 'Cube connected';
  else if (mode === 'connecting') els.connectBtn.textContent = 'Connecting…';
  else els.connectBtn.textContent = 'Connect cube';
  els.connectBtn.disabled = mode === 'connecting' || mode === 'connected';
  updateResetControls();
}

function supportsCubeReset() {
  if (!state.connected || !state.connection?.sendCommand) return false;
  return !state.capabilities || state.capabilities.reset !== false;
}

function setCubeFeedback(message, clearAfterMs = 0) {
  clearTimeout(state.cubeFeedbackTimer);
  els.cubeFeedback.textContent = message;
  if (clearAfterMs) {
    state.cubeFeedbackTimer = setTimeout(() => {
      els.cubeFeedback.textContent = '';
      updateResetControls();
    }, clearAfterMs);
  }
}

function updateResetControls() {
  const hasConnection = Boolean(state.connected && state.connection);
  const hasReset = supportsCubeReset();
  els.resetCubeBtn.disabled = !hasConnection || !hasReset || state.cubeResetPending;
  if (state.cubeResetPending) {
    els.resetCubeBtn.textContent = 'Resetting…';
    els.resetCubeBtn.title = 'Waiting for the cube reset command to complete.';
    setCubeFeedback('Resetting…');
  } else {
    els.resetCubeBtn.textContent = 'Reset cube';
    if (!hasConnection) {
      els.resetCubeBtn.title = 'Connect a compatible cube before resetting cube state.';
      els.cubeFeedback.textContent = 'Connect a compatible cube to reset cube state.';
    } else if (!hasReset) {
      els.resetCubeBtn.title = 'This connection reports that reset is unsupported.';
      els.cubeFeedback.textContent = 'Cube reset is not supported by this connection.';
    } else {
      els.resetCubeBtn.title = 'Tell the connected cube that the current physical position is solved.';
      if (!els.cubeFeedback.textContent || els.cubeFeedback.textContent.startsWith('Connect') || els.cubeFeedback.textContent.includes('not supported')) {
        els.cubeFeedback.textContent = 'Ready to reset cube state when the physical cube is solved.';
      }
    }
  }
}

function renderProfileMenu() {
  const activeProfile = getActiveProfile();
  if (!activeProfile) return;
  els.profileMenuBtn.textContent = `${activeProfile.name} ▾`;
  els.profileOptions.innerHTML = `
    ${state.profiles.map(profile => `
      <button class="profile-option ${profile.id === state.activeProfileId ? 'active' : ''}" type="button" data-profile-id="${profile.id}">
        <span>${escapeHtml(profile.name)}</span>
        <small>${escapeHtml(profile.experience)}</small>
      </button>
    `).join('')}
    <button class="profile-option add-profile-option" type="button" data-add-profile="true">+ Add profile</button>
  `;

  els.profileOptions.querySelectorAll('[data-profile-id]').forEach(button => {
    button.addEventListener('click', () => switchProfile(button.dataset.profileId));
  });
  els.profileOptions.querySelector('[data-add-profile]')?.addEventListener('click', openProfileForm);
}

function setProfileMenuOpen(open) {
  els.profileOptions.hidden = !open;
  els.profileMenuBtn.setAttribute('aria-expanded', String(open));
}

function switchProfile(profileId) {
  if (!state.profiles.some(profile => profile.id === profileId)) return;
  state.activeProfileId = profileId;
  saveActiveProfile();
  state.replaySolveId = null;
  state.replayIndex = -1;
  setProfileMenuOpen(false);
  renderProfileMenu();
  renderHistory();
  renderReplay();
  updateStageRecognition();
  logDiagnostic('Profile switched', { profileId, name: getActiveProfile()?.name });
}

function openProfileForm() {
  setProfileMenuOpen(false);
  els.profileForm.reset();
  els.profileExperienceInput.value = 'Learning algorithms';
  els.profileMethodInput.value = 'Atlas 8-step beginner';
  els.profileHelpInput.value = 'Mostly analyse';
  els.profileFormError.textContent = '';
  els.profileModal.hidden = false;
  els.profileNameInput.focus();
}

function closeProfileForm() {
  els.profileModal.hidden = true;
  els.profileForm.reset();
  els.profileNameInput.value = '';
  els.profileFormError.textContent = '';
}

function addProfile(event) {
  event.preventDefault();
  const name = els.profileNameInput.value.trim();
  if (!name) {
    els.profileFormError.textContent = 'Enter a profile name.';
    els.profileNameInput.focus();
    return;
  }

  const profile = {
    id: createProfileId(name),
    name,
    experience: els.profileExperienceInput.value,
    method: els.profileMethodInput.value,
    helpLevel: els.profileHelpInput.value,
    progress: {},
    createdAt: new Date().toISOString()
  };
  state.profiles.push(profile);
  state.activeProfileId = profile.id;
  saveProfiles();
  saveActiveProfile();
  state.replaySolveId = null;
  state.replayIndex = -1;
  closeProfileForm();
  renderProfileMenu();
  renderHistory();
  renderReplay();
  updateStageRecognition();
  logDiagnostic('Profile added', { profileId: profile.id, name: profile.name });
}

function getStageRecognitionProfile() {
  if (state.running && state.solveProfileId) return getProfileById(state.solveProfileId) || getActiveProfile();
  return getActiveProfile();
}

function isAtlasBeginnerProfile(profile) {
  return profile?.method === 'Atlas 8-step beginner';
}

function setStageDisplay(kicker, text, note, key) {
  els.stageKicker.textContent = kicker;
  els.stageText.textContent = text;
  els.stageNote.textContent = note;
  state.displayedStageKey = key;
}

function updateStageRecognition() {
  if (!state.hasLiveFacelets) {
    setStageDisplay('CURRENT STAGE', 'Connect cube to detect stage', 'Waiting for real cube facelets.', 'waiting');
    return;
  }

  const profile = getStageRecognitionProfile();
  if (!isAtlasBeginnerProfile(profile)) {
    setStageDisplay(
      'CURRENT STAGE',
      'Stage recognition unavailable',
      'Stage recognition is currently available for the Atlas 8-step beginner method.',
      'unsupported-method'
    );
    return;
  }

  const detectedStage = detectAtlasStage(state.currentFacelets);
  let displayStage = detectedStage;
  if (state.running) {
    if (!state.trackedStage) state.trackedStage = detectedStage;
    else if (detectedStage.index > state.trackedStage.index) state.trackedStage = detectedStage;
    displayStage = state.trackedStage;
  }

  const previousKey = state.displayedStageKey;
  setStageDisplay(displayStage.key === 'solved' ? 'SOLVED' : 'CURRENT STAGE', displayStage.display, profile.name, displayStage.key);

  if (!state.stageRecognitionAvailableLogged) {
    state.stageRecognitionAvailableLogged = true;
    logDiagnostic('Live stage recognition available', { profile: profile.name, stage: displayStage.display });
  }
  if (previousKey && previousKey !== displayStage.key && displayStage.index > stageIndexForKey(previousKey)) {
    logDiagnostic('Stage advanced', { from: previousKey, to: displayStage.display });
  }
  if (previousKey !== displayStage.key && displayStage.key === 'solved') {
    logDiagnostic('Cube reached Solved');
  }
}

function stageIndexForKey(key) {
  if (key === 'solved') return 9;
  const match = /^step-(\d+)$/.exec(String(key));
  return match ? Number(match[1]) : 0;
}

function getSolveProfileName(solve) {
  return getProfileById(solve?.profileId)?.name || 'Unknown profile';
}

function getReviewSolve() {
  return state.solves.find(solve => solve.id === state.reviewSolveId);
}

async function ensureReviewPlayer() {
  if (state.reviewPlayer) return state.reviewPlayer;
  const { TwistyPlayer } = await import('cubing/twisty');
  state.reviewPlayer = new TwistyPlayer({
    puzzle: '3x3x3',
    alg: '',
    hintFacelets: 'none',
    backView: 'side-by-side',
    background: 'none',
    controlPanel: 'none',
    viewerLink: 'none',
    cameraLatitude: 24,
    cameraLongitude: 32
  });
  els.twistyWrap.replaceChildren(state.reviewPlayer);
  return state.reviewPlayer;
}

async function openSolveReplay(solveId) {
  const solve = state.solves.find(entry => entry.id === solveId);
  if (!solve) {
    logDiagnostic('Replay open failed: solve not found', { solveId });
    return;
  }
  state.reviewSolveId = solve.id;
  resetReviewToStart(solve);
  state.reviewSpeed = 1;
  els.reviewSpeedSelect.value = '1';
  state.reviewPlaying = false;
  state.reviewLastFrameAt = null;
  cancelAnimationFrame(state.reviewAnimationHandle);
  els.replayModal.hidden = false;
  els.reviewWarning.hidden = false;
  els.reviewWarning.textContent = 'Loading 3D replay...';
  renderReviewMoveStrip(solve);
  renderReviewStats(solve);
  if (state.reviewPhase === 'preroll') updateReviewPrerollAtTime(state.reviewPrerollMs);
  else updateReviewAtTime(state.reviewTimeMs);
  els.closeReplayBtn.focus();
  logDiagnostic('Replay open requested', { solveId: solve.id, moves: solve.moves?.length || 0, reason: solve.reason });
  await setupReviewPlayer(solve);
  if (state.reviewPhase === 'preroll') updateReviewPrerollAtTime(state.reviewPrerollMs);
  else updateReviewAtTime(state.reviewTimeMs);
}

function closeSolveReplay() {
  state.reviewPlaying = false;
  state.reviewLastFrameAt = null;
  cancelAnimationFrame(state.reviewAnimationHandle);
  els.replayModal.hidden = true;
  updateReviewButtons();
}

async function setupReviewPlayer(solve) {
  const eligibility = getReplayEligibility(solve);
  if (!eligibility.ok) {
    els.reviewWarning.hidden = false;
    els.reviewWarning.textContent = eligibility.reason;
    updateReviewButtons();
    logDiagnostic('Replay unavailable', { solveId: solve.id, mode: eligibility.mode, reason: eligibility.reason });
    return;
  }

  try {
    const player = await ensureReviewPlayer();
    player.experimentalSetupAnchor = eligibility.setupAnchor || 'start';
    player.alg = movesToAlg(solve.moves);
    player.timestamp = 0;
    els.reviewWarning.hidden = false;
    els.reviewWarning.textContent = eligibility.note;
    logDiagnostic('Replay 3D player ready', { solveId: solve.id, mode: eligibility.mode, setupAnchor: eligibility.setupAnchor });
  } catch (error) {
    els.reviewWarning.hidden = false;
    els.reviewWarning.textContent = `3D replay could not start: ${error?.message || String(error)}`;
    logDiagnostic('Replay 3D initialisation failed', { message: error?.message || String(error) });
  }
  updateReviewButtons();
}

function updateReviewAtTime(timeMs) {
  const solve = getReviewSolve();
  if (!solve) return;
  const snapshot = createReplaySnapshot(solve, timeMs);
  state.reviewPhase = 'recorded';
  const eligibility = getReplayEligibility(solve);
  state.reviewTimeMs = snapshot.timeMs;
  state.reviewPrerollMs = getReplayPrerollDuration(solve);
  renderReviewSnapshot(snapshot, solve, eligibility);
}

function updateReviewPrerollAtTime(prerollMs) {
  const solve = getReviewSolve();
  if (!solve) return;
  const snapshot = createReplayPrerollSnapshot(solve, prerollMs);
  const eligibility = getReplayEligibility(solve);
  state.reviewPhase = 'preroll';
  state.reviewPrerollMs = snapshot.prerollMs;
  state.reviewTimeMs = 0;
  renderReviewSnapshot(snapshot, solve, eligibility);
}

function renderReviewSnapshot(snapshot, solve, eligibility) {
  els.reviewScrubber.max = Math.max(0, Math.round(solve.durationMs || 0));
  els.reviewScrubber.value = Math.round(snapshot.timeMs);
  els.reviewTimeLabel.textContent = `${formatTime(snapshot.timeMs)} / ${formatTime(solve.durationMs || 0)}`;
  els.reviewMoveLabel.textContent = snapshot.phase === 'preroll'
    ? `START · before move 1`
    : snapshot.currentMove
    ? `Move ${snapshot.moveNumber} of ${solve.moves.length} · ${snapshot.currentMove}`
    : `Move 0 of ${solve.moves.length}`;
  els.reviewMeta.textContent = `${getSolveProfileName(solve)} · ${new Date(solve.createdAt).toLocaleString()}`;

  if (state.reviewPlayer && eligibility.ok) state.reviewPlayer.timestamp = snapshot.visualizerTimeMs;
  updateReviewMoveHighlight(snapshot.moveIndex);
  updateReviewButtons();
}

function resetReviewToStart(solve = getReviewSolve()) {
  const prerollDurationMs = getReplayPrerollDuration(solve);
  state.reviewPhase = prerollDurationMs > 0 ? 'preroll' : 'recorded';
  state.reviewPrerollMs = 0;
  state.reviewTimeMs = 0;
}

function updateReviewButtons() {
  const solve = getReviewSolve();
  const eligibility = getReplayEligibility(solve);
  const disabled = !solve || !eligibility.ok;
  els.reviewPlayBtn.disabled = disabled;
  els.reviewRestartBtn.disabled = disabled;
  els.reviewPrevBtn.disabled = disabled;
  els.reviewNextBtn.disabled = disabled;
  els.reviewStopBtn.disabled = disabled;
  els.reviewScrubber.disabled = disabled;
  els.reviewSpeedSelect.disabled = disabled;
  els.reviewPlayBtn.textContent = state.reviewPlaying ? '❚❚ Pause' : '▶ Play';
}

function playReview() {
  const solve = getReviewSolve();
  if (!solve || !getReplayEligibility(solve).ok) return;
  if (state.reviewTimeMs >= Number(solve.durationMs || 0)) {
    resetReviewToStart(solve);
    if (state.reviewPhase === 'preroll') updateReviewPrerollAtTime(0);
    else updateReviewAtTime(0);
  }
  state.reviewPlaying = true;
  state.reviewLastFrameAt = performance.now();
  updateReviewButtons();
  state.reviewAnimationHandle = requestAnimationFrame(tickReview);
}

function pauseReview() {
  state.reviewPlaying = false;
  state.reviewLastFrameAt = null;
  cancelAnimationFrame(state.reviewAnimationHandle);
  updateReviewButtons();
}

function tickReview(frameAt) {
  if (!state.reviewPlaying) return;
  const solve = getReviewSolve();
  if (!solve) return pauseReview();
  const delta = frameAt - (state.reviewLastFrameAt || frameAt);
  state.reviewLastFrameAt = frameAt;
  if (state.reviewPhase === 'preroll') {
    const nextPrerollMs = advanceReplayPreroll(state.reviewPrerollMs, delta, state.reviewSpeed, solve);
    updateReviewPrerollAtTime(nextPrerollMs);
    if (nextPrerollMs >= getReplayPrerollDuration(solve)) updateReviewAtTime(0);
    state.reviewAnimationHandle = requestAnimationFrame(tickReview);
    return;
  }

  const nextTime = advanceReplayClock(state.reviewTimeMs, delta, state.reviewSpeed, solve.durationMs);
  updateReviewAtTime(nextTime);
  if (nextTime >= Number(solve.durationMs || 0)) pauseReview();
  else state.reviewAnimationHandle = requestAnimationFrame(tickReview);
}

function jumpReviewToMove(offset) {
  const solve = getReviewSolve();
  if (!solve) return;
  pauseReview();
  if (state.reviewPhase === 'preroll') {
    if (offset > 0) updateReviewAtTime(timeForMoveIndex(solve.moves, 0));
    else updateReviewPrerollAtTime(0);
    return;
  }
  const currentIndex = createReplaySnapshot(solve, state.reviewTimeMs).moveIndex;
  if (currentIndex <= 0 && offset < 0) {
    resetReviewToStart(solve);
    if (state.reviewPhase === 'preroll') updateReviewPrerollAtTime(0);
    else updateReviewAtTime(0);
    return;
  }
  updateReviewAtTime(timeForMoveIndex(solve.moves, currentIndex + offset));
}

function renderReviewMoveStrip(solve) {
  els.reviewMoveStrip.innerHTML = solve.moves.map((move, index) => `
    <button class="review-move-token" type="button" data-review-index="${index}">
      <small>${index + 1}</small><span>${escapeHtml(move.move)}</span>
    </button>
  `).join('');
  els.reviewMoveStrip.querySelectorAll('[data-review-index]').forEach(button => {
    button.addEventListener('click', () => {
      pauseReview();
      updateReviewAtTime(timeForMoveIndex(solve.moves, Number(button.dataset.reviewIndex)));
    });
  });
}

function updateReviewMoveHighlight(moveIndex) {
  els.reviewMoveStrip.querySelectorAll('[data-review-index]').forEach(button => {
    button.classList.toggle('active', Number(button.dataset.reviewIndex) === moveIndex);
  });
  const active = els.reviewMoveStrip.querySelector('.review-move-token.active');
  active?.scrollIntoView({ behavior: state.reviewPlaying ? 'smooth' : 'auto', inline: 'center', block: 'nearest' });
}

function renderReviewStats(solve) {
  els.reviewStats.innerHTML = `
    <div><span>Total time</span><strong>${formatTime(solve.durationMs)}</strong></div>
    <div><span>Moves</span><strong>${solve.stats.moveCount}</strong></div>
    <div><span>TPS</span><strong>${solve.stats.tps.toFixed(2)}</strong></div>
    <div><span>Longest pause</span><strong>${solve.stats.longestPause ? shortTime(solve.stats.longestPause) : '—'}</strong></div>
    <div><span>Pauses &gt; 2s</span><strong>${solve.stats.pausesOver2}</strong></div>
  `;
}

function detectBluetoothSupport() {
  const supported = 'bluetooth' in navigator;
  const secure = window.isSecureContext;
  if (supported && secure) {
    els.browserBadge.textContent = 'Bluetooth ready';
    els.browserBadge.classList.add('good');
  } else if (!secure) {
    els.browserBadge.textContent = 'HTTPS required';
    els.browserBadge.classList.add('warn');
  } else {
    els.browserBadge.textContent = 'Web Bluetooth unavailable';
    els.browserBadge.classList.add('warn');
  }
  logDiagnostic('Browser check', { webBluetooth: supported, secureContext: secure, userAgent: navigator.userAgent });
}

async function connectCube() {
  if (!('bluetooth' in navigator)) {
    setConnectionUi('error', 'Web Bluetooth unavailable');
    logDiagnostic('Connect blocked: Web Bluetooth unavailable');
    return;
  }
  if (!window.isSecureContext) {
    setConnectionUi('error', 'HTTPS is required');
    logDiagnostic('Connect blocked: insecure context');
    return;
  }

  try {
    setConnectionUi('connecting', 'Waiting for device…');
    logDiagnostic('Opening Bluetooth device chooser');
    const conn = await connectSmartCube();
    state.connection = conn;
    state.connected = true;
    state.capabilities = conn.capabilities || {};
    state.deviceName = conn.device?.name || conn.name || 'Smart cube';
    els.deviceStatus.textContent = state.deviceName;
    setConnectionUi('connected', 'Connected');
    logDiagnostic('Connected', { device: state.deviceName, capabilities: state.capabilities });

    state.subscription = conn.events$.subscribe({
      next: event => handleCubeEvent(event),
      error: error => {
        logDiagnostic('Cube event error', { message: error?.message || String(error) });
        setConnectionUi('error', 'Connection error');
      },
      complete: () => {
        logDiagnostic('Cube event stream closed');
        state.connected = false;
        state.cubeResetPending = false;
        setConnectionUi('idle', 'Disconnected');
      }
    });

    if (conn.capabilities?.facelets) {
      try { await conn.sendCommand({ type: 'REQUEST_FACELETS' }); }
      catch (error) { logDiagnostic('Facelet request failed', { message: error?.message || String(error) }); }
    }
    if (conn.capabilities?.battery) {
      try { await conn.sendCommand({ type: 'REQUEST_BATTERY' }); }
      catch (error) { logDiagnostic('Battery request failed', { message: error?.message || String(error) }); }
    }
  } catch (error) {
    state.connected = false;
    state.cubeResetPending = false;
    const cancelled = error?.name === 'NotFoundError';
    setConnectionUi('idle', cancelled ? 'Connection cancelled' : 'Could not connect');
    logDiagnostic(cancelled ? 'Device chooser cancelled' : 'Connection failed', {
      name: error?.name,
      message: error?.message || String(error)
    });
  }
}

function handleCubeEvent(event) {
  const compact = { type: event?.type };
  for (const key of ['move','face','direction','batteryLevel','timestamp','cubeTimestamp']) {
    if (event?.[key] !== undefined) compact[key] = event[key];
  }
  logDiagnostic('Cube event', compact);

  switch (event.type) {
    case 'MOVE':
      receiveMove(String(event.move || '?'), event);
      break;
    case 'FACELETS':
      if (event.facelets) {
        const firstLiveFacelets = !state.hasLiveFacelets;
        state.hasLiveFacelets = true;
        state.currentFacelets = normalizeFacelets(event.facelets);
        renderCube(state.currentFacelets);
        els.faceletText.textContent = state.currentFacelets;
        updateStageRecognition();
        if (firstLiveFacelets) logDiagnostic('Live facelets received');
        const suppressResetFinish = now() < state.cubeResetSuppressSolvedUntil;
        if (suppressResetFinish && isSolvedFacelets(state.currentFacelets)) {
          logDiagnostic('Solved-state finish suppressed after cube reset');
        }
        if (!suppressResetFinish && state.running && state.moves.length > 0 && isSolvedFacelets(state.currentFacelets)) {
          finishSolve('solved-state');
        }
      }
      break;
    case 'BATTERY':
      state.battery = event.batteryLevel;
      els.batteryStatus.textContent = Number.isFinite(Number(state.battery)) ? `${state.battery}%` : String(state.battery ?? '—');
      break;
    default:
      break;
  }
}

async function resetCubeState() {
  if (!state.connected || !state.connection) {
    logDiagnostic('Cube reset blocked: no cube connected');
    setCubeFeedback('Connect a compatible cube before resetting.');
    updateResetControls();
    return;
  }
  if (!supportsCubeReset()) {
    logDiagnostic('Cube reset unsupported', { capabilities: state.capabilities });
    setCubeFeedback('Cube reset is not supported by this connection.');
    updateResetControls();
    return;
  }

  const confirmed = confirm(
    'Reset cube state?\n\nOnly continue if the physical cube is completely solved.\n\nThis will tell the connected Rubik\'s Cube that its current physical position is the solved position.'
  );
  if (!confirmed) {
    logDiagnostic('Cube reset cancelled');
    return;
  }

  try {
    state.cubeResetPending = true;
    state.cubeResetSuppressSolvedUntil = now() + 5000;
    updateResetControls();
    logDiagnostic('Cube reset requested', { command: 'REQUEST_RESET', capabilities: state.capabilities });
    await state.connection.sendCommand({ type: 'REQUEST_RESET' });
    state.cubeResetPending = false;
    setCubeFeedback('Cube reset', 1800);
    updateResetControls();
    logDiagnostic('Cube reset successful');
  } catch (error) {
    state.cubeResetPending = false;
    setCubeFeedback('Cube reset failed');
    updateResetControls();
    logDiagnostic('Cube reset failure', { message: error?.message || String(error) });
  } finally {
    setTimeout(() => {
      if (now() >= state.cubeResetSuppressSolvedUntil) state.cubeResetSuppressSolvedUntil = 0;
    }, 5000);
  }
}

function normalizeFacelets(value) {
  if (typeof value === 'string') return value.replace(/\s+/g, '').toUpperCase();
  if (Array.isArray(value)) return value.join('').toUpperCase();
  return String(value || '').replace(/\s+/g, '').toUpperCase();
}

function isSolvedFacelets(facelets) {
  if (!facelets || facelets.length !== 54) return false;
  for (let i = 0; i < 54; i += 9) {
    const face = facelets.slice(i, i + 9);
    if (![...face].every(c => c === face[0])) return false;
  }
  return true;
}

function armSolve() {
  resetCurrentSolve(false);
  state.armed = true;
  els.recordingState.textContent = 'ARMED · TURN TO START';
  els.recordingState.className = 'rec-state armed';
  els.armBtn.textContent = 'Armed';
  els.armBtn.disabled = true;
  els.finishBtn.disabled = true;
  logDiagnostic('Solve armed');
}

function startOnFirstMove() {
  state.armed = false;
  state.running = true;
  state.solveProfileId = state.activeProfileId;
  state.solveStartFacelets = captureStartFacelets(state.hasLiveFacelets, state.currentFacelets);
  state.trackedStage = state.hasLiveFacelets ? detectAtlasStage(state.currentFacelets) : null;
  state.startedAt = now();
  els.recordingState.textContent = 'RECORDING';
  els.recordingState.className = 'rec-state recording';
  els.finishBtn.disabled = false;
  els.timer.classList.add('running');
  state.timerHandle = requestAnimationFrame(tickTimer);
  updateStageRecognition();
  logDiagnostic('Solve started on first move');
}

function tickTimer() {
  if (!state.running) return;
  els.timer.textContent = formatTime(now() - state.startedAt);
  updateLiveStats(now() - state.startedAt);
  state.timerHandle = requestAnimationFrame(tickTimer);
}

function receiveMove(move, raw = {}) {
  if (state.armed) startOnFirstMove();

  els.liveMove.textContent = move;
  state.lastMove = move;

  if (!state.running) return;

  const hostNow = now();
  const elapsed = hostNow - state.startedAt;
  const previous = state.moves.at(-1);
  const gap = previous ? elapsed - previous.elapsedMs : 0;

  state.moves.push({
    move,
    elapsedMs: elapsed,
    gapMs: gap,
    hostEpochMs: Date.now(),
    cubeTimestamp: raw.timestamp ?? raw.cubeTimestamp ?? null
  });

  updateMoveStream();
  updateLiveStats(elapsed);
}

function calculateStats(moves, durationMs) {
  const gaps = moves.slice(1).map(m => m.gapMs).filter(Number.isFinite);
  const longestPause = gaps.length ? Math.max(...gaps) : 0;
  const pausesOver2 = gaps.filter(gap => gap >= 2000).length;
  return {
    moveCount: moves.length,
    durationMs,
    tps: durationMs > 0 ? moves.length / (durationMs / 1000) : 0,
    longestPause,
    pausesOver2
  };
}

function updateLiveStats(durationMs = 0) {
  const stats = calculateStats(state.moves, durationMs);
  els.moveCount.textContent = stats.moveCount;
  els.tps.textContent = stats.tps.toFixed(2);
  els.longestPause.textContent = stats.longestPause ? shortTime(stats.longestPause) : '—';
  els.pauseCount.textContent = stats.pausesOver2;
}

function updateMoveStream() {
  if (!state.moves.length) {
    els.moveStream.innerHTML = '<span class="empty-state">Moves will appear here as the cube turns.</span>';
    return;
  }
  els.moveStream.innerHTML = state.moves.map((entry, index) => `
    <span class="move-token" title="${entry.elapsedMs.toFixed(0)}ms · gap ${entry.gapMs.toFixed(0)}ms">
      <b>${entry.move}</b><small>${index + 1}</small>
    </span>
  `).join('');
  els.moveStream.scrollLeft = els.moveStream.scrollWidth;
}

function finishSolve(reason = 'manual') {
  if (!state.running || !state.moves.length) return;
  const solveProfileId = state.solveProfileId || state.activeProfileId;
  state.running = false;
  state.armed = false;
  cancelAnimationFrame(state.timerHandle);

  const durationMs = Math.max(state.moves.at(-1).elapsedMs, now() - state.startedAt);
  const stats = calculateStats(state.moves, durationMs);
  const solve = {
    id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    profileId: solveProfileId,
    startFacelets: state.solveStartFacelets,
    createdAt: new Date().toISOString(),
    reason,
    deviceName: state.deviceName || (state.demoRunning ? 'Demo cube' : 'Unknown'),
    durationMs,
    moves: state.moves.map(m => ({ ...m })),
    stats
  };

  state.solves.unshift(solve);
  saveSolves();

  els.timer.textContent = formatTime(durationMs);
  els.timer.classList.remove('running');
  els.recordingState.textContent = reason === 'solved-state' ? 'SOLVED · SAVED' : 'SAVED';
  els.recordingState.className = 'rec-state saved';
  els.armBtn.textContent = 'Arm another';
  els.armBtn.disabled = false;
  els.finishBtn.disabled = true;
  els.reviewSolveBtn.hidden = false;
  els.reviewSolveBtn.dataset.solveId = solve.id;
  state.solveProfileId = null;
  state.solveStartFacelets = null;
  state.trackedStage = null;
  state.demoRunning = false;
  logDiagnostic('Solve saved', { reason, durationMs: Math.round(durationMs), moves: stats.moveCount });

  renderHistory();
  selectReplay(solve.id);
  updateStageRecognition();
}

function resetCurrentSolve(resetUi = true) {
  state.armed = false;
  state.running = false;
  state.solveProfileId = null;
  state.solveStartFacelets = null;
  state.trackedStage = null;
  state.startedAt = null;
  state.moves = [];
  state.lastMove = null;
  state.demoRunning = false;
  cancelAnimationFrame(state.timerHandle);
  els.timer.textContent = '0:00.000';
  els.timer.classList.remove('running');
  els.moveCount.textContent = '0';
  els.tps.textContent = '0.00';
  els.longestPause.textContent = '—';
  els.pauseCount.textContent = '0';
  els.liveMove.textContent = '—';
  els.reviewSolveBtn.hidden = true;
  delete els.reviewSolveBtn.dataset.solveId;
  updateMoveStream();
  updateStageRecognition();
  if (resetUi) {
    els.recordingState.textContent = 'IDLE';
    els.recordingState.className = 'rec-state';
    els.armBtn.textContent = 'Arm solve';
    els.armBtn.disabled = false;
    els.finishBtn.disabled = true;
  }
}

function renderHistory() {
  const visibleSolves = getVisibleSolves();
  const activeProfile = getActiveProfile();
  if (!visibleSolves.length) {
    els.historyList.innerHTML = `<div class="empty-panel">No solves yet for ${escapeHtml(activeProfile?.name || 'this profile')}.</div>`;
    return;
  }
  els.historyList.innerHTML = visibleSolves.map((solve, index) => `
    <button class="history-item ${solve.id === state.replaySolveId ? 'selected' : ''}" data-solve-id="${solve.id}">
      <span class="history-rank">#${visibleSolves.length - index}</span>
      <span class="history-main">
        <strong>${formatTime(solve.durationMs)}</strong>
        <small>${new Date(solve.createdAt).toLocaleString()}</small>
      </span>
      <span class="history-meta">${solve.stats.moveCount} moves<br>${solve.stats.tps.toFixed(2)} TPS</span>
      <span class="history-actions"><span class="review-link">Review</span></span>
    </button>
  `).join('');

  els.historyList.querySelectorAll('[data-solve-id]').forEach(button => {
    button.addEventListener('click', event => {
      selectReplay(button.dataset.solveId);
      if (event.target.closest('.history-actions')) openSolveReplay(button.dataset.solveId);
    });
  });
}

function selectReplay(id) {
  const solve = getVisibleSolves().find(s => s.id === id);
  if (!solve) return;
  state.replaySolveId = id;
  state.replayIndex = solve.moves.length ? solve.moves.length - 1 : -1;
  els.replaySlider.disabled = solve.moves.length === 0;
  els.replaySlider.min = 0;
  els.replaySlider.max = Math.max(0, solve.moves.length - 1);
  els.replaySlider.value = Math.max(0, state.replayIndex);
  renderHistory();
  renderReplay();
}

function renderReplay() {
  const solve = getVisibleSolves().find(s => s.id === state.replaySolveId);
  if (!solve) {
    els.replayMove.textContent = '—';
    els.replayTime.textContent = 'Select a saved solve';
    els.replaySequence.innerHTML = '';
    return;
  }

  const entry = solve.moves[state.replayIndex];
  els.replayMove.textContent = entry?.move || 'START';
  els.replayTime.textContent = entry
    ? `${formatTime(entry.elapsedMs)} · move ${state.replayIndex + 1} of ${solve.moves.length}`
    : `0:00.000 · ${solve.moves.length} moves total`;

  els.replaySequence.innerHTML = solve.moves.map((m, i) => `
    <button class="replay-token ${i === state.replayIndex ? 'active' : ''}" data-replay-index="${i}" title="${shortTime(m.gapMs)} since previous move">${m.move}</button>
  `).join('');

  els.replaySequence.querySelectorAll('[data-replay-index]').forEach(button => {
    button.addEventListener('click', () => {
      state.replayIndex = Number(button.dataset.replayIndex);
      els.replaySlider.value = state.replayIndex;
      renderReplay();
    });
  });

  els.analysisPreview.innerHTML = buildEarlyAnalysis(solve);
}

function buildEarlyAnalysis(solve) {
  const gaps = solve.moves.slice(1).map((m, i) => ({ gap: m.gapMs, moveNumber: i + 2, move: m.move }));
  const worst = [...gaps].sort((a, b) => b.gap - a.gap)[0];
  const reversals = [];
  for (let i = 1; i < solve.moves.length; i++) {
    if (isImmediateInverse(solve.moves[i - 1].move, solve.moves[i].move)) reversals.push(i + 1);
  }
  const notes = [];
  if (worst?.gap >= 1500) notes.push(`Your longest pause was <strong>${shortTime(worst.gap)}</strong> before move ${worst.moveNumber} (${escapeHtml(worst.move)}). That is the first place worth reviewing.`);
  else notes.push('No large pauses showed up in this solve. That usually shifts attention toward move efficiency rather than recognition delay.');
  if (reversals.length) notes.push(`I spotted <strong>${reversals.length}</strong> immediate move reversal${reversals.length === 1 ? '' : 's'}. They may be intentional, but later coaching can check whether they were corrections.`);
  notes.push(`Average turning rate was <strong>${solve.stats.tps.toFixed(2)} TPS</strong> across ${solve.stats.moveCount} recorded moves.`);
  return `<span class="section-kicker">EARLY COACHING SIGNAL</span><p>${notes.join(' ')}</p>`;
}

function isImmediateInverse(a, b) {
  if (!a || !b) return false;
  const parse = move => ({ face: move[0], amount: move.includes('2') ? 2 : move.includes("'") ? -1 : 1 });
  const x = parse(a);
  const y = parse(b);
  return x.face === y.face && ((x.amount === 1 && y.amount === -1) || (x.amount === -1 && y.amount === 1));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
}

function renderCube(facelets) {
  const clean = normalizeFacelets(facelets);
  const valid = clean.length === 54;
  const faces = valid ? [0, 9, 18, 27, 36, 45].map(start => clean.slice(start, start + 9)) : Array(6).fill('?????????');
  const labels = ['U', 'R', 'F', 'D', 'L', 'B'];
  els.cubeNet.innerHTML = faces.map((face, faceIndex) => `
    <div class="cube-face face-${labels[faceIndex].toLowerCase()}">
      <span class="face-label">${labels[faceIndex]}</span>
      <div class="face-grid">
        ${[...face].map(token => `<span class="sticker ${stickerClass(token)}" title="${token}"></span>`).join('')}
      </div>
    </div>
  `).join('');
}

function stickerClass(token) {
  const t = String(token).toUpperCase();
  const map = {
    U:'white', W:'white',
    R:'red',
    F:'green', G:'green',
    D:'yellow', Y:'yellow',
    L:'orange', O:'orange',
    B:'blue'
  };
  return map[t] || 'unknown';
}

async function runDemo() {
  if (state.demoRunning || state.running || state.armed) resetCurrentSolve();
  state.demoRunning = true;
  state.deviceName = 'Demo Rubik\'s Connected';
  els.deviceStatus.textContent = 'Demo cube';
  els.batteryStatus.textContent = '87%';
  setConnectionUi('connected', 'Demo mode');
  armSolve();
  logDiagnostic('Demo sequence started');

  const sequence = [
    ['R', 0], ['U', 220], ["R'", 210], ["U'", 240],
    ['F', 410], ['R', 260], ['U', 230], ["R'", 250],
    ['U', 2450], ['U', 180], ['R', 240], ["U'", 260], ["R'", 240],
    ['F2', 720], ['D', 300], ['R', 225], ["R'", 1850], ['U2', 260], ['F', 220], ['F2', 260]
  ];

  for (const [move, delay] of sequence) {
    if (!state.demoRunning) return;
    await sleep(delay || 180);
    receiveMove(move, { timestamp: Math.round(now()) });
  }
  await sleep(350);
  finishSolve('demo');
  setConnectionUi('idle', 'Not connected');
  els.deviceStatus.textContent = '—';
  els.batteryStatus.textContent = '—';
  els.connectBtn.disabled = false;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

els.connectBtn.addEventListener('click', connectCube);
els.resetCubeBtn.addEventListener('click', resetCubeState);
els.demoBtn.addEventListener('click', runDemo);
els.armBtn.addEventListener('click', armSolve);
els.finishBtn.addEventListener('click', () => finishSolve('manual'));
els.reviewSolveBtn.addEventListener('click', () => {
  const solveId = els.reviewSolveBtn.dataset.solveId;
  if (solveId) openSolveReplay(solveId);
});
els.resetBtn.addEventListener('click', () => {
  resetCurrentSolve();
  logDiagnostic('Current solve reset');
});
els.clearHistoryBtn.addEventListener('click', () => {
  const activeProfile = getActiveProfile();
  const visibleSolves = getVisibleSolves();
  if (!visibleSolves.length) return;
  if (!confirm(`Delete locally saved solves for ${activeProfile?.name || 'this profile'}?`)) return;
  state.solves = state.solves.filter(solve => solve.profileId !== state.activeProfileId);
  state.replaySolveId = null;
  saveSolves();
  renderHistory();
  renderReplay();
});
els.profileMenuBtn.addEventListener('click', () => {
  setProfileMenuOpen(els.profileOptions.hidden);
});
els.profileForm.addEventListener('submit', addProfile);
els.cancelProfileBtn.addEventListener('click', closeProfileForm);
els.profileModal.addEventListener('click', event => {
  if (event.target === els.profileModal) closeProfileForm();
});
els.closeReplayBtn.addEventListener('click', closeSolveReplay);
els.replayModal.addEventListener('click', event => {
  if (event.target === els.replayModal) closeSolveReplay();
});
els.reviewPlayBtn.addEventListener('click', () => {
  if (state.reviewPlaying) pauseReview();
  else playReview();
});
els.reviewRestartBtn.addEventListener('click', () => {
  pauseReview();
  resetReviewToStart();
  if (state.reviewPhase === 'preroll') updateReviewPrerollAtTime(0);
  else updateReviewAtTime(0);
});
els.reviewPrevBtn.addEventListener('click', () => jumpReviewToMove(-1));
els.reviewNextBtn.addEventListener('click', () => jumpReviewToMove(1));
els.reviewStopBtn.addEventListener('click', () => {
  pauseReview();
  resetReviewToStart();
  if (state.reviewPhase === 'preroll') updateReviewPrerollAtTime(0);
  else updateReviewAtTime(0);
});
els.reviewSpeedSelect.addEventListener('change', event => {
  state.reviewSpeed = Number(event.target.value) || 1;
});
els.reviewScrubber.addEventListener('input', event => {
  pauseReview();
  updateReviewAtTime(Number(event.target.value));
});
document.addEventListener('click', event => {
  if (!els.profileOptions.hidden && !event.target.closest('.profile-menu')) setProfileMenuOpen(false);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    setProfileMenuOpen(false);
    if (!els.profileModal.hidden) closeProfileForm();
    if (!els.replayModal.hidden) closeSolveReplay();
  }
});
els.replaySlider.addEventListener('input', event => {
  state.replayIndex = Number(event.target.value);
  renderReplay();
});
els.copyDiagnosticsBtn.addEventListener('click', async () => {
  const text = state.diagnostics.join('\n') || 'No events yet.';
  try {
    await navigator.clipboard.writeText(text);
    els.copyDiagnosticsBtn.textContent = 'Copied';
    setTimeout(() => { els.copyDiagnosticsBtn.textContent = 'Copy diagnostics'; }, 1200);
  } catch {
    logDiagnostic('Clipboard copy failed');
  }
});
els.clearDiagnosticsBtn.addEventListener('click', () => {
  state.diagnostics = [];
  els.diagnosticLog.textContent = 'No events yet.';
});

renderCube(SOLVED_FACELETS);
renderProfileMenu();
renderHistory();
renderReplay();
updateStageRecognition();
detectBluetoothSupport();
updateResetControls();

if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(error => logDiagnostic('Service worker registration failed', { message: error.message }));
  });
}
