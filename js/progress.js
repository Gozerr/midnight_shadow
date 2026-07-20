const STORAGE_KEY = "midnight-shadow-state";
const SECRET = "voronov-1948";
let memoryState = null;

const defaults = {
  startedAt: Date.now(),
  elapsedBeforePause: 0,
  paused: false,
  pauseStartedAt: null,
  unlocked: [],
  choices: [],
  notes: [],
  ending: null,
};

const toBase64 = (value) => btoa(unescape(encodeURIComponent(value)));
const fromBase64 = (value) => decodeURIComponent(escape(atob(value)));

function xorCrypt(value) {
  return Array.from(value)
    .map((char, index) => String.fromCharCode(char.charCodeAt(0) ^ SECRET.charCodeAt(index % SECRET.length)))
    .join("");
}

function loadState() {
  let raw = memoryState;
  try {
    raw = localStorage.getItem(STORAGE_KEY) || memoryState;
  } catch {
    raw = memoryState;
  }

  if (!raw) {
    return { ...defaults, startedAt: Date.now() };
  }

  try {
    const decoded = xorCrypt(fromBase64(raw));
    return { ...defaults, ...JSON.parse(decoded) };
  } catch {
    return { ...defaults, startedAt: Date.now() };
  }
}

function saveState(state) {
  const packed = toBase64(xorCrypt(JSON.stringify(state)));
  memoryState = packed;
  try {
    localStorage.setItem(STORAGE_KEY, packed);
  } catch {
    memoryState = packed;
  }
}

function resetState() {
  memoryState = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    memoryState = null;
  }
}

function hasUnlock(state, id) {
  return state.unlocked.includes(id);
}

function unlockMany(state, ids) {
  let changed = false;
  ids.forEach((id) => {
    if (!state.unlocked.includes(id)) {
      state.unlocked.push(id);
      changed = true;
    }
  });
  if (changed) {
    saveState(state);
  }
  return changed;
}

async function hashInput(input) {
  const normalized = input.trim().toLowerCase().replaceAll("ё", "е");
  if (!window.crypto || !window.crypto.subtle || !window.TextEncoder) {
    return "";
  }
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function matchesPassword(input, hash) {
  const normalized = input.trim().toLowerCase().replaceAll("ё", "е");
  const fallbackCodes = {
    "59e6d95bf36622a92a85ba609b88d5bce6e6f8f4b34d2cbc452b83e7dd7f1837": "воронов",
    "581f7d14c96c4fca3e3be08fd0580526843492b1b0d45bd64c740f997e5f49cb": "полночь",
    "bc611d02af9630381b06561bc2d9bacb6351f87d39e7c0c5a91ddb862f72617e": "север",
    "9fdd8d382c849be1e5dfa6460e6ff9c1fcf24f060ebfb21e26daa3e89a754759": "белецкая",
    "d01a7dbd2e27f574c9ccc293103afa3a3ff4491a078c0810e112b913cd8243a6": "сатурн",
    "ecbb1c68c19cf5b04d81b40b360352d3f20d9105b9e366e50c8a02221bc9e8d6": "миндаль",
  };

  try {
    const hashed = await hashInput(input);
    if (hashed && hashed === hash) {
      return true;
    }
  } catch {
    return fallbackCodes[hash] === normalized;
  }

  return fallbackCodes[hash] === normalized;
}

function chooseBranch(state, choiceId) {
  state.choices = state.choices.filter((id) => id !== choiceId);
  state.choices.push(choiceId);
  saveState(state);
}

function addNote(state, text) {
  const clean = text.trim();
  if (!clean) {
    return false;
  }
  state.notes.unshift({
    id: window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : String(Date.now()),
    text: clean,
    createdAt: new Date().toISOString(),
  });
  saveState(state);
  return true;
}

window.MidnightShadowProgress = {
  addNote,
  chooseBranch,
  hasUnlock,
  loadState,
  matchesPassword,
  resetState,
  saveState,
  unlockMany,
};
