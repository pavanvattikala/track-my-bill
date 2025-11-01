import { NextResponse } from "next/server";
import { google } from "googleapis";
import { Buffer } from "buffer";

const isImageMimeType = (mimeType: string): boolean => {
  return mimeType.startsWith("image/");
};

const isSupportedDocumentMimeType = (mimeType: string): boolean => {
  const supportedDocs = [
    "application/msword", // .doc
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
    "text/plain", // .txt
    "application/rtf", // .rtf
    "application/pdf", // .pdf
  ];
  return supportedDocs.includes(mimeType) || mimeType.startsWith("text/");
};

// --- Perplexity AI Configuration ---
const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    amount: {
      type: "number",
      description:
        "The final, grand total amount of the invoice or receipt, as a number.",
    },
    vendor: {
      type: "string",
      description:
        "The short name of the company or vendor issuing the invoice, 2 to 4 words maximum.",
    },
    date: {
      type: "string",
      description: "The date the invoice was issued, in YYYY-MM-DD format.",
    },
    category: {
      type: "string",
      description:
        "The general category of the purchase. Choose one from: food, travel, cosmetics, utility, services, miscellaneous. Do not use any other category.",
    },
    notes: {
      type: "string",
      description:
        "A brief description of the bill or purchase, up to 30 words.",
    },
  },
  required: ["amount", "vendor", "date", "category", "notes"],
};

const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

export async function POST(req: Request) {
  try {
    if (!PERPLEXITY_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error: "PERPLEXITY_API_KEY is not set in environment variables.",
        },
        { status: 500 }
      );
    }

    // 1. Get the Access Token and File ID from the request body
    const body = await req.json();
    const fileId = body.fileId;

    const fileType = body.fileType as string | undefined;

    if (!fileType) {
      return NextResponse.json(
        { success: false, error: "Missing file type in request." },
        { status: 400 }
      );
    }

    console.log(`Received file type: ${fileType}`);

    if (!fileId) {
      return NextResponse.json(
        { success: false, error: "Missing file ID for extraction." },
        { status: 400 }
      );
    }

    // 2. Initialize Google Drive client to download the file
    const accessToken = req.headers.get("Authorization")?.split(" ")[1];

    if (!accessToken) {
      return NextResponse.json(
        {
          success: false,
          error: "Authentication required to access file data.",
        },
        { status: 401 }
      );
    }

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: "v3", auth });

    // 3. Get file metadata (MIME type) and download the raw content
    const driveRes = await drive.files.get(
      {
        fileId: fileId,
        alt: "media",
        fields: "mimeType",
      },
      {
        responseType: "arraybuffer",
      }
    );

    const originalMimeType = fileType;
    const fileBuffer = Buffer.from(driveRes.data as ArrayBuffer);

    console.log(
      `File MIME type: ${originalMimeType}, Size: ${fileBuffer.length} bytes`
    );

    // 4. Check size limit
    const MAX_BUFFER_SIZE = 25 * 1024 * 1024; // 25 MB
    if (fileBuffer.length > MAX_BUFFER_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error:
            "File size exceeds the 25MB processing limit. Please upload a smaller file.",
        },
        { status: 413 }
      );
    }

    const base64File = fileBuffer.toString("base64");
    let attachmentContent;
    // 5. Prepare attachment content based on MIME type
    if (isImageMimeType(originalMimeType)) {
      // IMAGE
      attachmentContent = {
        type: "image_url",
        image_url: {
          url: `data:${originalMimeType};base64,${base64File}`,
        },
      };
      console.log(`Processing as image: ${originalMimeType}`);
    } else if (isSupportedDocumentMimeType(originalMimeType)) {
      // DOCUMENT
      attachmentContent = {
        type: "file_url",
        file_url: {
          url: base64File,
        },
      };
      console.log(`Processing as document: ${originalMimeType}`);
    } else {
      return NextResponse.json(
        {
          success: false,
          error: `Unsupported file type for AI extraction: ${originalMimeType}.`,
        },
        { status: 415 }
      );
    }

    // 6. Construct the Perplexity API payload
    const payload = {
      model: "sonar",
      disable_search: true,
      messages: [
        {
          role: "system",
          content:
            "You are an expert data extraction assistant. Analyze the provided document/image and extract the key information precisely according to the requested JSON schema. Ensure the vendor name is short (2-4 words), the date is in YYYY-MM-DD format, and the category is one of the allowed types (food, travel, cosmetics, utility, services, miscellaneous). Do not make up information.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract the data from this document/image and return it as a JSON object matching the provided schema.",
            },
            attachmentContent as any,
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          schema: EXTRACTION_SCHEMA,
        },
      },
    };

    // 7. Call the Perplexity API
    const perplexityResponse = await fetch(PERPLEXITY_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!perplexityResponse.ok) {
      const errorData = await perplexityResponse.json();
      console.error("Perplexity API Error:", errorData);
      let errorMsg =
        errorData.error?.message || "Failed to call Perplexity API.";
      return NextResponse.json(
        { success: false, error: errorMsg },
        { status: perplexityResponse.status }
      );
    }

    const perplexityData = await perplexityResponse.json();
    const responseContent = perplexityData.choices[0]?.message?.content;

    if (!responseContent) {
      throw new Error(
        "Invalid response structure from Perplexity (no content)."
      );
    }

    const extractedArgs = JSON.parse(responseContent);

    // 8. Return the extracted data
    return NextResponse.json(extractedArgs, { status: 200 });
  } catch (error) {
    console.error("AI Extraction Pipeline Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "An internal server error occurred.",
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
