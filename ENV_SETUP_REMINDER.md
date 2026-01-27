# ⚠️ Environment Variables Setup Reminder

## ✅ Already Added to .env

Your `.env` file already has Cloudinary credentials:

```
CLOUDINARY_CLOUD_NAME=dioknuz64
CLOUDINARY_API_KEY=842982369322241
CLOUDINARY_API_SECRET=YOUR_API_SECRET_HERE
```

## 🔑 Action Required: Add Your API Secret

**You need to replace `YOUR_API_SECRET_HERE` with your actual Cloudinary API Secret.**

### Steps:

1. **Go to Cloudinary Dashboard:**
   - Visit: https://cloudinary.com/console
   - Login to your account

2. **Get Your API Secret:**
   - Click on **Settings** (gear icon)
   - Go to **Security** tab
   - Find **API Secret** section
   - Click **Reveal** to show your secret
   - Copy the secret

3. **Update .env File:**
   - Open `server/.env`
   - Find the line: `CLOUDINARY_API_SECRET=YOUR_API_SECRET_HERE`
   - Replace `YOUR_API_SECRET_HERE` with your actual secret
   - Save the file

4. **Example:**
   ```
   CLOUDINARY_API_SECRET=your_actual_secret_here_123456789
   ```

## ✅ After Adding Secret

1. **Restart your server:**
   ```bash
   cd server
   npm start
   ```

2. **Test image upload:**
   - Try uploading a profile picture
   - Try creating a notification with an image
   - Images should upload to Cloudinary successfully

## 📝 Current .env Status

- ✅ Cloud Name: `dioknuz64` (Added)
- ✅ API Key: `842982369322241` (Added)
- ⚠️ API Secret: **NEEDS TO BE ADDED** (Replace YOUR_API_SECRET_HERE)

## 🔒 Security Note

- Never share your API Secret
- Never commit `.env` to git (already in `.gitignore`)
- Keep your credentials secure

---

**Once you add the API Secret, Cloudinary will work perfectly!** 🎉

