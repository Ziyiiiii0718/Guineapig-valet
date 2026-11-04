"""Run in the disposable container documented by run-photo-deletion.py.
Includes all photo/pet deletion regressions before testing manual labels.
No production endpoint or credentials are accepted.
"""
import pathlib
import runpy

ROOT = pathlib.Path(__file__).resolve().parents[2]
context = runpy.run_path(str(ROOT / "tests/database/run-pet-deletion.py"))
sql = context["sql"]
open_transaction = context["open_transaction"]
start_request = context["start_request"]
wait_for_blocked = context["wait_for_blocked"]
commit = context["commit"]
sql((ROOT / "tests/database/manual-photo-labels.sql").read_text())
print("PASS: manual labels without AI, errors, insufficient references, edits/clear/Unknown, ownership, rollback, gallery visibility, 0010/0011 compatibility", flush=True)

# Reuse the pet runner's authenticated owner/session and surviving shared photo.
OWNER = context["OWNER"]
PHOTO = context["PHOTO"]
A = "22000000-0000-4000-8000-000000000003"
B = "22000000-0000-4000-8000-000000000004"
sql(f"insert into public.pets(id,user_id,name,sex) values ('{A}','{OWNER}','A','unknown'),('{B}','{OWNER}','B','unknown');")
processes = []
try:
    # AI has an in-flight prediction UPDATE. Manual save waits, then changes
    # only human fields. AI's separate, stale photo summary arrives afterward.
    ai = open_transaction(f"update public.photo_pet_predictions set processing_status='ready_for_review', candidate_pet_ids=array['{A}']::uuid[], candidate_scores=array[0.9], candidate_reference_counts=array[3], suggested_pet_ids=array['{A}']::uuid[], suggested_unknown=false where photo_id='{PHOTO}';")
    processes.append(ai)
    manual = start_request(f"select outcome from public.set_photo_labels('{PHOTO}',0,array['{B}']::uuid[],false,'save');")
    processes.append(manual)
    wait_for_blocked(1)
    commit(ai)
    manual.wait(timeout=15)
    assert manual.returncode == 0, manual.stderr.read()
    assert "saved" in manual.stdout.read()
    sql(f"update public.photos set ai_status='ready_for_review' where id='{PHOTO}';")
    assert sql(f"select confirmed_pet_ids=array['{B}']::uuid[] and suggested_pet_ids=array['{A}']::uuid[] from public.photo_pet_predictions where photo_id='{PHOTO}';") == "t"
    assert sql(f"select ai_status from public.photos where id='{PHOTO}';") == "specific_pet"

    # Reverse order: manual edit locks the prediction while AI completion waits.
    human = open_transaction(f"select outcome from public.set_photo_labels('{PHOTO}',1,array['{A}']::uuid[],false,'save');")
    processes.append(human)
    late_ai = start_request(f"update public.photo_pet_predictions set processing_status='failed', error_category='service_unavailable' where photo_id='{PHOTO}'; update public.photos set ai_status='failed' where id='{PHOTO}';")
    processes.append(late_ai)
    wait_for_blocked(1)
    commit(human)
    late_ai.wait(timeout=15)
    assert late_ai.returncode == 0, late_ai.stderr.read()
    assert sql(f"select confirmed_pet_ids=array['{A}']::uuid[] and labels_revision=2 from public.photo_pet_predictions where photo_id='{PHOTO}';") == "t"
    assert sql(f"select ai_status from public.photos where id='{PHOTO}';") == "specific_pet"
    print("PASS: concurrent AI/manual writes preserve human labels in both lock orders", flush=True)

    first = open_transaction(f"select outcome from public.set_photo_labels('{PHOTO}',2,'{{}}',true,'save');")
    processes.append(first)
    stale = start_request(f"select outcome from public.set_photo_labels('{PHOTO}',2,array['{B}']::uuid[],false,'save');")
    processes.append(stale)
    wait_for_blocked(1)
    commit(first)
    stale.wait(timeout=15)
    assert stale.returncode == 0, stale.stderr.read()
    assert "conflict" in stale.stdout.read()
    assert sql(f"select confirmed_unknown and labels_revision=3 from public.photo_pet_predictions where photo_id='{PHOTO}';") == "t"
    print("PASS: conflicting manual edits cannot silently overwrite the newer save", flush=True)
finally:
    for process in processes:
        if process.poll() is None:
            process.kill()
