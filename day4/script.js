const form = document.querySelector("#note-form");
const input = document.querySelector("#note-input");
const list = document.querySelector("#notes-list");
const noteCount = document.querySelector("#note-count");
const charCount = document.querySelector("#char-count");
const wordCount = document.querySelector("#word-count");
const clearButton = document.querySelector("#clear-btn");
const themeToggle = document.querySelector("#theme-toggle");

const NOTES_STORAGE_KEY = "quicknotes";
const DRAFT_STORAGE_KEY = "quicknotes-draft";
const THEME_STORAGE_KEY = "quicknotes-theme";
const CHARACTER_LIMIT = 200;
const WARNING_THRESHOLD = 180;

let notes = loadNotes();

function loadNotes() {
  const saved = localStorage.getItem(NOTES_STORAGE_KEY);
  return saved ? JSON.parse(saved) : [];
}

function saveNotes() {
  localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
}

function renderNotes() {
  list.innerHTML = "";

  notes.forEach((note) => {
    const item = document.createElement("li");
    item.classList.add("note");

    const text = document.createElement("span");
    text.textContent = note.text;

    const deleteButton = document.createElement("button");
    deleteButton.textContent = "Delete";
    deleteButton.classList.add("delete-btn");
    deleteButton.addEventListener("click", () => {
      notes = notes.filter((savedNote) => savedNote.id !== note.id);
      saveNotes();
      renderNotes();
    });

    item.append(text, deleteButton);
    list.appendChild(item);
  });

  noteCount.textContent =
    notes.length === 1 ? "You have 1 note." : `You have ${notes.length} notes.`;
}

function updateCounts() {
  const text = input.value;
  const characters = text.length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  charCount.textContent = `${characters} / ${CHARACTER_LIMIT} characters`;
  wordCount.textContent = `${words} ${words === 1 ? "word" : "words"}`;

  charCount.classList.remove("warning", "over");
  if (characters > CHARACTER_LIMIT) {
    charCount.classList.add("over");
  } else if (characters > WARNING_THRESHOLD) {
    charCount.classList.add("warning");
  }
}

function clearDraft() {
  input.value = "";
  localStorage.removeItem(DRAFT_STORAGE_KEY);
  updateCounts();
}

function updateThemeButton() {
  themeToggle.textContent = document.body.classList.contains("dark")
    ? "Light mode"
    : "Dark mode";
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  notes.push({ id: Date.now(), text });
  saveNotes();
  renderNotes();
  clearDraft();
  input.focus();
});

input.addEventListener("input", () => {
  localStorage.setItem(DRAFT_STORAGE_KEY, input.value);
  updateCounts();
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    clearDraft();
  }
});

clearButton.addEventListener("click", clearDraft);

themeToggle.addEventListener("click", () => {
  const isDark = document.body.classList.toggle("dark");
  localStorage.setItem(THEME_STORAGE_KEY, isDark ? "dark" : "light");
  updateThemeButton();
});

const savedDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
if (savedDraft !== null) {
  input.value = savedDraft;
}

if (localStorage.getItem(THEME_STORAGE_KEY) === "dark") {
  document.body.classList.add("dark");
}

updateCounts();
updateThemeButton();
renderNotes();
