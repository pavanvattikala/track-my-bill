import { NextResponse } from "next/server";
import { google } from "googleapis";
import { Readable } from "stream";

const ROOT_FOLDER_NAME = "Track-My-Bills";
const CONFIG_FILE_NAME = "config.json";

/**
 * Finds or creates a top-level folder in the user's Drive root.
 */
async function findOrCreateRootFolder(drive: any, folderName: string): Promise<string> {
  const res = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and 'root' in parents and trashed=false`,
    fields: "files(id, name)",
    spaces: "drive",
  });

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id;
  }

  const folder = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id",
  });
  return folder.data.id!;
}

/**
 * Finds the config.json file inside the root folder. Returns null if not found.
 */
async function findConfigFile(drive: any, parentId: string): Promise<string | null> {
  const res = await drive.files.list({
    q: `name='${CONFIG_FILE_NAME}' and '${parentId}' in parents and mimeType='application/json' and trashed=false`,
    fields: "files(id, name)",
    spaces: "drive",
  });

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id;
  }
  return null;
}

/** POST /api/save-config — saves updated config.json back to Drive */
export async function POST(req: Request) {
  try {
    const accessToken = req.headers.get("Authorization")?.split(" ")[1];
    if (!accessToken) {
      return NextResponse.json({ error: "Missing authentication token." }, { status: 401 });
    }

    const body = await req.json();
    if (!body || !Array.isArray(body.categories)) {
      return NextResponse.json(
        { error: "Invalid config payload. Expected { categories: string[] }." },
        { status: 400 }
      );
    }

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: "v3", auth });

    // 1. Find or create the root "Track-My-Bills" folder
    const rootFolderId = await findOrCreateRootFolder(drive, ROOT_FOLDER_NAME);

    // 2. Look for existing config.json
    const existingConfigId = await findConfigFile(drive, rootFolderId);

    const configPayload = JSON.stringify({ ...body, version: 1 }, null, 2);

    const stream = new Readable();
    stream.push(configPayload);
    stream.push(null);

    if (existingConfigId) {
      // 3a. Update the existing file content
      await drive.files.update({
        fileId: existingConfigId,
        media: {
          mimeType: "application/json",
          body: stream,
        },
      });
      console.log("Updated config.json in Drive.");
    } else {
      // 3b. Create a new config.json
      await drive.files.create({
        requestBody: {
          name: CONFIG_FILE_NAME,
          mimeType: "application/json",
          parents: [rootFolderId],
        },
        media: {
          mimeType: "application/json",
          body: stream,
        },
        fields: "id",
      });
      console.log("Created config.json in Drive.");
    }

    return NextResponse.json({ message: "Config saved successfully." }, { status: 200 });
  } catch (error) {
    console.error("Save Config Error:", error);
    return NextResponse.json(
      { error: "Failed to save config.", details: (error as Error).message },
      { status: 500 }
    );
  }
}
