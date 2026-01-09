import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: { name: 'ConfigError', message: 'OPENAI_API_KEY not configured' } },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const imageFile = formData.get('image') as File;

    if (!imageFile) {
      return NextResponse.json(
        { ok: false, error: { name: 'ValidationError', message: 'No image provided' } },
        { status: 400 }
      );
    }

    const bytes = await imageFile.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Image = buffer.toString('base64');
    const mimeType = imageFile.type || 'image/png';
    const dataUrl = `data:${mimeType};base64,${base64Image}`;

    const client = new OpenAI({ apiKey });

    const systemPrompt = `Extract all visible text from the image.
Actively correct spelling errors, typos, and obvious medical misspellings.
Use radiological and medical context to intelligently infer unclear words.
Examples:
- "Hertzinfrkt" → "Herzinfarkt"
- "Lungenentzündng" → "Lungenentzündung"
- "Röngten" → "Röntgen"
- "Computertomograpfie" → "Computertomographie"
Output clean German medical text only, without any explanations or formatting.`;

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: dataUrl,
              },
            },
          ],
        },
      ],
      max_completion_tokens: 2000,
    });

    const extractedText = response.choices[0]?.message?.content || '';

    if (!extractedText) {
      return NextResponse.json(
        { ok: false, error: { name: 'OCRError', message: 'No text extracted from image' } },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      text: extractedText,
    });

  } catch (error: any) {
    console.error('OCR error:', error);
    return NextResponse.json(
      {
        ok: false,
        error: {
          name: error.name || 'OCRError',
          message: error.message || 'OCR processing failed'
        }
      },
      { status: 500 }
    );
  }
}
