// Gala data helpers backed by Supabase (replaces the Firestore implementation).
// Realtime listeners are replaced with an initial fetch plus 20-second polling.
// Rows are converted to the camelCase doc shape the components already consume
// ({ id, paddleNumber, firstName, lastName, checkedIn, ... } plus extras keys).
import { supabase, SUPABASE_CONFIG_ERROR } from "./supabaseClient";

const POLL_INTERVAL_MS = 20000;

const GUEST_COLUMNS = new Set([
    "paddle_number",
    "first_name",
    "last_name",
    "checked_in",
    "check_in_time",
    "original_paddle",
]);

const GUEST_COLUMN_MAP = {
    paddleNumber: "paddle_number",
    firstName: "first_name",
    lastName: "last_name",
    checkedIn: "checked_in",
    checkInTime: "check_in_time",
    originalPaddle: "original_paddle",
};

function requireClient() {
    if (!supabase) {
        throw new Error(SUPABASE_CONFIG_ERROR || "Supabase is not configured.");
    }
    return supabase;
}

// Preserve the Postgres error code so callers can detect specific failures
// (e.g. 23505 unique violations on paddle_number).
function toError(error) {
    const err = new Error(error.message);
    err.code = error.code;
    return err;
}

export function isDuplicatePaddleError(err) {
    return (
        err?.code === "23505" ||
        /duplicate key|already exists|unique constraint/i.test(
            err?.message || "",
        )
    );
}

// Active pollers, so writes can refresh subscribed lists immediately instead
// of waiting up to POLL_INTERVAL_MS for the next tick.
const guestRefreshers = new Set();
const donationRefreshers = new Set();

function startPolling(fetcher, registry) {
    let cancelled = false;
    const run = () => {
        if (!cancelled) fetcher();
    };
    run();
    const intervalId = setInterval(run, POLL_INTERVAL_MS);
    if (registry) registry.add(run);
    return () => {
        cancelled = true;
        clearInterval(intervalId);
        if (registry) registry.delete(run);
    };
}

export function refreshGuests() {
    guestRefreshers.forEach((run) => run());
}

export function refreshDonations() {
    donationRefreshers.forEach((run) => run());
}

function guestRowToDoc(row) {
    const extras = row.extras || {};
    const fullName = [row.first_name, row.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();

    return {
        ...extras,
        id: row.id,
        paddleNumber: row.paddle_number,
        firstName: row.first_name,
        lastName: row.last_name,
        fullName: fullName || extras.fullName || "",
        checkedIn: row.checked_in,
        checkInTime: row.check_in_time,
        originalPaddle: row.original_paddle,
    };
}

function donationRowToDoc(row) {
    const extras = row.extras || {};
    return {
        ...extras,
        id: row.id,
        paddleNumber: row.paddle_number,
        amount: Number(row.amount) || 0,
        donorName: row.donor_name,
        createdAt: row.created_at,
        timestamp: row.created_at,
    };
}

// Maps a camelCase (or snake_case) guest payload to table columns. Keys
// without a dedicated column are collected so they can be stored in extras.
function splitGuestPayload(data) {
    const columns = {};
    const extras = {};

    for (const [key, value] of Object.entries(data || {})) {
        if (key === "id" || key === "extras") continue;

        if (key === "fullName") {
            const parts = String(value || "")
                .trim()
                .split(/\s+/)
                .filter(Boolean);
            columns.first_name = parts.shift() || null;
            columns.last_name = parts.length ? parts.join(" ") : null;
        } else if (GUEST_COLUMN_MAP[key]) {
            columns[GUEST_COLUMN_MAP[key]] = value;
        } else if (GUEST_COLUMNS.has(key)) {
            columns[key] = value;
        } else {
            extras[key] = value;
        }
    }

    return { columns, extras };
}

// --- Guests ---

export const subscribeToGuests = (callback) => {
    if (!supabase) {
        console.error(SUPABASE_CONFIG_ERROR);
        callback([]);
        return () => {};
    }

    return startPolling(async () => {
        const { data, error } = await supabase
            .from("gala_guests")
            .select("*")
            .order("paddle_number", { ascending: true });

        if (error) {
            console.error("Error loading gala guests:", error.message);
            return;
        }

        callback((data || []).map(guestRowToDoc));
    }, guestRefreshers);
};

export const getGuestByPaddle = async (paddleNumber) => {
    const client = requireClient();
    const { data, error } = await client
        .from("gala_guests")
        .select("*")
        .eq("paddle_number", Number(paddleNumber))
        .maybeSingle();

    if (error) {
        throw toError(error);
    }

    return data ? guestRowToDoc(data) : null;
};

export const updateGuest = async (guestId, data) => {
    const client = requireClient();
    const { columns, extras } = splitGuestPayload(data);

    if (Object.keys(extras).length > 0) {
        const { data: row, error: readError } = await client
            .from("gala_guests")
            .select("extras")
            .eq("id", guestId)
            .single();

        if (readError) {
            throw toError(readError);
        }

        columns.extras = { ...(row?.extras || {}), ...extras };
    }

    const { error } = await client
        .from("gala_guests")
        .update(columns)
        .eq("id", guestId);

    if (error) {
        throw toError(error);
    }

    refreshGuests();
};

export const addGuest = async (data) => {
    const client = requireClient();
    const { columns, extras } = splitGuestPayload(data);

    if (Object.keys(extras).length > 0) {
        columns.extras = extras;
    }

    const { data: row, error } = await client
        .from("gala_guests")
        .insert(columns)
        .select("*")
        .single();

    if (error) {
        throw toError(error);
    }

    refreshGuests();
    return guestRowToDoc(row);
};

export const deleteGuest = async (guestId) => {
    const client = requireClient();
    const { error } = await client
        .from("gala_guests")
        .delete()
        .eq("id", guestId);

    if (error) {
        throw toError(error);
    }

    refreshGuests();
};

// --- Donations (staff tools; requires the gala module) ---

export const subscribeToDonations = (callback) => {
    if (!supabase) {
        console.error(SUPABASE_CONFIG_ERROR);
        callback([]);
        return () => {};
    }

    return startPolling(async () => {
        const { data, error } = await supabase
            .from("gala_donations")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Error loading gala donations:", error.message);
            return;
        }

        callback((data || []).map(donationRowToDoc));
    }, donationRefreshers);
};

export const addDonation = async (donationData) => {
    const client = requireClient();
    const {
        amount,
        paddleNumber,
        paddle_number: paddleNumberSnake,
        donorName,
        donor_name: donorNameSnake,
        ...rest
    } = donationData || {};

    const insert = {
        amount: Number(amount) || 0,
        paddle_number: paddleNumber ?? paddleNumberSnake ?? null,
        donor_name: donorName ?? donorNameSnake ?? null,
    };

    if (Object.keys(rest).length > 0) {
        insert.extras = rest;
    }

    const { error } = await client.from("gala_donations").insert(insert);

    if (error) {
        throw toError(error);
    }

    refreshDonations();
};

// Donation deletes are admin-only by RLS. A blocked delete does not raise an
// error, it just deletes zero rows, so we check the returned rows and report
// the permission problem explicitly.
export const deleteDonation = async (donationId) => {
    const client = requireClient();
    const { data, error } = await client
        .from("gala_donations")
        .delete()
        .eq("id", donationId)
        .select("id");

    if (error) {
        if (
            error.code === "42501" ||
            /permission|policy|denied/i.test(error.message || "")
        ) {
            throw new Error("Only admins can delete donations.");
        }
        throw toError(error);
    }

    if (!data || data.length === 0) {
        throw new Error("Only admins can delete donations.");
    }

    refreshDonations();
};

// --- Public donation feed (anon-safe) ---
// Public pages (thermometer, ticker, popups) must read gala_donations_public;
// the anon key cannot select the base tables. Donor names are already
// resolved by the view (guest name, donor_name, or "Anonymous").

export const subscribeToPublicDonations = (callback) => {
    if (!supabase) {
        console.error(SUPABASE_CONFIG_ERROR);
        callback([]);
        return () => {};
    }

    return startPolling(async () => {
        const { data, error } = await supabase
            .from("gala_donations_public")
            .select("id, amount, donor_name, paddle_number, created_at")
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Error loading public donations:", error.message);
            return;
        }

        callback((data || []).map(donationRowToDoc));
    });
};
