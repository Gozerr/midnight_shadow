import "./progress.js";
import "./dialogues.js";
import "./gameData.js";

const {
  GAME_DURATION_MS,
  clues,
  dossier,
  endings,
  journalChoices,
  passwords,
  suspects,
} = window.MidnightShadowData;

const dialogues = window.MidnightShadowDialogues;

const {
  addNote,
  chooseBranch,
  hasUnlock,
  loadState,
  matchesPassword,
  resetState,
  saveState,
  unlockMany,
} = window.MidnightShadowProgress;

let state = loadState();
const page = document.body.dataset.page;

const $ = (selector) => document.querySelector(selector);

function markJsLoaded() {
  const status = $("#js-status");
  if (status) {
    status.textContent = "JS загружен";
  }
}

function toast(message) {
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 3200);
}

function getElapsedMs() {
  if (state.paused) {
    return state.elapsedBeforePause;
  }
  return state.elapsedBeforePause + (Date.now() - state.startedAt);
}

function getRemainingMs() {
  return Math.max(0, GAME_DURATION_MS - getElapsedMs());
}

function formatTime(ms) {
  const total = Math.ceil(ms / 1000);
  const hours = String(Math.floor(total / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function renderTimer() {
  const display = $("#timer-display");
  const toggle = $("#timer-toggle");
  if (!display || !toggle) {
    return;
  }

  const remaining = getRemainingMs();
  display.textContent = formatTime(remaining);
  toggle.textContent = state.paused ? "Продолжить" : "Пауза";

  if (remaining <= 0 && state.ending !== "timeout") {
    state.ending = "timeout";
    saveState(state);
    if (page === "endings") {
      renderEnding();
    }
  }
}

function setupTimer() {
  const toggle = $("#timer-toggle");
  if (toggle) {
    toggle.addEventListener("click", () => {
      if (state.paused) {
        state.startedAt = Date.now();
        state.paused = false;
        state.pauseStartedAt = null;
      } else {
        state.elapsedBeforePause = getElapsedMs();
        state.paused = true;
        state.pauseStartedAt = Date.now();
      }
      saveState(state);
      renderTimer();
    });
  }
  renderTimer();
  setInterval(renderTimer, 1000);
}

function renderDossier() {
  const content = $("#dossier-content");
  const status = $("#global-status");
  if (!content) {
    return;
  }

  if (!hasUnlock(state, "dossier")) {
    content.innerHTML = "<p>Доступ к досье закрыт. Введите пароль, чтобы увидеть основные факты.</p>";
    if (status) status.textContent = "закрыто";
    return;
  }

  if (status) status.textContent = "досье открыто";
  content.innerHTML = `
    <article class="paper" style="--tilt:-1deg">
      <p class="meta">рассекречено</p>
      <h3>${dossier.title}</h3>
      ${dossier.body.map((line) => `<p>${line}</p>`).join("")}
      <p><strong>${dossier.next}</strong></p>
    </article>
  `;
}

function setupIndex() {
  renderDossier();
  const test = $("#self-test");
  const input = $("#entry-password");
  const button = $("#unlock-dossier");
  if (test) {
    test.addEventListener("click", async () => {
      const timerOk = Boolean($("#timer-display") && $("#timer-display").textContent !== "10:00:00");
      const passwordOk = await matchesPassword("воронов", passwords.dossier.hash);
      const storageOk = (() => {
        try {
          saveState(state);
          return true;
        } catch {
          return false;
        }
      })();
      toast(`JS: да · таймер: ${timerOk ? "идёт" : "проверьте через секунду"} · пароль: ${passwordOk ? "да" : "нет"} · сохранение: ${storageOk ? "да" : "резерв"}`);
    });
  }
  if (!input || !button) {
    return;
  }

  button.addEventListener("click", async () => {
    if (await matchesPassword(input.value, passwords.dossier.hash)) {
      unlockMany(state, passwords.dossier.unlocks);
      renderDossier();
      toast("Досье открыто. На доске появилась первая улика.");
      input.value = "";
    } else {
      toast("Код не подходит. Проверьте регистр, пробелы и смысл.");
    }
  });
}

function renderClues() {
  const list = $("#clues-list");
  const count = $("#clue-count");
  if (!list) {
    return;
  }

  const opened = clues.filter((clue) => hasUnlock(state, clue.id));
  if (count) count.textContent = `${opened.length} открыто`;

  list.innerHTML = clues
    .map((clue, index) => {
      const unlocked = hasUnlock(state, clue.id);
      return `
        <article class="${unlocked ? "paper" : "paper locked"}" style="--tilt:${index % 2 ? 1.2 : -0.8}deg">
          <p class="meta">${clue.time} · ${clue.type}</p>
          <h3>${unlocked ? clue.title : "Материал закрыт"}</h3>
          <p>${unlocked ? clue.secretText : clue.publicText}</p>
          ${
            unlocked
              ? `${renderCluePreview(clue)}<a class="file-link" href="${clue.file}" target="_blank" rel="noreferrer">Открыть файл ${clue.type}</a>`
              : "<p class=\"meta\">требуется код</p>"
          }
        </article>
      `;
    })
    .join("");
}

function renderCluePreview(clue) {
  if (clue.type === "PDF") {
    return `<iframe class="material-preview pdf-preview" src="${clue.file}" title="${clue.title}"></iframe>`;
  }
  if (clue.type === "Скан") {
    return `<img class="material-preview" src="${clue.file}" alt="${clue.title}" />`;
  }
  if (clue.type === "Аудио") {
    return `<audio class="material-preview audio-preview" controls src="${clue.file}"></audio>`;
  }
  return "";
}

function setupClues() {
  renderClues();
  const input = $("#clue-password");
  const button = $("#unlock-clue");
  if (!input || !button) {
    return;
  }

  button.addEventListener("click", async () => {
    for (const code of passwords.clueCodes) {
      if (await matchesPassword(input.value, code.hash)) {
        const changed = unlockMany(state, code.unlocks);
        renderClues();
        toast(changed ? "Материал добавлен на доску." : "Этот материал уже открыт.");
        input.value = "";
        return;
      }
    }
    toast("Такого кода нет в архиве.");
  });
}

function renderSuspects() {
  const list = $("#suspects-list");
  const count = $("#suspect-count");
  if (!list) {
    return;
  }

  const opened = suspects.filter((suspect) => hasUnlock(state, suspect.unlock));
  if (count) count.textContent = `${opened.length} допрошено`;

  list.innerHTML = suspects
    .map((suspect, index) => {
      const unlocked = hasUnlock(state, suspect.unlock);
      const dialogue = dialogues[suspect.id];
      return `
        <article class="${unlocked ? "suspect-card" : "suspect-card locked"}" style="--tilt:${index % 2 ? -1 : 1.1}deg">
          <p class="meta">${suspect.role}</p>
          <h3>${suspect.name}</h3>
          <p><strong>Мотив:</strong> ${unlocked ? suspect.motive : "закрыто"}</p>
          <p><strong>Алиби:</strong> ${unlocked ? suspect.alibi : "закрыто"}</p>
          <div class="dialogue">
            ${
              unlocked
                ? dialogue.lines.map((line) => `<p>«${line}»</p>`).join("")
                : `<p>${dialogue.locked}</p>`
            }
          </div>
        </article>
      `;
    })
    .join("");
}

function setupJournal() {
  renderChoices();
  renderNotes();

  const save = $("#save-note");
  const input = $("#note-input");
  if (save && input) {
    save.addEventListener("click", () => {
      if (addNote(state, input.value)) {
        input.value = "";
        renderNotes();
        toast("Запись сохранена в журнале.");
      }
    });
  }

  const reset = $("#reset-progress");
  if (reset) {
    reset.addEventListener("click", () => {
      if (confirm("Сбросить таймер, пароли, заметки и выборы?")) {
        resetState();
        state = loadState();
        renderChoices();
        renderNotes();
        renderTimer();
        toast("Прогресс очищен.");
      }
    });
  }
}

function renderChoices() {
  const list = $("#journal-choices");
  const status = $("#branch-status");
  if (!list) {
    return;
  }
  if (status) status.textContent = state.choices.length ? `${state.choices.length} версии` : "нет версии";

  list.innerHTML = journalChoices
    .map((choice) => {
      const available = choice.requires.every((id) => hasUnlock(state, id));
      const selected = state.choices.includes(choice.id);
      return `
        <article class="choice-card ${selected ? "selected" : ""} ${available ? "" : "locked"}">
          <h3>${choice.title}</h3>
          <p>${choice.text}</p>
          <div class="mini-tags">${choice.requires.map((item) => `<span>${item}</span>`).join("")}</div>
          <button class="button ${selected ? "secondary" : ""}" data-choice="${choice.id}" ${available ? "" : "disabled"} type="button">
            ${selected ? "Версия принята" : available ? "Выбрать версию" : "Недостаточно материалов"}
          </button>
        </article>
      `;
    })
    .join("");

  list.querySelectorAll("[data-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      chooseBranch(state, button.dataset.choice);
      renderChoices();
      toast("Версия записана. Финал изменится.");
    });
  });
}

function renderNotes() {
  const list = $("#journal-notes");
  if (!list) {
    return;
  }

  if (!state.notes.length) {
    list.innerHTML = "<div class=\"locked-panel\"><p>Пока нет личных заметок.</p></div>";
    return;
  }

  list.innerHTML = state.notes
    .map((note) => {
      const date = new Date(note.createdAt).toLocaleString("ru-RU");
      return `<article class="note"><p class="meta">${date}</p>${escapeHtml(note.text)}</article>`;
    })
    .join("");
}

function escapeHtml(text) {
  const node = document.createElement("div");
  node.textContent = text;
  return node.innerHTML;
}

function calculateEnding() {
  if (state.ending === "timeout") {
    return "timeout";
  }

  const effects = state.choices
    .map((choiceId) => journalChoices.find((choice) => choice.id === choiceId))
    .filter(Boolean)
    .map((choice) => choice.effect);

  const hasCoreTruth = ["telegram", "ledger", "lab"].every((id) => hasUnlock(state, id));
  if (hasCoreTruth && effects.filter((effect) => effect === "truth").length >= 2) {
    return "truth";
  }
  if (effects.includes("justice") && hasUnlock(state, "telegram")) {
    return "justice";
  }
  if (effects.includes("ruin")) {
    return "ruin";
  }
  return "mercy";
}

function renderEnding() {
  const content = $("#ending-content");
  const status = $("#ending-status");
  if (!content) {
    return;
  }

  const endingId = state.ending;
  if (!endingId) {
    content.innerHTML = "<p>Последняя дверь закрыта. Финальный код ещё не принят.</p>";
    if (status) status.textContent = "запечатано";
    return;
  }

  const ending = endings[endingId];
  if (status) status.textContent = "открыто";
  content.innerHTML = `
    <article class="paper" style="--tilt:-0.6deg">
      <p class="meta">итог дела</p>
      <h3>${ending.title}</h3>
      <p>${ending.text}</p>
    </article>
  `;
}

function setupEndings() {
  renderEnding();
  const input = $("#final-password");
  const button = $("#unlock-ending");
  if (!input || !button) {
    return;
  }

  button.addEventListener("click", async () => {
    if (!(await matchesPassword(input.value, passwords.final.hash))) {
      toast("Финальный код не совпадает с материалами дела.");
      return;
    }
    state.ending = calculateEnding();
    saveState(state);
    input.value = "";
    renderEnding();
    toast("Последняя дверь открыта.");
  });
}

function setupTypewriter() {
  const line = $("#typewriter-line");
  if (!line) {
    return;
  }
  const text = line.textContent;
  line.textContent = "";
  let index = 0;
  const tick = () => {
    line.textContent = text.slice(0, index);
    index += 1;
    if (index <= text.length) {
      setTimeout(tick, 42);
    }
  };
  tick();
}

try {
  markJsLoaded();
  setupTimer();

  if (page === "index") {
    setupIndex();
    setupTypewriter();
  }
  if (page === "clues") {
    setupClues();
  }
  if (page === "suspects") {
    renderSuspects();
  }
  if (page === "journal") {
    setupJournal();
  }
  if (page === "endings") {
    setupEndings();
  }
} catch (error) {
  toast(`Ошибка запуска JS: ${error.message}`);
  console.error(error);
}
