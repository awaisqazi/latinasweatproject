<script>
    // Selfie-mirror photo booth. Everything happens on-device: the guest's
    // photo is read into a canvas, cropped under a transparent frame overlay
    // PNG, and exported as a JPEG via the Web Share API or a download link.
    // No photo bytes ever leave the browser.
    import {
        PHOTOBOOTH_RATIOS,
        activeFrames,
        photoWindow,
        frameSrc,
        frameTextStyle,
        framePresets,
        PHOTOBOOTH_STICKERS,
    } from "@/data/photobooth.js";

    const frames = activeFrames();
    const MAX_ZOOM = 4;
    // Downscale huge phone photos once up front; keeps redraws smooth and
    // memory sane. 2400px comfortably covers a 1080-wide export window.
    const MAX_SOURCE_PX = 2400;

    let photo = $state(null); // normalized source canvas
    let frameId = $state(frames[0].id);
    let ratioId = $state("story");
    let zoom = $state(1); // multiplier on top of cover-fit
    let offX = $state(0); // pan, in export pixels
    let offY = $state(0);
    let loadingPhoto = $state(false);
    let exporting = $state(false);
    let shared = $state(""); // "shared" | "saved" | ""
    let errorMsg = $state("");
    // "Save to Photos" viewer: on phones the OS can only write to the photo
    // library through its own UI (share sheet's Save Image, or long-press ->
    // Add to Photos), so we show the finished JPEG and hand off to those.
    let saveView = $state(null); // { url, file }

    // Guest personalization: text lines + stickers drawn above the frame.
    let elements = $state([]); // {id, kind:'text'|'emoji'|'image', x, y, scale, text?, char?, src?}
    let selectedId = $state(null);
    let customText = $state("");
    let elementSeq = 1;
    let dragMode = "photo"; // what a one-finger drag moves right now
    const bboxes = new Map(); // element id -> {w, h} from the last draw
    const stickerImgs = new Map(); // src -> HTMLImageElement

    const selectedEl = $derived(elements.find((el) => el.id === selectedId));

    let canvasEl = $state(null);
    let fileInput;

    const ratio = $derived(PHOTOBOOTH_RATIOS.find((r) => r.id === ratioId));
    const frame = $derived(frames.find((f) => f.id === frameId));
    const win = $derived(photoWindow(frameId, ratioId));

    // Frame overlay images, cached per src.
    const overlayCache = new Map();
    function loadOverlay(src) {
        if (!overlayCache.has(src)) {
            overlayCache.set(
                src,
                new Promise((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = () =>
                        reject(new Error(`Could not load frame ${src}`));
                    img.src = src;
                }),
            );
        }
        return overlayCache.get(src);
    }

    async function onFileChange(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        errorMsg = "";
        shared = "";
        loadingPhoto = true;
        try {
            const url = URL.createObjectURL(file);
            const img = await new Promise((resolve, reject) => {
                const el = new Image();
                el.onload = () => resolve(el);
                el.onerror = () =>
                    reject(new Error("That file doesn't look like a photo."));
                el.src = url;
            });
            // Draw once into a downscaled canvas; the browser applies EXIF
            // orientation when decoding, so this also normalizes rotation.
            const scale = Math.min(
                1,
                MAX_SOURCE_PX / Math.max(img.naturalWidth, img.naturalHeight),
            );
            const source = document.createElement("canvas");
            source.width = Math.round(img.naturalWidth * scale);
            source.height = Math.round(img.naturalHeight * scale);
            source
                .getContext("2d")
                .drawImage(img, 0, 0, source.width, source.height);
            URL.revokeObjectURL(url);
            photo = source;
            zoom = 1;
            offX = 0;
            offY = 0;
        } catch (err) {
            errorMsg = err.message || "Couldn't open that photo. Try another.";
        } finally {
            loadingPhoto = false;
            // Allow re-picking the same file.
            event.target.value = "";
        }
    }

    // Photo placement in export pixels for the current window/zoom/pan.
    function placement() {
        const cover = Math.max(win.w / photo.width, win.h / photo.height);
        const s = cover * zoom;
        const dw = photo.width * s;
        const dh = photo.height * s;
        const maxX = (dw - win.w) / 2;
        const maxY = (dh - win.h) / 2;
        offX = Math.max(-maxX, Math.min(maxX, offX));
        offY = Math.max(-maxY, Math.min(maxY, offY));
        return {
            dx: win.x + (win.w - dw) / 2 + offX,
            dy: win.y + (win.h - dh) / 2 + offY,
            dw,
            dh,
        };
    }

    let drawToken = 0;
    async function draw() {
        if (!canvasEl || !ratio) return;
        const token = ++drawToken;
        const overlay = await loadOverlay(frameSrc(frameId, ratioId)).catch(
            () => null,
        );
        if (token !== drawToken || !canvasEl) return;
        const ctx = canvasEl.getContext("2d");
        ctx.clearRect(0, 0, ratio.width, ratio.height);
        if (photo) {
            const { dx, dy, dw, dh } = placement();
            ctx.save();
            ctx.beginPath();
            ctx.rect(win.x, win.y, win.w, win.h);
            ctx.clip();
            ctx.fillStyle = frame.backdrop;
            ctx.fillRect(win.x, win.y, win.w, win.h);
            ctx.drawImage(photo, dx, dy, dw, dh);
            ctx.restore();
        } else {
            ctx.fillStyle = frame.backdrop;
            ctx.fillRect(win.x, win.y, win.w, win.h);
        }
        if (overlay) ctx.drawImage(overlay, 0, 0, ratio.width, ratio.height);
        for (const el of elements) drawElement(ctx, el);
        if (selectedEl) {
            const bb = bboxes.get(selectedEl.id);
            if (bb) {
                ctx.save();
                ctx.setLineDash([10, 8]);
                ctx.lineWidth = 3;
                ctx.strokeStyle = "#ffffff";
                roundRectPath(
                    ctx,
                    selectedEl.x - bb.w / 2 - 10,
                    selectedEl.y - bb.h / 2 - 10,
                    bb.w + 20,
                    bb.h + 20,
                    14,
                );
                ctx.stroke();
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
                ctx.stroke();
                ctx.restore();
            }
        }
    }

    // Manual path: canvas roundRect() is missing on older iOS Safari.
    function roundRectPath(ctx, x, y, w, h, r) {
        const rr = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.arcTo(x + w, y, x + w, y + h, rr);
        ctx.arcTo(x + w, y + h, x, y + h, rr);
        ctx.arcTo(x, y + h, x, y, rr);
        ctx.arcTo(x, y, x + w, y, rr);
        ctx.closePath();
    }

    function stickerImage(src) {
        let img = stickerImgs.get(src);
        if (!img) {
            img = new Image();
            img.onload = () => draw();
            img.src = src;
            stickerImgs.set(src, img);
        }
        return img;
    }

    function drawElement(ctx, el) {
        ctx.save();
        ctx.translate(el.x, el.y);
        if (el.kind === "text") {
            const st = frameTextStyle(frameId);
            ctx.rotate((st.tilt * Math.PI) / 180);
            const fontOf = (px) =>
                `${st.italic ? "italic " : ""}${st.weight} ${px}px ${st.family}`;
            let fontPx = st.size * el.scale;
            ctx.font = fontOf(fontPx);
            let textW = ctx.measureText(el.text).width;
            // Never let a line run off the canvas, whatever its length/scale.
            const maxW = ratio.width * 0.94 - fontPx;
            if (textW > maxW) {
                fontPx *= maxW / textW;
                ctx.font = fontOf(fontPx);
                textW = ctx.measureText(el.text).width;
            }
            const padX = fontPx * 0.55;
            const w = textW + padX * 2;
            const h = fontPx * 1.72;
            ctx.fillStyle = st.scrim;
            roundRectPath(ctx, -w / 2, -h / 2, w, h, h / 2);
            ctx.fill();
            ctx.fillStyle = st.color;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(el.text, 0, fontPx * 0.06);
            bboxes.set(el.id, { w, h });
        } else if (el.kind === "emoji") {
            const px = 120 * el.scale;
            ctx.font = `${px}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(el.char, 0, px * 0.06);
            bboxes.set(el.id, { w: px * 1.15, h: px * 1.15 });
        } else {
            const img = stickerImage(el.src);
            if (img.complete && img.naturalWidth) {
                const h = 170 * el.scale;
                const w = (h * img.naturalWidth) / img.naturalHeight;
                ctx.drawImage(img, -w / 2, -h / 2, w, h);
                bboxes.set(el.id, { w, h });
            }
        }
        ctx.restore();
    }

    $effect(() => {
        // Read everything the drawing depends on so the effect re-runs
        // (stringify walks the element proxies for deep tracking).
        void [photo, frameId, ratioId, zoom, offX, offY, canvasEl, selectedId];
        void JSON.stringify(elements);
        draw();
    });

    $effect(() => {
        // Warm the theme font so canvas text doesn't flash a fallback face.
        const st = frameTextStyle(frameId);
        document.fonts
            ?.load(`${st.italic ? "italic " : ""}${st.weight} 32px ${st.family}`)
            .then(() => draw())
            .catch(() => {});
    });

    // ---- Gestures: one pointer pans, two pinch-zoom. --------------------
    const pointers = new Map();
    let pinchStart = null;

    function canvasScale() {
        // CSS px -> export px
        return ratio.width / canvasEl.getBoundingClientRect().width;
    }

    function canvasPoint(e) {
        const rect = canvasEl.getBoundingClientRect();
        return {
            x: ((e.clientX - rect.left) * ratio.width) / rect.width,
            y: ((e.clientY - rect.top) * ratio.height) / rect.height,
        };
    }

    function hitElement(pt) {
        for (let i = elements.length - 1; i >= 0; i--) {
            const el = elements[i];
            const bb = bboxes.get(el.id);
            if (!bb) continue;
            // Generous minimum target so small stickers stay grabbable.
            const hw = Math.max(bb.w / 2, 54);
            const hh = Math.max(bb.h / 2, 54);
            if (Math.abs(pt.x - el.x) <= hw && Math.abs(pt.y - el.y) <= hh) {
                return el;
            }
        }
        return null;
    }

    function onPointerDown(e) {
        if (!photo) return;
        try {
            canvasEl.setPointerCapture(e.pointerId);
        } catch {
            // Capture is a nicety; dragging still works without it.
        }
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 1) {
            const hit = hitElement(canvasPoint(e));
            if (hit) {
                selectedId = hit.id;
                dragMode = "element";
            } else {
                selectedId = null;
                dragMode = "photo";
            }
        } else if (pointers.size === 2) {
            const [a, b] = [...pointers.values()];
            pinchStart = {
                dist: Math.hypot(a.x - b.x, a.y - b.y),
                zoom,
                elScale: selectedEl?.scale,
            };
        }
    }

    function onPointerMove(e) {
        if (!photo || !pointers.has(e.pointerId)) return;
        const prev = pointers.get(e.pointerId);
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const k = canvasScale();
        if (pointers.size === 1) {
            const dx = (e.clientX - prev.x) * k;
            const dy = (e.clientY - prev.y) * k;
            if (dragMode === "element" && selectedEl) {
                selectedEl.x = Math.max(
                    0,
                    Math.min(ratio.width, selectedEl.x + dx),
                );
                selectedEl.y = Math.max(
                    0,
                    Math.min(ratio.height, selectedEl.y + dy),
                );
            } else {
                offX += dx;
                offY += dy;
            }
        } else if (pointers.size === 2 && pinchStart) {
            const [a, b] = [...pointers.values()];
            const dist = Math.hypot(a.x - b.x, a.y - b.y);
            if (pinchStart.dist > 0) {
                if (selectedEl && pinchStart.elScale != null) {
                    selectedEl.scale = Math.max(
                        0.35,
                        Math.min(4, (pinchStart.elScale * dist) / pinchStart.dist),
                    );
                } else {
                    zoom = Math.max(
                        1,
                        Math.min(
                            MAX_ZOOM,
                            (pinchStart.zoom * dist) / pinchStart.dist,
                        ),
                    );
                }
            }
        }
    }

    function onPointerUp(e) {
        pointers.delete(e.pointerId);
        if (pointers.size < 2) pinchStart = null;
    }

    function onWheel(e) {
        if (!photo) return;
        e.preventDefault();
        const factor = Math.pow(1.0015, -e.deltaY);
        if (selectedEl) {
            selectedEl.scale = Math.max(
                0.35,
                Math.min(4, selectedEl.scale * factor),
            );
        } else {
            zoom = Math.max(1, Math.min(MAX_ZOOM, zoom * factor));
        }
    }

    function resetCrop() {
        zoom = 1;
        offX = 0;
        offY = 0;
    }

    // ---- Text + stickers --------------------------------------------------
    function addText(line, source) {
        const text = line.trim().slice(0, 40);
        if (!text || !photo) return;
        const id = elementSeq++;
        // Faces sit center-to-lower in mirror selfies, so new text lands in
        // the upper part of the photo window.
        const nthText = elements.filter((el) => el.kind === "text").length;
        elements.push({
            id,
            kind: "text",
            text,
            x: ratio.width / 2,
            // Stagger stacked lines so a second one never hides the first.
            y: win.y + win.h * (0.18 + (nthText % 4) * 0.09),
            scale: 1,
        });
        selectedId = id;
        track(
            source === "custom"
                ? "photobooth_text_custom"
                : "photobooth_text_preset",
        );
    }

    function addCustomText() {
        if (!customText.trim()) return;
        addText(customText, "custom");
        customText = "";
    }

    function addSticker(s) {
        if (!photo) return;
        const id = elementSeq++;
        elements.push({
            id,
            kind: s.kind,
            char: s.char,
            src: s.src,
            x: ratio.width / 2 + ((elements.length % 3) - 1) * 60,
            y: win.y + win.h * 0.34,
            scale: 1,
        });
        selectedId = id;
        track("photobooth_sticker");
    }

    function removeSelected() {
        elements = elements.filter((el) => el.id !== selectedId);
        selectedId = null;
    }

    function setRatio(id) {
        ratioId = id;
        const r = PHOTOBOOTH_RATIOS.find((x) => x.id === id);
        for (const el of elements) {
            el.x = Math.min(el.x, r.width);
            el.y = Math.min(el.y, r.height);
        }
    }

    // ---- Export -----------------------------------------------------------
    function track(action) {
        try {
            window.gtag?.("event", action, {
                event_category: "photobooth",
                event_label: `${frameId}-${ratioId}`,
            });
        } catch {
            /* analytics must never break the booth */
        }
    }

    async function exportFile() {
        // Deselect so the selection outline never lands in the export, then
        // make sure the latest state is on the canvas before reading it back.
        selectedId = null;
        await draw();
        const blob = await new Promise((resolve) =>
            canvasEl.toBlob(resolve, "image/jpeg", 0.92),
        );
        if (!blob) throw new Error("Couldn't create the image. Try again.");
        return new File([blob], `lsp-photobooth-${frameId}-${ratioId}.jpg`, {
            type: "image/jpeg",
        });
    }

    function downloadFile(file) {
        const url = URL.createObjectURL(file);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }

    async function onShare() {
        if (!photo || exporting) return;
        exporting = true;
        errorMsg = "";
        shared = "";
        try {
            const file = await exportFile();
            if (navigator.canShare?.({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: "The Latina Sweat Project",
                });
                shared = "shared";
                track("photobooth_share");
            } else {
                downloadFile(file);
                shared = "saved";
                track("photobooth_download");
            }
        } catch (err) {
            // Closing the share sheet is not an error.
            if (err?.name !== "AbortError") {
                errorMsg = "Sharing didn't work, so try Save instead.";
            }
        } finally {
            exporting = false;
        }
    }

    async function onSaveToPhotos() {
        if (!photo || exporting) return;
        exporting = true;
        errorMsg = "";
        shared = "";
        try {
            const file = await exportFile();
            const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
            if (isTouchDevice) {
                saveView = { url: URL.createObjectURL(file), file };
                track("photobooth_save_photos");
            } else {
                downloadFile(file);
                shared = "saved";
                track("photobooth_download");
            }
        } catch {
            errorMsg = "Couldn't save the image. Try again.";
        } finally {
            exporting = false;
        }
    }

    function closeSaveView() {
        if (saveView) URL.revokeObjectURL(saveView.url);
        saveView = null;
    }

    async function shareFromSaveView() {
        try {
            if (navigator.canShare?.({ files: [saveView.file] })) {
                await navigator.share({ files: [saveView.file] });
                shared = "shared";
            } else {
                downloadFile(saveView.file);
                shared = "saved";
            }
        } catch (err) {
            if (err?.name !== "AbortError") downloadFile(saveView.file);
        }
    }
</script>

<div class="mx-auto w-full max-w-xl">
    <input
        bind:this={fileInput}
        type="file"
        accept="image/*"
        class="hidden"
        onchange={onFileChange}
    />

    {#if !photo}
        <!-- Empty state: one big tap target -->
        <button
            type="button"
            onclick={() => fileInput.click()}
            class="flex w-full flex-col items-center gap-4 rounded-3xl border-2 border-dashed border-vibrant-pink/40 bg-white px-6 py-16 text-center shadow-sm transition hover:border-vibrant-pink hover:shadow-md"
        >
            <span
                class="flex h-16 w-16 items-center justify-center rounded-full bg-accent-gold/20"
            >
                <svg
                    class="h-8 w-8 text-off-black"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                >
                    <path
                        d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
                    />
                    <circle cx="12" cy="13" r="4" />
                </svg>
            </span>
            <span class="font-sans text-xl font-extrabold text-off-black">
                Add your mirror selfie
            </span>
            <span class="max-w-xs font-body text-sm text-medium-gray">
                Take your photo in the studio mirror, then pick it here. It
                stays on your phone, we never see it or store it.
            </span>
            <span
                class="rounded-full bg-accent-gold px-6 py-2.5 font-sans text-sm font-bold text-off-black"
            >
                {loadingPhoto ? "Opening…" : "Choose photo"}
            </span>
        </button>
    {:else}
        <!-- Preview -->
        <div
            class="overflow-hidden rounded-3xl bg-white p-3 shadow-md ring-1 ring-black/5"
        >
            <canvas
                bind:this={canvasEl}
                width={ratio.width}
                height={ratio.height}
                class="w-full touch-none select-none rounded-2xl"
                style="aspect-ratio: {ratio.width} / {ratio.height}; cursor: grab;"
                onpointerdown={onPointerDown}
                onpointermove={onPointerMove}
                onpointerup={onPointerUp}
                onpointercancel={onPointerUp}
                onwheel={onWheel}
                ondblclick={resetCrop}
            ></canvas>
            <p class="mt-2 text-center font-body text-xs text-medium-gray">
                {#if selectedEl}
                    Drag to place it · pinch or scroll to resize · tap
                    elsewhere when done
                {:else}
                    Drag to move · pinch or scroll to zoom · tap text or
                    stickers to adjust them
                {/if}
            </p>
        </div>

        <!-- Size picker -->
        <div class="mt-5 grid grid-cols-3 gap-2">
            {#each PHOTOBOOTH_RATIOS as r (r.id)}
                <button
                    type="button"
                    onclick={() => setRatio(r.id)}
                    class="rounded-2xl border px-3 py-2.5 text-center transition {ratioId ===
                    r.id
                        ? 'border-off-black bg-off-black text-white'
                        : 'border-black/10 bg-white text-off-black hover:border-black/30'}"
                >
                    <span class="block font-sans text-sm font-bold">
                        {r.label}
                    </span>
                    <span
                        class="block font-body text-[11px] {ratioId === r.id
                            ? 'text-white/70'
                            : 'text-medium-gray'}"
                    >
                        {r.hint}
                    </span>
                </button>
            {/each}
        </div>

        <!-- Frame picker -->
        <div class="mt-4 grid grid-cols-3 gap-2">
            {#each frames as f (f.id)}
                <button
                    type="button"
                    onclick={() => (frameId = f.id)}
                    class="rounded-2xl border p-2 transition {frameId === f.id
                        ? 'border-off-black bg-off-black text-white'
                        : 'border-black/10 bg-white text-off-black hover:border-black/30'}"
                >
                    <span
                        class="block overflow-hidden rounded-xl"
                        style="background: {f.backdrop};"
                    >
                        <img
                            src={frameSrc(f.id, "square")}
                            alt="{f.name} frame"
                            class="w-full"
                            loading="lazy"
                        />
                    </span>
                    <span class="mt-1.5 block font-sans text-xs font-bold">
                        {f.name}
                    </span>
                    <span
                        class="block font-body text-[10px] {frameId === f.id
                            ? 'text-white/70'
                            : 'text-medium-gray'}"
                    >
                        {f.tag}
                    </span>
                </button>
            {/each}
        </div>

        <!-- Make it yours: preset lines, custom text, stickers -->
        <div class="mt-4 rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-black/5">
            <p
                class="font-sans text-xs font-bold uppercase tracking-wider text-medium-gray"
            >
                Say something
            </p>
            <div class="mt-2 flex flex-wrap gap-1.5">
                {#each framePresets(frameId) as line (line)}
                    <button
                        type="button"
                        onclick={() => addText(line, "preset")}
                        class="rounded-full border border-black/10 bg-light-gray px-3 py-1.5 font-sans text-xs font-bold text-off-black transition hover:border-black/30"
                    >
                        {line}
                    </button>
                {/each}
            </div>
            <div class="mt-2.5 flex gap-2">
                <input
                    type="text"
                    bind:value={customText}
                    maxlength="40"
                    placeholder="Or write your own…"
                    onkeydown={(e) => e.key === "Enter" && addCustomText()}
                    class="min-w-0 flex-1 rounded-full border border-black/15 px-4 py-2 font-body text-sm text-off-black outline-none focus:border-off-black"
                />
                <button
                    type="button"
                    onclick={addCustomText}
                    class="rounded-full bg-off-black px-5 py-2 font-sans text-sm font-bold text-white transition hover:bg-black disabled:opacity-50"
                    disabled={!customText.trim()}
                >
                    Add
                </button>
            </div>
            <p
                class="mt-3.5 font-sans text-xs font-bold uppercase tracking-wider text-medium-gray"
            >
                Stickers
            </p>
            <div class="mt-1.5 flex gap-1.5 overflow-x-auto pb-1">
                {#each PHOTOBOOTH_STICKERS as s (s.id)}
                    <button
                        type="button"
                        onclick={() => addSticker(s)}
                        aria-label={s.kind === "emoji"
                            ? `Add ${s.char} sticker`
                            : `Add ${s.label} sticker`}
                        class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-black/10 bg-light-gray text-2xl transition hover:border-black/30"
                    >
                        {#if s.kind === "emoji"}
                            {s.char}
                        {:else}
                            <img
                                src={s.src}
                                alt={s.label}
                                class="max-h-8 max-w-9 object-contain"
                                loading="lazy"
                            />
                        {/if}
                    </button>
                {/each}
            </div>
        </div>

        {#if selectedEl}
            <div
                class="mt-3 flex items-center gap-3 rounded-2xl bg-off-black p-3 text-white"
            >
                <span class="shrink-0 font-sans text-xs font-bold uppercase">
                    Size
                </span>
                <input
                    type="range"
                    min="0.35"
                    max="4"
                    step="0.01"
                    value={selectedEl.scale}
                    oninput={(e) => (selectedEl.scale = +e.target.value)}
                    class="min-w-0 flex-1 accent-accent-gold"
                />
                <button
                    type="button"
                    onclick={removeSelected}
                    class="shrink-0 rounded-full border border-white/40 px-3.5 py-1.5 font-sans text-xs font-bold transition hover:bg-white/10"
                >
                    Remove
                </button>
                <button
                    type="button"
                    onclick={() => (selectedId = null)}
                    class="shrink-0 rounded-full bg-accent-gold px-3.5 py-1.5 font-sans text-xs font-extrabold text-off-black"
                >
                    Done
                </button>
            </div>
        {/if}

        <!-- Actions -->
        <div class="mt-5 grid grid-cols-2 gap-3">
            <button
                type="button"
                onclick={onShare}
                disabled={exporting}
                class="rounded-full bg-accent-gold px-6 py-3.5 font-sans text-base font-extrabold text-off-black shadow-sm transition hover:brightness-95 disabled:opacity-60"
            >
                {exporting ? "Working…" : "Share"}
            </button>
            <button
                type="button"
                onclick={onSaveToPhotos}
                disabled={exporting}
                class="rounded-full border-2 border-off-black bg-white px-6 py-3.5 font-sans text-base font-extrabold text-off-black transition hover:bg-off-black hover:text-white disabled:opacity-60"
            >
                Save to Photos
            </button>
        </div>

        {#if shared === "shared"}
            <p class="mt-3 text-center font-body text-sm font-bold text-accent">
                Shared! Tag @latinasweatproject so we can repost you.
            </p>
        {:else if shared === "saved"}
            <p class="mt-3 text-center font-body text-sm font-bold text-accent">
                Saved! Post it and tag @latinasweatproject.
            </p>
        {/if}
        {#if errorMsg}
            <p class="mt-3 text-center font-body text-sm text-red-600">
                {errorMsg}
            </p>
        {/if}

        <div class="mt-4 flex items-center justify-center gap-4">
            <button
                type="button"
                onclick={() => fileInput.click()}
                class="font-sans text-sm font-bold text-medium-gray underline underline-offset-4 hover:text-off-black"
            >
                Change photo
            </button>
            <button
                type="button"
                onclick={resetCrop}
                class="font-sans text-sm font-bold text-medium-gray underline underline-offset-4 hover:text-off-black"
            >
                Reset crop
            </button>
        </div>
    {/if}

    <p class="mt-6 text-center font-body text-xs text-medium-gray">
        Your photo never leaves your device. The frame is added right here in
        your browser, nothing is uploaded or stored.
    </p>

    {#if saveView}
        <!-- Save-to-Photos viewer: a real <img> so the OS long-press "Add to
             Photos" works, plus a share-sheet shortcut ("Save Image" on iOS,
             gallery apps on Android). -->
        <div
            class="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/90 p-5"
            role="dialog"
            aria-modal="true"
            aria-label="Save your photo"
        >
            <img
                src={saveView.url}
                alt="Your framed LSP photo"
                class="max-h-[62vh] w-auto max-w-full rounded-xl shadow-2xl"
            />
            <p
                class="max-w-xs text-center font-body text-sm leading-relaxed text-white"
            >
                <span class="font-bold">Press and hold the photo</span> and
                choose <span class="font-bold">Add to Photos</span> (or
                <span class="font-bold">Download image</span>), or use the
                button below.
            </p>
            <div class="flex flex-wrap items-center justify-center gap-3">
                <button
                    type="button"
                    onclick={shareFromSaveView}
                    class="rounded-full bg-accent-gold px-6 py-3 font-sans text-sm font-extrabold text-off-black"
                >
                    Save via share sheet
                </button>
                <button
                    type="button"
                    onclick={closeSaveView}
                    class="rounded-full border-2 border-white/70 px-6 py-3 font-sans text-sm font-extrabold text-white"
                >
                    Done
                </button>
            </div>
        </div>
    {/if}
</div>
