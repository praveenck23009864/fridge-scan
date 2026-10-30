# Fridge Scan MVP assignment audit

Audited against the scope supplied in the conversation. No separate grading rubric was provided. Initial findings are retained in [INITIAL.md](test-results/assignment-audit/INITIAL.md). “Tested” means implemented with automated evidence, not a guarantee of real-world recognition accuracy or physical-device compatibility.

| Requirement | Final status | Implementation | Test evidence |
|---|---|---|---|
| Camera capture, 1–3 photos | Tested synthetically; physical hardware unverified | frontend/src/features/fridge-scan/CameraCapture.tsx: getUserMedia, canvas JPEG capture, MAX_PHOTOS | frontend/e2e/assignment.spec.ts: repeated synthetic video capture and one Chromium fake-camera capture |
| Live preview | Tested synthetically | CameraCapture.tsx: video.srcObject, play(), labelled preview | assignment.spec.ts asserts visible preview and videoWidth > 0 |
| Retake/delete | Tested synthetically | CameraCapture.tsx replaces selected photo, revokes old URL, stops active stream before deletion | assignment.spec.ts checks replacement URL, unchanged count, URL revocation, individual and clear-all deletion |
| Camera permission/missing camera | Tested with injected errors; actual OS prompt unverified | CameraCapture.openCamera handles NotAllowedError, NotFoundError, missing media API | assignment.spec.ts permission-denied and missing-camera cases verify sample fallback |
| Sample photo fallback | Tested | CameraCapture.loadSamples | App.test.tsx, assignment.spec.ts sample fallback and failed partial-download cleanup |
| GroqCloud food detection | Implemented and mocked tests passed; current live accuracy unverified | backend/vision_service.py: AsyncGroq, JSON response, no fallback to mock | backend/test_vision.py:test_success, test_single_model_failure_no_fallback; prior live evidence test-results/live.json (not rerun this audit) |
| Duplicate merging | Tested for case/whitespace; semantic aliases partial | vision_service.parse_items casefold and whitespace normalization; prompt requests cross-photo merging | test_vision.test_duplicate_and_evidence; aliases/spelling variants still depend on model |
| Low-stock detection | Tested; visual inference remains heuristic | Groq prompt requires visible evidence; parser downgrades unsupported low to unknown | test_duplicate_and_evidence |
| Low-stock highlighting | Tested | ScanReview.tsx data-stock, new Low stock badge; ScanReview.css amber border/badge | assignment.spec.ts asserts visible badge and different border color; screenshot test-results/assignment-audit/low-stock.png |
| Review/edit/add/delete/confirmation | Tested | ScanReview.tsx, backend/schemas.py and crud.py; edits require reconfirmation | ScanReview.test.tsx, test_review.py, e2e/workflow.spec.ts |
| SQLite CRUD persistence | Tested | backend/models.py/database.py/crud.py/main.py | test_review.py and test_shopping.py; rollback, invalid input, additive migration coverage |
| Convert confirmed low-stock items to shopping list | Tested | crud.scanto_shopping_list, persisted source_scan_id, idempotent conversion | test_review.test_conversion_only_confirmed_low_and_persistent |
| Save-to-list survives application restart | Tested across separate application processes | File-backed SQLite default resolves beside database.py | test_assignment.test_save_to_list_survives_application_process_restart starts two independent Python processes using FastAPI TestClient and the same isolated DB; second process reads list and repeats conversion without duplication |
| Image quality/corruption/empty image | Tested | vision_service.prepare_image validates size/format/resolution/darkness/blur; main returns 422 for no food | test_vision.test_quality/test_formats/test_resolution_and_resize/test_upload_errors/test_no_food; assignment.spec.ts browser empty-result state |
| Connectivity/rate limits/timeouts | Tested | vision_service error mapping and total timeout; services/api.ts actionable connectivity message; App catches and releases loading state | test_vision.test_http_errors/test_timeout; App.test.tsx; assignment.spec.ts aborts actual browser request then recovers |
| Photo consent | Tested | App checkbox gates analysis; main checks consent before inference | test_vision.test_consent and e2e/workflow.spec.ts |
| Photo retention/deletion | Tested local safeguards; provider retention outside app control | CameraCapture local File/blob URLs only; delete/retake/clear/unmount revoke previews; track shutdown and late-operation guards; main closes every UploadFile in finally; models contain ingredient text, not photos | CameraCapture.test.tsx late permission resolution and unmount revocation; assignment.spec.ts clear/retake/failure cleanup; test_assignment.test_uploads_closed_on_validation_failure |
| Recipe generation preserved | Tested | RecipeSuggestions.tsx, main recipe endpoint, recipe_service.py retained | RecipeSuggestions.test.tsx, test_recipes.py, e2e/recipe-preferences.spec.ts and workflow.spec.ts |

## Fixes made in this audit

- CameraCapture.tsx: invalidated delayed camera/capture operations after cancel/unmount; stopped streams resolved after unmount; revoked partial sample previews on failure; added clear-all deletion and local-retention text. Camera capture remains available; existing gallery upload is a separate optional feature.
- ScanReview.tsx / ScanReview.css: added a textual Low stock badge alongside the existing amber border and stock selector.
- backend/main.py: explicitly closes all multipart upload spools in finally, including consent, count, MIME and file-size validation failures.
- Added frontend/src/components/CameraCapture.test.tsx, frontend/e2e/assignment.spec.ts, and backend/test_assignment.py. Existing tests remain intact.
- Original modified files backed up in backups/assignment-audit. Production SQLite, credentials and Groq model configuration were not changed.

## Retention rules and limits

Selected/captured photos remain in page memory until deleted or the page closes/reloads. Retaking deletes the prior preview reference. Delete all photos releases all selected photos; it does not delete saved ingredient reviews or shopping lists. Stopping or cancelling capture stops camera tracks. No browser persistent-storage API is used for photos. Source files selected through optional upload are not deleted from the user's device.

The backend does not create an application photo library or store photos in SQLite. FastAPI multipart parsing may temporarily spool uploads to disk; the endpoint now explicitly closes those spools on all exit paths. Normal framework cleanup also applies. This is resource cleanup, not a forensic secure-erasure guarantee. In-flight requests may already have transmitted a photo before the user deletes its local preview. Groq retention is provider-controlled and was not independently audited here; the consent/retention copy does not promise deletion at Groq.

## Camera verification limitation

Chromium's fake device produced one successful capture, then disappeared after stream.stop(), returning NotFoundError on reopen. A standalone probe outside the application reproduced that behavior, including after a two-second delay. Failure traces remain under test-results/assignment-audit/camera. Repeated capture/retake/delete tests therefore use a deterministic canvas.captureStream MediaStream, with real video preview, canvas encoding, File/blob previews and shutdown assertions. A separate test retains the actual getUserMedia path using Chromium's fake device for one frame. Physical webcams, phone rear-camera switching, real permission dialogs, focus/lighting and browser-specific device behavior remain unverified. No physical camera was available for this audit.

## Git

Branch: main. HEAD: 9aa4a3a — Complete fridge scan backend CRUD and review workflow.
Earlier commits: 11e40fa — Connect React shopping lists to FastAPI; 6d153ba — Day 1: Add SQLite models and fridge item CRUD APIs.
Remote origin (fetch/push): https://github.com/praveenck23009864/fridge-scan.git.
The working tree already contained numerous modified/untracked files before this audit; those changes were preserved. No commit, reset, fetch or push was performed. Remote synchronization status has not been verified. Old pytest-temp directories have Windows access restrictions, so validation used a fresh isolated test-results directory.

## Validation

Backend command: backend/venv/Scripts/python.exe -m pytest -q --basetemp=D:/fridge-scan-mvp/test-results/assignment-audit/pytest-run -p no:cacheprovider
Result: 114 passed.
Frontend: npm run build; npm run lint; npm run test -- --run; npx playwright test.
Build/lint passed; frontend unit tests: 18 passed. Final Playwright suite: 12 passed, 0 failed; results in test-results/results.json.
No live Groq calls were made during this audit. External AI was mocked; persistence testing used disposable databases, not the production database. Test traces contain only synthetic/sample fixtures.

