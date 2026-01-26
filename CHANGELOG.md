# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.13] - 2026-01-26

### 🔨 Chores

- ****release**: improve release notes legibility and synchronize workflows** (a9b0a0a)

### 📝 Other Changes

- **** ()

## [1.0.0] - 2026-01-16

### ⚠️ BREAKING CHANGES

- Implement component event handling with native HTML syntax (0a8fee2)
- Implement component runtime reactivity with instance-scoped state (de189f4)

### ✨ Features

- **router**: integrate SPA router runtime into shared bundle (de1a45f)
- **compiler**: add Acorn-based import parsing (Phase 1) (e946213)
- **compiler**: make compiler pipeline async for ES module parsing (71f668c)
- **compiler**: rewrite import handling with es-module-lexer (1e79af6)
- **compiler**: add es-module-lexer and ScriptImport type (862a3bb)
- Implement hybrid reactive primitives and lifecycle hooks (d4f02f1)
- Implement complete runtime file-based routing system for SPA (8dfe5b9)
- Implement file-based routing for static multi-page generation (1ccfa34)
- Implement component event handling with native HTML syntax (0a8fee2)
- Implement component runtime reactivity with instance-scoped state (de189f4)
- **phase-2**: reactive text binding (9684da0)
- Implement Phase 1 & Phase 2 event system with DOM helpers (5aba7d2)

### 🐛 Bug Fixes

- **release**: use appendFileSync for GitHub Actions output (e04d232)
- ensure bin and files fields are correctly set in package.json (ac0430a)
- **zenlink**: fix browser back button requiring multiple clicks (1261151)

### 📚 Documentation

- add comprehensive README and MIT license (da24054)

### 🔨 Chores

- **release**: v0.6.1 - fix module resolution (8799b5f)
- **release**: v0.6.0 - Acorn-based import parsing (8e5a28f)
- **release**: v0.5.0 - ES module import support (419b205)

### 📝 Other Changes

- 
9409e30e4a40e7bb4f3ae0a4ff2023fe66939f0f ()
- 
eb51a2a3c54fd533f2deb9f6f1399abfbf70fd9b ()
- 
b9d042a47efba5167d73139601ad11cdf0edf6c5 ()
- 
45b5fee328f21f72fdc8f96bc81ae1ba2483ddca ()
- 
2d808a20bf3670e30a8ee15103e0306c42e7756e ()
- 0.6.2 (5417c2f)
- 
36e60980425f21410881f7886c9922feccaff4fc ()
- 
abd20bc10a8890d75575c282c1393574ad5113c6 ()
- 
d20984ee5ae3195df7b5b53a4e69a8daacd42dcc ()
- 
24446549cc2b31279b5fe182260973d3e34b5094 ()
- 0.4.7 (4ca5965)
- 
7628524e703abb531f1041f1f73b40743bf8d383 ()
- 
b55fbae66c439ae74e4fd9aa9534874693602e41 ()
- 
289824ba3d115aeb9558b34a91b2735b6524b6a4 ()
- 
affaa73c396f9d02dafba89e4a1d42405e555a95 ()
- 
8878f7e34af035f9eeaab452298ba0049199bb4c ()
- 0.4.4 (e801b34)
- 
42b60cfa8816c4e4c99f3c12513cea948e1a694d ()
- 
bbf4d53e627038cbbfa3f29cd75220615ad58c08 ()
- 
3cad70c9774134ac78811f98d087c7616167073c ()
- 
eb7a88069ae6b2d798ae03be1a2147d52079f3bf ()
- 
a4e15bf9e3630b87249b41476307050942acb896 ()
- 
8e1da267491920afd01193737437e879e7ed20a6 ()
- 
6b0db6171ebaac6a256f193eebd16fdcf2003c8f ()
- 
2b347b985d23eb3e27f0777fbe4bb7af6e6b99a0 ()
- 
1294987a05f7aa3aebc723f72f1d55d54988dd35 ()
- 
5f5981cfdd053d1268b0fff5f5e33fbdc4099c34 ()
- update to core (71f31d2)
- 0.3.3 (a858b54)
- 
3a533a55e85d0b8872e43f0b287b856c043f68dc ()
- 
10db946508a26cc08d0f1295ad8e2bcdbc416b9e ()
- 
2f538162c2c6ef12ef8880ddb03dea9f44ad4659 ()
- 
2658347efb7cb6699b8084a69099f9d177842f8d ()
- 0.3.0 (0a8f484)
- 
35e82a69a91c2f7448afe4692f9b8da7dfb0fe7e ()
- 
ab98de691a231431da405bc5b6f56b04d92d26f9 ()
- 
c110a9684a86e632b94d6181c828e1af37828e99 ()
- 
8cef03c443cc308bee9a0fe9b35e7d2cf002b90f ()
- 
873fcc3ebcbaecb9fb290209961e4c113d4af00b ()
- 
197cc39177f55bee5e9a0f530c0ea970d9ae5790 ()
- Merge pull request #45 from zenithbuild/fix/zenlink (5d23f8d)
- Merge pull request #38 from judahbsullivan/33-contributing-md (7955c20)
- 
026791e72a5382495257071e41c24e9be70bd6a5 ()
- 
dd6942694715f5008ae4ffcbe58c5df0e85c25a9 ()
- 
059de907907744946b429dba5748f9718a49de25 ()
- 
3850da6bc41e9f16be4af2673cf65bbe1fa451f1 ()
- 
80979a2bcb42511f03990be21ac2d53742247e57 ()
- 
d208f7e2bf08ac3cec20216d9b99fd99d27f1767 ()
- 
bf983761fd302c81fbec1726d04d6e1a6b5b3cb1 ()
- 
50eb37104526a191c85e50a6e7b2b08b7212ec55 ()
- 
ef0527dad4487d1bd0a15665f8b101563ae832f1 ()
- Added ZenLink and Routing API (1ce5892)
- Merge pull request #29 from judahbsullivan/core/state-primitives-lifecycle-hooks (6427281)
- Merge pull request #26 from judahbsullivan/feature/zenlink-navigation (6035261)
- Merge pull request #25 from judahbsullivan/cursor/file-based-routing-analysis-f2bb (0dde315)
- Merge pull request #24 from judahbsullivan/feature/Component-Event-Handlers-#18 (bd4a01d)
- Merge pull request #23 from judahbsullivan/feature/enable-component-reactive-bindings-#17 (434fe81)
- Merge pull request #22 from judahbsullivan/feature/component-architecture (5b12a14)
- Built Simple Component Architecture (10e34dc)
- Merge pull request #15 from judahbsullivan/feature/minimal-binding-runtime (5c6c15c)
- extended bind.ts created minimal binding runtime and deterministic state update order in one (1822143)
- 
eb2f49c438d59c8b5d46997d4fb912081de17632 ()
- changed app.zen to index.zen and state mutations events and test working on frontend (622092b)
- 
96c3f50d850a4b79a90c06a60ac4bba28bfcd806 ()
- added State declorations (ddd6f93)
- Merge pull request #11 from judahbsullivan/feature/reactive-text-bindings (becdcb7)
- Merge branch 'main' into feature/reactive-text-bindings (93152a8)
- 
212d3cdf7ba0173dffc049882d6e059f9f49cb57 ()
- 
681104dbe36c4eba2b4c8f88923aa22dbc65dbe3 ()
- Phase 2: Direct State Mutation (1ef5c7f)
- working on release webhooks (1921488)
- 
63cbbc03d868f7e5f57caa7197404ef2fbfc3a49 ()
- 
d756ca6a5172ba5008451fa589dccc052f7c5bfb ()
- 
84477b7ca0a2d9b07144f95b8262b2d93b78f607 ()
- 
fa75e58ae80d14e4adacb234d7249e5e352325ae ()
- 
5623f6e4061ad459093e12f4c46dbdd05e6f3829 ()
- 
abfa086b668776708c6d0b1ba656a94079aa2080 ()
- 
f243a465bea8448300c156d9f09fa7abf05eb81f ()
- Fix Node.js syntax error in Discord notification workflow (89254a5)
- 
00135bfd5c978a9bdce98452f0161212e620d21a ()
- 
ce13d24e44b381761df76941d1ee0fc3e69725d5 ()
- 
cc4a68a15929d77ec6102f8ad75c9053b3ba3bb6 ()
- building web hook (d33c340)
- 
186fbf228582d54df236eb2ef559b0c146d55fd9 ()
- 
28bb64a6eef595671f4d65543e680ed0420825c6 ()
- Built Simple Compiler (664bcb6)
- 🚀 editing small configurations in the application (cf10568)
- 
d89a5f6a82a74378b1ea89e76ac6b2b7ac3fb1fb ()
- ⚠️ building core checklist (1ea90fb)
- 
c506b8c4d5885bfd10aebe2493e823c9fcd41e78 ()
-  ()

