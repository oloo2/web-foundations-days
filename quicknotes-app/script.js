const form = document.querySelector("#note-form");
const input = document.querySelector("#note-input");
const categoryInput = document.querySelector("#note-category");
const list = document.querySelector("#notes-list");
const noteCount = document.querySelector("#note-count");
const charCount = document.querySelector("#char-count");
const wordCount = document.querySelector("#word-count");
const clearButton = document.querySelector("#clear-btn");
const clearAllButton = document.querySelector("#clear-all-btn");
const themeToggle = document.querySelector("#theme-toggle");
const searchInput = document.querySelector("#search-input");
const errorMessage = document.querySelector("#error-message");
const noNotesMessage = document.querySelector("#no-notes-message");

const NOTES_STORAGE_KEY = "quicknotes";
const DRAFT_STORAGE_KEY = "quicknotes-draft";
const THEME_STORAGE_KEY = "quicknotes-theme";
const CHARACTER_LIMIT = 200;
const WARNING_THRESHOLD = 180;

let notes = loadNotes();

function loadNotes() {
  const saved = localStorage.getItem(NOTES_STORAGE_KEY);
  if (!saved) return [];

  try {
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) {
      errorMessage.textContent = "Saved notes could not be loaded because the data is invalid.";
      return [];
    }

    return parsed
      .filter((note) => note && typeof note.text === "string")
      .map((note, index) => ({
        id: note.id ?? Date.now() + index,
        text: note.text,
        category: note.category || "general",
        createdAt: note.createdAt || new Date().toISOString(),
      }));
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    errorMessage.textContent = "Saved notes could not be read. Add a note to replace the invalid saved data.";
    return [];
  }
}

function saveNotes() {
  localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
}

function render() {
  list.replaceChildren();

  const query = searchInput.value.trim().toLowerCase();
  const visibleNotes = notes.filter((note) =>
    `${note.text} ${note.category}`.toLowerCase().includes(query)
  );

  visibleNotes.forEach((note) => {
    const item = document.createElement("li");
    item.classList.add("note");

    const details = document.createElement("div");
    const text = document.createElement("p");
    text.textContent = note.text;

    const metadata = document.createElement("small");
    metadata.textContent = `${note.category} · ${new Date(note.createdAt).toLocaleString()}`;
    details.append(text, metadata);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.classList.add("delete-btn");
    deleteButton.addEventListener("click", () => deleteNote(note.id));

    item.append(details, deleteButton);
    list.appendChild(item);
  });

  noteCount.textContent =
    notes.length === 0
      ? "You have 0 notes."
      : notes.length === 1
        ? "You have 1 note."
        : `You have ${notes.length} notes.`;

  noNotesMessage.hidden = visibleNotes.length > 0;
  if (notes.length === 0) {
    noNotesMessage.textContent = "No notes available. Add a note to get started!";
  } else if (visibleNotes.length === 0) {
    noNotesMessage.textContent = "No notes match your search.";
  }
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
  categoryInput.value = "";
  localStorage.removeItem(DRAFT_STORAGE_KEY);
  errorMessage.textContent = "";
  updateCounts();
}

function updateThemeButton() {
  themeToggle.textContent = document.body.classList.contains("dark")
    ? "Light mode"
    : "Dark mode";
}

function deleteNote(id) {
  notes = notes.filter((note) => note.id !== id);
  saveNotes();
  render();
}

function clearAllNotes() {
  notes = [];
  saveNotes();
  errorMessage.textContent = "";
  render();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = input.value.trim();

  if (!text) {
    errorMessage.textContent = "Please enter a note before adding it.";
    input.focus();
    return;
  }

  if (input.value.length > CHARACTER_LIMIT) {
    errorMessage.textContent = `Notes must be ${CHARACTER_LIMIT} characters or fewer.`;
    input.focus();
    return;
  }

  errorMessage.textContent = "";
  notes.push({
    id: Date.now(),
    text,
    category: categoryInput.value || "general",
    createdAt: new Date().toISOString(),
  });
  saveNotes();
  render();
  clearDraft();
  input.focus();
});

input.addEventListener("input", () => {
  localStorage.setItem(DRAFT_STORAGE_KEY, input.value);
  errorMessage.textContent = "";
  updateCounts();
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    clearDraft();
  }
});

searchInput.addEventListener("input", render);
clearButton.addEventListener("click", clearDraft);
clearAllButton.addEventListener("click", clearAllNotes);

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
render();
