"""Live end-to-end check with the real AI provider, using the demo data.

Run from backend/, with the API server running on port 8000:

    uv run python -m scripts.seed_demo      # once; embeds the notes if the quota allows
    uv run python -m scripts.smoke_ai

It makes about 12 provider requests (free tiers allow ~50 a day):
  1. Sam submits Assignment 3; the evaluation agent grades it   (~7 requests)
  2. The professor approves the AI marks and publishes          (no AI)
  3. Sam asks the analytics agent how he is doing               (~3 requests)
  4. Sam asks the lecture chatbot one question                  (~2 requests)
It stops early, with the reason, if the provider's quota is used up.
"""

import argparse
import sys
import time
from pathlib import Path

import httpx

API = "http://localhost:8000"
PASSWORD = "SigerDemo123"
ANSWERS = (
    Path(__file__).resolve().parents[1] / "demo_data" / "sam_assignment3_answers.pdf"
)
GRADING_TIMEOUT = 600


def fail(message: str) -> None:
    print(message, flush=True)
    sys.exit(1)


def login(client: httpx.Client, email: str) -> dict[str, str]:
    response = client.post(
        f"{API}/auth/login", data={"username": email, "password": PASSWORD}
    )
    if response.status_code != 200:
        fail(
            f"Could not log in as {email}; "
            "run `uv run python -m scripts.seed_demo` first."
        )
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def stop_if_failed(response: httpx.Response, step: str) -> dict:
    if response.status_code >= 400:
        detail = response.json().get("detail", response.text)
        fail(f"\n✕ {step} failed ({response.status_code}): {detail}")
    return response.json()


def main(question: str) -> None:
    with httpx.Client(timeout=300) as client:
        try:
            client.get(f"{API}/health").raise_for_status()
        except httpx.HTTPError:
            fail(
                f"The API is not running at {API}; "
                "start it with `uv run uvicorn app.main:app --reload`."
            )

        professor = login(client, "prof.demo@siger.edu")
        sam = login(client, "student.demo@siger.edu")
        course = next(
            c
            for c in client.get(f"{API}/courses/my", headers=professor).json()
            if c["code"] == "DB201"
        )
        cid = course["id"]
        assignment = next(
            a
            for a in client.get(f"{API}/courses/{cid}/assignments", headers=sam).json()
            if a["title"].startswith("Assignment 3")
        )
        base = f"{API}/courses/{cid}/assignments/{assignment['id']}"

        # 1. Submit (or reuse an earlier submission) and wait for the AI grade.
        print("1. Evaluation agent")
        mine = client.get(f"{base}/submission", headers=sam).json()["submission"]
        if mine is None:
            mine = stop_if_failed(
                client.post(
                    f"{base}/submission",
                    headers=sam,
                    files={
                        "file": (ANSWERS.name, ANSWERS.read_bytes(), "application/pdf")
                    },
                ),
                "Submitting Sam's answers",
            )
            print("   submitted; grading in the background…")
        elif mine["status"] == "failed":
            stop_if_failed(
                client.post(
                    f"{base}/submissions/{mine['id']}/grade", headers=professor
                ),
                "Retrying",
            )
            print("   earlier grading had failed; retrying…")
        submission_id = mine["id"]

        started = time.time()
        while True:
            result = client.get(
                f"{base}/submissions/{submission_id}", headers=professor
            ).json()
            status = result["submission"]["status"]
            if status in ("under_review", "published", "failed"):
                break
            if time.time() - started > GRADING_TIMEOUT:
                fail(
                    "   ✕ grading is still running after 10 minutes; check the API logs"
                )
            time.sleep(5)
        if status == "failed":
            fail(f"   ✕ grading failed: {result['error']}")
        print(
            f"   graded in {time.time() - started:.0f}s: "
            f"{result['total_ai_marks']} / {result['total_marks']}"
        )
        for step in result["grading_trace"]:
            print(f"     [{step['node']}] {step['detail']}")
        for q in result["questions"]:
            flag = "  ⚑ flagged" if q["flagged"] else ""
            print(
                f"   Q{q['position']}: {q['ai_marks']}/{q['max_marks']} "
                f"(similarity {q['similarity']}, confidence {q['confidence']}){flag}"
            )
            print(f"     rationale: {q['rationale']}")
            print(f"     feedback:  {q['feedback']}")

        # 2. The professor approves the AI marks and publishes.
        print("\n2. Faculty review")
        if status != "published":
            stop_if_failed(
                client.put(
                    f"{base}/submissions/{submission_id}/review",
                    headers=professor,
                    json={
                        "publish": True,
                        "questions": [
                            {
                                "question_id": q["question_id"],
                                "final_marks": q["ai_marks"],
                                "feedback": q["feedback"],
                            }
                            for q in result["questions"]
                        ],
                    },
                ),
                "Publishing",
            )
        grade = stop_if_failed(
            client.get(f"{base}/submission/result", headers=sam), "Reading Sam's grade"
        )
        print(f"   published; Sam sees {grade['total_marks']} / {grade['max_marks']}")

        # 3. The analytics agent, as Sam.
        print("\n3. Analytics agent")
        insight = stop_if_failed(
            client.post(
                f"{API}/courses/{cid}/analytics/insight",
                headers=sam,
                json={"question": question},
            ),
            "The analytics agent",
        )
        print(f"   queries: {', '.join(c['tool'] for c in insight['tool_calls'])}")
        if insight["verified"]:
            print("   ✓ every number verified against the query results:")
            for line in insight["insight"].splitlines():
                print(f"     {line}")
        else:
            print(
                f"   ✕ withheld; unsupported numbers: {insight['unsupported_numbers']}"
            )

        # 4. The lecture chatbot, as Sam.
        print("\n4. Lecture chatbot")
        reply = client.post(
            f"{API}/courses/{cid}/chat",
            headers=sam,
            json={"question": "What is a dirty read?"},
        )
        if reply.status_code == 409:
            print(
                "   skipped: the course notes are not embedded yet "
                "(run seed_demo again)"
            )
        else:
            body = stop_if_failed(reply, "The chatbot")
            print(f"   [{body['status']}] {body['answer'][:300]}")

    print("\nDone: every AI component worked end to end.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Live AI check with the demo data.")
    parser.add_argument(
        "--question",
        default="How am I doing? What should I study next?",
        help="what Sam asks the analytics agent",
    )
    main(parser.parse_args().question)
