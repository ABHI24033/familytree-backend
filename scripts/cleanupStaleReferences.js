import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import Profile from '../models/Profile.js';

dotenv.config();

const cleanup = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const users = await User.find({}, { _id: 1 });
        const userIds = new Set(users.map(u => u._id.toString()));
        console.log(`Found ${userIds.size} total users`);

        const profiles = await Profile.find({});
        console.log(`Checking ${profiles.length} profiles for stale references...`);

        let totalFixed = 0;
        let totalDeleted = 0;

        for (const profile of profiles) {
            // Check if the user itself exists
            if (!profile.user || !userIds.has(profile.user.toString())) {
                console.log(`Deleting zombie profile ${profile._id}: User ${profile.user} not found`);
                await Profile.findByIdAndDelete(profile._id);
                totalDeleted++;
                continue;
            }

            let changed = false;

            // Check single references
            const singleRefs = ['father', 'mother', 'partner', 'guardian'];
            for (const field of singleRefs) {
                if (profile[field] && !userIds.has(profile[field].toString())) {
                    console.log(`Fixed stale ${field} in profile ${profile._id}: ${profile[field]} -> null`);
                    profile[field] = null;
                    changed = true;
                }
            }

            // Check array references
            const arrayRefs = ['brothers', 'sisters', 'sons', 'daughters'];
            for (const field of arrayRefs) {
                if (profile[field] && profile[field].length > 0) {
                    const originalLength = profile[field].length;
                    profile[field] = profile[field].filter(id => userIds.has(id.toString()));
                    if (profile[field].length !== originalLength) {
                        console.log(`Fixed stale ${field} in profile ${profile._id}: removed ${originalLength - profile[field].length} IDs`);
                        changed = true;
                    }
                }
            }

            if (changed) {
                await profile.save();
                totalFixed++;
            }
        }

        console.log(`Cleanup complete. Fixed ${totalFixed} profiles, deleted ${totalDeleted} zombie profiles.`);
        process.exit(0);
    } catch (err) {
        console.error('Cleanup failed:', err);
        process.exit(1);
    }
};

cleanup();
