import { NextResponse } from "next/server";
import { google } from "googleapis";
import { Readable } from "stream";

// --- CONFIGURATION ---
const TARGET_FOLDER_PATH = "track-my-bills/uploads";

function fileToReadableStream(file: File): Readable {
  const stream = new Readable();
  stream._read = () => {};

  file
    .arrayBuffer()
    .then((buffer) => {
      stream.push(Buffer.from(buffer));
      stream.push(null);
    })
    .catch((err) => {
      stream.emit("error", err);
    });

  return stream;
}

/**
 * Finds a folder by name within a parent folder, or creates it if it doesn't exist.
 */
async function findOrCreateFolder(
  drive: any,
  folderName: string,
  parentId?: string
): Promise<string> {
  const parentQuery = parentId ? `'${parentId}' in parents and` : "";
  // 1. Search for the folder
  const q = `${parentQuery} mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`;

  const searchRes = await drive.files.list({
    q: q,
    fields: "files(id, name)",
    spaces: "drive",
  });

  if (searchRes.data.files && searchRes.data.files.length > 0) {
    // Folder found
    return searchRes.data.files[0].id;
  }

  // 2. If not found, create the folder
  const requestBody: { name: string; mimeType: string; parents?: string[] } = {
    name: folderName,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) {
    requestBody.parents = [parentId];
  }

  const createRes = await drive.files.create({
    requestBody: requestBody,
    fields: "id",
  });

  return createRes.data.id!;
}

/**
 * Traverses and creates a nested folder structure (e.g., 'parent/child/grandchild').
 */
async function findOrCreateNestedFolder(
  drive: any,
  path: string
): Promise<string> {
  const parts = path.split("/");
  let currentParentId: string | undefined = undefined;

  for (const folderName of parts) {
    // Use the previous folder's ID as the parent for the current folder
    currentParentId = await findOrCreateFolder(
      drive,
      folderName,
      currentParentId
    );
  }

  return currentParentId!;
}
/** Entry point for the upload-to-drive API route */
export async function POST(req: Request) {
  try {
    // 1. Get the Access Token from the custom Authorization header (passed from frontend)
    const accessToken = req.headers.get("Authorization")?.split(" ")[1];

    if (!accessToken) {
      return NextResponse.json(
        { error: "Missing authentication token." },
        { status: 401 }
      );
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

    // 4. FIND OR CREATE THE NESTED FOLDER PATH
    const folderId = await findOrCreateNestedFolder(drive, TARGET_FOLDER_PATH);

    if (!folderId) {
      throw new Error("Target folder path could not be located or created.");
    }

    // 5. Define File Metadata and Media Stream
    const fileMetadata = {
      name: file.name,
      parents: [folderId],
    };

    const media = {
      mimeType: file.type,
      body: fileToReadableStream(file),
    };

    // 6. Perform the upload using the 'files.create' method
    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: "id, webViewLink, name",
    });

    // 7. Return the result
    return NextResponse.json(
      {
        message: `File uploaded to '${TARGET_FOLDER_PATH}'.`,
        id: response.data.id,
        fileName: response.data.name,
        link: response.data.webViewLink,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Google Drive Upload Error:", error);
    // Return a generic error message for security
    return NextResponse.json(
      {
        error: "Failed to upload file to Google Drive.",
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
