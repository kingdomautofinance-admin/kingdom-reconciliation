let gapiInitialized = false;
let tokenClient: google.accounts.oauth2.TokenClient | null = null;
let accessToken: string | null = null;
let storedApiKey: string | null = null;
let storedClientId: string | null = null;

export function setStoredCredentials(apiKey: string, clientId: string): void {
  storedApiKey = apiKey;
  storedClientId = clientId;
}

export function initializeGoogleAPI(apiKey?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (gapiInitialized) {
      resolve();
      return;
    }

    if (!window.gapi) {
      reject(new Error('Google API not loaded'));
      return;
    }

    const key = apiKey || storedApiKey || import.meta.env.VITE_GOOGLE_API_KEY;
    if (!key) {
      reject(new Error('No API key available'));
      return;
    }

    window.gapi.load('client', async () => {
      try {
        await window.gapi.client.init({
          apiKey: key,
          discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
        });
        gapiInitialized = true;
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

export function initializeTokenClient(clientId?: string): void {
  if (tokenClient) return;

  if (!window.google?.accounts?.oauth2) {
    throw new Error('Google Identity Services not loaded');
  }

  const id = clientId || storedClientId || import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!id) {
    throw new Error('No client ID available');
  }

  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: id,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    callback: () => {},
  });
}

export function requestAccessToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      reject(new Error('Token client not initialized'));
      return;
    }

    tokenClient.callback = (response) => {
      if (response.error) {
        reject(new Error(response.error));
        return;
      }
      accessToken = response.access_token;
      resolve(response.access_token);
    };

    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
}

export function hasValidToken(): boolean {
  return accessToken !== null;
}

export async function fetchSpreadsheetData(spreadsheetId: string): Promise<any[][]> {
  if (!accessToken) {
    throw new Error('No access token available');
  }

  if (!gapiInitialized) {
    await initializeGoogleAPI();
  }

  window.gapi.client.setToken({ access_token: accessToken });

  try {
    const response = await window.gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'A:Z',
    });

    return response.result.values || [];
  } catch (error: any) {
    if (error.status === 401) {
      accessToken = null;
      throw new Error('Token expired. Please reconnect.');
    }
    throw error;
  }
}

export function revokeAccess(): void {
  if (accessToken) {
    window.google.accounts.oauth2.revoke(accessToken, () => {
      accessToken = null;
    });
  }
}
