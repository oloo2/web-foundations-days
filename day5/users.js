const loadUsersButton = document.getElementById("load-users");
const filterInput = document.getElementById("filter-input");
const statusMessage = document.getElementById("status");
const usersList = document.getElementById("users-list");

let users = [];
let usersLoaded = false;

function renderUsers(list) {
  usersList.replaceChildren();

  for (const user of list) {
    const listItem = document.createElement("li");
    const name = document.createElement("p");
    const email = document.createElement("p");
    const city = document.createElement("p");
    const company = document.createElement("p");

    name.textContent = `Name: ${user.name}`;
    email.textContent = `Email: ${user.email}`;
    city.textContent = `City: ${user.address.city}`;
    company.textContent = `Company: ${user.company.name}`;

    listItem.append(name, email, city, company);
    usersList.append(listItem);
  }
}

async function loadUsers() {
  loadUsersButton.disabled = true;
  statusMessage.textContent = "Loading users...";

  try {
    const response = await fetch("https://jsonplaceholder.typicode.com/users");

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}.`);
    }

    const loadedUsers = await response.json();

    if (!Array.isArray(loadedUsers)) {
      throw new Error("The server returned an invalid users list.");
    }

    users = loadedUsers;
    usersLoaded = true;
    renderUsers(users);
    statusMessage.textContent = `Successfully loaded ${users.length} users.`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    statusMessage.textContent = `Error loading users: ${message}`;
  } finally {
    loadUsersButton.disabled = false;
  }
}

loadUsersButton.addEventListener("click", loadUsers);

filterInput.addEventListener("input", () => {
  if (!usersLoaded) {
    return;
  }

  const searchText = filterInput.value.trim().toLowerCase();
  const filteredUsers = users.filter((user) =>
    user.name.toLowerCase().includes(searchText),
  );

  renderUsers(filteredUsers);
  statusMessage.textContent =
    filteredUsers.length === 0
      ? "No users match your filter."
      : `Showing ${filteredUsers.length} of ${users.length} users.`;
});
