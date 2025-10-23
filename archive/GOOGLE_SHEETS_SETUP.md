# Google Sheets API Setup Guide

This application uses Google Sheets API with OAuth 2.0 authentication to securely access your private spreadsheets.

## Step 1: Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Click **"Create Project"** or select an existing project
3. Give it a name (e.g., "Reconciliation System")
4. Click **"Create"**

## Step 2: Enable Google Sheets API

1. In your project, go to **"APIs & Services"** > **"Library"**
2. Search for **"Google Sheets API"**
3. Click on it and click **"Enable"**

## Step 3: Create API Credentials

### Create an API Key

1. Go to **"APIs & Services"** > **"Credentials"**
2. Click **"Create Credentials"** > **"API key"**
3. Copy the API key
4. Click **"Restrict Key"** (recommended)
5. Under "API restrictions", select **"Restrict key"**
6. Select **"Google Sheets API"** from the dropdown
7. Click **"Save"**

### Create an OAuth 2.0 Client ID

1. Still in **"Credentials"**, click **"Create Credentials"** > **"OAuth client ID"**
2. If prompted to configure consent screen:
   - Click **"Configure Consent Screen"**
   - Select **"External"** (unless you have a Google Workspace)
   - Fill in the required fields:
     - App name: "Reconciliation System"
     - User support email: your email
     - Developer contact: your email
   - Click **"Save and Continue"**
   - On "Scopes", click **"Add or Remove Scopes"**
   - Search for and add: `https://www.googleapis.com/auth/spreadsheets.readonly`
   - Click **"Update"** then **"Save and Continue"**
   - On "Test users", click **"Add Users"**
   - Add your Google email address
   - Click **"Save and Continue"**

3. Back to "Create OAuth client ID":
   - Application type: **"Web application"**
   - Name: "Reconciliation Web Client"
   - Under "Authorized JavaScript origins", click **"Add URI"**:
     - For local development: `http://localhost:5173`
     - For production: Add your production domain (e.g., `https://yourdomain.com`)
   - Click **"Create"**

4. Copy the **Client ID** that appears (starts with something like `xxxxx.apps.googleusercontent.com`)

## Step 4: Configure Your Application

1. Open the `.env` file in your project root
2. Replace the placeholder values with your credentials:

```env
VITE_GOOGLE_CLIENT_ID=your-actual-client-id.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=your-actual-api-key
```

3. Save the file and restart your development server

## Step 5: Connect Your Spreadsheet

1. Open the application and go to the **Upload** page
2. Find the **"Google Sheets Connection"** section
3. Paste your Google Sheets URL
4. Click **"Connect with Google"**
5. A Google sign-in popup will appear
6. Select your Google account
7. Review and grant permissions (read-only access to your spreadsheets)
8. Once authorized, your spreadsheet will be connected

## Using the Connection

### First Sync
- After connecting, the system automatically imports all transactions
- Duplicates are detected and skipped

### Manual Sync
- Click **"Sync Now"** anytime to import new data
- Only new transactions are imported

### Disconnecting
- Click the disconnect icon to revoke access
- This removes the connection and revokes the OAuth token

## Troubleshooting

### "Google Sheets API Setup Required" Message

This means the API credentials are not configured. Follow Steps 1-4 above.

### "Failed to initialize Google APIs"

- Check that your API key is correct
- Verify the Google Sheets API is enabled in your project
- Clear browser cache and reload

### "Access denied" or "Token expired"

- Click **"Sync Now"** to re-authorize
- If that doesn't work, disconnect and reconnect

### OAuth Popup Blocked

- Make sure your browser allows popups for this site
- Try clicking the connect button again

## Security Benefits

Using OAuth 2.0 provides:
- **Secure Authentication**: No need to make spreadsheets public
- **Granular Permissions**: App only gets read-only access
- **User Control**: Users can revoke access anytime from their Google Account
- **Token Expiration**: Tokens expire and need renewal for security

## Required Spreadsheet Format

Your spreadsheet should have these columns (in any order):

- **Data**: Transaction date
- **Valor**: Transaction amount
- **Depositante**: Client/depositor name
- **Forma de Pagamento**: Payment method
- **Nome**: (Optional) Additional name field

## Production Deployment

When deploying to production:

1. Update OAuth configuration:
   - Add your production domain to "Authorized JavaScript origins"
   - Update the `.env` file with production values

2. Verify your app in Google Cloud Console:
   - Submit for verification if you'll have more than 100 users
   - This removes the "unverified app" warning

3. Consider publishing the OAuth consent screen:
   - This allows any Google user to connect (not just test users)
   - Requires app verification by Google

## Support

If you encounter issues:
- Check that all steps were followed correctly
- Verify your credentials in the `.env` file
- Make sure the Google Sheets API is enabled
- Check browser console for error messages
