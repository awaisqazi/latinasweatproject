// Gemini AI Utilities for Volunteer Summary Analysis
// Uses Gemini 3.1 Flash Lite via REST API
// API key is loaded from .env (PUBLIC_GEMINI_API_KEY) — never hardcoded

const GEMINI_API_KEY = import.meta.env.PUBLIC_GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-3.1-flash-lite";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

/**
 * Parse a CSV string with quoted fields into an array of objects.
 * Handles quoted fields with commas inside, and strips surrounding quotes.
 *
 * @param {string} csvText - Raw CSV text content
 * @returns {Array<Object>} Parsed rows as objects keyed by header names
 */
export function parseCSV(csvText) {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2) return [];

    // Parse a single CSV line respecting quoted fields
    function parseLine(line) {
        const fields = [];
        let current = "";
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++; // skip escaped quote
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (ch === ',' && !inQuotes) {
                fields.push(current.trim());
                current = "";
            } else {
                current += ch;
            }
        }
        fields.push(current.trim());
        return fields;
    }

    const headers = parseLine(lines[0]);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const values = parseLine(lines[i]);
        if (values.length === headers.length) {
            const row = {};
            headers.forEach((h, idx) => {
                row[h] = values[idx];
            });
            rows.push(row);
        }
    }
    return rows;
}

/**
 * Extract the relevant fields from parsed CSV rows for the expected volunteers list.
 *
 * @param {Array<Object>} csvRows - Parsed CSV row objects
 * @returns {Array<{fullName: string, email: string, firstName: string, lastName: string}>}
 */
export function extractExpectedVolunteers(csvRows) {
    return csvRows.map(row => ({
        fullName: row["Full Name"] || `${row["First Name"] || ""} ${row["Last Name"] || ""}`.trim(),
        email: row["Email"] || "",
        firstName: row["First Name"] || "",
        lastName: row["Last Name"] || "",
    })).filter(v => v.fullName || v.email);
}

/**
 * Generate a volunteer summary analysis using Gemini AI.
 * Optionally compares against an expected volunteers list from a CSV upload.
 *
 * @param {Array<{name: string, email: string, shiftDate: string, shiftTime: string, durationHours: number, checkedIn: boolean}>} records
 * @param {{startDate: string, endDate: string}} dateRange
 * @param {Array<{fullName: string, email: string, firstName: string, lastName: string}>|null} expectedVolunteers
 * @returns {Promise<{volunteers: Array, notFound: Array, stats: object}>}
 */
export async function generateVolunteerSummary(records, dateRange, expectedVolunteers = null) {
    if (!records || records.length === 0) {
        throw new Error("No volunteer records found for the selected date range.");
    }

    if (!GEMINI_API_KEY) {
        throw new Error("Gemini API key not configured. Add PUBLIC_GEMINI_API_KEY to your .env file or GitHub Secrets.");
    }

    // Build the CSV-like data string for the prompt
    const dataLines = records.map((r, i) =>
        `${i + 1}. Name: "${r.name}" | Email: "${r.email}" | Date: ${r.shiftDate} | Time: ${r.shiftTime} | Duration: ${r.durationHours}h | Checked In: ${r.checkedIn ? "Yes" : "No"}`
    ).join("\n");

    // Build expected volunteers section if provided
    let expectedSection = "";
    let expectedInstructions = "";
    let expectedJsonFields = "";

    if (expectedVolunteers && expectedVolunteers.length > 0) {
        const expectedLines = expectedVolunteers.map((v, i) =>
            `${i + 1}. Name: "${v.fullName}" | Email: "${v.email}"`
        ).join("\n");

        expectedSection = `
## Expected Volunteers List (from uploaded CSV - ${expectedVolunteers.length} people)
These are the volunteers who are EXPECTED to be volunteering. Compare their names and emails against the check-in records above.
${expectedLines}
`;

        expectedInstructions = `
5. **Expected Volunteer Matching**: For each person in the Expected Volunteers List:
   - Try to match them to check-in records using fuzzy name AND/OR email matching
   - A volunteer might check in with a slightly different name or email than what's in the expected list
   - If an expected volunteer has NO matching check-in records, include them in the "notFound" array
   - If they DO have matching records, include them in the "volunteers" array with their hours

6. **Additional Check-In Volunteers**: If there are check-in records for people NOT on the expected list, still include them in the "volunteers" array but add a note in their uncertaintyNote saying "Not on expected volunteer list"
`;

        expectedJsonFields = `
  "notFound": [
    {
      "name": "Full name from expected list",
      "email": "email from expected list",
      "note": "No matching check-in records found for this date range"
    }
  ],`;
    }

    const prompt = `You are analyzing volunteer check-in data for The Latina Sweat Project, a nonprofit organization. Your job is to identify unique volunteers from the data below, even when names or emails have typos, variations, or inconsistencies.${expectedVolunteers ? " You also need to compare check-in data against an expected volunteer list." : ""}

## Date Range
${dateRange.startDate} to ${dateRange.endDate}

## Raw Check-In Records (only count rows where Checked In = Yes)
${dataLines}
${expectedSection}
## Your Task

1. **Identity Resolution**: Group records that likely belong to the SAME person. People may:
   - Have typos in their name (e.g., "Sara" vs "Sarah", "Jon" vs "John")
   - Use different name formats (e.g., "Maria Garcia" vs "M. Garcia" vs "Maria G.")
   - Have typos in email (e.g., "jane@gmal.com" vs "jane@gmail.com")
   - Use different emails across check-ins
   - Have first/last name swapped or partial names

2. **Hour Calculation**: For each unique volunteer, calculate TWO totals:
   - **totalCheckedInHours**: Sum of hours ONLY from shifts where they were checked in (Checked In = Yes)
   - **totalRegisteredHours**: Sum of hours from ALL shifts they were registered for (both checked in and not checked in)
   This lets us see if someone is signing up for shifts but not showing up.

3. **Categorization**: Place each volunteer into one of three categories:
   - "met" = 4.0 or more total checked-in hours
   - "close" = 2.0 to 3.99 total checked-in hours (close to meeting the 4-hour requirement)
   - "under" = less than 2.0 total checked-in hours (potentially out of compliance)

4. **Uncertainty Flagging**: For any identity groupings you're uncertain about, flag them. Be honest about confidence.
${expectedInstructions}
## Required JSON Response Format

Respond with ONLY valid JSON, no markdown fences, no explanation. Use this exact structure:

{
  "volunteers": [
    {
      "primaryName": "Most likely correct full name",
      "primaryEmail": "Most likely correct email",
      "allNames": ["name variation 1", "name variation 2"],
      "allEmails": ["email1@example.com", "email2@example.com"],
      "totalCheckedInHours": 5.0,
      "totalRegisteredHours": 8.0,
      "checkedInShifts": 5,
      "totalRegisteredShifts": 8,
      "category": "met",
      "confidence": "high",
      "uncertaintyNote": null,
      "onExpectedList": ${expectedVolunteers ? "true" : "null"}
    }
  ],${expectedJsonFields}
  "stats": {
    "totalUniqueVolunteers": 10,
    "totalCheckedInHours": 50.5,
    "metCount": 5,
    "closeCount": 2,
    "underCount": 3,
    "uncertainGroupings": 1${expectedVolunteers ? ',\n    "notFoundCount": 0,\n    "expectedTotal": ' + expectedVolunteers.length : ""}
  },
  "notes": "Any general observations about data quality"
}

Confidence levels:
- "high" = very confident this is one person (exact or very similar name+email)
- "medium" = likely the same person but some ambiguity (similar name OR email but not both)
- "low" = possibly the same person, flagged for human review

IMPORTANT: Respond with ONLY the JSON object. No markdown code fences, no extra text.`;

    const requestBody = {
        contents: [{
            parts: [{
                text: prompt
            }]
        }],
        generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 65536,
            responseMimeType: "application/json"
        }
    };

    const response = await fetch(GEMINI_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("Gemini API error:", response.status, errorText);
        throw new Error(`Gemini API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    // Extract the text content from the Gemini response
    const textContent = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textContent) {
        console.error("Unexpected Gemini response structure:", data);
        throw new Error("No content in Gemini response. The model may have been blocked or returned empty.");
    }

    // Parse the JSON response - handle potential markdown fences
    let parsed;
    try {
        // Try direct parse first
        parsed = JSON.parse(textContent);
    } catch (e) {
        // Try stripping markdown code fences
        const cleaned = textContent
            .replace(/```json\s*/gi, "")
            .replace(/```\s*/g, "")
            .trim();
        try {
            parsed = JSON.parse(cleaned);
        } catch (e2) {
            // Try to recover truncated JSON by closing open structures
            console.warn("Attempting truncated JSON recovery...");
            let recovered = cleaned;
            // Count open/close braces and brackets
            const openBraces = (recovered.match(/{/g) || []).length;
            const closeBraces = (recovered.match(/}/g) || []).length;
            const openBrackets = (recovered.match(/\[/g) || []).length;
            const closeBrackets = (recovered.match(/]/g) || []).length;

            // Try to find the last complete object/array and close the rest
            // First, try to find the last complete volunteer entry
            const lastCompleteObj = recovered.lastIndexOf('},');
            if (lastCompleteObj > 0) {
                // Cut at the last complete object and close arrays/objects
                recovered = recovered.substring(0, lastCompleteObj + 1);
                // Close remaining open brackets and braces
                for (let i = 0; i < openBrackets - (recovered.match(/]/g) || []).length; i++) recovered += ']';
                for (let i = 0; i < openBraces - (recovered.match(/}/g) || []).length; i++) recovered += '}';
            }

            try {
                parsed = JSON.parse(recovered);
                console.log("Successfully recovered truncated JSON");
            } catch (e3) {
                console.error("Failed to parse Gemini response as JSON:", textContent.substring(0, 500) + "...");
                console.error("Full response length:", textContent.length);
                throw new Error("Gemini returned invalid JSON. The response may have been too large. Try a smaller date range.");
            }
        }
    }

    // Validate the response structure
    if (!parsed.volunteers || !Array.isArray(parsed.volunteers)) {
        throw new Error("Gemini response missing 'volunteers' array.");
    }

    // Ensure notFound array exists
    if (!parsed.notFound) {
        parsed.notFound = [];
    }

    // Ensure stats exist with defaults
    if (!parsed.stats) {
        parsed.stats = {
            totalUniqueVolunteers: parsed.volunteers.length,
            totalCheckedInHours: parsed.volunteers.reduce((sum, v) => sum + (v.totalCheckedInHours || 0), 0),
            metCount: parsed.volunteers.filter(v => v.category === "met").length,
            closeCount: parsed.volunteers.filter(v => v.category === "close").length,
            underCount: parsed.volunteers.filter(v => v.category === "under").length,
            uncertainGroupings: parsed.volunteers.filter(v => v.confidence !== "high").length,
            notFoundCount: parsed.notFound.length,
        };
    }

    return parsed;
}
