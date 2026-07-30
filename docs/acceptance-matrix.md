# Render acceptance matrix

This is the execution ledger for the first integrated render pass. It does not certify any workflow by itself. Every catalog entry remains `spec-only` until all declared outputs for that workflow pass both machine and full-video human review.

## Integration gate

- Rejected first-pass baseline: integration `d3a8c34c333d035a8d32848441203cb1e78ddd4d`, content merge `b3decf1c584651ed10eeaf5ef0f991f8c4f97089`, and frozen sample source commit `f36e38f58082de76eb9604509c7bb05b38232bd3`.
- Upstream integration `44113a7236a169b465adb55ef3f0bcc3804a39a7` contains the SVG fix but still has two known Render P0 classes: title/body and portrait layout failures, plus scene-local cursor/callout frames interpreted as global frames.
- Do not sync `44113a7` or render again from this branch. Wait for the sample-acceptance Render fix to merge, then sync its successor SHA and run the final acceptance pass.
- Workflow status remains independent from integration: do not promote any entry until its declared outputs pass the gates below.

## Declared outputs

The suite contains five workflows, seven outputs, 2,010 frames, and 67 seconds of encoded media at 30 fps.

| Workflow | Output ID | File | Required media | Audio | Current state |
| --- | --- | --- | --- | --- | --- |
| SaaS Feature Launch | `landscape` | `saas-feature-launch-landscape.mp4` | 1920x1080, 30 fps, 330 frames / 11s | Four-track local mix, no narration | Rejected first pass; waiting for Render fix |
| SaaS Feature Launch | `vertical` | `saas-feature-launch-vertical.mp4` | 1080x1920, 30 fps, 330 frames / 11s | Same locked mix and cue frames | Rejected first pass; waiting for Render fix |
| Mobile Onboarding | `vertical` | `mobile-onboarding-vertical.mp4` | 1080x1920, 30 fps, 300 frames / 10s | No source audio tracks | Waiting for Render fix |
| AI Workflow Demo | `landscape` | `ai-workflow-demo-landscape.mp4` | 1920x1080, 30 fps, 360 frames / 12s | No source audio tracks | Waiting for Render fix |
| Before / After Comparison | `landscape` | `before-after-comparison-landscape.mp4` | 1920x1080, 30 fps, 240 frames / 8s | No source audio tracks | Waiting for Render fix |
| Before / After Comparison | `vertical` | `before-after-comparison-vertical.mp4` | 1080x1920, 30 fps, 240 frames / 8s | No source audio tracks | Waiting for Render fix |
| Vertical Social Feature | `vertical` | `vertical-social-feature.mp4` | 1080x1920, 30 fps, 210 frames / 7s | No source audio tracks | Waiting for Render fix |

## Machine acceptance

Record one evidence row per output. A pass requires all applicable checks, not only a zero render exit code.

| Gate | Required result |
| --- | --- |
| Source validation | `validate` passes the frozen `demo-v1` Schema and repository semantic gates. |
| Compilation | `compiled-demo-v1.json` passes its Schema; asset hashes match repository bytes; paths are project-relative; no wall-clock or local absolute path appears. |
| SVG handoff | SVGs are rasterized only into ignored temporary render inputs; compiled assets and Git retain the original SVG paths and bytes. |
| Video probe | MP4 contains H.264 video in `yuv420p`, exact declared dimensions and 30 fps, exact frame count, and duration within one frame. |
| Complete decode | FFmpeg decodes the complete output with no errors. |
| Silent outputs | Workflows without source audio contain no unexpected audio stream. |
| SaaS audio | Both SaaS outputs contain the intended encoded audio stream, no narration, clicks at frames 107/219, chime at frame 255, and 12/24-frame BGM fades. |
| SaaS loudness | Final integrated loudness is from -24 to -20 LUFS and true peak is at or below -1 dBFS. Reject clipping, high-presence BGM, or masked cues; confirm at normal listening volume. |
| Determinism | Render both SaaS outputs twice from clean output directories; MP4 and first/middle/last decoded-frame SHA-256 values must match. |
| Review artifacts | Preserve compiled JSON, render report, FFprobe facts, first/middle/last frames, contact sheet, completed review checklist, and hashes under ignored output storage. |

### Rejected first-pass evidence

The ignored evidence directory is `outputs/acceptance-f36e38f/saas-feature-launch/`. It is bound to source commit `f36e38f58082de76eb9604509c7bb05b38232bd3`, source YAML SHA-256 `8768637ae4d9253fd2d688fbf9559a8be03bd54019c8032b16101ba095ae0fce`, and compiled JSON SHA-256 `0129a40d6a314e7047ce847991f4112f6cc37b09ba089d9fffb9ee672da003a5`.

- Both MP4s passed structural probe and complete decode: 330 frames, 11 seconds, 30 fps, H.264/yuv420p video, and AAC 48 kHz audio. The compiled manifest referenced zero PNG files, and no temporary `render-work` directory remained.
- Both MP4s measured `-28.2 LUFS` integrated, `2.0 LU` LRA, and `-10.9 dBFS` true peak. This fails the loudness gate. Together with the prior all-tracks-at-2 result of `-18.6 LUFS` and `-4.8 dBFS` true peak, the final source plan is calibrated to `music-bed: 1.3` and all three cues at `1.25`; expected output is approximately `-22.2 LUFS` and `-9 dBFS` true peak.
- Human review rejected both outputs. Title and body overlap; portrait content overflows and exposes black frames; the scene-local callout at frame 42 appears at global frame 42; and visual clicks occur at global frames 62/84 instead of the intended 107/219.
- This pass is failure evidence only. It is not a determinism run, no second render is allowed before the Render P0 fix merges, and it does not change any catalog status.

### Evidence ledger

| Output file | Integration SHA | MP4 SHA-256 | Probe/decode | Audio facts | Determinism | Human review | Final decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `saas-feature-launch-landscape.mp4` | `d3a8c34` / content `f36e38f` | `eb9f45d84b5eeecada55edd6bbe91f3eec096c054da860f1c2ca18d021e0fe17` | Pass: 1920x1080, 330f/11s, H.264/yuv420p + AAC 48 kHz; full decode | Fail: -28.2 LUFS, 2.0 LU LRA, -10.9 dBFS TP | Not run; blocked on Render fix | Reject: layout and scene-local timing P0 | `spec-only` |
| `saas-feature-launch-vertical.mp4` | `d3a8c34` / content `f36e38f` | `32dfb80c726554fae011e339293a7acbe7fe7124b32aaed880849292cf18d330` | Pass: 1080x1920, 330f/11s, H.264/yuv420p + AAC 48 kHz; full decode | Fail: -28.2 LUFS, 2.0 LU LRA, -10.9 dBFS TP | Not run; blocked on Render fix | Reject: overflow/black frame and timing P0 | `spec-only` |
| `mobile-onboarding-vertical.mp4` | Pending | Pending | Pending | N/A | Not required | Pending | `spec-only` |
| `ai-workflow-demo-landscape.mp4` | Pending | Pending | Pending | N/A | Not required | Pending | `spec-only` |
| `before-after-comparison-landscape.mp4` | Pending | Pending | Pending | N/A | Not required | Pending | `spec-only` |
| `before-after-comparison-vertical.mp4` | Pending | Pending | Pending | N/A | Not required | Pending | `spec-only` |
| `vertical-social-feature.mp4` | Pending | Pending | Pending | N/A | Not required | Pending | `spec-only` |

## Workflow-specific human review

| Workflow | Required full-video decisions |
| --- | --- |
| SaaS Feature Launch | Feature category is immediate; dashboard, builder, and `42% faster` result stay readable; both clicks land on controls; callout avoids nodes; vertical crop follows the active UI; BGM and cues support rather than mask the result. |
| Mobile Onboarding | Welcome, preferences, and first plan read in order; selections and CTA fit the phone; longest text stays inside the device; value arrives without a rushed hold. |
| AI Workflow Demo | Structured input, execution status, output, and explicit human approval are all visible; no generated layer is mistaken for exact product UI. |
| Before / After Comparison | Both states use matched content and framing; the comparison is honest; labels remain visible; vertical adaptation does not hide evidence. |
| Vertical Social Feature | Hook, one interaction, and result remain readable at phone size; captions stay inside marked social safe margins; no real platform chrome is misrepresented. |

Reviewers must watch each complete video at normal speed and intended display size, then complete the example's `review-checklist.md`. Contact sheets and individual frames support review but cannot replace it.

## Status promotion

Do not edit `data/workflows.json` during the first sample pass. A workflow can leave `spec-only` only after every declared output has machine evidence and signed human review. Passing the two SaaS outputs alone proves the sample pipeline; it does not promote the other four workflows or the catalog as a whole.
