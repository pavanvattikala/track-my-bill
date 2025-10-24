import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    amount: { 
      type: "number",
      description: "The final, grand total amount of the invoice or receipt, as a number.",
    },
    vendor: {
      type: "string",
      description: "The short name of the company or vendor issuing the invoice, 2 to 4 words maximum.",
    },
    date: {
      type: "string",
      description: "The date the invoice was issued, in YYYY-MM-DD format.",
    },
    category: {
      type: "string",
      description: "The general category of the purchase. Choose one from: food, travel, cosmetics, utility, services, miscellaneous. Do not use any other category.",
    },
    notes: {
      type: "string",
      description: "A brief description of the bill or purchase, up to 30 words.",
    },
  },
  required: ["amount", "vendor", "date", "category", "notes"], 
};


const isImageMimeType = (mimeType: string): boolean => {
  return mimeType.startsWith("image/");
};

const isSupportedDocumentMimeType = (mimeType: string): boolean => {
  const supportedDocs = [
    "application/pdf", // .pdf
    "application/msword", // .doc
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
    "text/plain", // .txt
    "application/rtf", // .rtf
  ];
  return supportedDocs.includes(mimeType) || mimeType.startsWith("text/");
};

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided." },
        { status: 400 }
      );
    }

    const fileBuffer = await file.arrayBuffer();
    const base64File = Buffer.from(fileBuffer).toString("base64");
    const mimeType = file.type;
    const fileName = file.name;

    let attachmentContent;
    
    if (isImageMimeType(mimeType)) {
      attachmentContent = {
        type: "image_url",
        image_url: {
          url: `data:${mimeType};base64,${base64File}`, 
        },
      };
      console.log(`Processing as image: ${mimeType}`);
    } else if (isSupportedDocumentMimeType(mimeType)) {

      attachmentContent = {
        type: "file_url",
        file_url: {
          url: base64File, 
        },
      };
      console.log(`Processing as document: ${mimeType}`);
    } else {
      return NextResponse.json(
        { success: false, error: `Unsupported file type: ${mimeType}. Please upload an image, PDF, DOCX, DOC, TXT, or RTF file.` },
        { status: 415 }
      );
    }

    const perplexityResponse = await fetch(
      "https://api.perplexity.ai/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
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
                attachmentContent, 
              ],
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              schema: EXTRACTION_SCHEMA, 
            },
          },
        }),
      }
    );

    if (!perplexityResponse.ok) {
      const errorData = await perplexityResponse.json();
      console.error("Perplexity API Error:", errorData);
      const status = perplexityResponse.status;
      let errorMsg = "Failed to call Perplexity API.";
      if (status === 429) {
        errorMsg = "Rate limit hit. Please try again later.";
      }
      return NextResponse.json(
        { success: false, error: errorMsg },
        { status }
      );
    }

    const perplexityData = await perplexityResponse.json();

    console.log("Perplexity Response Data:", perplexityData);

    const responseContent = perplexityData.choices[0]?.message?.content;

    if (!responseContent) {
      throw new Error("Invalid response structure from Perplexity (no content).");
    }

    const extractedArgs = JSON.parse(responseContent);
    const { amount, vendor, date, category, notes } = extractedArgs;

    console.log("Extracted Arguments:", extractedArgs);

    return NextResponse.json({
      success: true,
      amount: amount,
      vendor: vendor,
      date: date,
      category: category,
      notes: notes,
    });
  } catch (error: any) {
    console.error("Error in /api/extract:", error);
    return NextResponse.json(
      { success: false, error: error.message || "An internal server error occurred." },
      { status: 500 }
    );
  }
}