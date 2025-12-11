import { writable, derived } from 'svelte/store';
import { collection, onSnapshot, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../lib/galaFirebase';

// Internal stores
const donationsStore = writable([]);
const guestsStore = writable({}); // Map: paddleNumber -> fullName

// Subscribe to donations (Real-time)
// We'll export a function to initialize listeners to avoid side effects on import if needed,
// but for a singleton app store, running it top-level is often acceptable.
// However, to be safe with SSR/Astro, we should probably check if we are in the browser or just let it run.
// Given the context, let's start subscriptions immediately but handle cleanup if we were to wrap this.
// For simplicity in this specific task, we'll just start them.

if (typeof window !== 'undefined') {
    const donationsQuery = query(collection(db, 'gala_donations'), orderBy('timestamp', 'desc'));
    onSnapshot(donationsQuery, (snapshot) => {
        const donations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        donationsStore.set(donations);
    });

    // Fetch guests (One-time or Real-time)
    // Using onSnapshot for guests too, just in case of last minute changes/additions
    const guestsCollection = collection(db, 'gala_guests');
    onSnapshot(guestsCollection, (snapshot) => {
        const guestsMap = {};
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            // Assuming paddleNumber is a string or number in the DB. Key by it.
            if (data.paddleNumber) {
                guestsMap[data.paddleNumber] = `${data.firstName || ''} ${data.lastName || ''}`.trim();
            }
        });
        guestsStore.set(guestsMap);
    });
}

// Derived Stores

// 1. Total Raised
export const totalRaised = derived(donationsStore, ($donations) => {
    return $donations.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
});

// 2. Progress Percentage
export const progressPercentage = derived(totalRaised, ($total) => {
    const goal = 75000;
    const percent = ($total / goal) * 100;
    return Math.min(percent, 100); // Cap at 100 for the bar, but UI can show text if higher
});

// 3. Recent Donations (Top 10 most recent, excluding hidden/ticket sales)
// Donations are already sorted by timestamp desc from the query, but let's be safe
export const recentDonations = derived([donationsStore, guestsStore], ([$donations, $guests]) => {
    return $donations
        .filter(d => !d.hidden) // Exclude hidden donations (ticket sales)
        .slice(0, 10)
        .map(d => ({
            ...d,
            donorName: d.paddleNumber && $guests[d.paddleNumber] ? $guests[d.paddleNumber] : (d.donorName || 'Anonymous')
        }));
});

// 4. Top Donors (Top 5 by total contribution, excluding hidden/ticket sales)
export const topDonors = derived([donationsStore, guestsStore], ([$donations, $guests]) => {
    const donorTotals = {};

    // Filter out hidden donations (ticket sales) from leaderboard
    $donations.filter(d => !d.hidden).forEach(d => {
        // Group by paddleNumber if available, otherwise fallback to donorName or 'Anonymous'
        // If paddleNumber exists, we use it as the key to aggregate
        const key = d.paddleNumber || d.donorName || 'Anonymous';
        if (!donorTotals[key]) {
            donorTotals[key] = {
                amount: 0,
                name: d.paddleNumber && $guests[d.paddleNumber] ? $guests[d.paddleNumber] : (d.donorName || 'Anonymous'),
                paddleNumber: d.paddleNumber
            };
        }
        donorTotals[key].amount += (Number(d.amount) || 0);
    });

    return Object.values(donorTotals)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);
});

// Export raw stores if needed, but usually derived is enough
export const donations = donationsStore;
export const guests = guestsStore;
