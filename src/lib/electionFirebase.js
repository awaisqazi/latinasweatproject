// Election Firebase Configuration for LSP Junior Board Elections
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, getDoc, setDoc, deleteDoc, doc, query, where, serverTimestamp, orderBy, onSnapshot } from "firebase/firestore";

// Firebase configuration for lspelections project
const firebaseConfig = {
    apiKey: "AIzaSyBbvLJMOAXwPSIpVa3lwnbCxIqRweTOp3k",
    authDomain: "lspelections.firebaseapp.com",
    projectId: "lspelections",
    storageBucket: "lspelections.firebasestorage.app",
    messagingSenderId: "171467040348",
    appId: "1:171467040348:web:53c3769f0e2eb4b4bd2899"
};

// Initialize Firebase with unique name to avoid conflicts with other Firebase instances
const app = initializeApp(firebaseConfig, "electionApp");
export const db = getFirestore(app);

// Collection reference
const votesCollection = collection(db, "votes");

/**
 * Check if an email has already voted
 * @param {string} email - Voter's email address
 * @returns {Promise<boolean>} - True if already voted
 */
export async function hasAlreadyVoted(email) {
    const q = query(votesCollection, where("email", "==", email.toLowerCase().trim()));
    const snapshot = await getDocs(q);
    return !snapshot.empty;
}

/**
 * Submit a vote to the database
 * @param {Object} voteData - The vote data containing voter info and selections
 * @returns {Promise<{success: boolean, error?: string, id?: string}>}
 */
export async function submitVote(voteData) {
    try {
        // Check for duplicate vote
        const alreadyVoted = await hasAlreadyVoted(voteData.email);
        if (alreadyVoted) {
            return { success: false, error: "This email address has already submitted a vote." };
        }

        // Add vote to database
        const docRef = await addDoc(votesCollection, {
            ...voteData,
            email: voteData.email.toLowerCase().trim(),
            submittedAt: serverTimestamp(),
            submittedAtLocal: new Date().toISOString()
        });

        return { success: true, id: docRef.id };
    } catch (error) {
        console.error("Error submitting vote:", error);
        return { success: false, error: "Failed to submit vote. Please try again." };
    }
}

/**
 * Get all votes (for admin dashboard)
 * @returns {Promise<Array>} - Array of vote documents
 */
export async function getAllVotes() {
    try {
        const q = query(votesCollection, orderBy("submittedAtLocal", "desc"));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error("Error fetching votes:", error);
        return [];
    }
}

/**
 * Subscribe to real-time vote updates (for admin dashboard)
 * @param {function} callback - Function to call when votes change
 * @returns {function} - Unsubscribe function
 */
export function subscribeToVotes(callback) {
    const q = query(votesCollection, orderBy("submittedAtLocal", "desc"));
    return onSnapshot(q, (snapshot) => {
        const votes = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        callback(votes);
    }, (error) => {
        console.error("Error in votes subscription:", error);
        callback([]);
    });
}

/**
 * Delete a vote by ID (for admin)
 * @param {string} voteId - The document ID to delete
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteVote(voteId) {
    try {
        await deleteDoc(doc(db, "votes", voteId));
        return { success: true };
    } catch (error) {
        console.error("Error deleting vote:", error);
        return { success: false, error: "Failed to delete vote." };
    }
}

/**
 * Get vote tallies for all roles
 * @param {Array} votes - Array of vote documents
 * @returns {Object} - Tallies organized by role and candidate
 */
export function calculateTallies(votes) {
    const roles = ['secretary', 'treasurer', 'vicePresident', 'president'];
    const tallies = {};

    roles.forEach(role => {
        tallies[role] = {};
    });

    votes.forEach(vote => {
        roles.forEach(role => {
            const selection = vote[role];
            if (selection) {
                tallies[role][selection] = (tallies[role][selection] || 0) + 1;
            }
        });
    });

    return tallies;
}

/**
 * Check if voting is currently open based on schedule
 * @returns {{isOpen: boolean, message: string, isScheduled: boolean}}
 */
export function getScheduledVotingStatus() {
    const now = new Date();
    // Scheduled voting period: Dec 9, 2025 00:00 to Dec 10, 2025 23:59 CST
    const votingStart = new Date('2025-12-09T00:00:00-06:00');
    const votingEnd = new Date('2025-12-10T23:59:59-06:00');

    if (now < votingStart) {
        return {
            isOpen: false,
            message: `Voting opens on December 9th, 2025 at 12:00 AM CST.`,
            isScheduled: false
        };
    }

    if (now > votingEnd) {
        return {
            isOpen: false,
            message: `Voting has closed as of December 10th, 2025 at 11:59 PM.`,
            isScheduled: false
        };
    }

    return {
        isOpen: true,
        message: `Voting is open until December 10th at 11:59 PM CST.`,
        isScheduled: true
    };
}

/**
 * Get voting period override settings from Firebase
 * @returns {Promise<{override: string|null, updatedAt: string|null}>}
 * override can be: 'open', 'closed', or null (use schedule)
 */
export async function getVotingPeriodSettings() {
    try {
        const settingsDoc = await getDoc(doc(db, "settings", "votingPeriod"));
        if (settingsDoc.exists()) {
            return settingsDoc.data();
        }
        return { override: null, updatedAt: null };
    } catch (error) {
        console.error("Error fetching voting period settings:", error);
        return { override: null, updatedAt: null };
    }
}

/**
 * Set voting period override
 * @param {string|null} override - 'open', 'closed', or null for auto
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function setVotingPeriodOverride(override) {
    try {
        await setDoc(doc(db, "settings", "votingPeriod"), {
            override: override,
            updatedAt: new Date().toISOString()
        });
        return { success: true };
    } catch (error) {
        console.error("Error setting voting period override:", error);
        return { success: false, error: "Failed to update voting period settings." };
    }
}

/**
 * Subscribe to voting period settings for real-time updates
 * @param {function} callback - Function to call when settings change
 * @returns {function} - Unsubscribe function
 */
export function subscribeToVotingPeriod(callback) {
    return onSnapshot(doc(db, "settings", "votingPeriod"), (docSnapshot) => {
        if (docSnapshot.exists()) {
            callback(docSnapshot.data());
        } else {
            callback({ override: null, updatedAt: null });
        }
    }, (error) => {
        console.error("Error in voting period subscription:", error);
        callback({ override: null, updatedAt: null });
    });
}

/**
 * Check if voting is currently open (considers both schedule and override)
 * @returns {Promise<{isOpen: boolean, message: string, status: string}>}
 * status can be: 'scheduled', 'manual-open', 'manual-closed', 'before-period', 'after-period'
 */
export async function isVotingOpen() {
    const scheduled = getScheduledVotingStatus();
    const settings = await getVotingPeriodSettings();

    // If there's a manual override, use it
    if (settings.override === 'open') {
        return {
            isOpen: true,
            message: `Voting is open (manually enabled by admin).`,
            status: 'manual-open'
        };
    }

    if (settings.override === 'closed') {
        return {
            isOpen: false,
            message: `Voting is currently closed. Please check back later.`,
            status: 'manual-closed'
        };
    }

    // No override, use scheduled status
    if (scheduled.isOpen) {
        return {
            isOpen: true,
            message: scheduled.message,
            status: 'scheduled'
        };
    }

    return {
        isOpen: false,
        message: scheduled.message,
        status: new Date() < new Date('2025-12-09T00:00:00-06:00') ? 'before-period' : 'after-period'
    };
}
