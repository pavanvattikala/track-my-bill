import { NextResponse } from "next/server";
import { google } from "googleapis";
import { Buffer } from "buffer";
import OpenAI from "openai";

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

const DEFAULT_CATEGORIES = [
  "Food & Dining",
  "Groceries",
  "Travel",
  "Utilities",
  "Medical",
  "Shopping",
  "Entertainment",
  "Services",
  "Miscellaneous",
];

/**
 * Builds the JSON schema and system prompt dynamically based on user categories.
 */
function buildExtractionSchema(categories: string[]) {
  const categoryList = categories.join(", ");
  return {
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
        description: `The general category of the purchase. Choose the best matching one from: ${categoryList}. Do not use any other category.`,
      },
      notes: {
        type: "string",
        description:
          "A brief description of the bill or purchase, up to 30 words.",
      },
    },
    required: ["amount", "vendor", "date", "category", "notes"],
    additionalProperties: false,
  };
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

export async function POST(req: Request) {
  let uploadedFileId: string | null = null;
  try {
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error: "OPENAI_API_KEY is not set in environment variables.",
        },
        { status: 500 }
      );
    }

    // 1. Get the Access Token and File ID from the request body
    const body = await req.json();
    const fileId = body.fileId;
    const fileType = body.fileType as string | undefined;
    const userCategories: string[] = Array.isArray(body.categories) && body.categories.length > 0
      ? body.categories
      : DEFAULT_CATEGORIES;

    const EXTRACTION_SCHEMA = buildExtractionSchema(userCategories);
    const categoryList = userCategories.join(", ");

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
      // IMAGE — use base64 data URI directly
      attachmentContent = {
        type: "image_url",
        image_url: {
          url: `data:${originalMimeType};base64,${base64File}`,
        },
      };
      console.log(`Processing as image: ${originalMimeType}`);
    } else if (isSupportedDocumentMimeType(originalMimeType)) {
      // PDF / DOCUMENT — upload to OpenAI Files API, reference by file_id
      console.log(`Processing as document via OpenAI Files API: ${originalMimeType}`);

      // Determine a sensible filename extension
      const extMap: Record<string, string> = {
        "application/pdf": "pdf",
        "application/msword": "doc",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
        "text/plain": "txt",
        "application/rtf": "rtf",
      };
      const ext = extMap[originalMimeType] ?? "pdf";
      const fileName = `bill_upload.${ext}`;

      // Create a File object from the buffer for the OpenAI SDK
      const fileBlob = new File([fileBuffer], fileName, { type: originalMimeType });

      const uploadedFile = await openai.files.create({
        file: fileBlob,
        purpose: "user_data",
      });
      uploadedFileId = uploadedFile.id;
      console.log(`Uploaded to OpenAI Files API with id: ${uploadedFileId}`);

      attachmentContent = {
        type: "file",
        file: {
          file_id: uploadedFileId,
        },
      };
    } else {
      return NextResponse.json(
        {
          success: false,
          error: `Unsupported file type: ${originalMimeType}. Please upload an image (JPG, PNG, WEBP) or a PDF.`,
        },
        { status: 415 }
      );
    }

    // 6. Call the OpenAI API
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an expert data extraction assistant. Analyze the provided document/image and extract the key information precisely according to the requested JSON schema. Ensure the vendor name is short (2-4 words), the date is in YYYY-MM-DD format, and the category must be exactly one of these options: ${categoryList}. Pick the closest match based on the bill contents. Do not invent or use any other category value. Do not make up information.`,
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
          name: "expense_extraction",
          strict: true,
          schema: EXTRACTION_SCHEMA,
        },
      },
    });

    const responseContent = completion.choices[0]?.message?.content;

    // 7. Clean up the uploaded file from OpenAI (fire-and-forget, best effort)
    if (uploadedFileId) {
      openai.files.delete(uploadedFileId).catch((err) =>
        console.warn(`Failed to delete uploaded OpenAI file ${uploadedFileId}:`, err)
      );
    }

    if (!responseContent) {
      throw new Error(
        "Invalid response structure from OpenAI (no content)."
      );
    }

    const extractedArgs = JSON.parse(responseContent);

    // 8. Return the extracted data
    return NextResponse.json(extractedArgs, { status: 200 });
  } catch (error) {
    // Best-effort cleanup on error path
    if (uploadedFileId) {
      openai.files.delete(uploadedFileId).catch(() => {});
    }
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
