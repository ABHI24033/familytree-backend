import nodemailer from 'nodemailer';

// Create transporter with ZeptoMail configuration
const createTransporter = () => {
    return nodemailer.createTransport({
        host: "smtp.zeptomail.in",
        port: 587,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });
};

// Generate professional email template
const generateFamilyMemberEmail = (addedByName, relationship, familyMemberName, loginDetails) => {
    // Map relationship to readable format
    const relationshipMap = {
        'father': 'their Father',
        'mother': 'their Mother',
        'brother': 'their Brother',
        'sister': 'their Sister',
        'partner': 'their Partner',
        'son': 'their Son',
        'daughter': 'their Daughter'
    };

    const readableRelationship = relationshipMap[relationship] || relationship;

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to Sanyojan Family Tree</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 40px 0; text-align: center;">
                <table role="presentation" style="width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 10px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
                    <!-- Header with Logo -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
                            <img src="https://res.cloudinary.com/dote0aphl/image/upload/v1763943182/familytree/general/nhlf2p6564piukyyulzc.png" alt="Sanyojan Logo" style="max-width: 180px; height: auto; margin-bottom: 20px;" />
                            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">Welcome to Your Family Tree</h1>
                        </td>
                    </tr>
                    
                    <!-- Main Content -->
                    <tr>
                        <td style="padding: 40px 30px;">
                            <h2 style="color: #333333; margin: 0 0 20px 0; font-size: 22px;">Hello ${familyMemberName}! 👋</h2>
                            
                            <p style="color: #555555; line-height: 1.6; font-size: 16px; margin: 0 0 20px 0;">
                                We're excited to let you know that <strong style="color: #667eea;">${addedByName}</strong> has added you to their family tree on <strong>Sanyojan</strong> as <strong>${readableRelationship}</strong>.
                            </p>
                            
                            <p style="color: #555555; line-height: 1.6; font-size: 16px; margin: 0 0 30px 0;">
                                Sanyojan is a comprehensive platform designed to help families stay connected, preserve their heritage, and celebrate their bonds across generations.
                            </p>

                            ${loginDetails ? `
                            <div style="background-color: #eef2ff; border-left: 4px solid #667eea; padding: 20px; border-radius: 6px; margin-bottom: 30px;">
                                <h3 style="color: #333; margin: 0 0 15px 0; font-size: 18px;">Your Sanyojan Login Details</h3>
                                <p style="color: #555; margin: 0 0 10px 0; font-size: 15px;">
                                    Use the following credentials to access your account:
                                </p>
                                <div style="display: flex; flex-direction: column; gap: 8px; font-size: 15px; color: #333;">
                                    <div><strong>Phone:</strong> ${loginDetails.phone}</div>
                                    <div><strong>Temporary Password:</strong> ${loginDetails.password}</div>
                                </div>
                                <p style="color: #777; font-size: 13px; margin: 15px 0 0 0;">
                                    For your security, please sign in and update your password after your first login.
                                </p>
                            </div>
                            ` : ''}
                            
                            <!-- Features Section -->
                            <div style="background-color: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; margin: 0 0 30px 0; border-radius: 4px; display: flex;flex-direction: column;align-items: flex-start;">
                                <h3 style="color: #333333; margin: 0 0 15px 0; font-size: 18px;">What You Can Do on Sanyojan:</h3>
                                <ul style="color: #555555; line-height: 1.8; font-size: 15px; margin: 0; padding-left: 20px; display: contents; list-style-type: none;">
                                    <li>View and explore your complete family tree</li>
                                    <li>Connect with family members</li>
                                    <li>Share photos, stories, and memories</li>
                                    <li>Preserve your family's history for future generations</li>
                                </ul>
                            </div>
                            
                            <!-- Call to Action Button -->
                            <table role="presentation" style="margin: 0 auto;">
                                <tr>
                                    <td style="text-align: center; padding: 20px 0;">
                                        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}" target="_blank" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; padding: 15px 40px; text-decoration: none; border-radius: 30px; font-size: 16px; font-weight: 600; display: inline-block; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);">
                                            View Your Family Tree
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            
                            <p style="color: #777777; line-height: 1.6; font-size: 14px; margin: 30px 0 0 0; text-align: center;">
                                If you have any questions or need assistance, feel free to reach out to our support team.
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e9ecef;">
                            <p style="color: #999999; font-size: 13px; margin: 0 0 10px 0;">
                                &copy; ${new Date().getFullYear()} Sanyojan. All rights reserved.
                            </p>
                            <p style="color: #999999; font-size: 12px; margin: 0;">
                                This email was sent because you were added to a family tree on Sanyojan.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
  `.trim();
};

// Send email to newly added family member
export const sendFamilyMemberWelcomeEmail = async (memberEmail, addedByName, relationship, familyMemberName, loginDetails) => {
    try {
        const transporter = createTransporter();

        const mailOptions = {
            from: `"Sanyojan Family Tree" <${process.env.EMAIL_USER}>`,
            to: memberEmail,
            subject: `${addedByName} added you to their Family Tree on Sanyojan`,
            html: generateFamilyMemberEmail(addedByName, relationship, familyMemberName, loginDetails)
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('✉️ Welcome email sent successfully to:', memberEmail);
        console.log('Message ID:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Error sending welcome email:', error);
        // Don't throw error - we don't want email failure to break the family member addition
        return { success: false, error: error.message };
    }
};

// Generate welcome email template for new user
const generateWelcomeEmail = (name) => {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to Sanyojan Family Tree</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 40px 0; text-align: center;">
                <table role="presentation" style="width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 10px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
                    <!-- Header with Logo -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
                            <img src="https://res.cloudinary.com/dote0aphl/image/upload/v1763943182/familytree/general/nhlf2p6564piukyyulzc.png" alt="Sanyojan Logo" style="max-width: 180px; height: auto; margin-bottom: 20px;" />
                            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">Welcome to Sanyojan!</h1>
                        </td>
                    </tr>
                    
                    <!-- Main Content -->
                    <tr>
                        <td style="padding: 40px 30px;">
                            <h2 style="color: #333333; margin: 0 0 20px 0; font-size: 22px;">Hello ${name}! 👋</h2>
                            
                            <p style="color: #555555; line-height: 1.6; font-size: 16px; margin: 0 0 20px 0;">
                                We're thrilled to have you join <strong>Sanyojan</strong>, the place where families come together.
                            </p>
                            
                            <p style="color: #555555; line-height: 1.6; font-size: 16px; margin: 0 0 30px 0;">
                                Your profile has been successfully created. You can now start building your family tree, connecting with relatives, and preserving your family's precious memories.
                            </p>
                            
                            <!-- Features Section -->
                            <div style="background-color: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; margin: 0 0 30px 0; border-radius: 4px;">
                                <h3 style="color: #333333; margin: 0 0 15px 0; font-size: 18px;">Get Started:</h3>
                                <ul style="color: #555555; line-height: 1.8; font-size: 15px; margin: 0; padding-left: 20px; list-style-type: disc;">
                                    <li style="margin-bottom: 5px;">Complete your profile details</li>
                                    <li style="margin-bottom: 5px;">Add family members to your tree</li>
                                    <li style="margin-bottom: 5px;">Invite relatives to join</li>
                                </ul>
                            </div>
                            
                            <!-- Call to Action Button -->
                            <table role="presentation" style="margin: 0 auto;">
                                <tr>
                                    <td style="text-align: center; padding: 20px 0;">
                                        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}" target="_blank" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; padding: 15px 40px; text-decoration: none; border-radius: 30px; font-size: 16px; font-weight: 600; display: inline-block; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);">
                                            Go to My Profile
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            
                             <p style="color: #777777; line-height: 1.6; font-size: 14px; margin: 30px 0 0 0; text-align: center;">
                                If you have any questions, our support team is here to help.
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e9ecef;">
                            <p style="color: #999999; font-size: 13px; margin: 0 0 10px 0;">
                                &copy; ${new Date().getFullYear()} Sanyojan. All rights reserved.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
  `.trim();
};

// Send welcome email to new user
export const sendWelcomeEmail = async (email, name) => {
    try {
        const transporter = createTransporter();

        const mailOptions = {
            from: `"Sanyojan Family Tree" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: `Welcome to Sanyojan!`,
            html: generateWelcomeEmail(name)
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('✉️ Welcome email sent successfully to:', email);
        console.log('Message ID:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Error sending welcome email:', error);
        return { success: false, error: error.message };
    }
};

export default { sendFamilyMemberWelcomeEmail, sendWelcomeEmail };

