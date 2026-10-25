# Library Books API

Base path: `/api`

## Endpoints

- **List books**
  - **Method:** `GET`
  - **Path:** `/api/books`
  - **Description:** Returns the collection of books.
  - **Success status:** `200 OK`

- **Get one book**
  - **Method:** `GET`
  - **Path:** `/api/books/{bookId}`
  - **Description:** Returns the book with the specified ID.
  - **Success status:** `200 OK`

- **Create a book**
  - **Method:** `POST`
  - **Path:** `/api/books`
  - **Description:** Adds a book and returns the created resource.
  - **Example request body:**
    ```json
    {
      "title": "A Wizard of Earthsea",
      "author": "Ursula K. Le Guin",
      "publishedYear": 1968
    }
    ```
  - **Success status:** `201 Created`

- **Update a book**
  - **Method:** `PUT`
  - **Path:** `/api/books/{bookId}`
  - **Description:** Replaces the details of the book with the specified ID.
  - **Example request body:**
    ```json
    {
      "title": "A Wizard of Earthsea",
      "author": "Ursula K. Le Guin",
      "publishedYear": 1968
    }
    ```
  - **Success status:** `200 OK`

- **Delete a book**
  - **Method:** `DELETE`
  - **Path:** `/api/books/{bookId}`
  - **Description:** Deletes the book with the specified ID.
  - **Success status:** `204 No Content`

- **List books by author**
  - **Method:** `GET`
  - **Path:** `/api/books?author=Ursula%20K.%20Le%20Guin`
  - **Description:** Returns books whose author matches the `author` query parameter.
  - **Success status:** `200 OK`

## Error Responses

- **`400 Bad Request`:** The request is invalid, such as creating a book without a required `title` or `author`.
- **`404 Not Found`:** The requested book does not exist, such as requesting `GET /api/books/9999` when there is no book with ID `9999`.
