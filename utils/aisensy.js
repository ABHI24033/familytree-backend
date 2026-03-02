import axios from "axios";

/**
 * Sends an OTP via WhatsApp using AiSensy API
 * @param {string} mobile - Mobile number without country code (e.g., "8210920357")
 * @param {string} otp - The OTP to send
 * @returns {Promise<Object>} - The API response data
 */
export const sendWhatsAppOtp = async (mobile, otp) => {
    try {
        if (process.env.NODE_ENV === "development") {
            console.log(`[DEV MODE] Skipping WhatsApp OTP for ${mobile}. Local OTP: ${otp}`);
            return { success: true, message: "Bypassed in development" };
        }
        // Ensure destination format: 91 + mobile (assuming India as per prompt)
        const destination = mobile.startsWith("91") ? mobile : `91${mobile}`;

        const payload = {
            apiKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5NDE4YjI0NTliYTM2NGE1NDQ0ZTNhZCIsIm5hbWUiOiJTYW55b2phbiIsImFwcE5hbWUiOiJBaVNlbnN5IiwiY2xpZW50SWQiOiI2OTQxOGIyNDU5YmEzNjRhNTQ0NGUzYTgiLCJhY3RpdmVQbGFuIjoiRlJFRV9GT1JFVkVSIiwiaWF0IjoxNzY1OTAzMTQwfQ.CQmxvkYUH7xPxcnXXa2cOUyqMYMxHQ44wk1pFA6QsPI",
            campaignName: "sanyojanotp",
            destination: destination,
            userName: "Sanyojan",
            templateParams: [otp],
            source: "new-landing-page form",
            media: {},
            buttons: [
                {
                    type: "button",
                    sub_type: "url",
                    index: 0,
                    parameters: [
                        {
                            type: "text",
                            text: otp
                        }
                    ]
                }
            ],
            carouselCards: [],
            location: {},
            attributes: {},
            paramsFallbackValue: {
                FirstName: "user"
            }
        };

        const response = await axios.post(
            "https://backend.aisensy.com/campaign/t1/api/v2",
            payload,
            {
                headers: {
                    "Content-Type": "application/json"
                }
            }
        );

        console.log("AiSensy Response:", response.data);
        return response.data;
    } catch (error) {
        console.error(
            "AiSensy Error:",
            error.response?.data || error.message
        );
        throw error;
    }
};

/**
 * Sends an event invitation WITH FAMILY via WhatsApp using AiSensy API
 * Template: "Dear [Name], You are cordially invited to join us for Marriage of [Event Name] on [Date of Event], at [Location].
 *           We kindly request you to grace the occasion with your Family. You can confirm with this [Event Link]. RSVP: [Admin Name] Regards"
 * @param {Object} recipient - { country_code, phone, name }
 * @param {Object} eventData - { eventName, eventDate, eventLocation, eventLink, adminName }
 * @returns {Promise<Object>} - The API response data
 */
export const sendWhatsAppEventInviteWithFamily = async (recipient, eventData) => {
    try {
        const apiKey = process.env.WHATSAPP_API_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5NDE4YjI0NTliYTM2NGE1NDQ0ZTNhZCIsIm5hbWUiOiJTYW55b2phbiIsImFwcE5hbWUiOiJBaVNlbnN5IiwiY2xpZW50SWQiOiI2OTQxOGIyNDU5YmEzNjRhNTQ0NGUzYTgiLCJhY3RpdmVQbGFuIjoiRlJFRV9GT1JFVkVSIiwiaWF0IjoxNzY1OTAzMTQwfQ.CQmxvkYUH7xPxcnXXa2cOUyqMYMxHQ44wk1pFA6QsPI";
        const campaignName = process.env.AISENSY_CAMPAIGN_WITH_FAMILY || "sanyojan_event_family";

        const phoneWithCountryCode = `${recipient.country_code ? recipient.country_code.replace('+', '') : '91'}${recipient.phone}`;
        const guestName = recipient.name || 'user';
        console.log(phoneWithCountryCode);
        console.log(eventData);
        console.log(campaignName);


        const payload = {
            apiKey: apiKey,
            campaignName: campaignName,
            destination: String(phoneWithCountryCode),
            userName: "Sanyojan",
            templateParams: [
                guestName,                              // [Name] - greeting
                eventData.eventName || 'Event',        // [Event Name]
                eventData.eventDate || 'TBD',          // [Date of Event]
                eventData.eventLocation || 'TBD',      // [Location]
                eventData.eventLink || '',             // [Event Link]
                eventData.adminName || 'Host'          // [Admin Name / RSVP]
            ],
            source: "new-landing-page form",
            media: {},
            buttons: [],
            carouselCards: [],
            location: {},
            attributes: {},
            paramsFallbackValue: {
                FirstName: "user"
            }
        };

        const response = await axios.post(
            "https://backend.aisensy.com/campaign/t1/api/v2",
            payload,
            {
                headers: {
                    "Content-Type": "application/json"
                }
            }
        );

        console.log(`[AiSensy WithFamily] Sent to ${recipient.phone}:`, response.data);
        return response.data;
    } catch (error) {
        console.error(
            `[AiSensy WithFamily] Failed to ${recipient.phone}:`,
            error.response?.data || error.message
        );
        throw error;
    }
};

/**
 * Sends an event invitation WITHOUT FAMILY via WhatsApp using AiSensy API
 * Template: "Dear [Name], You are cordially invited to join us for [Event Name] on [Date], at [Location].
 *           We kindly request you to grace the occasion with your presence. Please use this link [Event Link] for confirmation. RSVP: [Admin Name] See You There!!"
 * @param {Object} recipient - { country_code, phone, name }
 * @param {Object} eventData - { eventName, eventDate, eventLocation, eventLink, adminName }
 * @returns {Promise<Object>} - The API response data
 */
export const sendWhatsAppEventInviteWithoutFamily = async (recipient, eventData) => {
    try {
        const apiKey = process.env.WHATSAPP_API_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5NDE4YjI0NTliYTM2NGE1NDQ0ZTNhZCIsIm5hbWUiOiJTYW55b2phbiIsImFwcE5hbWUiOiJBaVNlbnN5IiwiY2xpZW50SWQiOiI2OTQxOGIyNDU5YmEzNjRhNTQ0NGUzYTgiLCJhY3RpdmVQbGFuIjoiRlJFRV9GT1JFVkVSIiwiaWF0IjoxNzY1OTAzMTQwfQ.CQmxvkYUH7xPxcnXXa2cOUyqMYMxHQ44wk1pFA6QsPI";
        const campaignName = process.env.AISENSY_CAMPAIGN_WITHOUT_FAMILY || "sanyojan_event_without_family";

        const phoneWithCountryCode = `${recipient.country_code ? recipient.country_code.replace('+', '') : '91'}${recipient.phone}`;
        const guestName = recipient.name || 'user';

        const payload = {
            apiKey: apiKey,
            campaignName: campaignName,
            destination: String(phoneWithCountryCode),
            userName: "Sanyojan",
            templateParams: [
                guestName,                              // [Name] - greeting
                eventData.eventName || 'Event',        // [Event Name]
                eventData.eventDate || 'TBD',          // [Date of Event]
                eventData.eventLocation || 'TBD',      // [Location]
                eventData.eventLink || '',             // [Event Link]
                eventData.adminName || 'Host'          // [Admin Name / RSVP]
            ],
            source: "new-landing-page form",
            media: {},
            buttons: [],
            carouselCards: [],
            location: {},
            attributes: {},
            paramsFallbackValue: {
                FirstName: "user"
            }
        };

        const response = await axios.post(
            "https://backend.aisensy.com/campaign/t1/api/v2",
            payload,
            {
                headers: {
                    "Content-Type": "application/json"
                }
            }
        );

        console.log(`[AiSensy WithoutFamily] Sent to ${recipient.phone}:`, response.data);
        return response.data;
    } catch (error) {
        console.error(
            `[AiSensy WithoutFamily] Failed to ${recipient.phone}:`,
            error.response?.data || error.message
        );
        throw error;
    }
};

/**
 * Sends a THANK YOU message via WhatsApp after someone RSVPs
 * Template: "Dear [Name], Thank you for your response for [Event Name]! We are excited to see you there. Regards, [Admin Name]"
 * @param {Object} recipient - { phone, name }
 * @param {Object} eventData - { eventName, adminName }
 * @returns {Promise<Object>}
 */
export const sendWhatsAppRSVPThankYou = async (recipient, eventData) => {
    try {
        const apiKey = process.env.WHATSAPP_API_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5NDE4YjI0NTliYTM2NGE1NDQ0ZTNhZCIsIm5hbWUiOiJTYW55b2phbiIsImFwcE5hbWUiOiJBaVNlbnN5IiwiY2xpZW50SWQiOiI2OTQxOGIyNDU5YmEzNjRhNTQ0NGUzYTgiLCJhY3RpdmVQbGFuIjoiRlJFRV9GT1JFVkVSIiwiaWF0IjoxNzY1OTAzMTQwfQ.CQmxvkYUH7xPxcnXXa2cOUyqMYMxHQ44wk1pFA6QsPI";
        const campaignName = process.env.AISENSY_CAMPAIGN_THANK_YOU || "sanyojan_rsvp_thanks"; // Assuming a name

        const phoneWithCountryCode = `91${recipient.phone.replace(/^91/, '')}`;
        const guestName = recipient.name || 'user';

        const payload = {
            apiKey: apiKey,
            campaignName: campaignName,
            destination: String(phoneWithCountryCode),
            userName: "Sanyojan",
            templateParams: [
                guestName,
                eventData.eventName || 'Event',
                eventData.adminName || 'Host'
            ],
            source: "rsvp-form",
            media: {},
            buttons: [],
            carouselCards: [],
            location: {},
            attributes: {},
            paramsFallbackValue: {
                FirstName: "user"
            }
        };

        const response = await axios.post(
            "https://backend.aisensy.com/campaign/t1/api/v2",
            payload,
            {
                headers: {
                    "Content-Type": "application/json"
                }
            }
        );

        console.log(`[AiSensy ThankYou] Sent to ${recipient.phone}:`, response.data);
        return response.data;
    } catch (error) {
        console.error(
            `[AiSensy ThankYou] Failed to ${recipient.phone}:`,
            error.response?.data || error.message
        );
        throw error;
    }
};
