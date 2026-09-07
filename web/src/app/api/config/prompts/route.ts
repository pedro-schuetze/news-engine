import { NextResponse } from "next/server";
import { loadPromptOverrides, loadVerticalConfigs, readPromptRule, savePromptOverrides } from "@/lib/data";
import { TEXT_SYSTEM_PROMPT } from "@/lib/compose/draft";
import { DEFAULT_IMAGE_PROMPT } from "@/lib/media/prompt";
import { sameOrigin } from "@/lib/news";

export const dynamic = "force-dynamic";

export async function GET() {
  const [overrides, rules, verticals] = await Promise.all([
    loadPromptOverrides(),
    Promise.all(["headline", "humanize", "slides", "caption"].map(readPromptRule)),
    loadVerticalConfigs(),
  ]);
  return NextResponse.json({
    overrides,
    text: {
      system: TEXT_SYSTEM_PROMPT,
      rules: rules.filter(Boolean).join("\n\n"),
      context: "O título, as fontes, a verificação e o formato do carrossel são inseridos automaticamente a cada geração.",
      verticals: verticals.map((v) => ({ id: v.id, name: v.display_name, tone: v.tone })),
    },
    image: {
      template: DEFAULT_IMAGE_PROMPT,
      context: "{{title}}, {{slide_number}}, {{slide_count}} e {{image_direction}} são preenchidos automaticamente.",
    },
  });
}

export async function PUT(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { text?: unknown; image?: unknown };
  if (typeof body.text !== "string" || typeof body.image !== "string") {
    return NextResponse.json({ error: "envie text e image como strings" }, { status: 400 });
  }
  if (body.text.length > 12000 || body.image.length > 8000) {
    return NextResponse.json({ error: "prompt personalizado muito longo" }, { status: 400 });
  }
  try {
    await savePromptOverrides({ text: body.text, image: body.image });
    return NextResponse.json({ ok: true, overrides: await loadPromptOverrides() });
  } catch (error) {
    return NextResponse.json({ error: String(error).slice(0, 300) }, { status: 500 });
  }
}
