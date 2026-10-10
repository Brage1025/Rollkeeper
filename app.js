/**
 * Rollkeeper keeps one encounter in memory and copies it to localStorage
 * after every change. The storage key is namespaced so it does not collide
 * with other pages on the same origin.
 *
 * First visit (no saved key) loads a sample fight. Reset writes an empty
 * encounter with initialized: true. A later refresh must not treat that
 * empty save as "never opened" and bring the samples back.
 */

const STORAGE_KEY = "rollkeeper.encounter";

const SAMPLE_COMBATANTS = [
  ["Lyra Vale", 19, 24, 24],
  ["Goblin Boss", 15, 21, 12],
  ["Thorin Ironfoot", 14, 38, 18],
  ["Ashen Wolf", 11, 11, 2],
];

const els = {
  form: document.querySelector("#add-form"),
  name: document.querySelector("#combatant-name"),
  initiative: document.querySelector("#combatant-initiative"),
  maxHp: document.querySelector("#combatant-max-hp"),
  currentHp: document.querySelector("#combatant-current-hp"),
  formError: document.querySelector("#form-error"),
  list: document.querySelector("#combatant-list"),
  empty: document.querySelector("#empty-state"),
  round: document.querySelector("#round-number"),
  acting: document.querySelector("#acting-name"),
  announcement: document.querySelector("#turn-announcement"),
  storageNote: document.querySelector("#storage-note"),
  nextTurn: document.querySelector("#next-turn"),
  reset: document.querySelector("#reset-encounter"),
  resetDialog: document.querySelector("#reset-dialog"),
};

let state = { round: 1, activeId: null, combatants: [], started: false };
let storageNote = "";
let pendingFocus = null;

function createId() {
  if (globalThis.crypto && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      // file:// is not a secure context in every browser, so randomUUID can throw.
    }
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createSampleState() {
  const combatants = SAMPLE_COMBATANTS.map(([name, initiative, maxHp, currentHp], order) => ({
    id: createId(),
    name,
    initiative,
    maxHp,
    currentHp,
    order,
  }));

  return {
    round: 1,
    activeId: combatants[0].id,
    combatants,
    // The sample is a list to edit, not a round already in progress.
    // The highlight stays on the highest initiative until Next Turn or an HP button.
    started: false,
  };
}

function compareCombatants(a, b) {
  if (b.initiative !== a.initiative) return b.initiative - a.initiative;
  return a.order - b.order;
}

function activeCombatant() {
  return state.combatants.find((combatant) => combatant.id === state.activeId) || null;
}

function readInteger(raw) {
  const text = String(raw).trim();
  if (text === "") return { empty: true };
  if (!/^[+-]?\d+$/.test(text)) return { invalid: true };
  const value = Number(text);
  if (!Number.isSafeInteger(value)) return { invalid: true };
  return { value };
}

function sanitizeCombatant(entry, seenIds) {
  if (!entry || typeof entry !== "object") return null;
  if (typeof entry.id !== "string" || entry.id.length === 0 || entry.id.length > 80) return null;
  if (seenIds.has(entry.id)) return null;
  if (typeof entry.name !== "string") return null;

  const name = entry.name.replace(/\s+/g, " ").trim();
  if (!name || name.length > 40) return null;
  if (!Number.isInteger(entry.initiative) || entry.initiative < -99 || entry.initiative > 99) return null;
  if (!Number.isInteger(entry.maxHp) || entry.maxHp < 1 || entry.maxHp > 999) return null;
  if (!Number.isInteger(entry.currentHp)) return null;

  seenIds.add(entry.id);
  return {
    id: entry.id,
    name,
    initiative: entry.initiative,
    maxHp: entry.maxHp,
    currentHp: Math.min(entry.maxHp, Math.max(0, entry.currentHp)),
    order: Number.isInteger(entry.order) ? entry.order : 0,
  };
}

function sanitizeState(data) {
  if (!data || typeof data !== "object" || data.initialized !== true || !Array.isArray(data.combatants)) {
    return null;
  }

  const seenIds = new Set();
  const combatants = data.combatants
    .map((entry) => sanitizeCombatant(entry, seenIds))
    .filter(Boolean)
    .sort(compareCombatants);

  let activeId = typeof data.activeId === "string" ? data.activeId : null;
  if (combatants.length === 0) {
    activeId = null;
  } else if (!combatants.some((combatant) => combatant.id === activeId)) {
    activeId = combatants[0].id;
  }

  const round = Number.isInteger(data.round) && data.round >= 1 ? data.round : 1;
  let started = data.started === true;
  if (data.started == null && combatants.length > 0) {
    const topId = combatants[0].id;
    started = round > 1 || activeId !== topId;
  }
  if (combatants.length === 0) started = false;

  return {
    round: combatants.length === 0 ? 1 : round,
    activeId,
    combatants,
    started,
  };
}

function payload() {
  return {
    version: 1,
    initialized: true,
    round: state.round,
    activeId: state.activeId,
    started: state.started === true,
    combatants: state.combatants.map((combatant) => ({
      id: combatant.id,
      name: combatant.name,
      initiative: combatant.initiative,
      maxHp: combatant.maxHp,
      currentHp: combatant.currentHp,
      order: combatant.order,
    })),
  };
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload()));
    return true;
  } catch {
    return false;
  }
}

function persist() {
  if (save()) {
    storageNote = "";
  } else {
    storageNote = "This browser blocked saving, so a refresh can lose this encounter.";
  }
}

function loadState() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    state = createSampleState();
    storageNote = "This browser blocked saved encounters. A sample fight is showing, and changes may disappear on refresh.";
    return;
  }

  if (raw === null) {
    state = createSampleState();
    if (!save()) {
      storageNote = "This browser blocked saved encounters. A sample fight is showing, and changes may disappear on refresh.";
    }
    return;
  }

  try {
    const saved = sanitizeState(JSON.parse(raw));
    if (!saved) {
      state = createSampleState();
      save();
      storageNote = "The saved encounter could not be read. A sample fight was loaded instead.";
      return;
    }
    state = saved;
  } catch {
    state = createSampleState();
    save();
    storageNote = "The saved encounter could not be read. A sample fight was loaded instead.";
  }
}

function clearFieldErrors() {
  for (const input of els.form.querySelectorAll("input")) {
    input.removeAttribute("aria-invalid");
  }
  els.currentHp.setAttribute("aria-describedby", "current-hp-hint");
  els.formError.textContent = "";
}

function showError(input, message) {
  els.formError.textContent = message;
  input.setAttribute("aria-invalid", "true");
  const describedBy = input === els.currentHp ? "current-hp-hint form-error" : "form-error";
  input.setAttribute("aria-describedby", describedBy);
  input.focus();
}

function nextOrder() {
  return state.combatants.reduce((highest, combatant) => Math.max(highest, combatant.order), -1) + 1;
}

function addCombatant(event) {
  event.preventDefault();
  clearFieldErrors();

  const name = els.name.value.replace(/\s+/g, " ").trim();
  const initiative = readInteger(els.initiative.value);
  const maxHp = readInteger(els.maxHp.value);
  const currentHp = readInteger(els.currentHp.value);

  if (!name) {
    showError(els.name, "Enter a name.");
    return;
  }
  if (name.length > 40) {
    showError(els.name, "Use 40 characters or fewer for the name.");
    return;
  }
  if (initiative.empty) {
    showError(els.initiative, "Enter an initiative score.");
    return;
  }
  if (initiative.invalid || initiative.value < -99 || initiative.value > 99) {
    showError(els.initiative, "Initiative must be a whole number from -99 to 99.");
    return;
  }
  if (maxHp.empty) {
    showError(els.maxHp, "Enter a maximum HP.");
    return;
  }
  if (maxHp.invalid || maxHp.value < 1 || maxHp.value > 999) {
    showError(els.maxHp, "Maximum HP must be a whole number from 1 to 999.");
    return;
  }
  if (currentHp.invalid || (!currentHp.empty && (currentHp.value < 0 || currentHp.value > maxHp.value))) {
    showError(els.currentHp, `Current HP must be a whole number from 0 to ${maxHp.value}.`);
    return;
  }

  const combatant = {
    id: createId(),
    name,
    initiative: initiative.value,
    maxHp: maxHp.value,
    currentHp: currentHp.empty ? maxHp.value : currentHp.value,
    order: nextOrder(),
  };

  state.combatants.push(combatant);
  state.combatants.sort(compareCombatants);
  // Until the round starts, the highlight belongs to whoever is first.
  if (!state.started) {
    state.activeId = state.combatants[0].id;
    state.round = 1;
  }

  els.form.reset();
  persist();
  render();
  els.name.focus();
}

function adjustHp(id, delta) {
  const combatant = state.combatants.find((entry) => entry.id === id);
  if (!combatant) return;

  const nextHp = Math.min(combatant.maxHp, Math.max(0, combatant.currentHp + delta));
  if (nextHp === combatant.currentHp) return;

  combatant.currentHp = nextHp;
  state.started = true;
  persist();
  render();
}

function removeCombatant(id) {
  const index = state.combatants.findIndex((combatant) => combatant.id === id);
  if (index === -1) return;

  const wasActive = state.activeId === id;
  state.combatants.splice(index, 1);

  if (state.combatants.length === 0) {
    state.activeId = null;
    state.round = 1;
    state.started = false;
  } else if (!state.started) {
    state.activeId = state.combatants[0].id;
  } else if (wasActive) {
    const next = state.combatants[index] || state.combatants[0];
    state.activeId = next.id;
  }

  pendingFocus = null;
  persist();
  render();

  if (state.combatants.length === 0) {
    els.name.focus();
  } else if (!els.nextTurn.disabled) {
    els.nextTurn.focus();
  }
}

function advanceTurn() {
  if (state.combatants.length === 0) return;

  state.started = true;
  const index = state.combatants.findIndex((combatant) => combatant.id === state.activeId);
  if (index === -1) {
    state.activeId = state.combatants[0].id;
  } else {
    const nextIndex = (index + 1) % state.combatants.length;
    if (nextIndex === 0) state.round += 1;
    state.activeId = state.combatants[nextIndex].id;
  }

  persist();
  render();
}

function resetEncounter() {
  state = {
    round: 1,
    activeId: null,
    combatants: [],
    started: false,
  };
  pendingFocus = null;
  persist();
  render();
  els.name.focus();
}

function requestReset() {
  if (state.combatants.length === 0) return;

  if (typeof els.resetDialog.showModal === "function") {
    if (els.resetDialog.open) return;
    els.resetDialog.returnValue = "";
    els.resetDialog.showModal();
    return;
  }

  const confirmed = window.confirm(
    "Reset this encounter? Every combatant will be removed and the round returns to 1."
  );
  if (confirmed) resetEncounter();
}

function healthTone(combatant) {
  if (combatant.currentHp === 0) return "is-down";
  const ratio = combatant.currentHp / combatant.maxHp;
  if (ratio <= 0.25) return "is-low";
  if (ratio <= 0.5) return "is-mid";
  return "is-high";
}

function renderStorageNote() {
  els.storageNote.hidden = storageNote === "";
  els.storageNote.textContent = storageNote;
}

function renderTurn() {
  const acting = activeCombatant();
  els.round.textContent = String(state.round);
  els.acting.textContent = acting ? acting.name : "No one yet";

  const announcement = acting
    ? `${acting.name}'s turn. Round ${state.round}.`
    : "No combatants yet. Round 1.";
  if (els.announcement.textContent !== announcement) {
    els.announcement.textContent = announcement;
  }

  const hasCombatants = state.combatants.length > 0;
  els.nextTurn.disabled = !hasCombatants;
  els.reset.disabled = !hasCombatants;
}

function renderCombatant(combatant) {
  const isActive = combatant.id === state.activeId;
  const tone = healthTone(combatant);
  const percent = (combatant.currentHp / combatant.maxHp) * 100;

  const item = document.createElement("li");
  item.className = "card";
  if (isActive) {
    item.classList.add("is-active");
    item.setAttribute("aria-current", "true");
  }
  if (combatant.currentHp === 0) item.classList.add("is-down");

  const initiative = document.createElement("p");
  initiative.className = "initiative";
  initiative.setAttribute("aria-label", `Initiative ${combatant.initiative}`);
  const initiativeLabel = document.createElement("span");
  initiativeLabel.className = "initiative-label";
  initiativeLabel.setAttribute("aria-hidden", "true");
  initiativeLabel.textContent = "Init";
  const initiativeValue = document.createElement("span");
  initiativeValue.className = "initiative-value";
  initiativeValue.setAttribute("aria-hidden", "true");
  initiativeValue.textContent = String(combatant.initiative);
  initiative.append(initiativeLabel, initiativeValue);

  const body = document.createElement("div");
  body.className = "card-body";

  const heading = document.createElement("div");
  heading.className = "card-heading";
  const name = document.createElement("h3");
  name.textContent = combatant.name;
  heading.append(name);

  const pills = document.createElement("div");
  pills.className = "pills";
  if (isActive) {
    const activePill = document.createElement("p");
    activePill.className = "status-pill";
    activePill.textContent = "Active";
    pills.append(activePill);
  }
  if (combatant.currentHp === 0) {
    const downPill = document.createElement("p");
    downPill.className = "status-pill is-down";
    downPill.textContent = "Down";
    pills.append(downPill);
  }
  if (pills.childElementCount > 0) heading.append(pills);

  const meter = document.createElement("div");
  meter.className = "health";
  meter.setAttribute("role", "meter");
  meter.setAttribute("aria-valuemin", "0");
  meter.setAttribute("aria-valuemax", String(combatant.maxHp));
  meter.setAttribute("aria-valuenow", String(combatant.currentHp));
  meter.setAttribute("aria-label", `${combatant.name} hit points`);
  meter.setAttribute("aria-valuetext", `${combatant.currentHp} of ${combatant.maxHp} hit points`);
  const fill = document.createElement("div");
  fill.className = `health-fill ${tone}`;
  if (combatant.currentHp > 0) fill.classList.add("has-hp");
  fill.style.width = `${percent}%`;
  const readout = document.createElement("span");
  readout.className = "hp-readout";
  readout.setAttribute("aria-hidden", "true");
  readout.textContent = `${combatant.currentHp} / ${combatant.maxHp}`;
  meter.append(fill, readout);

  const actions = document.createElement("div");
  actions.className = "card-actions";
  const hpControls = document.createElement("div");
  hpControls.className = "hp-controls";

  const decrease = document.createElement("button");
  decrease.type = "button";
  decrease.className = "button button-secondary hp-button";
  decrease.textContent = "−";
  decrease.setAttribute("aria-label", `Decrease ${combatant.name}'s hit points`);
  decrease.dataset.focusKey = `hp-down-${combatant.id}`;
  decrease.disabled = combatant.currentHp === 0;
  decrease.addEventListener("click", () => {
    pendingFocus = decrease.dataset.focusKey;
    adjustHp(combatant.id, -1);
  });

  const increase = document.createElement("button");
  increase.type = "button";
  increase.className = "button button-secondary hp-button";
  increase.textContent = "+";
  increase.setAttribute("aria-label", `Increase ${combatant.name}'s hit points`);
  increase.dataset.focusKey = `hp-up-${combatant.id}`;
  increase.disabled = combatant.currentHp === combatant.maxHp;
  increase.addEventListener("click", () => {
    pendingFocus = increase.dataset.focusKey;
    adjustHp(combatant.id, 1);
  });

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "button button-secondary remove-button";
  remove.textContent = "Remove";
  remove.setAttribute("aria-label", `Remove ${combatant.name}`);
  remove.addEventListener("click", () => removeCombatant(combatant.id));

  hpControls.append(decrease, increase);
  actions.append(hpControls, remove);
  body.append(heading, meter, actions);
  item.append(initiative, body);
  return item;
}

function restoreFocus() {
  if (!pendingFocus) return;
  const key = pendingFocus;
  pendingFocus = null;

  const current = document.querySelector(`[data-focus-key="${CSS.escape(key)}"]`);
  if (current && !current.disabled) {
    current.focus();
    return;
  }

  const fallbackKey = key.startsWith("hp-up-")
    ? key.replace("hp-up-", "hp-down-")
    : key.replace("hp-down-", "hp-up-");
  const fallback = document.querySelector(`[data-focus-key="${CSS.escape(fallbackKey)}"]`);
  if (fallback && !fallback.disabled) fallback.focus();
}

function render() {
  renderStorageNote();
  renderTurn();
  const hasCombatants = state.combatants.length > 0;
  els.empty.hidden = hasCombatants;
  els.list.hidden = !hasCombatants;
  els.list.replaceChildren(...state.combatants.map(renderCombatant));
  restoreFocus();
}

function bindEvents() {
  els.form.addEventListener("submit", addCombatant);
  els.form.addEventListener("input", clearFieldErrors);
  els.nextTurn.addEventListener("click", advanceTurn);
  els.reset.addEventListener("click", requestReset);

  els.resetDialog.addEventListener("close", () => {
    const choice = els.resetDialog.returnValue;
    els.resetDialog.returnValue = "";
    if (choice === "confirm") resetEncounter();
  });

  els.resetDialog.addEventListener("cancel", () => {
    els.resetDialog.returnValue = "";
  });

  els.resetDialog.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !els.resetDialog.open) return;
    event.preventDefault();
    els.resetDialog.close("cancel");
  });

  els.resetDialog.addEventListener("click", (event) => {
    if (event.target === els.resetDialog) els.resetDialog.close("cancel");
  });

}

loadState();
bindEvents();
render();
