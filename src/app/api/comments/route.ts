// src/app/api/comments/route.ts
import { getComments } from "@/lib";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    // The client sends ?variation=<product model>; we keep productName as a fallback
    const productName = searchParams.get("variation") || searchParams.get("productName");

    const comments = await getComments(productName);

    return NextResponse.json(comments, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("Failed to fetch comments from Airtable:", error);
    
    return NextResponse.json(
      { error: "Internal Server Error while fetching comments" },
      { status: 500 }
    );
  }
}