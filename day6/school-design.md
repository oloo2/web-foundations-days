# School Database Design

## Tables

- **`students`** stores each student's name and unique email address. `student_id` is the primary key.
- **`courses`** stores each course's title and description. `course_id` is the primary key.
- **`enrolments`** records a student's enrolment in a course and their grade. Its foreign keys reference `students` and `courses`; its unique constraint prevents the same student from enrolling in the same course twice.

## Relationships

- **Students to enrolments is one-to-many:** one student can have many enrolment records, while each enrolment refers to one student.
- **Courses to enrolments is one-to-many:** one course can have many enrolment records, while each enrolment refers to one course.
- **Students and courses are many-to-many:** a student can take multiple courses, and each course can have multiple students. The `enrolments` join table represents each student-course pairing and stores relationship-specific data—the student's grade—which would not belong solely in either the `students` or `courses` table.

## Index

I would add an index on `enrolments(course_id)`. It helps the database find enrolments for a course efficiently when listing that course's students or counting students per course. The unique constraint on `(student_id, course_id)` already creates an index for that pair, but it does not efficiently support searches by `course_id` alone.

## SQL or NoSQL?

I would choose a relational SQL database for this system. Students, courses, and enrolments have clear relationships, and foreign keys and unique constraints help maintain consistent data and prevent duplicate enrolments. SQL joins make it straightforward to retrieve course rosters and enrolment counts, while the grade naturally belongs to the student-course relationship. A NoSQL database could work, but modeling and querying these relationships while maintaining the same integrity would require additional application logic.
