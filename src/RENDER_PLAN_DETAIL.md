# Render 管線大修：設計原文（附錄）

> 這份是 2026-10-21 設計階段（三份設計＋評審）定稿的原文，英文照錄，給接手的人（或代理）照著做。摘要、進度與怎麼接著做在 `src/RENDER_PLAN.md`。
> 已完成：S1–S4、R0–R2（見 RENDER_PLAN.md）。這裡的 S0 是量測工具（已在 `src/tests/render_lab/`）。行號是 e991baa 那時的，合併後會偏移，照函式名找。

## Architecture

TARGET SHAPE. Every step before the lid step is bit-exact on harness no-MSAA shots, with identical battle hashes.

1) render() (60_render.js:645-785) becomes a list of stages. Bodies move verbatim and the GL call order is unchanged:
```
render(){
  var fr=frameBegin();                       // resize … lampsUpdate, DUMMY, prepRig, rbatPrep (new), unbind unit 4, bedBuild
  if (GFX.shadow && !cutOn()) shadowPass(); else SHM.on=false;   // kept inline (keeps the harness stack shallow)
  shadowMats(); bind SHM.tex → unit 4
  if (RT.R) reflPass();
  mainOpaque(fr); mainWater(fr); mainOverlay(fr); frameEnd(fr);
}
```
- shadowSimple and the shadowPass cascade loop both call one function, shadowCasters(k). It replaces the copy-pasted P.dvox/P.dtri/P.dsail triples at 417-419 and 508-510.
- GL state (depth func, cull, frontFace, polygon offset, viewport) stays written explicitly by shadowPass/shadowSimple/reflPass/mainOpaque, exactly as today.
- Descriptors never 'normalize' state. Reflection keeps inheriting LESS from the shadow pass.

2) FRAME PREP. New view-layer file src/js/60_rbatch.js, one script line in template.html right after js/60_render.js, same data-bundle.
- Global object RBAT. Function prefix rbat*. Avoid a global named RB and any short lowercase top-level names.
- rbatPrep() runs once per render() call, keyed by RFR. That includes __game.cam/mask/cut, demo and fleetlab.
- Structure-of-arrays typed arrays that grow ×2 and are reused. Steady-state frames allocate nothing.

Owners: RBAT.own = ships with sink≤40 in SHIPS order, then PIECES. Per owner:
- ref, kind;
- item ranges per class;
- cs, a cascade bitmask filled by the shadow pass (csmIn evaluated once per owner per cascade; centre and R cached per frame with the identical expressions);
- per colour pass: world AABB, max clip-w, cluster id.

Items: per owner, in today's draw order:
- cls: 0 model, 1 deco, 2 smooth region/run, 3 armour smooth, 4 piece mod, 5 FLY;
- owner, slot (model k, deco k, or position in the smR Map);
- vao, el (arrays/elements), off (byte offset), cnt;
- glow (isLamp ? lanternK : 0; pieces and FLY get 0);
- matrix: 16 floats in RBAT.M at i*16;
- world AABB, filled from step S6 on.

Predicates are copied verbatim from drawModels, smDraw and armSmDraw. meshGpu runs in prep, only for drawn items.

Matrices are computed with today's exact expressions and association:
- model: M4.mul(sh.M, dv ? M4.mul(trans(dv), modelLocal(m)) : modelLocal(m)), with dv = m.ancD || m.vsl;
- deco: M4.mul(sh.M, d.L || trans(origin));
- piece mod: M4.mul(pc.M, m.L);
- FLY: f.M copied;
- smooth: sh.M;
- armour smooth: armM(a).
modelWorld/MWM is retired; RFR stays (shLog uses it). S12 later swaps M4.mul for an exact, allocation-free m4Into.

Hull lists (from S8): per owner, the runs of its RegionSet over a per-type arena (see 4).

3) PASS DESCRIPTORS. RBAT.pd.sh (with .k = cascade), RBAT.pd.rf, RBAT.pd.mn.
- They carry: name, owner-visibility test (sh: own.cs bit k; rf/mn: all), depth-only flag, the instanced/legacy program pair, and the per-pass colour emission list (built lazily inside drawModels once PASS.vp is final).
- drawHulls/drawModels/drawSails keep their names (harness by_pass_fn) and take (prog, pd) instead of (prog, near).
- drawColours, the rope/line loop, chain shot, glsDraw, crew, debris and sea are untouched legacy code.

4) ARENAS (exact by construction; legacy programs).
Hull arena per pristine RegionSet (T.pristine, A.rs0, P.rs0):
- one VBO = the pristine region VBOs copied GPU-side with copyBufferSubData, in pristine Map order;
- one VAO with VoxelKit's own format (loc 0 = vertexAttribIPointer(4, UNSIGNED_SHORT, 8, 0); element buffer QIDX.buf).
Each frame, a ship's live rs.regions Map is cut into runs:
- consecutive entries still shared with pristine (!own && same vbo) that are contiguous in the arena become one drawElements(TRIANGLES, Σn*6, UNSIGNED_INT, q0*24);
- own (damaged) regions are drawn in place with their own VAO.
Same program, same uniforms, same vertex bytes, same primitive sequence as RegionSet.draw.

Smooth arena per pristine smooth map (T.smP, A.smP, P.smP):
- one VB/IB/VAO, built from smBuild's own CPU arrays at load;
- indices shifted by vbase; each region keeps n and gets io.
- Consecutive entries with the same vao and contiguous io merge into one drawElements.

5) REPLAY.
(a) Legacy replay: exactly today's GL stream from RBAT. Used when cutOn() is true, for ?rb=0, and when an instanced program is missing.

(b) Depth passes (shadow; LESS, depth-only, order-free):
- one bucket per (vao, el, off, cnt) across all owners whose cascade bit is set; FLY is always included when the cascade draws;
- P.dtriI with palette chunks of at most INST_K;
- hulls as per-owner arena runs on P.dvox (uModel = sh.M);
- sails as today.

(c) Colour passes (refl, main):
- Units: ships whose model-stage world AABBs are within tau_pass of another ship form a cluster (union-find). Each clustered ship is a unit of its own, in SHIPS order. Free ships of the same type form one unit.
- Units are emitted in order of their first ship.
- Inside a unit, items are processed slot-major across ships through one batcher. Groups are keyed by (vao, el, off, cnt, glow). The precedence relation is: same owner AND world-AABB gap ≤ tau_pass. A new item first closes every other open group that holds one of its predecessors. Groups never reopen. Instance order is insertion order. Chunks are split consecutively at INST_K.
- Phase barrier: a unit's models and decos are all emitted before its smooth and armour-smooth items, which stay strict per ship and are instanced across ships only when identical.
- Pieces mods and FLY come after all units, strict (consecutive same-mesh runs only).
- tau_pass = 16·2^-24·wmax²/(|c2|·cosmin) + 1e-3 m, where:
  - z_ndc = c1 + c2/w is taken from the pass VP;
  - wmax = max clip-w over the two boxes, clamped to at least near;
  - cosmin = cosine of the widest frustum corner ray.
  An orthographic VP or cutOn() means no reordering.
- Hulls stay per ship (P.vox arena runs) with cutSet, vlampSet and uModel as today. Poles, lines and sails are unchanged.
- Return contract: P.tri bound, P.tri uGlow 0, cutSet(P.tri, null) applied.

6) OWNERSHIP.
- 60_render.js: pass order, targets, cascade fitting, all GL state, sea, overlays, prepRig.
- 60_rbatch.js: what is drawn this frame (items, matrices, bounds, clusters, batches, arenas) and how it is submitted; debug switches window.__rbat and the probes.
- 01_gl.js: programs (P.triI, P.dtriI, INST_K).
- 62_simview.js: me.bb at upload, armDraw/arena hookup.
- 15_smooth.js: smooth arena build and run-merging draw.
- 74_cutaway.js: cut-state cache.
- 62_ports.js / 07_gfx.js: lid policy text (last step only).
- Switches are URL flags read from Q, like ?lerp=0:
  - rb=0: all legacy;
  - rbinst=0: no instanced programs;
  - rbgeo=0: no within-ship reorder;
  - rbtau=<m>: debug override of tau, where a huge value clusters everything;
  - rbchk=1: matrix check;
  - rigchk=1: sail-buffer check.
  Debug helpers live in window.__rbat under DEBUG, not in __game and not in prefs. The core/shell files (71_input, 69_prefs, 70_flow, 00_events, 90_main) are not touched, except one coordinated readout line in the lid step.

Comment style for new code (Traditional Chinese, terse, says why), for example:
'// 一格一張表（rbatPrep）：世界矩陣照以前同一條算式、同一個捨入點（⛔ 不合併乘法、不跨格留：d.L、m.vsl 原地改，renderLerp 每格換 sh.M）'
'// 兩艘之間的距離大於 τ ⇒ 同一個像素不可能深度相同 ⇒ 誰先畫都一樣（LEQUAL 後畫贏、LESS 先畫贏都不變）'

7) END STATE (approximate; the harness gives exact counts).
| Config | Baseline draws | Final draws |
|---|---|---|
| gc_low | 910 | ~220-290 |
| gc_mid | 2148 | ~420-490 |
| gc_high | 2804 | ~650-710 |
| gc_high_csm | 4660 | ~1000 |
| fleet8_high | 12056 | ~400 |
Total vertices (count×instances) stay identical through every step except the optional reflection-underwater step and the lid step.

## Shaders

PRINCIPLE: the text of every existing program stays byte-identical, and it keeps serving every non-instanced use. That covers:
- P.vox / voxFS, P.dvox (all hull drawing, including arena runs);
- P.tri: the legacy replay, poles, lines, chain shot, glass, cutaway;
- P.dtri, P.sail, P.dsail.
Those paths are exact by construction.

NEW PROGRAMS (01_gl.js programs()). Only two.
1. Move the P.tri VS/FS literals and the P.dtri VS literal into vars TRI_VS, TRI_FS, DTRI_VS. Moving a literal into a var changes no byte.
2. instVS(src) applies two replacements, each of which must occur exactly once (otherwise return null and console.warn; that program stays legacy):
   - 'uniform mat4 uModel,uVP;' becomes 'uniform mat4 uMs[' + INST_K + '],uVP;'
   - 'void main(){ ' becomes 'void main(){ mat4 uModel=uMs[gl_InstanceID]; '
   The rest of each VS stays character-identical:
   - 'vec4 w=uModel*vec4(aP,1.0); vW=w.xyz; vN=mat3(uModel)*aN; vC=aC; vM=aM; gl_Position=uVP*w;'
   - 'gl_Position=uVP*(uModel*vec4(aP,1.0));'
3. Write the results on their own lines so the harness labels them:
   - P.triI = VK.compile(gl, instVS(TRI_VS), TRI_FS)
   - P.dtriI = VK.compile(gl, instVS(DTRI_VS), NOFS)
   Each is wrapped in try/catch; on failure the value is null and that program stays legacy. programs() also runs inside GL_STEPS before QIDX exists, so it does no other GL work.
4. INST_K = clamp(floor((MAX_VERTEX_UNIFORM_VECTORS−16)/4), 16, 64). That is 64 on the harness GPU (4095) and 60 at the WebGL2 minimum (256).
5. The FS is the identical string. uGlow stays a uniform; batches are split by glow value.

ATTRIBUTES. Unchanged.
- Locations 0 aP, 1 aN, 2 aC, 3 aM. No divisors, no new VAOs, no instance buffers.
- Model VAOs keep location 3 disabled and read the generic constant from vertexAttrib2f(3, 0, 0.5), which is set before every model stage. Smooth VAOs and arenas supply aM themselves.
- me.vao and me.vbo are untouched (90_main.js:430-433 reads me.vbo).

PER DRAW.
1. Copy at most INST_K matrices into RBAT.pal (a Float32Array of INST_K·16) with manual 16-float copies.
2. gl.uniformMatrix4fv(prog.u.uMs, false, RBAT.pal, 0, 16k). VK.compile strips '[0]' from array names, so u.uMs exists.
3. bindVertexArray on the existing VAO (me.vao, a smooth VAO, or a smooth arena VAO).
4. drawArraysInstanced(TRIANGLES, 0, me.n, k) or drawElementsInstanced(TRIANGLES, cnt, UNSIGNED_INT, off, k).
gl_InstanceID restarts at 0 for every draw; WebGL2 has no base instance.

HULLS: no new voxel program. Arenas reduce a pristine ship to about 1 draw per pass using P.vox/P.dvox with uModel. P.voxI would need an FS change because VOXEL_FS uses mat3(uModel); it is deferred.

WHY THE RESULT IS BIT-EXACT, and how that is proven:
(a) Every instance receives exactly the float32 matrix bits uModel receives today: same expressions, same Float32Array rounding points, copied float32 to float32.
(b) The VS differs only in where uModel comes from (a default-block uniform array element instead of a default-block uniform). The arithmetic text is identical and the FS is identical.
(c) An instanced draw rasterizes its instances in order, so a group keeps its internal order.
(d) The shadow pass is depth-only with LESS and no blending, so the final texel is the minimum depth and order does not matter. Polygon offset is computed per triangle from identical vertices.

GLSL does not guarantee identical codegen for a dynamically indexed array, so this is GATED, not assumed:
1. window.__rbatProbe() (debug only, run by the harness in every config):
   - links transform-feedback twins of (TRI_VS, TRI_FS) versus (instVS(TRI_VS), TRI_FS), capturing gl_Position, vW, vN, vC and vM; and of (DTRI_VS, NOFS) versus its instanced variant, capturing gl_Position;
   - runs every current RBAT item under RASTERIZER_DISCARD with POINTS: legacy uses uModel and drawArrays(POINTS, 0, nVerts); instanced uses palette slots cycling over 0..K−1 and drawArraysInstanced;
   - sets generic attribute 3 = (0, 0.5) exactly as drawModels does;
   - compares the results as Uint32, reports {items, verts, mismatch, maxUlp} per program, and restores every GL binding it touched.
2. Harness no-MSAA shots must be bit-identical, and a same-build A/B with ?rbinst=0 must be identical.

FALLBACK LADDER, used only if the probe shows a mismatch. Each rung changes only the new program, never P.tri/P.dtri:
1. A std140 UBO 'uniform IM{ mat4 uMs[K]; }' with bindBufferRange.
2. A per-instance attribute mat4 at locations 4-7 with divisor 1, via game-side instance VAOs.
3. Otherwise that program stays legacy (rbinst off by default). Arenas, trackers and the CPU steps still land.

The probe is strong evidence, not proof, because the TF twin is a separate link. The pixel comparison is the arbiter. Bit-exactness is established only for the harness backend (ANGLE D3D11, RTX 2060).

## Steps

### S0 — Harness: extra stress configs, same-build A/B flags, verts per pass, probe/check capture; record baselines (no repo change)

- **Files:** C:/Users/CRESPI~1/AppData/Local/Temp/claude/D--Unity-Blocksail/43308a73-7475-4a27-be6e-5f73c80f5a16/scratchpad/harness/harness.py, C:/Users/CRESPI~1/AppData/Local/Temp/claude/D--Unity-Blocksail/43308a73-7475-4a27-be6e-5f73c80f5a16/scratchpad/harness/inject.js
- **Depends on:** —; **effort:** M

**Changes**

Keep the 9 default configs byte-for-byte unchanged. Add an EXTRA set used by every later ab:
- gc_high_cut: GC&gfx=high, plus a new per-config 'js' hook run after warm-up: '__game.cut({half:true})'. Covers the cutaway legacy path; shadows are off.
- eve_late_high: GC&gfx=high&mode=eve, warm 1500-1800, camera {ship:0, dist:60, pitch:0.12}. Has PIECES, FLY, own (damaged) hull and smooth regions, shot-away lids (d.gone), possibly burn.
- fleet8_csm: F8&gfx=high&csm=1.
- fleet8_close: F8&gfx=high with camera dist 40 among the ships. Gives a larger depth-tie distance and neighbours near the camera.
- gc_high_close: camera {ship:0, dist:22, pitch:0.06}. Lids, guns and lamps are large on screen.
- gc_low_close: the same camera at gfx=low. For the lid step.
- gc_high_fp: hook '__game.fp(1)' after warm-up. First person, near 0.05. Make sure the harness cam does not override it.
Note: the URL dist is clamped to at least 50 m (config dist [50,1000,140]), so touching ships cannot be forced by URL. Cluster logic is exercised through ?rbtau overrides instead.

Options:
- ab --qa/--qb: extra query appended to the A or B side, so one build can be compared with itself (?rb=0, ?rbinst=0, ?rbgeo=0, ?rbtau=1e9).
- inject.js: also accumulate count×instances per stack path (byPathVerts), so the harness reports verts per pass.
- After the shot and counting, if window.__rbatProbe exists, call it and store the result; if __rbat.stat exists, store it (rigMiss, matMiss). compare fails (exit 2) on any probe mismatch > 0 or check miss > 0.

Record the frozen baseline builds/base_add56a9_0737dec053d1 on the extra configs (--repeat 2). Run one A=B pass on all 9 + extra configs.

Workflow for every later step:
1. export GIT_WORK_TREE=D:/Unity/Blocksail/.claude/worktrees/blockside-render.
2. Run git checkout -- index.html before each build (build --code requires index.html built from HEAD), or commit each verified step including index.html.
3. python -I src/admin.py build --code.
4. Snapshot index.html + ships/ + icons + manifest to scratchpad/builds/<step>/.
5. ab against the previous step and against the frozen baseline (--repeat 1 for pure-structure steps, 3 for steps with a CPU claim).

**Exactness**

No game change. Done when:
- the A=B run reports ALL PIXELS + HASHES IDENTICAL on every default and extra config;
- verts per pass are reported;
- the extra baselines are stored.
If any extra config is non-deterministic, fix its hook timing or drop it before S1.

**Expected gain**

None. Enables exact per-step checks. Reference draw counts:
| Config | Draws | Per pass |
|---|---|---|
| gc_low | 910 | |
| gc_mid | 2148 | |
| gc_high | 2804 | shadow 928 / refl 930 / main 946 |
| gc_high_csm | 4660 | shadow 2784 |
| gc_high_nolids | 2597 | |
| fleet8_high | 12056 | 4000 / 4008 / 4048 |
| ports_high | 2806 | |

**Risk**

Extra configs can be non-deterministic (eve combat, cut hook timing); the A=B run shows it. Run all measurements in the harness's own Chrome instances on explicit ports, never the shared Browser pane (phase 1 hit other sessions' tabs twice).

### S1 — render() as stages; one shadowCasters(); csmIn once per owner per cascade; no SHIPS.concat

- **Files:** src/js/60_render.js, src/README.md
- **Depends on:** S0; **effort:** S

**Changes**

- Split render() into frameBegin()→fr {w,h,sky0,hor0,tod0,bolt} (646-655), mainOpaque(fr) (661-705), mainWater(fr) (706-735), mainOverlay(fr) (736-776) and frameEnd(fr) (777-784).
  - Keep the shadow line, shadowMats, unit-4 binding and the reflPass call inline in render().
  - Bodies move verbatim. Watch captured locals: the debris loop's var i is reused by the PT loop; m/pushPt live in mainOverlay.
- shadowCasters(k) replaces the triples at 417-419 and 508-510. It does useProgram + setCommon + drawHulls/drawModels/drawSails for P.dvox, P.dtri and P.dsail, in the same order.
- Per cascade, evaluate csmIn once per owner (SHIPS then PIECES) into flag arrays. any = OR of the flags. near becomes an index lookup. Owner centre and R are computed once per frame with the identical expressions (M4.pt(o.M, B.sx/2, B.sy/2, B.sz/2), T.shR; pieces o.c || M[12..14], R 30). FLY still gets no near test.
- prepRig (210), drawSails (335) and the lines loop (689): SHIPS.concat(PIECES).forEach becomes two loops in the same order.
- Names: keep drawHulls/drawModels/drawSails. No 'shadow', 'csm' or 'refl' in any function on the main path. At most 6 named frames between a draw and render().

**Exactness**

Same GL calls, same arguments, same order. csmIn is pure (it only reads o.M, o.c and T), so one evaluation gives the booleans the 3-4 calls returned.

Done when, in every config:
- draws_total, by_program, by_fb, by_pass, verts, gl_calls_total, uniform_total and bindVertexArray are identical to the baseline;
- no-MSAA pixels and hashes are identical;
- only by_pass_fn keys are renamed (main|render becomes main|mainOpaque etc.).

**Expected gain**

Draws unchanged (gc_high 2804, gc_high_csm 4660, fleet8_high 12056). CPU: under 0.1 ms at gc_high; about 0.1-0.3 ms at gc_high_csm, fleet8_csm and fleetlab-size fleets (no closures or M4.pt arrays per call, no concat arrays).

**Risk**

Low. Scoping mistakes in the split; the adversarial review checks every moved variable. The harness stackKey stops at 7 named frames, so keep the stack shallow.

### S2 — RBAT frame-prep table + pass descriptors + legacy replay emitting today's exact GL stream (retire modelWorld)

- **Files:** src/js/60_rbatch.js (new), src/template.html, src/js/60_render.js, src/README.md
- **Depends on:** S1; **effort:** M

**Changes**

- New 60_rbatch.js, with its script tag right after js/60_render.js (data-bundle='game').
- rbatPrep() is called in frameBegin right after prepRig. It fills RBAT owners and items (see architecture §2):
  - ships with sink≤40, in order: models (today's predicate), decos (today's gate GFX.deco || portOn(sh), then today's per-deco test), smooth regions in sh.smR Map order, armour smooth in sh.arm order (skipping propGone);
  - PIECES mods, then FLY (skip !me || !f.M);
  - meshGpu(me) for drawn items with no vao;
  - matrices with today's exact expressions (M4.mul / trans / modelLocal / armM), copied into RBAT.M;
  - glow, vao/el/off/cnt.
- Pass descriptors RBAT.pd.sh/rf/mn. The shadow pass writes per-owner cascade bits into RBAT.own[i].cs (replacing S1's arrays). drawHulls/drawModels/drawSails take (prog, pd).
- drawModels(prog, pd) = rbatReplay(prog, pd). It emits exactly today's calls, in order:
  1. vertexAttrib2f(3, 0, 0.5);
  2. per included ship: cutSet; per model uniformMatrix4fv(uModel, false, RBAT.M, i*16, 16), uGlow if prog has it (every item, as today), bindVertexArray, drawArrays;
  3. decos the same way;
  4. smooth: uModel = sh.M once, uGlow 0, per-region drawElements;
  5. armour smooth: armM matrix once per piece, uGlow 0, regions;
  6. after the ships: uGlow 0, cutSet(prog, null);
  7. pieces mods (cascade bit), then FLY (no test).
- Delete MWM/modelWorld (248-250). Keep RFR.
- Debug ?rbchk=1 / __rbat.check(): recompute every matrix through the old inline expressions and compare Uint32 views. Count misses in __rbat.stat.matMiss.

**Exactness**

Bit-exact by construction:
- the same expressions are evaluated once per render() call (inputs are constant during render());
- same predicates, same order, same uniform values.
The only GL difference is that a lazily uploaded furniture mesh is created earlier in the same frame; that never happens in a counted frame after warm-up.

Done when:
- every count (draws, uniform_by_fn, bindVertexArray, gl_calls_total, verts) is identical to S1 in all configs;
- pixels and hashes are identical;
- matMiss is 0, including eve_late_high (pieces, FLY) and ports_high (vsl, d.L).

**Expected gain**

Draws unchanged. CPU about −0.2..0.5 ms (gc_high) and −0.4..0.8 ms (fleet8): no WeakMap, closure or cache objects per model per frame, and piece-mod products once per frame instead of per pass.

**Risk**

Medium-low. Must not cache anything across frames: d.L and m.vsl are mutated in place, renderLerp swaps sh.M, and remesh changes smR. Lazily appended furniture meshes must still get meshGpu. Entries in T.meshes can be null.

### S3 — Redundant per-draw state: uGlow on change, cached cut-off state, vlampSet by index, sail texture, hullUniforms memo, MAX_SAMPLES

- **Files:** src/js/60_rbatch.js, src/js/60_render.js, src/js/74_cutaway.js, src/js/62_simview.js
- **Depends on:** S2; **effort:** S

**Changes**

- rbatReplay keeps a local glow value that starts at NaN for each call. It uploads uGlow only when the value changes, sets the local to 0 after the smooth uGlow-0 upload, and skips the final reset when the local is already 0.
- cutSet (74_cutaway.js:99-108): compute on = cutOn() && SHIPS.indexOf(ow) >= 0 (indexOf only when cutOn()). If !on and prog.cut0, return. Otherwise upload as today and set prog.cut0 = !on. armDraw (62_simview.js:40-43) writes uCutL, so it sets prog.cut0 = false before its writes. The only writers of uCut/uCutL are cutSet and armDraw (grep-verified).
- vlampSet: write VLAMP_U by index (no temporary arrays).
- drawSails: rebind unit 9 only when sailTex(T) differs from the last bind in this call.
- hullUniforms: hullArr() and the HU fill once per RFR; the per-program uploads stay.
- targets(): cache MAX_SAMPLES, like CSM_MAXTEX.
- The uXb IIFE becomes a plain loop.

**Exactness**

Every draw sees identical uniform and texture state; only uploads of an already-current value are dropped. Program uniform state persists across frames (programs are never recreated; no context-loss path).

Done when:
- draws and verts are identical;
- uniform_total drops (gc_high 3045 → ~1900, with uniform1f 1186 → ~80; fleet8 9068 → ~5600);
- pixels and hashes are identical in all configs, including gc_high_cut (cut cache coherence).

**Expected gain**

Draws unchanged. CPU −0.1..0.4 ms (gc_high → fleet8), more with CSM.

**Risk**

Low. A missed uCutL/uCut writer would leave a stale cut; only cutSet and armDraw exist.

### S4 — P.triI / P.dtriI compiled behind guards (not drawn yet) + transform-feedback exactness probe + URL switches

- **Files:** src/js/01_gl.js, src/js/60_rbatch.js, src/README.md
- **Depends on:** S3; **effort:** M

**Changes**

- Hoist TRI_VS, TRI_FS and DTRI_VS (byte-identical literals).
- instVS(), INST_K, and P.triI / P.dtriI exactly as in 'shaders', each in try/catch.
- RBAT.pal.
- Switches from Q: rb, rbinst, rbgeo, rbtau, rbchk, rigchk.
- Debug window.__rbatProbe(), as in 'shaders': its own compile helper with transformFeedbackVaryings + INTERLEAVED_ATTRIBS; one TF buffer sized to the largest capture; RASTERIZER_DISCARD; POINTS; models/decos/pieces/FLY by me.n vertices, smooth regions by m.verts; palette slots cycling through 0..K−1; restores the program, VAO, TF, ARRAY_BUFFER and RASTERIZER_DISCARD state it touched.

**Exactness**

The new programs are linked but never drawn, so the draw stream is unchanged; the harness only sees two extra linkProgram calls.

Done when:
- both programs link on the harness GPU;
- __rbatProbe reports 0 mismatches for P.triI (gl_Position, vW, vN, vC, vM) and P.dtriI (gl_Position) in all default and extra configs;
- pixels and hashes are identical to S3.

This is the gate for S5-S7. On a mismatch, try the UBO and then the attribute variant (each touches only the new program). If none is exact, set the rbinst default to 0, skip S5-S7 and continue with S8.

**Expected gain**

None by itself. It decides feasibility before any pixel risk.

**Risk**

Some drivers refuse to capture gl_Position. Then capture vW (w.w is exactly 1 for affine matrices, so equal vW with the same uVP gives the same gl_Position) and rely on pixels. A too-large INST_K on low-end GPUs is caught by try/catch and falls back to legacy.

### S5 — Shadow pass: instanced depth buckets for models, decos (incl. port lids), piece mods, FLY, smooth and armour-smooth on P.dtriI

- **Files:** src/js/60_rbatch.js, src/js/60_render.js
- **Depends on:** S4; **effort:** M

**Changes**

drawModels(P.dtri, pd.sh) goes to rbatDepth(k) when P.dtriI exists and instancing is on:
1. Build buckets once per frame, keyed by (vao, el, off, cnt) over all RBAT items, with lamps included (a depth pass has no glow).
2. Per cascade, filter by owner cs bit k. FLY is always included (drawModels runs only for cascades with any, exactly as today).
3. useProgram(P.dtriI); setCommon(P.dtriI), giving uVP = this cascade's PASS.vp.
4. Per chunk of at most INST_K: palette copy, uniformMatrix4fv(uMs), bindVertexArray, then drawArraysInstanced or drawElementsInstanced.
5. useProgram(P.dtri) at the end; the caller switches to P.dsail next.
Assert that each bucket has a single cnt. Hull regions stay legacy P.dvox in this step.

**Exactness**

Depth-only target, LESS, no blending, per-primitive polygon offset: the final texel is the minimum depth whatever the order. The vertex arithmetic is the S4-probed P.dtriI. The caster set is unchanged (cs bit = the old csmIn per cascade; FLY as today), so the 400 m shadow-extension cap cannot add shadows.

Done when:
- pixels and hashes are identical in every shadow-bearing config: gc_mid, gc_high, gc_ultra, gc_high_csm, gc_high_nolids, gc_high_portstatic, fleet8_high, ports_high, eve_late_high, fleet8_csm, fleet8_close, gc_high_close;
- verts per pass are identical;
- same build with ?rbinst=0 gives identical pixels;
- draw deltas match the expected numbers exactly.

**Expected gain**

Draws:
| Config | Before | After | Notes |
|---|---|---|---|
| gc_high | 2804 | 2432 | shadow 928 → 556; P.dtri 652 → P.dtriI 280 (118 model meshes + 38 deco meshes + 121 smooth + 3 armour smooth) |
| gc_mid | 2148 | 1776 | |
| gc_high_csm | 4660 | 3544 | 3 populated cascades × −372 |
| gc_high_nolids | 2597 | ~2256 | |
| fleet8_high | 12056 | ~9580 | shadow drawModels 2672 → ~197: 50 model buckets + ~7 K-splits, 14 deco buckets (+2 splits), 121 shared smooth VAOs × 8 instances, 3 armour smooth |
Port lids in the shadow pass: 62 → 34 draws for 1 Gloire + 1 Constitution, 272 → 10 (+2 splits) for 8 Gloires.
CPU at about 1 µs per draw: gc_high −0.4 ms, gc_high_csm −1.1 ms, fleet8 −2.5 ms.

**Risk**

Medium. Exactness rests on S4. Each new program needs setCommon (samplers uShA/uCutT are irrelevant to NOFS but harmless).

### S6 — Colour passes: batch free same-type ships slot-major on P.triI (proven tie-free by tau); clustered ships and gc singletons stay legacy

- **Files:** src/js/60_rbatch.js, src/js/62_simview.js, src/js/60_render.js
- **Depends on:** S5; **effort:** M

**Changes**

- me.bb: local AABB of mesh positions (stride 9), computed in buildMeshes (from d.tri) and in meshGpu before me.tri = null. vbo/vao untouched.
- Smooth region local boxes: the 64³ cell from rk ±1 voxel, clipped to the grid.
- Built inside drawModels for pd.rf / pd.mn, once PASS.vp is final:
  - item world AABBs (double math, centre ± |W3x3|·extent, padded by 1e-3 m + 1e-6·|coord|);
  - owner model-stage boxes (union of items);
  - tau_pass (architecture §5c), clusters (union-find over pairs with gap ≤ tau), units.
- No reordering when cutOn(), when the VP is orthographic, or with ?rb=0.
- Unit of ≥2 free same-type ships:
  - P.triI: useProgram + setCommon, uLit = 1, cutSet(P.triI, null), uGlow tracked;
  - slot-major across ships, merging consecutive same-mesh, same-glow slots into one instanced draw;
  - then smooth and armour smooth slot-major by Map position, merged across ships only when (vao, off, cnt) match;
  - K-split.
- Units of one ship (all gc configs, every clustered ship): today's legacy P.tri replay for that ship.
- Pieces mods and FLY afterwards: legacy.
- End state: P.tri bound, uGlow 0, cutSet(P.tri, null).

**Exactness**

Each ship's own subsequence (models, then decos, then smooth, then armour smooth) is unchanged. Only items of different free ships change relative order. Free ships have conservative boxes more than tau apart, so along any view or sample ray their fragments differ by ≥ 8 depth quanta (D24 + float error). Neither the LEQUAL winner (main) nor the LESS winner (refl after shadows) can change.

Stage order is untouched: hulls → debris/crew → models → poles → lines → sails, and pieces and FLY still come after all ships.

Done when:
- pixels and hashes are identical in all configs;
- gc configs have GL streams identical to S5;
- fleet8_high, fleet8_close and fleet8_csm are identical, and so is the same build with ?rbtau=1e9 (everything clustered, i.e. legacy) and with ?rbinst=0.

**Expected gain**

gc_*: 0 draws (one ship per type).
fleet8_high: refl/main drawModels 2672 → ~318 per pass (154 slot runs + 40 deco runs + 121 smooth + 3), so the frame goes ~9580 → ~4870.
CPU fleet8 about −3..5 ms; FLEET_MAX 40 fleets scale linearly.

**Risk**

Medium. The tau derivation must use the pass's own VP (mirrored for refl) with w clamped to ≥ near. Boxes must cover everything the owner draws in this stage: anchors on chain ends via ancD, swung boats, yards.

### S7 — Colour passes: within-ship batching only between items proven unable to tie (geo); all model-stage draws on P.triI — batches each ship's gun-port lids and guns

- **Files:** src/js/60_rbatch.js
- **Depends on:** S6; **effort:** M

**Changes**

The S6 batcher gets the precedence relation 'same owner AND world-AABB gap ≤ tau_pass':
- items processed slot-major across the unit's ships (any linear extension of each ship's legacy order);
- an incoming item closes every other open group holding one of its predecessors (found with per-frame sweep-and-prune neighbour lists on world AABBs);
- groups never reopen; instance order is insertion order;
- K-split consecutively.

More rules:
- Phase barrier: a unit's model/deco groups are all emitted before its smooth and armour-smooth items, which stay strict.
- Pieces mods and FLY: strict runs.
- Every model-stage draw (singleton groups too) uses P.triI when instancing is on and !cutOn(), so there are no per-ship program switches.
- Lamps are keyed by glow.
- ?rbgeo=0 restores S6 behaviour.
- Debug stat: items versus draws per pass.

**Exactness**

Invariant: no precedence edge ever links two open groups, so every emitted order is a valid linear extension of 'legacy order restricted to close pairs'. Every pair closer than tau keeps today's relative order. Every reordered pair is more than tau apart, so the same quantized-depth argument as S6 applies to both depth funcs and to MSAA samples. VS and FS arithmetic is the S4-probed P.triI.

Done when:
- pixels and hashes are identical in all configs, especially gc_high_close (lids and lamps large), gc_high_fp (near 0.05), ports_high (lids swinging, guns recoiling), eve_late_high (pieces, FLY, gone lids) and fleet8_close;
- the same build with ?rbgeo=0 and with ?rbinst=0 is identical;
- verts per pass are identical.

**Expected gain**

gc_high: refl/main models+decos 528 → ~220-300 per pass (Gloire guns 36 → ~10, lids 34 → 10, kegs partly; Constitution lids 28 → 24). Frame ~2432 → ~1830-1890.
gc_low (main only): 910 → ~610-680. gc_mid: ~−240.
gc_high_csm: ~3544 → ~2950. fleet8_high: ~4870 → ~4700.
CPU about −0.3..0.6 ms at gc_high. Sweep-and-prune costs about 0.05 ms per ship.

**Risk**

Medium. The bound must stay conservative (padding, near plane, mirrored eye) and the batcher must be correct. Keep the kill switch. If any stress config differs, ship with rbgeo default 0, which is still exact.

### S8 — Hull arenas: one draw per contiguous run of pristine-shared regions (all passes, legacy P.vox/P.dvox, exact by construction)

- **Files:** src/js/60_rbatch.js, src/js/60_render.js, src/js/62_simview.js
- **Depends on:** S2; **effort:** M

**Changes**

hullArena(rs0) is built lazily the first time a RegionSet sharing from rs0 is drawn. rs0 is T.pristine, A.rs0 or P.rs0.
1. Guard: the source of VK.RegionSet.prototype.flush contains the exact vertexAttribIPointer(0, 4, gl.UNSIGNED_SHORT, 8, 0) call, and Σ r.n === rs0.quads(). Otherwise null and legacy.
2. q0[rk] = running quad offset in rs0.regions Map order.
3. One VBO of Σn·32 bytes, filled by copyBufferSubData from each r.vbo (COPY_READ/COPY_WRITE, offset q0·32, size n·32). Exact bytes, independent of the chunk layout.
4. QIDX.ensure(total quads) BEFORE creating or binding the arena VAO (ensure binds VAO null).
5. Arena VAO: loc 0 = vertexAttribIPointer(4, UNSIGNED_SHORT, 8, 0); ELEMENT_ARRAY_BUFFER = QIDX.buf.
6. Register every GL object in RBAT.gl.

Per frame, rbatRuns(rs, arena) walks the live rs.regions Map:
- an entry is shared iff !e.own && e.vbo === arena.vbo0[rk];
- consecutive shared entries contiguous in the arena form one run;
- own entries are drawn in place with e.vao.

drawHulls and armDraw keep cutSet, vlampSet, uModel and uCutL exactly as today. They replace rs.draw() with the run draws: drawElements(TRIANGLES, Σn·6, UNSIGNED_INT, q0·24), then bindVertexArray(null) like rs.draw. Pieces keep rs.draw(). VoxelKit is only read.

**Exactness**

Same program, same uniforms per owner, same vertex bytes (GPU copy), same absolute QIDX index pattern (offset q0·24 bytes addresses vertex 4·q0). The run is the same primitive sequence as the per-region loop in Map order, so pixels are identical in every pass, colour passes included.

Done when:
- pixels and hashes are identical in all configs;
- verts per pass are identical;
- draws drop exactly to 1 per pristine owner per pass, plus 1 + 2·(own regions) on damaged ships (eve_late_high);
- a debug getBufferSubData compare of one arena against its region VBOs passes.

**Expected gain**

Hull draws per pass: gc 274 → 2; fleet8 1320 → 8.
| Config | Change |
|---|---|
| gc_high | −816 (~1850 → ~1040) |
| gc_mid | −816 |
| gc_low | −272 |
| gc_high_csm | −1360 (5 hull passes) |
| fleet8_high | −3936 (~4700 → ~760) |
CPU about −0.8 ms gc_high, −1.4 ms gc_high_csm, −4 ms fleet8. GPU memory: +~5 MB per loaded ship type (Gloire 163k quads), plus QIDX grown once to cover a whole-ship run.

**Risk**

Medium. Relies on public RegionSet fields (regions {vao, vbo, n, own}, quads(), QIDX); guarded and falls back to legacy. Watch the Map-order rules: rebuilt keys keep their position, emptied keys are deleted, refilled keys go to the end.

### S9 — prepRig: skip sail and loose-rope rebuild on frames without a sim step; skip empty chain uploads; loose-rope scratch

- **Files:** src/js/60_render.js, src/js/11_rig_gpu.js, src/js/76_anchor.js
- **Depends on:** S0; **effort:** S

**Changes**

prepRig keeps its current order: rigDirty → buildRig, then the sink>40 return. Then:
- live = PHYS && ow.crew;
- same = !dirty && ow.sb && ow.sbT === SIMT && ow.sbP === PHYS;
- sailBuf runs if dirty || (live && !same), then set ow.sbT/sbP;
- looseBuf runs if live && !same;
- chainBuf and poleBuf still run every frame. chainBuf uses the lerped sh.inv.
Comment: '// 這一格沒走模擬（暫停、慢動作、高更新率的空格、__game.cam）⇒ 帆與垂繩的輸入一個都沒變 ⇒ 上一份照用'.

chainBuf: return early when no chain is out and sh.chain is missing or already has n === 0.

looseBuf: fill a growable module Float32Array scratch and upload a subarray (the same bytes).

Debug ?rigchk=1: on skipped frames, rebuild into scratch and compare with a kept copy of the last upload. Count mismatches in __rbat.stat.rigMiss.

**Exactness**

sailBuf and looseBuf output depends only on cloth and rope state. That state changes only inside simStep (SIMT += DT at 50_sim.js:62), in writers that set rigDirty (setPhys, sailmaker, burn, colours, 57_core), or through PHYS. Buffers are owner-local, so renderLerp cannot affect them. A skipped rebuild would therefore produce identical bytes, and the side outputs tDraw/tKey/tJ stay valid.

The harness shot renders without a sim step, so every config exercises the skip.

Done when:
- pixels and hashes are identical;
- rigMiss is 0 in all configs, including eve_late_high (torn, shredded and loose sails);
- the render-only counted frame shows bufferData −3 per crewed ship;
- the tick frame changes only by the chain skip.

**Expected gain**

Draws 0. Render-only CPU, from harness 'render' timing (--repeat 3): gc_high 4.2 → ~2.5 ms median (prepRig 1.9 ms → ~0.1 ms); fleet8 13.7 → ~8 ms (prepRig ~6 ms). Real play: pause, slow-mo and about half of the frames at 120-144 Hz; upload bandwidth falls the same way.

**Risk**

Low-medium. A view-affecting cloth mutation outside simStep without rigDirty (debug APIs such as __game.cloth or sailDev) would leave a stale sail until the next step; audit with grep and rigchk. Confirm fleetlab advances SIMT through step().

### S10 — Smooth-surface arenas: pristine smooth regions packed per type; consecutive runs drawn as one drawElements

- **Files:** src/js/15_smooth.js, src/js/62_simview.js, src/js/60_rbatch.js
- **Depends on:** S5; **effort:** M

**Changes**

- smBuild gets an optional keep flag that leaves m.cpu = {buf, idx}. It is used only by smoothSetup (T.smP) and armorMesh (A.smP, P.smP).
- smArena(P), after a set's regions are built:
  1. concatenate buf (Float32) and idx+vbase (Uint32) in P's Map order;
  2. upload one VB and one IB; create one VAO with smBuild's exact layout (stride 44: 0:3@0, 1:3@12, 2:3@24, 3:2@36) and the IB bound;
  3. per region: m.vao = arena.vao, m.io = byte offset; keep n and verts;
  4. delete the per-region buffers; drop m.cpu.
- smShare also copies io. Own regions rebuilt by smFlush keep io 0. smFree is only ever called on own regions (re-grep every reader of T.smP/A.smP/P.smP buffers).
- smDraw and the RBAT smooth items walk smR in Map order and merge entries with the same vao and contiguous io: drawElements(TRIANGLES, Σn, UNSIGNED_INT, io0). In S5/S6/S7 the bucket key (vao, off, cnt) then covers runs.

**Exactness**

Same vertex floats; indices shifted by exact integers; same triangles in the same order. The draw is primitive-for-primitive the same as today, and memory is unchanged.

Done when:
- pixels and hashes are identical in all configs;
- verts are identical;
- smooth draws are 1 run per pristine Gloire per pass (3 propeller regions → 1);
- eve_late_high shows correct splits around own regions.

**Expected gain**

| Config | Draws |
|---|---|
| gc_low | −122 (→ ~220-290) |
| gc_mid | −244 (→ ~420-490) |
| gc_high | −366 (→ ~650-710) |
| gc_high_csm | −610 (→ ~1000) |
| fleet8_high | ~−366 (→ ~400) |
CPU −0.3..0.5 ms. Transient CPU copy at load (about 20 MB for Gloire). Check load and transition time on the globe→sail path.

**Risk**

Low-medium. It touches the load path. The smBuild 'var o' shadowing (15_smooth.js:128 vs 72/139) must stay as is (separate fix).

### S11 — Remaining per-frame allocations in render() (same arithmetic)

- **Files:** src/js/60_render.js, src/js/77_colours.js, src/js/60_rbatch.js
- **Depends on:** S1; **effort:** S

**Changes**

- Debris loop (672-679): inline M4.pt for st===2 with the same term order (m[0]*x+m[4]*y+m[8]*z+m[12] …); read D.p directly otherwise.
- PT loop and BALLS write PBUF directly with pushPt's field order and its m*9 >= PBUF.length guard, using scratch vectors. pushPt keeps its signature for the external callers (wpPushSpray, flPushJets, rdPushSplash, lanternHalo, flHoleMarks).
- reflPass: mirrored VP written into a static Float32Array with M4.mul's exact expression.
- poleBuf key built without map/join (same comparison).
- lampsUpdate/lanternHalo: per-ship cached lamp-model index lists in model order, so pushes and the stable sort keep their order.
- Optional, separate commit: drawCrew scratch vectors (41_crew_art.js) with the identical expressions.

**Exactness**

Each value comes from the same expression in the same order into the same float32 slots.

Done when:
- draws and verts are identical;
- pixels and hashes are identical, especially ports_high and eve_late_high (debris, particles, lamps).

**Expected gain**

CPU −0.1..0.5 ms typical; up to ~1 ms in debris-heavy late battles (DEB_CAP 20k, PMAX 12k); fewer GC pauses.

**Risk**

Low.

### S12 — Allocation-free prep matrices: exact m4Into, static model-local cache, scratch T(dv)

- **Files:** src/js/60_rbatch.js
- **Depends on:** S2; **effort:** S

**Changes**

- m4Into(out, o, a, b) evaluates VK.M4.mul's exact double expression and summation order and stores into Float32Array slots. The output never aliases an input.
- The inner product T(dv)·L goes to a Float32Array scratch first (the same two rounding points). T(dv) is an identity with Math.fround(dv[i]), which is exactly what trans() stores.
- Static local: a per-model cached trans(origin) Float32Array (view-only field) is used while modelLocal0 would take its last branch (!m.swM, !(m.sw || m.spinB && m.spinB.mt), !(m.rot && m.piv)) and !m.hd. Re-test every frame; otherwise call modelLocal(m).
- Decos: d.L || cached trans(origin). Piece mods: m4Into(pc.M, m.L). Armour: armLocal once per frame per piece.

**Exactness**

Proven by ?rbchk=1: every item, every frame, Uint32 compare against the M4.mul path.

Done when:
- matMiss is 0 in all configs, especially ports_high (vsl, d.L), eve_late_high (pieces, FLY, ancD if anchored) and fleet8;
- pixels and hashes are identical.

**Expected gain**

CPU −0.2..0.5 ms gc_high, −0.5..0.8 ms fleet8 (about 1700 fewer Float32Arrays per frame at 8 Gloires).

**Risk**

Low with rbchk. A missed modelLocal0 branch (swM, sw, spinB.mt, rot+piv, gsl, hd) is caught by the check.

### S13 — (Optional) Reflection: skip model/deco/piece/FLY instances entirely below the clip plane

- **Files:** src/js/60_rbatch.js
- **Depends on:** S7; **effort:** S

**Changes**

In pd.rf only, and only if P.triI.u.uClip and P.tri.u.uClip exist: drop an instance when the world max y of me.bb under its matrix is below −0.02 m.
maxY = W[13] + Σj max(W[1+4j]·lo_j, W[1+4j]·hi_j), in double.
Hull and smooth arena runs are not culled (that would split runs). A group that becomes empty issues no draw.

**Exactness**

Every reflection fragment with vW.y < uClip = 0 is discarded before any write (TRI_FS first statement). A triangle whose vertices all have y < −0.02 has interpolated vW.y < 0 everywhere, so it writes nothing either way. The S6/S7 order proofs are unaffected (no fragments).

Done when:
- pixels and hashes are identical in all refl=2 configs;
- refl verts drop as expected and draws drop where whole groups vanish.

**Expected gain**

GPU: about 60% of model triangles skipped in the reflection (Gloire 181k, Constitution 275k per frame at gc_high). Draws about −dozens. CPU small.

**Risk**

Low. Valid only while the reflection clip is the flat y = 0 plane. It must use the actual instance matrix (vsl, ancD, heel).

### S14 — FINAL (intentional visual change, Tim): gun-port lids always drawn on every ship; GFX.port only selects the animation

- **Files:** src/js/60_rbatch.js, src/js/62_ports.js, src/js/07_gfx.js, src/js/05_hull.js, src/js/75_shipcheck.js, src/template.html, src/README.md, src/js/90_main.js (one readout line, coordinated)
- **Depends on:** S7, S8, S9, S10, S11, S12; **effort:** S

**Changes**

rbatPrep deco gate:
- drop the ship-level (GFX.deco || portOn(sh));
- keep: skip if !me || d.gone || (!GFX.deco && d.meta.kind !== 'portlid') || (d.foot >= 0 && !hullGp(sh.grid, d.foot));
- so lids are drawn on every ship whatever GFX.deco and GFX.port say; other decos still follow GFX.deco.
Comment: '// 砲門蓋板：每艘、每個畫質都畫（Tim）；「砲門的開關演出」（portOn）只管演不演 —— 沒輪到的那艘停在模型的樣子（開著、砲推出去）'.

Unchanged: portsAnim, portOn, portsOffShip, portPose. Non-animated lids keep d.L = null (open) and their guns m.vsl = null (run out).

Text updates:
- 62_ports.js: header 17-21, portOn doc 183, portsSummary 377 (drop the '「裝飾」也關 ⇒ 不畫蓋板' clause).
- 07_gfx.js: port opt[0] label and comment (19-21), deco opt[0] '關（不畫；砲門蓋板照畫）' (29), low-preset comment (54).
- 05_hull.js:67.
- 75_shipcheck.js:85.
- template.html:567 help text.
- README 砲門 section.
- 90_main.js:467 __vxk.deco.drawn = GFX.deco ? decoN : lid count. Coordinate with the core/shell session, or land after their merge.

Harness: gc_high_nolids no longer means 'no lids'. Rename it, or add a debug ?rblids=0 reference.

**Exactness**

Pixels are EXPECTED to change only in:
- gc_low and gc_low_close: Constitution's 28 lids appear, open;
- gc_high_nolids: all 62 lids appear, open, with guns run out.
Every other config must stay bit-identical (no-MSAA), because GFX.deco=1 or portOn already drew every lid there: gc_mid, gc_high, gc_ultra, gc_high_csm, gc_high_portstatic, fleet8_high, ports_high and all extra configs.
Battle hashes must be identical in ALL configs: decos are outside the sim (05_hull.js decoSplit) and the gate is render-only.
Inspect <cfg>_diff_exact.png: differences must lie only in lid footprints (and their shadows in gc_high_nolids).

**Expected gain**

Visual correctness per Tim. Cost after batching:
- gc_low main: about +24 draws (Constitution's 24 lid meshes);
- gc_high_nolids: shadow +34 buckets and refl/main about +34 each;
- gc_high, gc_high_csm and fleet8_high: +0.
40 triangles per lid.

**Risk**

Low. Must land alone, after every refactor step is verified.

## R3 — ragged torn sail edges (Tim's request; sails are now GPU-skinned, see 11_rig_gpu.js SAILK)

- Tim: 「帆破洞邊緣可以一起做嗎(參考火燒 做出撕裂感)」.
- Today a hole is the set of torn triangles not drawn -> hard triangle-jagged edges. Make the hole boundary look torn: per-vertex "tear proximity" (distance in fine-grid steps or metres to the nearest torn triangle/hole vertex), static data updated only on tear events; the sail fragment shader discards where proximity + noise is below a threshold, giving an irregular, frayed edge (look at BURN_GLSL / bnB in 01_gl.js for the burn-through look and noise functions; reuse them). Fully torn triangles stay collapsed. Optional thin fibres/threads at the edge if cheap. Apply the same to shreds' torn borders if feasible.
- Shadow pass (P.dsail or its replacement) must use the same discard so shadows match the holes.
- Physics untouched; hashes identical; everything except torn sail edges pixel-identical (harness with sails suppressed exact; with sails: diffs only near holes).
- Produce before/after PNGs (close-up camera on a torn sail) into scratchpad/report/r3/ for Tim.


## Traps

- Exactness has two separate risks: arithmetic and draw order. A depth-only shadow pass makes order irrelevant, but not arithmetic. A 1-ULP vertex change moves shadow-map depth and then main-pass pixels. Every new program (P.triI, P.dtriI) must pass the S4 TF probe with 0 mismatches and the harness no-MSAA screenshots. Never 'fix' a mismatch by editing P.tri, P.dtri, P.vox or P.dvox source: that changes baseline pixels for every other user.
- Depth funcs:
- main is LEQUAL (60_render.js:663): last drawn wins;
- reflection never sets depthFunc, so it inherits LESS from shadowPass:353 (first drawn wins), or LEQUAL when shadows are off;
- shadow is LESS.
Do not normalize any of these in a pass descriptor. Reorder only items proven farther apart than tau, and keep the stage order: hulls → debris/crew → models/decos → smooth/armour-smooth → pieces mods → FLY → poles → lines → sails.
- Matrix association and float32 rounding points:
- model: M4.mul(sh.M, dv ? M4.mul(trans(dv), modelLocal(m)) : modelLocal(m)), dv = m.ancD || m.vsl;
- deco: M4.mul(sh.M, d.L || trans(origin));
- piece mod: M4.mul(pc.M, m.L);
- FLY: f.M;
- armour: L ? M4.mul(sh.M, L) : sh.M (62_simview.js:39);
- armour smooth: armM(a) (24_armor.js:102). armM is also used by sim code: do not change it.
M4.mul writes a Float32Array, so the inner product is float32-rounded. Never fuse the products, carry doubles through, or multiply ship×local on the GPU.
- No cross-frame caching of matrices or region lists:
- d.L (P.Lb), m.vsl (P.vb/I.vb) and ancD are mutated in place (62_ports.js:202-206, 330-336; 76_anchor.js);
- renderLerp replaces sh.M every frame;
- __game.cam/mask/cut and demo call render() with the sim matrices;
- remesh and SM_FRAME change rs.regions and smR between frames.
Rebuild RBAT on every render() call, keyed by RFR.
- Visibility predicates, verbatim:
- models: !m.alive || !me || (m.vox && !m.moved) (the propeller is drawn as voxels);
- decos (until S14): ship gate GFX.deco || portOn(sh), then !me || d.gone || (!GFX.deco && kind !== 'portlid') || (d.foot >= 0 && !hullGp(sh.grid, d.foot));
- ships: sink > 40, plus the cascade flag;
- pieces: cascade flag only;
- FLY: !me || !f.M, never cascade-tested, but drawModels runs only for cascades with any owner (shadowPass:402-414) and always in shadowSimple.
- Lamps:
- glow = isLamp ? lanternK : 0 for models and decos; decos use k = 1000 + j; pieces and FLY use 0;
- lanternK depends only on SIMT and m.k, so the same slot on same-type ships shares one value;
- split batches by glow; the FS stays byte-identical (no per-instance glow attribute);
- P.tri must end each model stage with uGlow 0 (drawColours and glsDraw also force 0; do not rely on that).
- Generic vertex attributes are context state, not VAO state:
- vertexAttrib2f(3, 0, 0.5) must run before every model stage in every pass (model VAOs, poles and lines read aM from it);
- never enable location 3 on me.vao; smooth VAOs and arenas supply it;
- vertexAttrib3f(1, 0, 1, 0) must still precede the rope lines.
- drawModels return contract:
- the caller's program is bound again: P.tri (drawColours, rope lines and the chain shot follow immediately) or P.dtri (the caller then switches to P.dsail);
- P.tri uGlow is 0;
- cutSet(prog, null) has been applied.
Any new code that binds ELEMENT_ARRAY_BUFFER must bind its own VAO first, or it rebinds the element buffer of a model or region VAO.
- New programs need useProgram + setCommon in every pass. setCommon sets PASS.vp, eye, clip, sh, lamps, and samplers uCutT=8 and uShA=4; a sampler left on unit 0 while the target texture is bound drops the draw (feedback loop, 01_gl.js:184-185). Also on P.triI: set uLit = 1 explicitly, leave uGls at 0, and call cutSet(P.triI, null). Never add a 'setCommon already done this pass' skip: callers override managed uniforms afterwards (treeDraw sets uFogD).
- Cutaway: when cutOn(), shadows are skipped (60_render.js:656) and refl/main must use the legacy replay. uCut, uCutW, uCutInv (= ow.inv) and texture unit 8 are per ship (cutSet). The S3 cut cache must be invalidated by armDraw's uCutL writes. Pieces always get the 'off' state.
- Lazy meshGpu:
- furniture meshes are appended to T.meshes as {tri, occ} and uploaded on first draw (36_rooms.js:296-303; 62_simview.js:83);
- upload in prep, only for drawn items, and compute me.bb before me.tri = null;
- T.meshes entries can be null (meshSkip);
- keep me.vbo, me.vao and me.n: the self-check at 90_main.js:430-433 reads me.vbo.
- Remesh and Map order:
- RegionSet.flush replaces a shared region with an own one in place (Map position kept), deletes emptied regions, and appends refilled ones at the end;
- smR behaves the same way;
- derive runs and buckets from the live maps every frame; key them by VAO object + offset + count, never by rk; assert one count per bucket.
- VoxelKit stays unmodified:
- the arena uses only public fields (regions {vao, vbo, n, own}, quads(), QIDX.buf/ensure) and a guarded check of flush's attribute format;
- QIDX.ensure binds VAO null and re-specifies the same buffer object; call it before binding an arena VAO;
- run offsets are q0·24 bytes into absolute QIDX indices;
- T.pristine is never re-flushed after load, so arenas are built once per type.
- Smooth arena:
- smShare must copy io; own regions rebuilt by smFlush have io 0;
- smFree is only called on own regions (15_smooth.js:56, 62_simview.js:58);
- re-grep every reader of T.smP/A.smP/P.smP buffers before deleting per-region buffers (75_shipcheck reads only meta).
- gl_InstanceID restarts at 0 for every draw (WebGL2 has no base instance):
- chunk buckets and groups at INST_K, consecutively, and re-upload uMs per chunk with uniformMatrix4fv(loc, false, data, srcOffset, srcLength);
- no per-chunk subarray allocations; VK.compile stores the name without '[0]' (u.uMs);
- derive K from MAX_VERTEX_UNIFORM_VECTORS (minimum 256 gives K=60) and compile in try/catch, because programs() runs inside GL_STEPS before QIDX exists;
- no GL calls at file load (headless, ?pick and the sandbox bundle).
- prepRig skip:
- the key is SIMT, PHYS, !rigDirty and ow.sb existing;
- chainBuf must still run every frame (it uses the lerped sh.inv); poleBuf keeps its own key;
- sailBuf side effects (tDraw, tKey/tJ, setting rigDirty when tethers change) happen only on rebuild;
- debug cloth mutators must set rigDirty;
- confirm fleetlab advances SIMT through step();
- render-only paths (pause, slow-mo, __game.cam/mask/gpu/shadow/cut, floodlab screenshots, fleetlab 3D) must show identical sails (rigchk).
- The simulation must never be touched:
- no rnd() in render code;
- never write model, deco or ship fields read by the sim;
- per-frame data lives in RBAT arrays; only view-only owner fields are allowed (like the existing sb/vlamps/poleKey);
- battle hashes must match in every config at every step (gc_* baseline 7892f005 → 54262d62 → 7a3563d3).
- MSAA 4x is not bit-reproducible on the test GPU, even for one build. Prove exactness on shot_noaa.png only; check the MSAA shot only against its self-noise envelope. Bit-exactness is established only for ANGLE D3D11 on the RTX 2060; other backends could differ by ULPs (run __rbatProbe there).
- Other render() paths and pages:
- thumbnails and ?demo render once after remesh(Infinity);
- headless never renders;
- ?shipcheck and ?admin embeds use the same render();
- fleetlab (84_fleetlab.js:210) renders with renderLerp(true, 1) and up to FLEET_MAX 40 ships: size arrays dynamically, never by MAX_SHIPS;
- sandbox.html (sb bundle) and admin.html have no game render; the new file goes only into the game bundle of template.html.
- Context loss is not handled anywhere (no webglcontextlost listener). Register every new GL object (arena VBOs/VAOs, the smooth arena, probe programs) in RBAT.gl so a future reset can rebuild them. The per-program uniform caches (cut0, glow) assume programs live forever, as they do today.
- Harness labels:
- program labels come from the 'P.x = VK.compile(' left-hand side;
- passes come from stack function names containing shadow/csm/refl (shadowDebugDraw excluded), collected up to 7 named frames;
- keep the drawHulls/drawModels/drawSails names, keep those substrings out of main-path names, keep stacks shallow;
- by_pass_fn keys may be renamed, but by_program, by_fb, by_pass and verts must match the expected deltas exactly.
- Build and admin rules:
- the new file needs a template.html script line with data-bundle='game';
- no duplicate top-level names, no short lowercase top-level names (SHORT_RX), no global named RB, no undeclared writes;
- sim files (20-54) must never call 60_rbatch.js; add a README file-table row;
- build --code requires index.html to equal HEAD's build: run git checkout -- index.html first, or commit each step;
- always export GIT_WORK_TREE for this worktree (the submodule core.worktree leaks).
- Concurrency with the core/shell session: do not touch 71_input.js, 69_prefs.js, 70_flow.js or 00_events.js. The only 90_main.js edit is the S14 readout line, which must be coordinated. Switches are URL flags read from Q plus window.__rbat under DEBUG: not prefs, not __game. template.html gets one script line.
- tau proof details:
- use the pass's actual VP (CAM.vp, or PASS.vp mirrored for the reflection) and clamp w to at least near (0.5 in third person, 0.05 in first person);
- orthographic VP (transition camera) means no reordering;
- world AABBs come from |W|·extent with padding (1e-3 m + 1e-6·|coord|), not from spheres or the grid box;
- boxes must include everything the owner draws in that stage (anchors on chain ends via ancD, swung boats, yards beyond the grid).
- Pieces:
- their hulls are drawn after all ships; during the remesh-budget window a piece and its parent ship draw the same voxels at the same place, which ties exactly, so never reorder pieces relative to ships;
- piece mods use M4.mul(pc.M, m.L);
- csmIn's R = 30 for pieces is not a geometric bound (half-ship pieces exceed 60k voxels): never use it for culling or tau.
- Armour and propellers:
- armDraw uploads uCutL per piece and resets it to CUT_ID; only P.vox has uCutL;
- propGone(a) hides the propeller in both armDraw and armSmDraw;
- armour regions are shared from A.rs0 / P.rs0 and armour smooth from A.smP / P.smP (arenas apply to all of them);
- Gloire's armour entry is the propeller: 0 voxel regions, 3 smooth regions.
- Reflection underwater skip (S13) is valid only because uClip is the flat plane y = 0 and the discard is the first FS statement. Check that P.tri/P.triI.u.uClip exist (the voxFS fallback path has no uClip). Use the real instance matrix (vsl, ancD, heel). Never cull hull or smooth arena runs this way.
- Port lids (S14):
- change only the draw gate; never touch portsAnim, portOn, portsOffShip, portPose or recoil;
- d.L null means the open model pose and m.vsl null means guns run out;
- d.gone is written only for animated ships;
- foot is hinge-a's neighbour cell (10_ship.js:85), or −1 = always drawn;
- GFX.port = 2 follows SHIPS[PLAYER_I] after playerTake.
- drawColours (poles), glass (glsDraw), rope/ladder lines and the chain shot stay on P.tri legacy. Poles are drawn in reflection and main but not in the shadow pass; keep that. Glass is main-only, after the water.

## Deferred

- Visual-change proposals for Tim (out of scope now; each changes pixels):
- Low-poly or distance-LOD powder keg. Kegs are 1948 triangles each, about 70% of model triangles: 104 per Gloire, 150 per Constitution.
- Hold interior culling (kegs and furniture) in the shadow and reflection passes. They are visible through breaches, cutaway and first person.
- Smooth-surface LOD or decimation: 612k triangles per Gloire per pass.
- Binning tree and town shadow casters in light space; today they reuse the previous main-pass camera bins.
- csmIn culling of FLY per cascade.
- Flag poles (drawColours) casting shadows.
- Crew and debris casting shadows.
- Raising the pieces-to-debris threshold (22_pieces.js, 40 voxels). That is a simulation change, not render work.
- Main/reflection camera-frustum culling of owners, instances and regions (plan 2 s4, plan 3 S9). Exact in principle with conservative boxes, but it gains about 0 at the 9 harness cameras and the fixed views cannot prove there is no edge pop. Next phase, with dedicated edge/off-screen harness configs. prepRig deferral for owners invisible in every pass depends on it.
- P.voxI / P.dvoxI cross-ship hull instancing. Arenas already reduce a pristine ship to about 1 hull draw per pass. P.voxI would need an FS change, because VOXEL_FS uses mat3(uModel) plus per-ship uVG/uCut/uCutL.
- Pieces batching or arena (plan 3 S11). Only pays in long battles (about 250 pieces → 314 region draws per pass). L effort: residency, compaction, an integer-palette voxel VS.
- Sail VBO split into static and dynamic parts with bufferSubData (plan 3 S2). It speeds up stepped frames, but carries an implicit GPU-sync risk on in-flight buffers. Measure first.
- Incremental rope rebuild (buildRig on rigDirty): needs render-only 'moved rope' sets written from sim files 26_gunanim.js and 27_turret.js.
- UBO for setCommon constants: touches every shader including the VoxelKit string patches; about 0.1-0.2 ms.
- WEBGL_multi_draw range draws (optional fast path only; not on Safari). WEBGL_draw_instanced_base_vertex_base_instance is absent even on the test GPU.
- Multi-mesh batch for Constitution's 24 one-off lid meshes (vertex-fetched matrix palette).
- Runtime per-device gating of instancing by the TF probe at startup. For now the probe is a debug and harness gate.
- Region-level trimming of underwater hull and smooth arena runs in the reflection (it splits runs; weigh after S13 numbers).
- Micro items: share bedPlanes(CAM.vp) between the land passes; ResizeObserver instead of reading clientWidth every frame; cache town flag meshes (63_towns.js townFlagMesh; needs a land harness config).
- smBuild 'var o' shadowing bug (15_smooth.js:72/128/139). Output is identical today; fix in its own tiny commit, never inside S10.
- GPU-side profiling on Tim's real machine (real resolution, MSAA, ideally an integrated GPU) before prioritising triangle-reduction proposals.

## Decisions made on the judge's open questions (2026-10-21)

1. Instanced paths are ON by default on every backend. `?inst=0` (URL) switches them off. The transform-feedback exactness probe stays a debug/harness gate, not a runtime gate.
2. On the harness backend every refactor step must be bit-exact (no-MSAA shots). If the probe or the harness shows a difference for some program/path, that path stays on the legacy per-object draw (no "identical within rounding" for refactor steps).
3. Hull arenas: the extra GPU memory (about 5 MB per loaded ship type plus the shared index-buffer growth) is accepted.
4. Lid step S14 may update the one debug readout line in 90_main.js (`__vxk.deco.drawn`). Keep every other change out of 71_input.js / 69_prefs.js / 70_flow.js / 00_events.js / 90_main.js (another session is refactoring core/shell there).
5. Visual-change proposals (keg LOD, hold contents out of shadow/reflection, smooth LOD, ...) are listed for Tim at the end, not implemented.

