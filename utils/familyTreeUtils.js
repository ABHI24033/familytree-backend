import Profile from "../models/Profile.js";

// Helper: Traverse graph to find all connected profiles
export const getAllConnectedProfiles = async (startUserId) => {
    const visited = new Set();
    const queue = [startUserId.toString()];
    const profilesMap = new Map(); // Use Map to deduplicate by user ID

    // Safety break to prevent infinite loops if something goes wrong
    let iterations = 0;
    const MAX_ITERATIONS = 10000;

    while (queue.length > 0 && iterations < MAX_ITERATIONS) {
        iterations++;
        const currentId = queue.shift();

        if (visited.has(currentId)) continue;
        visited.add(currentId);

        const profile = await Profile.findOne({ user: currentId })
            .populate('user', 'firstname lastname phone email country_code avatar');

        if (!profile) continue;

        profilesMap.set(currentId, profile);

        // Add all connections to queue
        if (profile.father) queue.push(profile.father.toString());
        if (profile.mother) queue.push(profile.mother.toString());

        if (profile.partner) queue.push(profile.partner.toString());

        if (profile.sons && profile.sons.length > 0) {
            profile.sons.forEach(s => queue.push(s.toString()));
        }
        if (profile.daughters && profile.daughters.length > 0) {
            profile.daughters.forEach(d => queue.push(d.toString()));
        }
        if (profile.brothers && profile.brothers.length > 0) {
            profile.brothers.forEach(b => queue.push(b.toString()));
        }
        if (profile.sisters && profile.sisters.length > 0) {
            profile.sisters.forEach(s => queue.push(s.toString()));
        }
    }

    return Array.from(profilesMap.values());
};
