# SaaS sample audio sources

These are frozen source assets for the first integrated render sample. They are media inputs, not generated render outputs.

| Path | Provenance | Media facts | SHA-256 |
| --- | --- | --- | --- |
| `bgm/bgm_003.wav` | Original deterministic local synthesis, MIT | PCM s16le, 48 kHz stereo, 11.06s, source -23.9 LUFS / -16.5 dBFS true peak | `35566352a71b74f082409aa5c175651620779715ec988f6adcb14e0bda1e8a9e` |
| `sfx/sfx_001.mp3` | `media-use` bundled SFX, Pixabay Content License, library key `click` | MP3, 44.1 kHz stereo, approximately 0.4s | `075e17bdac5c13662a1c9530050e0046f81d4138e00eb3bf30427a7b4404103d` |
| `sfx/sfx_002.mp3` | `media-use` bundled SFX, Pixabay Content License, library key `chime` | MP3, 48 kHz mono, 2.5s | `74823b1b27703c56e0652db838f503c150ce9c2442d47d27430af3d5121d6d12` |

`bgm_001` and `bgm_002` are rejected staging variants and must not be added or referenced. The bundled SFX retain their library provenance and are distributed under the [Pixabay Content License](https://pixabay.com/service/license-summary/), which permits commercial and non-commercial use, modification, and distribution as part of derivative works without mandatory attribution.
