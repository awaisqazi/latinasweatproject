// Volunteer shift check-in: on/off switch for the old /checkin kiosk.
//
// Context (Oct 12, 2026): the Supabase volunteer shift check-in
// (src/components/CheckInApp.svelte + CheckInModal.svelte, reading
// shifts_public and the get_today_check_in_roster RPC; volunteers tapped in
// for their registered shifts from /checkin, linked from the admin
// Volunteers view) has not been used during the pop-up era, while LSP runs
// classes across Pilsen with Zeffy registrations. We will use it again, so
// the code stays in the repo untouched.
//
// THE TOGGLE: while false, /checkin is the "Pop-up class check-in" page
// (one button per pop-up week and location that opens that form's Zeffy
// check-in manager; data in src/data/popUpWeek1.js to popUpWeek4.js and
// src/data/collectiveFinishLine.js, URL pattern in zeffyCheckInUrl in
// src/data/popUpShared.js). Flip to true to bring the shift check-in back
// at /checkin exactly as before.
export const showVolunteerCheckIn = false;
