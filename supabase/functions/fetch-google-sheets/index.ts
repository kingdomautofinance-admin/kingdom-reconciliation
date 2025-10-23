import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
}

function base64urlEncode(str: string): string {
  const base64 = btoa(str);
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function formatPrivateKey(key: string): string {
  let privateKey = key.trim();
  
  console.log('=== FORMATTING PRIVATE KEY ===');
  console.log('Original length:', privateKey.length);
  console.log('Has literal \\n:', privateKey.includes('\\n'));
  console.log('Has actual newline:', privateKey.includes('\n'));
  console.log('First 60 chars:', privateKey.substring(0, 60));
  
  // Replace literal \n with actual newlines
  if (privateKey.includes('\\n')) {
    console.log('Replacing literal \\n with actual newlines');
    privateKey = privateKey.replace(/\\n/g, '\n');
  }
  
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  
  // Check if key has proper headers
  if (!privateKey.includes(pemHeader) || !privateKey.includes(pemFooter)) {
    console.error('Missing PEM headers!');
    throw new Error('Invalid private key format: missing PEM headers');
  }
  
  // If the key is still on one line or has very few lines, reformat it
  const lines = privateKey.split('\n').filter(line => line.trim().length > 0);
  console.log('Number of lines after split:', lines.length);
  
  if (lines.length < 3) {
    console.log('Key appears to be on one line, reformatting...');
    
    // Extract just the key content (remove headers and all whitespace)
    let keyContent = privateKey
      .replace(pemHeader, '')
      .replace(pemFooter, '')
      .replace(/\s+/g, ''); // Remove ALL whitespace
    
    console.log('Key content length after extraction:', keyContent.length);
    
    if (keyContent.length < 1000) {
      throw new Error(`Private key appears to be truncated: ${keyContent.length} characters`);
    }
    
    // Split into 64-character lines (PEM standard)
    const formattedLines = [];
    for (let i = 0; i < keyContent.length; i += 64) {
      formattedLines.push(keyContent.substring(i, i + 64));
    }
    
    // Reconstruct with proper formatting
    privateKey = `${pemHeader}\n${formattedLines.join('\n')}\n${pemFooter}`;
    console.log('Reformatted into', formattedLines.length, 'lines');
  }
  
  console.log('Final key length:', privateKey.length);
  console.log('Final key first 60 chars:', privateKey.substring(0, 60));
  console.log('Final key last 60 chars:', privateKey.substring(privateKey.length - 60));
  console.log('=== END FORMATTING ===');
  
  return privateKey;
}

async function createJWT(credentials: ServiceAccountCredentials): Promise<string> {
  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedClaim = base64urlEncode(JSON.stringify(claim));
  const unsignedToken = `${encodedHeader}.${encodedClaim}`;

  // Format the private key properly
  const privateKey = formatPrivateKey(credentials.private_key);

  const encoder = new TextEncoder();
  const data = encoder.encode(unsignedToken);

  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";

  const pemContents = privateKey.substring(
    privateKey.indexOf(pemHeader) + pemHeader.length,
    privateKey.indexOf(pemFooter)
  ).replace(/\s/g, '');

  console.log('PEM contents length:', pemContents.length);

  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  console.log('Binary DER length:', binaryDer.length);

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    data
  );

  const signatureArray = new Uint8Array(signature);
  const signatureBase64 = btoa(String.fromCharCode(...signatureArray));
  const encodedSignature = signatureBase64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return `${unsignedToken}.${encodedSignature}`;
}

async function getAccessToken(credentials: ServiceAccountCredentials): Promise<string> {
  const jwt = await createJWT(credentials);

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get access token: ${error}`);
  }

  const data = await response.json();
  return data.access_token;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { spreadsheetId, serviceAccountEmail, serviceAccountKey } = await req.json();

    if (!spreadsheetId) {
      return new Response(
        JSON.stringify({ error: "spreadsheetId is required" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    let accessToken: string;

    if (serviceAccountEmail && serviceAccountKey) {
      console.log("Using provided service account credentials");

      const credentials: ServiceAccountCredentials = {
        client_email: serviceAccountEmail,
        private_key: serviceAccountKey,
      };

      accessToken = await getAccessToken(credentials);
    } else {
      const envEmail = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL');
      const envKey = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY');

      if (envEmail && envKey) {
        console.log("Using environment service account credentials");

        const credentials: ServiceAccountCredentials = {
          client_email: envEmail,
          private_key: envKey,
        };

        accessToken = await getAccessToken(credentials);
      } else {
        console.log("No service account credentials, falling back to public CSV export");

        const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=0`;

        const response = await fetch(csvUrl, {
          redirect: "follow",
        });

        if (!response.ok) {
          let errorMessage = "Failed to fetch spreadsheet.";

          if (response.status === 404) {
            errorMessage = "Spreadsheet not found. Check if the URL is correct.";
          } else if (response.status === 403 || response.status === 401) {
            errorMessage = "Access denied. Please provide service account credentials or make the spreadsheet public.";
          }

          return new Response(
            JSON.stringify({
              error: errorMessage,
              status: response.status,
              spreadsheetId,
            }),
            {
              status: response.status,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            }
          );
        }

        const csvText = await response.text();

        if (!csvText || csvText.length < 10) {
          return new Response(
            JSON.stringify({
              error: "Spreadsheet appears to be empty or invalid",
            }),
            {
              status: 400,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            }
          );
        }

        const rows = csvText.split('\n').map(row => row.split(','));

        return new Response(
          JSON.stringify({ values: rows }),
          {
            status: 200,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }
    }

    console.log("Fetching spreadsheet with service account:", spreadsheetId);

    const sheetsResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:Z100000`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    if (!sheetsResponse.ok) {
      const errorText = await sheetsResponse.text();
      let errorMessage = `Failed to fetch spreadsheet: ${errorText}`;

      if (sheetsResponse.status === 404) {
        errorMessage = "Spreadsheet not found. Check if the ID is correct.";
      } else if (sheetsResponse.status === 403) {
        errorMessage = "Access denied. Make sure the spreadsheet is shared with the service account email.";
      }

      return new Response(
        JSON.stringify({
          error: errorMessage,
          status: sheetsResponse.status,
        }),
        {
          status: sheetsResponse.status,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const data = await sheetsResponse.json();

    console.log("Successfully fetched spreadsheet data");

    return new Response(
      JSON.stringify(data),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Internal server error",
        details: error.toString(),
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});