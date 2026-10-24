# Third-party notices

The MIT license at the repository root covers the original game and tooling.
The following vendored components keep their own copyright notices and licenses.

| Files                            | Component                                                                                                                 | License                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `client/three.min.js`            | Three.js r128, copyright 2010-2021 three.js authors                                                                       | [MIT](licenses/threejs-MIT.txt)                               |
| `client/vendor.js`               | Three.js r128 post-processing examples: EffectComposer, ShaderPass, UnrealBloomPass, CopyShader, LuminosityHighPassShader | [MIT](licenses/threejs-MIT.txt)                               |
| `client/martian-mono.woff2`      | Martian Mono, copyright 2021 The Martian Mono Project Authors                                                             | [SIL Open Font License 1.1](licenses/martian-mono-OFL.txt)    |
| `client/saira-condensed-*.woff2` | Saira Condensed, copyright 2016 The Saira Project Authors, reserved font name Saira                                       | [SIL Open Font License 1.1](licenses/saira-condensed-OFL.txt) |

Three.js was obtained from cdnjs and the upstream examples. The font files are
the Latin WOFF2 subsets supplied by Google Fonts. Fonts remain under their OFL
license when distributed with this project. Game geometry and textures are generated
by the game code. JavaScript dependencies and their notices are recorded in
`pnpm-lock.yaml` and their installed packages.
