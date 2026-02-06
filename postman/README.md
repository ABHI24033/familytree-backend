# FamilyTree Auth API - Postman Collection

This directory contains Postman collection and environment files for testing the FamilyTree Authentication API.

## Files

- **FamilyTree_Auth_API.postman_collection.json** - Complete API collection with all endpoints
- **FamilyTree_Environment.postman_environment.json** - Environment variables for easy configuration

## Setup Instructions

### 1. Import Collection and Environment

1. Open Postman
2. Click **Import** button (top left)
3. Import both files:
   - `FamilyTree_Auth_API.postman_collection.json`
   - `FamilyTree_Environment.postman_environment.json`
4. Select the **FamilyTree Environment** from the environment dropdown (top right)

### 2. Configure Base URL

1. Click on the environment name (top right)
2. Click **Edit** or click on the environment name in the sidebar
3. Update `base_url` if your server is running on a different port:
   - Default: `http://localhost:8080`
   - For production: `https://your-domain.com`

## API Endpoints Overview

### 📝 Registration Flow
1. **Send OTP** - `POST /api/auth/send-otp`
   - Creates new user or updates existing unverified user
   - Returns OTP (in development mode)

2. **Verify OTP** - `POST /api/auth/verify-otp`
   - Verifies OTP and sets `is_verified=true`
   - Generates JWT tokens (access & refresh)
   - Sets HTTP-only cookies

3. **Resend OTP** - `POST /api/auth/resend-otp`
   - Resends OTP for unverified users

4. **Set Password** - `POST /api/auth/set-password`
   - Sets password after OTP verification
   - Password requirements:
     - Minimum 8 characters
     - At least one letter and one number

### 🔐 Login Flow
1. **Send OTP for Login** - `POST /api/auth/login/send-otp`
   - Requires phone and password
   - Verifies password before sending OTP

2. **Verify OTP for Login** - `POST /api/auth/login/verify-otp`
   - Verifies OTP and logs user in
   - Generates JWT tokens

3. **Resend OTP for Login** - `POST /api/auth/login/resend-otp`
   - Resends OTP (requires password verification)

### 🔑 Forgot Password Flow
1. **Send OTP for Forgot Password** - `POST /api/auth/forgot-password/send-otp`
   - Sends OTP for password reset
   - User must be verified and have password set

2. **Verify OTP for Forgot Password** - `POST /api/auth/forgot-password/verify-otp`
   - Verifies OTP for password reset

3. **Reset Password** - `POST /api/auth/forgot-password/reset`
   - Resets password after OTP verification
   - Requires: phone, OTP, new password, confirm_password

### 🔄 Session Management
1. **Refresh Token** - `POST /api/auth/refresh`
   - Refreshes access token using refresh token from cookies

2. **Logout** - `POST /api/auth/logout`
   - Clears authentication cookies

## Testing Workflows

### Complete Registration Flow
1. Run **Registration Flow → 1. Send OTP**
   - OTP is automatically saved to collection variable
2. Run **Registration Flow → 2. Verify OTP**
   - Access token is automatically saved
3. Run **Registration Flow → 4. Set Password**

### Complete Login Flow
1. Run **Login Flow → 1. Send OTP for Login**
   - Login OTP is automatically saved
2. Run **Login Flow → 2. Verify OTP for Login**
   - Access token is automatically saved

### Complete Forgot Password Flow
1. Run **Forgot Password Flow → 1. Send OTP for Forgot Password**
   - Reset OTP is automatically saved
2. Run **Forgot Password Flow → 2. Verify OTP for Forgot Password**
3. Run **Forgot Password Flow → 3. Reset Password**

## Automatic Variable Management

The collection includes test scripts that automatically:
- Save OTP values to collection variables (`otp`, `loginOtp`, `resetOtp`)
- Save access tokens to collection variables (`accessToken`)
- These variables are used in subsequent requests automatically

## Request Body Examples

### Send OTP
```json
{
    "firstname": "John",
    "lastname": "Doe",
    "country_code": "+91",
    "phone": "9876543210"
}
```

### Verify OTP
```json
{
    "phone": "9876543210",
    "otp": "1234"
}
```

### Set Password
```json
{
    "phone": "9876543210",
    "password": "Password123",
    "confirm_password": "Password123"
}
```

### Login Send OTP
```json
{
    "phone": "9876543210",
    "password": "Password123"
}
```

### Reset Password
```json
{
    "phone": "9876543210",
    "otp": "1234",
    "password": "NewPassword123",
    "confirm_password": "NewPassword123"
}
```

## Response Format

All endpoints return responses in the following format:

### Success Response
```json
{
    "success": true,
    "message": "Operation successful",
    "data": { ... }  // Optional
}
```

### Error Response
```json
{
    "success": false,
    "message": "Error message"
}
```

## Notes

- **OTP in Development**: In development mode (`NODE_ENV=development`), OTP is returned in the response for testing purposes
- **Cookies**: Access and refresh tokens are set as HTTP-only cookies automatically
- **Phone Validation**: Phone must be exactly 10 digits
- **Password Requirements**: Minimum 8 characters with at least one letter and one number

## Troubleshooting

1. **OTP not saving**: Check that test scripts are enabled in Postman settings
2. **Cookies not working**: Ensure cookies are enabled in Postman settings
3. **Connection refused**: Verify server is running on the configured port
4. **401 Unauthorized**: Check if refresh token is still valid (expires in 7 days)

