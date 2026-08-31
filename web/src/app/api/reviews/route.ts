import { NextResponse } from "next/server";
import { loadReviews, saveReview } from "@/lib/data";
import type { Review, ReviewStatus } from "@/lib/types";

const VALID_STATUS: ReviewStatus[] = ["PENDING", "APPROVED", "REJECTED"];

export async function GET() {
  return NextResponse.json(await loadReviews());
}

export async function POST(request: Request) {
  let body: Partial<Review>;
  try {
    body = (await request.json()) as Partial<Review>;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const status = body.review_status as ReviewStatus;
  if (!body.story_id || !VALID_STATUS.includes(status)) {
    return NextResponse.json(
      { error: "campos obrigatórios: story_id, review_status (PENDING|APPROVED|REJECTED)" },
      { status: 400 },
    );
  }

  const review: Review = {
    story_id: body.story_id,
    run_id: body.run_id ?? "",
    vertical: body.vertical ?? "",
    review_status: status,
    reviewed_at: status === "PENDING" ? null : new Date().toISOString(),
    review_notes: body.review_notes ?? "",
  };

  try {
    await saveReview(review);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
  return NextResponse.json(review);
}
