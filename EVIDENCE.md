# Evidence Mode

Run the offline demo with `npm run test:evidence -- tests/evidence-demo.spec.ts`.
Run any UI spec with `npm run test:evidence -- tests/legal.spec.ts`.
Open the HTML report with `npm run report`.

Every executed UI test now receives an annotated video and final screenshot, even when it passes in normal `npm test`. Normal runs keep traces on failure; full Evidence Mode also keeps traces on success and captures screenshot checkpoints after assertions at 1440 × 900. API-only tests have no browser video or screenshot.

The tracker (`tracker-report/index.html`, reopen with `npm run report:tracker`) has downloadable evidence on passed and failed tests. It includes individual case videos, screenshots, and a merged video of the entire spec. The original Playwright WebM and screenshot attachments still appear in HTML and Allure. Conversion runs after Playwright finalizes the browser context and attachments, not during teardown.

Download-ready files are in the project's flat `evidence/` folder. For example:

- `legal.spec.video.mp4` — combined video in test declaration order
- `legal.spec.tc1.1.screenshot.png`, `legal.spec.tc1.2.screenshot.png` — multiple checkpoints for case 1
- `legal.spec.tc2.screenshot.png` — a case with one screenshot

Each completed run replaces only the matching spec's generated filenames; files for other specs and unrelated user files remain. A filtered run numbers its selected cases in declaration order and replaces the previous spec export. The tracker shows only the current run and remains self-contained for the CI `test-tracker` artifact. Passing `--reporter=...` on the command line replaces configured reporters, so the tracker and flat export are unavailable for that run.

MP4 conversion uses the bundled `@ffmpeg-installer/ffmpeg` dependency. Set `EVIDENCE_FFMPEG` to override it with a full FFmpeg executable containing libx264. If conversion fails, the original WebM remains available.

For a new UI test, import `test` and `expect` from `../fixtures/evidence`. Call `await evidence.caption('Action')`, `await evidence.highlight(locator)`, and `await evidence.checkpoint('Expected result')` only after the corresponding assertion succeeds. Use plain Playwright for API-only tests.

The before/after demo has no external dependencies. Run the optional intentional-failure example with PowerShell: `$env:EVIDENCE_FAILURE_DEMO='1'; npm run test:evidence`. Clear the variable afterward with `Remove-Item Env:EVIDENCE_FAILURE_DEMO`.

Use approved test accounts and test data for all runs, since evidence is now retained on success too. Videos, traces and screenshots can show sensitive information; review them before sharing. Never include secrets in captions.
