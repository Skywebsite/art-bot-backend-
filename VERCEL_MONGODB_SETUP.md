# MongoDB Atlas Setup for Vercel Deployment

## Important: IP Whitelist Configuration

When deploying to Vercel, you **MUST** whitelist Vercel's IP addresses in MongoDB Atlas, otherwise you'll get connection errors like:

```
MongooseServerSelectionError: Could not connect to any servers in your MongoDB Atlas cluster. 
One common reason is that you're trying to access the database from an IP that isn't whitelisted.
```

## Solution: Allow All IPs (Recommended for Vercel)

Since Vercel uses dynamic IP addresses that change frequently, the best solution is to allow all IPs:

1. Go to [MongoDB Atlas Dashboard](https://cloud.mongodb.com/)
2. Navigate to **Network Access** (or **IP Access List**)
3. Click **Add IP Address**
4. Click **Allow Access from Anywhere**
5. Enter `0.0.0.0/0` as the IP address
6. Click **Confirm**

**Note:** This allows connections from any IP address. Make sure your MongoDB connection string has proper authentication (username/password) enabled.

## Alternative: Whitelist Specific Vercel IPs (Not Recommended)

Vercel's IP addresses change frequently, so this approach requires constant updates. It's better to use `0.0.0.0/0` with strong authentication.

## Verify Connection

After updating the IP whitelist:
1. Wait 1-2 minutes for changes to propagate
2. Test your Vercel deployment
3. Check Vercel logs for connection success messages

## Security Best Practices

- ✅ Use strong MongoDB username/password
- ✅ Enable MongoDB Atlas authentication
- ✅ Use environment variables for connection strings
- ✅ Never commit `.env` files to git
- ✅ Regularly rotate database passwords

