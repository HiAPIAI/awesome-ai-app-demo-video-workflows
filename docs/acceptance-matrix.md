# Render acceptance matrix

This is the execution ledger for the first integrated render pass. It does not certify any workflow by itself. Every catalog entry remains `spec-only` until all declared outputs for that workflow pass both machine and full-video human review.

## Integration gate

- Integrated render baseline: `d3a8c34c333d035a8d32848441203cb1e78ddd4d`, including Core/shared gates and `fix(render): 栅格化已验证的 SVG 素材 (#5)`.
- Content merge commit: `b3decf1c584651ed10eeaf5ef0f991f8c4f97089`; it contains the integration baseline without changing catalog status.
- The SVG raster blocker is satisfied. Compile and render evidence must identify this baseline and the final content commit.
- Workflow status remains independent from integration: do not promote any entry until its declared outputs pass the gates below.

## Declared outputs

The suite contains five workflows, seven outputs, 2,010 frames, and 67 seconds of encoded media at 30 fps.

| Workflow | Output ID | File | Required media | Audio | Current state |
| --- | --- | --- | --- | --- | --- |
| SaaS Feature Launch | `landscape` | `saas-feature-launch-landscape.mp4` | 1920x1080, 30 fps, 330 frames / 11s | Four-track local mix, no narration | Ready to render |
| SaaS Feature Launch | `vertical` | `saas-feature-launch-vertical.mp4` | 1080x1920, 30 fps, 330 frames / 11s | Same locked mix and cue frames | Ready to render |
| Mobile Onboarding | `vertical` | `mobile-onboarding-vertical.mp4` | 1080x1920, 30 fps, 300 frames / 10s | No source audio tracks | Ready to render |
| AI Workflow Demo | `landscape` | `ai-workflow-demo-landscape.mp4` | 1920x1080, 30 fps, 360 frames / 12s | No source audio tracks | Ready to render |
| Before / After Comparison | `landscape` | `before-after-comparison-landscape.mp4` | 1920x1080, 30 fps, 240 frames / 8s | No source audio tracks | Ready to render |
| Before / After Comparison | `vertical` | `before-after-comparison-vertical.mp4` | 1080x1920, 30 fps, 240 frames / 8s | No source audio tracks | Ready to render |
| Vertical Social Feature | `vertical` | `vertical-social-feature.mp4` | 1080x1920, 30 fps, 210 frames / 7s | No source audio tracks | Ready to render |

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
| SaaS loudness | Final integrated loudness is approximately -24 to -20 LUFS and true peak is at or below -1 dBFS. Reject clipping, high-presence BGM, or masked cues; confirm at normal listening volume. |
| Determinism | Render both SaaS outputs twice from clean output directories; MP4 and first/middle/last decoded-frame SHA-256 values must match. |
| Review artifacts | Preserve compiled JSON, render report, FFprobe facts, first/middle/last frames, contact sheet, completed review checklist, and hashes under ignored output storage. |

### Evidence ledger

| Output file | Integration SHA | MP4 SHA-256 | Probe/decode | Audio facts | Determinism | Human review | Final decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `saas-feature-launch-landscape.mp4` | Pending | Pending | Pending | Pending | Pending | Pending | `spec-only` |
| `saas-feature-launch-vertical.mp4` | Pending | Pending | Pending | Pending | Pending | Pending | `spec-only` |
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
