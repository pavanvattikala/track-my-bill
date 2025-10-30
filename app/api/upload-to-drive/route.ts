import { NextResponse } from "next/server";
import { google } from "googleapis";
import { Readable } from 'stream';

// --- CONFIGURATION ---
const TARGET_FOLDER_NAME = "track-my-bills";
// ---------------------


function fileToReadableStream(file: File): Readable {
  const stream = new Readable();
  stream._read = () => {};
  
  // Convert the File's content (ArrayBuffer) to a Buffer, and push to stream
  file.arrayBuffer().then(buffer => {
    stream.push(Buffer.from(buffer));
    stream.push(null); // Signal the end of the stream
  }).catch(err => {
    stream.emit('error', err);
  });
  
  return stream;
}


async function findOrCreateFolder(drive: any, folderName: string): Promise<string> {
    // 1. Search for the folder
    const q = `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`;
    const searchRes = await drive.files.list({
        q: q,
        fields: 'files(id, name)',
        spaces: 'drive',
    });

    if (searchRes.data.files && searchRes.data.files.length > 0) {
        // Folder found
        return searchRes.data.files[0].id; 
    }

    // 2. If not found, create the folder
    const createRes = await drive.files.create({
        requestBody: {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
        },
        fields: 'id',
    });
    
    return createRes.data.id!;
}

export async function POST(req: Request) {
  try {
    // 1. Get the Access Token from the custom Authorization header (passed from frontend)
    const accessToken = req.headers.get('Authorization')?.split(' ')[1];

    if (!accessToken) {
      return NextResponse.json({ error: "Missing authentication token." }, { status: 401 });
    }

    // 2. Parse the incoming form data
    const formData = await req.formData();
    const fileEntry = formData.get("file");

    if (!fileEntry || !(fileEntry instanceof File)) {
      return NextResponse.json({ error: "No file received." }, { status: 400 });
    }

    const file = fileEntry as File;
    
    // 3. Initialize Google Drive client with the user's access token
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const drive = google.drive({ version: "v3", auth });

    // 4. FIND OR CREATE THE TARGET FOLDER
    const folderId = await findOrCreateFolder(drive, TARGET_FOLDER_NAME);
    
    if (!folderId) {
        throw new Error("Target folder could not be located or created.");
    }

    // 5. Define File Metadata and Media Stream
    const fileMetadata = {
      name: file.name,
      // CRITICAL: Set the folder ID as the parent to upload to the specific folder
      parents: [folderId] 
    };
    
    const media = {
      mimeType: file.type,
      body: fileToReadableStream(file),
    };

    // 6. Perform the upload using the 'files.create' method
    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      // Request essential fields for the response
      fields: "id, webViewLink, name", 
    });

    // 7. Return the result
    return NextResponse.json({ 
        message: `File uploaded to '${TARGET_FOLDER_NAME}'.`, 
        id: response.data.id,
        fileName: response.data.name,
        link: response.data.webViewLink
    }, { status: 200 });

  } catch (error) {
    console.error("Google Drive Upload Error:", error);
    // Return a generic error message for security
    return NextResponse.json(
      { error: "Failed to upload file to Google Drive.", details: (error as Error).message },
      { status: 500 }
    );
  }
}
