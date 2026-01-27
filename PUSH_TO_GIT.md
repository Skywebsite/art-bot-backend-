# Force Push Server Folder to Git

## Steps to Force Push

### 1. Add Remote Repository
Replace `YOUR_GITHUB_USERNAME` and `YOUR_REPO_NAME` with your actual GitHub details:

```bash
cd server
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME.git
```

Or if you already have a remote:
```bash
git remote set-url origin https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME.git
```

### 2. Force Push to Main Branch
```bash
git push -f origin main
```

### 3. Alternative: Push to Master Branch
If your default branch is `master`:
```bash
git push -f origin master
```

## Quick One-Liner (After Setting Remote)
```bash
cd server
git push -f origin main
```

## Notes
- ⚠️ **Force push will overwrite remote history** - use with caution
- Make sure you have the correct repository URL
- Ensure you have write access to the repository

