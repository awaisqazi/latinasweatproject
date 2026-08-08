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
    }

    $effect(() => {
        // Read everything the drawing depends on so the effect re-runs.
        void [photo, frameId, ratioId, zoom, offX, offY, canvasEl];
        draw();
    });

    // ---- Gestures: one pointer pans, two pinch-zoom. --------------------
    const pointers = new Map();
    let pinchStart = null;

    function canvasScale() {
        // CSS px -> export px
        return ratio.width / canvasEl.getBoundingClientRect().width;
    }

    function onPointerDown(e) {
        if (!photo) return;
        try {
            canvasEl.setPointerCapture(e.pointerId);
        } catch {
            // Capture is a nicety; dragging still works without it.
        }
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 2) {
            const [a, b] = [...pointers.values()];
            pinchStart = {
                dist: Math.hypot(a.x - b.x, a.y - b.y),
                zoom,
            };
        }
    }

    function onPointerMove(e) {
        if (!photo || !pointers.has(e.pointerId)) return;
        const prev = pointers.get(e.pointerId);
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const k = canvasScale();
        if (pointers.size === 1) {
            offX += (e.clientX - prev.x) * k;
            offY += (e.clientY - prev.y) * k;
        } else if (pointers.size === 2 && pinchStart) {
            const [a, b] = [...pointers.values()];
            const dist = Math.hypot(a.x - b.x, a.y - b.y);
            if (pinchStart.dist > 0) {
                zoom = Math.max(
                    1,
                    Math.min(MAX_ZOOM, (pinchStart.zoom * dist) / pinchStart.dist),
                );
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
        zoom = Math.max(1, Math.min(MAX_ZOOM, zoom * Math.pow(1.0015, -e.deltaY)));
    }

    function resetCrop() {
        zoom = 1;
        offX = 0;
        offY = 0;
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
        // Make sure the latest state is on the canvas before reading it back.
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

    async function onDownload() {
        if (!photo || exporting) return;
        exporting = true;
        errorMsg = "";
        shared = "";
        try {
            downloadFile(await exportFile());
            shared = "saved";
            track("photobooth_download");
        } catch {
            errorMsg = "Couldn't save the image. Try again.";
        } finally {
            exporting = false;
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
                Drag to move · pinch or scroll to zoom · double-tap to reset
            </p>
        </div>

        <!-- Size picker -->
        <div class="mt-5 grid grid-cols-3 gap-2">
            {#each PHOTOBOOTH_RATIOS as r (r.id)}
                <button
                    type="button"
                    onclick={() => (ratioId = r.id)}
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
                onclick={onDownload}
                disabled={exporting}
                class="rounded-full border-2 border-off-black bg-white px-6 py-3.5 font-sans text-base font-extrabold text-off-black transition hover:bg-off-black hover:text-white disabled:opacity-60"
            >
                Save
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
</div>
