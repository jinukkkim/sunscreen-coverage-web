# Third-party notices

## Google MediaPipe

Copyright The MediaPipe Authors. Licensed under Apache License 2.0; see [license](third_party/mediapipe/LICENSE).

`tests/fixtures/canonical-face.json` contains synthetic canonical model vertices from [canonical_face_model.obj](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model.obj), converted to JSON. It contains no participant image or biometric capture.

The unmodified runtime package `@mediapipe/tasks-vision` is pinned to 0.10.32 (Apache-2.0). Its generated JavaScript/WASM files are copied from that package without modification.

Official unmodified model assets are pinned to float16/1. URLs and SHA-256 are recorded in `scripts/vision-assets.json`:

- Face Landmarker: [Face Mesh V2 model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf), Apache-2.0.
- Hand Landmarker: [Hand Tracking model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Hand%20Tracking%20%28Lite_Full%29%20with%20Fairness%20Oct%202021.pdf), Apache-2.0.

The generated `/vision/LICENSE` and `/vision/NOTICE.md` accompany the runtime/model assets in the built site. These licenses do not change the MIT license or SUNFIT contributors copyright of this project.
