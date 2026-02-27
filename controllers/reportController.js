import Profile from "../models/Profile.js";
import User from "../models/User.js";

/**
 * Filter members based on various criteria
 * GET /api/reports/members
 */
export const getMemberReport = async (req, res, next) => {
    try {
        const {
            ageMin,
            ageMax,
            gender, // Array
            marital_status, // Array
            city, // Array
            state, // Array
            dobStart,
            dobEnd,
            anniversaryStart,
            anniversaryEnd,
            jobCategory, // Array
            foodPreference, // Array
            bloodGroup, // Array
            page = 1,
            limit = 10
        } = req.query;

        const query = {};

        // 1. Age Range
        if (ageMin || ageMax) {
            query.age = {};
            if (ageMin) query.age.$gte = parseInt(ageMin);
            if (ageMax) query.age.$lte = parseInt(ageMax);
        }

        // 2. Arrays (Multi-select)
        if (gender) query.gender = { $in: Array.isArray(gender) ? gender : [gender] };
        if (marital_status) query.marital_status = { $in: Array.isArray(marital_status) ? marital_status : [marital_status] };
        if (city) query.city = { $in: Array.isArray(city) ? city : [city] };
        if (state) query.state = { $in: Array.isArray(state) ? state : [state] };
        if (jobCategory) query.jobCategory = { $in: Array.isArray(jobCategory) ? jobCategory : [jobCategory] };
        if (foodPreference) query.foodPreference = { $in: Array.isArray(foodPreference) ? foodPreference : [foodPreference] };
        if (bloodGroup) query.bloodGroup = { $in: Array.isArray(bloodGroup) ? bloodGroup : [bloodGroup] };

        // 3. Date Ranges
        if (dobStart || dobEnd) {
            query.dob = {};
            if (dobStart) query.dob.$gte = new Date(dobStart);
            if (dobEnd) query.dob.$lte = new Date(dobEnd);
        }

        if (anniversaryStart || anniversaryEnd) {
            query.marriageDate = {};
            if (anniversaryStart) query.marriageDate.$gte = new Date(anniversaryStart);
            if (anniversaryEnd) query.marriageDate.$lte = new Date(anniversaryEnd);
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [members, total] = await Promise.all([
            Profile.find(query)
                .populate('user', 'firstname lastname phone')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            Profile.countDocuments(query)
        ]);

        // Format for frontend
        const formattedData = members.map(m => ({
            _id: m._id,
            name: `${m.user?.firstname || ''} ${m.user?.lastname || ''}`.trim(),
            phoneNo: m.user?.phone || '-',
            whatsappNo: m.whatsappNo || '-',
            city: m.city,
            state: m.state,
            age: m.age,
            gender: m.gender
        }));

        return res.status(200).json({
            success: true,
            data: formattedData,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error("Get Member Report Error:", error);
        next(error);
    }
};

/**
 * Get unique values for filter metadata
 * GET /api/reports/metadata
 */
export const getMemberReportMetadata = async (req, res, next) => {
    try {
        const [cities, states, jobCategories] = await Promise.all([
            Profile.distinct("city", { city: { $ne: null, $ne: "" } }),
            Profile.distinct("state", { state: { $ne: null, $ne: "" } }),
            Profile.distinct("jobCategory", { jobCategory: { $ne: null, $ne: "" } })
        ]);

        return res.status(200).json({
            success: true,
            data: {
                cities: cities.sort(),
                states: states.sort(),
                jobCategories: jobCategories.sort()
            }
        });
    } catch (error) {
        next(error);
    }
};
