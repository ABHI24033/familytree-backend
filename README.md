# familytree_backend

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# MongoDB
MONGO_URI=your_mongodb_connection_string

# Cloudinary (for image uploads)
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
```

### Setting up Cloudinary

1. Sign up for a free account at [Cloudinary](https://cloudinary.com/)
2. Go to your Dashboard
3. Copy your `Cloud Name`, `API Key`, and `API Secret`
4. Add them to your `.env` file

## Profile Picture Upload

The profile picture upload feature uses Cloudinary for image storage. When creating or updating a profile:

- Upload a file with the field name `profilePicture` using `multipart/form-data`
- The image will be automatically:
  - Uploaded to Cloudinary
  - Resized to 500x500px with face detection
  - Optimized for web delivery
  - Stored in the `familytree/profiles` folder
- The Cloudinary URL will be saved in the database

### File Requirements:
- Maximum file size: 5MB
- Accepted formats: All image types (JPEG, PNG, GIF, WebP, etc.)