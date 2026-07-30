# SaaS Feature Launch

This workflow introduces one feature in context, demonstrates its decisive interaction, and closes on a concrete result. It avoids a feature-list montage.

## Expected rhythm

| Time | Beat | Review intent |
| --- | --- | --- |
| 0.0-1.5s | Literal feature promise | The viewer understands the category before seeing UI. |
| 1.5-4.5s | Dashboard context | The automation entry point remains readable. |
| 4.5-8.5s | Builder interaction | Cursor movement leads the eye; the callout never covers the workflow nodes. |
| 8.5-10.0s | Performance result | The 42% improvement is readable without pausing. |
| 10.0-11.0s | Product lockup | The product name lands once, without a second CTA. |

## Locked audio plan

There is no narration. The local mix uses four tracks. A rejected preflight with all tracks at `volume: 2` measured `-18.6 LUFS` and `-4.8 dBFS` true peak in both aspect ratios: it did not clip, but the music presence was too high for this UI demo.

| Frame | Audio | Source and intent |
| ---: | --- | --- |
| 0 | Light product bed | `bgm_003.wav`, original deterministic synthesis, 48 kHz stereo, 11.06s; `volume: 0.65`, 12-frame fade-in and 24-frame fade-out. |
| 107 | UI click | `sfx_001.mp3`, bundled `click`, `volume: 1`; synchronized to the dashboard action. |
| 219 | UI click | Reuse the same bundled `click` at `volume: 1`; synchronized to the builder action. |
| 255 | Result confirmation | `sfx_002.mp3`, bundled `chime`, `volume: 1`; lands as the performance result appears. |

The acceptance target is approximately `-24` to `-20 LUFS` integrated with true peak at or below `-1 dBFS`, followed by normal-volume human listening. `bgm_001` and `bgm_002` are explicitly excluded.

The screenshots and `bgm_003.wav` are original fictional assets created for this repository and licensed under MIT. The click and chime retain their `media-use` / `bundled.sfx` provenance and the Pixabay Content License; they are not presented as original repository recordings.
