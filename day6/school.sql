-- Reset the exercise tables so this script can be rerun.
DROP TABLE IF EXISTS enrolments;

DROP TABLE IF EXISTS courses;

DROP TABLE IF EXISTS students;

PRAGMA foreign_keys = ON;

CREATE TABLE students (
    student_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE
);

CREATE TABLE courses (
    course_id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL
);

CREATE TABLE enrolments (
    enrolment_id INTEGER PRIMARY KEY,
    student_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    grade REAL CHECK (
        grade IS NULL
        OR (
            grade >= 0
            AND grade <= 100
        )
    ),
    FOREIGN KEY (student_id) REFERENCES students (student_id),
    FOREIGN KEY (course_id) REFERENCES courses (course_id),
    UNIQUE (student_id, course_id)
);

INSERT INTO
    students (student_id, name, email)
VALUES (
        1,
        'Mia Chen',
        'mia.chen@example.com'
    ),
    (
        2,
        'Noah Patel',
        'noah.patel@example.com'
    ),
    (
        3,
        'Ava Brooks',
        'ava.brooks@example.com'
    ),
    (
        4,
        'Olivia Reyes',
        'olivia.reyes@example.com'
    );

INSERT INTO
    courses (course_id, title, description)
VALUES (
        1,
        'Introduction to SQL',
        'Relational databases and SQL fundamentals'
    ),
    (
        2,
        'Web Foundations',
        'HTML, CSS, and JavaScript fundamentals'
    ),
    (
        3,
        'Data Modeling',
        'Designing relational data models'
    );

INSERT INTO
    enrolments (
        enrolment_id,
        student_id,
        course_id,
        grade
    )
VALUES (1, 1, 1, 92),
    (2, 1, 2, 88),
    (3, 2, 1, 85),
    (4, 2, 3, 90),
    (5, 3, 2, 95);

-- All courses for one student, selected by name.
SELECT c.title, c.description, e.grade
FROM
    enrolments AS e
    JOIN students AS s ON s.student_id = e.student_id
    JOIN courses AS c ON c.course_id = e.course_id
WHERE
    s.name = 'Mia Chen'
ORDER BY c.title;

-- All students enrolled on one course.
SELECT s.name, s.email, e.grade
FROM
    enrolments AS e
    JOIN students AS s ON s.student_id = e.student_id
    JOIN courses AS c ON c.course_id = e.course_id
WHERE
    c.title = 'Introduction to SQL'
ORDER BY s.name;

-- Number of students per course, including courses with no enrolments.
SELECT c.title, COUNT(e.student_id) AS student_count
FROM courses AS c
    LEFT JOIN enrolments AS e ON e.course_id = c.course_id
GROUP BY
    c.course_id,
    c.title
ORDER BY c.title;

-- Students who have no enrolments.
SELECT s.name, s.email
FROM students AS s
    LEFT JOIN enrolments AS e ON e.student_id = s.student_id
WHERE
    e.student_id IS NULL
ORDER BY s.name;

-- Update Mia Chen's grade in Introduction to SQL.
UPDATE enrolments
SET
    grade = 94
WHERE
    student_id = (
        SELECT student_id
        FROM students
        WHERE
            name = 'Mia Chen'
    )
    AND course_id = (
        SELECT course_id
        FROM courses
        WHERE
            title = 'Introduction to SQL'
    );