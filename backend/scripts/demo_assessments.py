# ruff: noqa: E501  (demo answers and model answers are prose data)
"""Demo assignments and graded submissions for DB201, written without any LLM.

Grades are generated deterministically from a per-student ability and a
per-topic difficulty, so the dashboards show a believable class: Normalization
is a learning gap, one student missed a deadline, one submission waits for
faculty review, and Sam Student still has Assignment 3 open to submit for a
real AI grading demo.
"""

import random
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.evaluation.scoring import confidence, disagrees
from app.models.assignment import Assignment, Question
from app.models.course import Course
from app.models.question_score import QuestionScore
from app.models.review_log import ReviewAction, ReviewLog
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User
from app.services import storage
from scripts.text_pdf import text_pdf

NOTES = "db201_course_notes.pdf"
PAGE = {
    "Keys": 1,
    "Relational model": 1,
    "ER modelling": 1,
    "Functional dependencies": 2,
    "Normalization": 2,
    "Transactions": 3,
    "Concurrency control": 4,
}
# How easy each topic is for this class (Normalization is the learning gap).
EASE = {
    "Keys": 1.0,
    "Relational model": 0.97,
    "ER modelling": 0.92,
    "Functional dependencies": 0.85,
    "Normalization": 0.56,
    "Transactions": 0.95,
    "Concurrency control": 0.85,
}

# (title, days from now, questions). Each question: topic, marks, text, model
# answer, and key points with how a student might phrase each one.
ASSIGNMENTS = [
    (
        "Assignment 1 - Keys and the relational model",
        -21,
        [
            (
                "Keys",
                4,
                "Explain the difference between a candidate key and a primary key.",
                "A candidate key is a minimal set of attributes that uniquely identifies "
                "every tuple of a relation; a relation can have several. The primary key "
                "is the candidate key chosen to identify tuples, and it cannot be NULL.",
                [
                    (
                        "candidate key uniquely identifies every tuple",
                        "A candidate key is a set of columns whose values are different for every row.",
                    ),
                    (
                        "candidate key is minimal",
                        "It is minimal, so no column can be removed without losing uniqueness.",
                    ),
                    (
                        "a relation may have several candidate keys",
                        "A table can have more than one candidate key.",
                    ),
                    (
                        "primary key is the chosen candidate key and cannot be NULL",
                        "The primary key is the one we pick from them, and it can never be NULL.",
                    ),
                ],
            ),
            (
                "Relational model",
                3,
                "What is a foreign key, and what does referential integrity guarantee?",
                "A foreign key is a set of attributes in one relation that refers to the "
                "primary key of another relation. Referential integrity guarantees that "
                "every non-null foreign key value matches an existing referenced key.",
                [
                    (
                        "refers to the primary key of another relation",
                        "A foreign key is a column that points to the primary key of another table.",
                    ),
                    (
                        "every foreign key value must match an existing key",
                        "Referential integrity means each foreign key value must exist in the referenced table.",
                    ),
                    (
                        "no dangling references",
                        "So we never have a reference to a row that does not exist.",
                    ),
                ],
            ),
            (
                "ER modelling",
                3,
                "How is a many-to-many relationship represented in the relational model?",
                "With a separate junction relation whose primary key combines foreign keys "
                "to both participating entities; attributes of the relationship are stored "
                "in it.",
                [
                    (
                        "a separate junction table",
                        "We create a separate junction table between the two entities.",
                    ),
                    (
                        "foreign keys to both entities",
                        "It holds a foreign key to each of the two tables.",
                    ),
                    (
                        "composite primary key",
                        "Together those two foreign keys form its primary key.",
                    ),
                ],
            ),
        ],
    ),
    (
        "Assignment 2 - Normalization",
        -7,
        [
            (
                "Normalization",
                5,
                "Define third normal form (3NF).",
                "A relation is in 3NF if it is in 2NF and no non-prime attribute is "
                "transitively dependent on a candidate key: for every non-trivial "
                "dependency X -> A, X is a superkey or A is a prime attribute.",
                [
                    ("is in 2NF", "A table is in 3NF when it is already in 2NF."),
                    (
                        "no transitive dependency of non-key attributes",
                        "Also, no non-key column may depend on the key only through another non-key column (no transitive dependencies).",
                    ),
                    (
                        "for X -> A, X is a superkey or A is prime",
                        "Formally, for every dependency X -> A, X must be a superkey or A must be part of a candidate key.",
                    ),
                ],
            ),
            (
                "Normalization",
                5,
                "Why does normalization reduce update anomalies? Give an example.",
                "Normalization stores each fact once, removing redundancy. If a course's "
                "instructor is repeated in every enrollment row, changing the instructor "
                "means updating many rows (update anomaly), deleting the last enrollment "
                "loses the instructor (deletion anomaly), and a course with no students "
                "cannot be stored (insertion anomaly). Splitting into Course(course, "
                "instructor) and Enrollment(student, course) removes these.",
                [
                    (
                        "each fact is stored once, removing redundancy",
                        "Normalization removes redundancy so each fact is stored only once.",
                    ),
                    (
                        "update anomaly",
                        "Otherwise changing one fact means updating many rows, and missing one makes the data inconsistent.",
                    ),
                    (
                        "insertion or deletion anomaly",
                        "Deleting the last row about something can also lose other information.",
                    ),
                    (
                        "a decomposition example",
                        "For example, keep instructors in a Course table instead of repeating them in every Enrollment row.",
                    ),
                ],
            ),
            (
                "Functional dependencies",
                3,
                "What is a functional dependency X -> Y?",
                "X -> Y holds when any two tuples that agree on X also agree on Y, that "
                "is, X determines Y.",
                [
                    (
                        "tuples that agree on X agree on Y",
                        "Any two rows with the same X value also have the same Y value.",
                    ),
                    ("X determines Y", "So X determines Y, like student_id -> name."),
                ],
            ),
        ],
    ),
    (
        "Assignment 3 - Transactions",
        5,
        [
            (
                "Transactions",
                4,
                "What does the atomicity property of a transaction guarantee?",
                "Atomicity guarantees that a transaction is all-or-nothing: either all of "
                "its operations take effect or none do; if it fails, its partial changes "
                "are rolled back.",
                [
                    (
                        "all operations take effect or none do",
                        "A transaction either happens completely or not at all.",
                    ),
                    (
                        "partial changes are rolled back on failure",
                        "If it fails halfway, the database rolls back the partial changes.",
                    ),
                ],
            ),
            (
                "Concurrency control",
                4,
                "What is a dirty read, and which isolation level prevents it?",
                "A dirty read occurs when a transaction reads data written by another "
                "transaction that has not committed yet; if that transaction rolls back, "
                "the value never existed. READ COMMITTED and stronger isolation levels "
                "prevent dirty reads.",
                [
                    (
                        "reading another transaction's uncommitted data",
                        "A dirty read is reading a value another transaction wrote but has not committed.",
                    ),
                    (
                        "the writer may roll back, so the value never existed",
                        "If that transaction rolls back, we used data that never really existed.",
                    ),
                    (
                        "READ COMMITTED or stronger prevents it",
                        "READ COMMITTED (or anything stronger) prevents it.",
                    ),
                ],
            ),
        ],
    ),
]

# Common misconceptions a weaker answer may contain, per topic.
MISCONCEPTION = {
    "Normalization": "3NF means every table has only one column besides the key.",
    "Functional dependencies": "A functional dependency means Y is calculated from X.",
    "Concurrency control": "SERIALIZABLE is the only level that prevents dirty reads.",
    "Keys": "The primary key can be NULL if the row is new.",
}

# Students and how strong they are. Plans per assignment:
# "published", "review" (graded by AI, waiting for faculty) or None (not submitted).
CLASSMATES = [
    (
        "Priya Sharma",
        "priya.demo@siger.edu",
        1.0,
        ["published", "published", "published"],
    ),
    (
        "Meera Iyer",
        "meera.demo@siger.edu",
        0.9,
        ["published", "published", "published"],
    ),
    ("Arjun Mehta", "arjun.demo@siger.edu", 0.82, ["published", "published", "review"]),
    ("Lina Chen", "lina.demo@siger.edu", 0.68, ["published", "review", None]),
    ("Rahul Verma", "rahul.demo@siger.edu", 0.42, ["published", None, None]),
]
# Sam Student (the main demo student): A3 is left open for a live AI grading.
SAM_PLAN = (0.74, ["published", "published", None])


async def seed_assessments(
    session: AsyncSession,
    course: Course,
    professor: User,
    students: list[tuple[User, float, list[str | None]]],
) -> None:
    existing = set(
        await session.scalars(
            select(Assignment.title).where(Assignment.course_id == course.id)
        )
    )
    rng = random.Random(42)
    now = datetime.now(UTC)
    local = datetime.now().astimezone()  # deadlines at 23:59 local time
    for (title, days, questions), index in zip(ASSIGNMENTS, range(3), strict=True):
        if title in existing:
            print(f"  exists  {title}")
            continue
        deadline = (local + timedelta(days=days)).replace(
            hour=23, minute=59, second=0, microsecond=0
        )
        assignment = Assignment(
            course_id=course.id,
            created_by_id=professor.id,
            title=title,
            instructions="Answer every question in your own words. Label answers Q1, Q2, ... "
            "and upload one typed PDF.",
            deadline=deadline,
            questions=[
                Question(
                    position=position,
                    text=text,
                    model_answer=model,
                    max_marks=marks,
                    topic=topic,
                    key_points=[point for point, _ in points],
                )
                for position, (topic, marks, text, model, points) in enumerate(
                    questions, start=1
                )
            ],
        )
        session.add(assignment)
        await session.flush()

        made = {"published": 0, "review": 0}
        for student, ability, plans in students:
            plan = plans[index]
            if plan is None:
                continue
            submitted = deadline - timedelta(
                days=rng.randint(1, 4), hours=rng.randint(0, 12)
            )
            await _graded_submission(
                session,
                rng,
                assignment,
                questions,
                student,
                ability,
                plan,
                professor,
                min(submitted, now - timedelta(hours=2)),
            )
            made[plan] += 1
        print(
            f"  created {title}: {made['published']} published, "
            f"{made['review']} waiting for review"
        )
    await session.commit()


async def _graded_submission(
    session, rng, assignment, questions, student, ability, plan, professor, submitted_at
) -> None:
    submission_id = uuid.uuid4()
    answers: list[str] = []
    scores: list[QuestionScore] = []
    for question, (topic, marks, _text, _model, points) in zip(
        assignment.questions, questions, strict=True
    ):
        share = min(max(rng.gauss(ability * EASE[topic], 0.08), 0.0), 1.0)
        hit_count = round(share * len(points))
        hit = points[:hit_count]
        missed = points[hit_count:]
        wrong = (
            [MISCONCEPTION[topic]] if topic in MISCONCEPTION and share < 0.35 else []
        )
        answer = " ".join([phrase for _, phrase in hit] + wrong) or "I am not sure."
        answers.append(f"Q{question.position}. {answer}")

        ai = round(marks * hit_count / len(points) * 2) / 2
        if wrong:
            ai = max(ai - 0.5, 0.0)
        similarity = round(min(0.42 + 0.3 * share + rng.uniform(-0.04, 0.04), 0.95), 4)
        if plan == "review" and question.position == 1:
            # Right vocabulary, few marks: a disagreement the review screen flags.
            similarity = max(similarity, 0.74)
        conf = confidence(similarity, ai, marks)
        # Faculty mostly agree; sometimes they adjust by half a mark.
        final = ai
        if plan == "published" and rng.random() < 0.18:
            final = min(max(ai + rng.choice([-0.5, 0.5]), 0.0), marks)
        scores.append(
            QuestionScore(
                submission_id=submission_id,
                question_id=question.id,
                student_answer=answer,
                similarity=similarity,
                ai_marks=ai,
                final_marks=final if plan == "published" else None,
                key_points_hit=[point for point, _ in hit],
                key_points_missed=[point for point, _ in missed],
                incorrect_points=wrong,
                rationale=_rationale(hit, missed, wrong),
                confidence=conf,
                flagged=disagrees(conf),
                rechecked=disagrees(conf),
                feedback=_feedback(topic, hit, missed, wrong),
                feedback_sources=[{"filename": NOTES, "page": PAGE[topic]}]
                if missed or wrong
                else [],
            )
        )

    stored_path = f"submissions/{submission_id}.pdf"
    storage.save(
        stored_path,
        text_pdf(f"{assignment.title}\n{student.full_name}\n\n" + "\n\n".join(answers)),
    )
    published = plan == "published"
    session.add(
        Submission(
            id=submission_id,
            assignment_id=assignment.id,
            student_id=student.id,
            filename=f"{student.full_name.split()[0].lower()}_answers.pdf",
            stored_path=stored_path,
            page_count=1,
            status=SubmissionStatus.PUBLISHED
            if published
            else SubmissionStatus.UNDER_REVIEW,
            submitted_at=submitted_at,
            graded_at=submitted_at + timedelta(minutes=3),
            published_at=submitted_at + timedelta(days=1) if published else None,
            grading_trace=[
                {"node": "seed", "detail": "demo data, graded without an LLM"}
            ],
        )
    )
    await session.flush()
    session.add_all(scores)
    if published:
        for score in scores:
            session.add(
                ReviewLog(
                    submission_id=submission_id,
                    faculty_id=professor.id,
                    question_id=score.question_id,
                    action=ReviewAction.APPROVE
                    if score.final_marks == score.ai_marks
                    else ReviewAction.OVERRIDE,
                    ai_marks=score.ai_marks,
                    final_marks=score.final_marks,
                )
            )
        session.add(
            ReviewLog(
                submission_id=submission_id,
                faculty_id=professor.id,
                action=ReviewAction.PUBLISH,
            )
        )


def _rationale(hit, missed, wrong) -> str:
    parts = []
    if hit:
        parts.append("Covers: " + "; ".join(point for point, _ in hit) + ".")
    if missed:
        parts.append("Misses: " + "; ".join(point for point, _ in missed) + ".")
    if wrong:
        parts.append("Contains a misconception: " + wrong[0])
    return " ".join(parts) or "No relevant content."


def _feedback(topic, hit, missed, wrong) -> str:
    if not missed and not wrong:
        return "Well done: your answer covers every key point clearly."
    text = "Good start" if hit else "This answer needs more work"
    if missed:
        text += f". To complete it, explain: {missed[0][0]}"
        if len(missed) > 1:
            text += f", and {missed[1][0]}"
    if wrong:
        text += f". Also note that this is not correct: {wrong[0]}"
    return text + f". Review {NOTES}, page {PAGE[topic]}."


SAM_ASSIGNMENT_3_ANSWERS = """Assignment 3 - Transactions
Sam Student

Q1. A transaction is all or nothing: either every operation in it is applied, or none of them are. If something fails in the middle, the database rolls back the changes that were already made, so we never see half of a transaction.

Q2. A dirty read is when a transaction reads a value that another transaction has written but not committed yet. If the other transaction then rolls back, the first one has used data that never really existed. The READ COMMITTED isolation level prevents dirty reads."""
