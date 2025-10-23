declare namespace google {
  namespace accounts {
    namespace oauth2 {
      interface TokenClient {
        callback: (response: TokenResponse) => void;
        requestAccessToken(options?: { prompt?: string }): void;
      }

      interface TokenResponse {
        access_token: string;
        error?: string;
        expires_in: number;
        scope: string;
        token_type: string;
      }

      function initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
      }): TokenClient;

      function revoke(token: string, callback: () => void): void;
    }
  }
}

interface Window {
  gapi: {
    load(api: string, callback: () => void): void;
    client: {
      init(config: {
        apiKey: string;
        discoveryDocs: string[];
      }): Promise<void>;
      setToken(token: { access_token: string }): void;
      sheets: {
        spreadsheets: {
          values: {
            get(params: {
              spreadsheetId: string;
              range: string;
            }): Promise<{
              result: {
                values?: any[][];
              };
            }>;
          };
        };
      };
    };
  };
  google: typeof google;
}
